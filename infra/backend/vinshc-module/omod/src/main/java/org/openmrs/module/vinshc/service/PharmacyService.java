package org.openmrs.module.vinshc.service;

import static org.openmrs.module.vinshc.service.VinshcService.bad;
import static org.openmrs.module.vinshc.service.VinshcService.canonicalUuid;
import static org.openmrs.module.vinshc.service.VinshcService.limit;
import static org.openmrs.module.vinshc.service.VinshcService.optionalString;
import static org.openmrs.module.vinshc.service.VinshcService.requiredString;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.openmrs.Concept;
import org.openmrs.DrugOrder;
import org.openmrs.Encounter;
import org.openmrs.Location;
import org.openmrs.Order;
import org.openmrs.Patient;
import org.openmrs.Visit;
import org.openmrs.api.context.Context;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pharmacy counter: confirmed outpatient DrugOrders waiting to be dispensed and append-only dispense
 * records. The server refuses to dispense more than the prescribed quantity, a discontinued/expired
 * order, an order of a cancelled visit or an already expired batch. Stock levels are not tracked.
 */
@Transactional
public class PharmacyService {

	private static final String CANCELLED_VISIT_ANSWER = CareService.CLOSE_REASONS.get("cancelled");

	private static final String CLOSE_REASON = "e54c1088-b2ad-534d-923e-8fb82019751f";

	private final JdbcTemplate jdbc;

	private final SessionFactory sessionFactory;

	public PharmacyService(SessionFactory sessionFactory) {
		ConnectionProvider provider = ((SessionFactoryImplementor) sessionFactory).getServiceRegistry()
		        .getService(ConnectionProvider.class);
		this.jdbc = new JdbcTemplate(provider.unwrap(javax.sql.DataSource.class));
		this.sessionFactory = sessionFactory;
	}

	/**
	 * Prescription lines of the caller's facility. status=pending (default: active and not fully
	 * dispensed) | dispensed | all; one clinic day (default today) unless a patient is given.
	 */
	public Map<String, Object> prescriptions(String status, String patientUuid, String date, Integer limit,
	        Integer offset) {
		AuthorizationService.requireOperation("dispensing", "read");
		int size = CareService.page(limit), skip = CareService.offset(offset);
		Location facility = AuthorizationService.listingFacilityStatic();
		List<Object> args = new ArrayList<>();
		StringBuilder sql = new StringBuilder();
		if (facility != null) {
			sql.append("WITH RECURSIVE tree AS (SELECT location_id FROM location WHERE location_id=?")
			        .append(" UNION SELECT l.location_id FROM location l JOIN tree t ON l.parent_location=t.location_id) ");
			args.add(facility.getLocationId());
		}
		String dispensed = "(SELECT COALESCE(sum(COALESCE((SELECT r.effective_quantity FROM vinshc_dispense_revision r"
		        + " WHERE r.dispense_id=x.dispense_id ORDER BY r.version_number DESC LIMIT 1),x.quantity)),0)"
		        + " FROM vinshc_dispense x WHERE x.order_id=o.order_id AND x.status='completed')";
		sql.append("SELECT o.order_id FROM orders o JOIN drug_order d ON d.order_id=o.order_id")
		        .append(" JOIN encounter e ON e.encounter_id=o.encounter_id LEFT JOIN visit v ON v.visit_id=e.visit_id")
		        .append(" WHERE o.voided=false AND e.voided=false AND o.order_action='NEW'");
		if (facility != null)
			sql.append(" AND COALESCE(e.location_id, v.location_id) IN (SELECT location_id FROM tree)");
		if (patientUuid != null) {
			Patient patient = Context.getPatientService().getPatientByUuid(canonicalUuid(patientUuid, "patient"));
			if (patient == null || patient.getVoided())
				throw bad("patient does not exist");
			AuthorizationService.requirePatientScopeStatic(patient);
			sql.append(" AND o.patient_id=?");
			args.add(patient.getPatientId());
		}
		String state = status == null ? "pending" : status;
		if ("pending".equals(state))
			sql.append(" AND o.date_stopped IS NULL AND (o.auto_expire_date IS NULL OR o.auto_expire_date>now()) AND ")
			        .append(dispensed).append("<COALESCE(d.quantity,0)");
		else if ("dispensed".equals(state))
			sql.append(" AND ").append(dispensed).append(">0");
		else if (!"all".equals(state))
			throw bad("status must be pending, dispensed or all");
		if (date != null || patientUuid == null) {
			LocalDate day = date == null ? LocalDate.now(CareService.CLINIC_ZONE) : day(date);
			sql.append(" AND o.date_activated>=? AND o.date_activated<?");
			args.add(Timestamp.from(day.atStartOfDay(CareService.CLINIC_ZONE).toInstant()));
			args.add(Timestamp.from(day.plusDays(1).atStartOfDay(CareService.CLINIC_ZONE).toInstant()));
		}
		sql.append(" ORDER BY o.date_activated, o.order_id LIMIT ? OFFSET ?");
		args.add(size + 1);
		args.add(skip);
		List<Integer> ids = jdbc.queryForList(sql.toString(), Integer.class, args.toArray());
		List<Map<String, Object>> results = new ArrayList<>();
		for (Integer id : ids.subList(0, Math.min(size, ids.size())))
			results.add(prescriptionView((DrugOrder) Context.getOrderService().getOrder(id), false));
		AuthorizationService.auditReadStatic("dispensing_worklist", null, null, null, "results=" + results.size());
		return CareService.page(results, ids.size() > size, size, skip);
	}

	public Map<String, Object> prescription(String orderUuid) {
		AuthorizationService.requireOperation("dispensing", "read");
		DrugOrder order = drugOrder(orderUuid);
		AuthorizationService.requireEncounterScopeStatic(order.getEncounter());
		AuthorizationService.auditReadStatic("dispensing", order.getPatient(), order.getEncounter(), order.getUuid(),
		    "prescription");
		return prescriptionView(order, true);
	}

	/** Records one dispense against a drug order; a retried request returns the original record. */
	public Map<String, Object> dispense(Map<String, Object> body) {
		AuthorizationService.requireOperation("dispensing", "create");
		String key = CareService.idempotency(body);
		DrugOrder order = drugOrder(requiredString(body, "order"));
		Encounter encounter = order.getEncounter();
		AuthorizationService.requireEncounterScopeStatic(encounter);
		BigDecimal quantity = quantity(body.get("quantity"));
		TransactionLocks.lock(sessionFactory, "dispense-order:" + order.getOrderId());
		List<Map<String, Object>> replay = jdbc.queryForList("SELECT * FROM vinshc_dispense WHERE idempotency_key=?", key);
		if (!replay.isEmpty()) {
			Map<String, Object> row = replay.get(0);
			if (((Number) row.get("order_id")).intValue() != order.getOrderId()
			        || ((BigDecimal) row.get("quantity")).compareTo(quantity) != 0)
				throw new OperationsService.OperationsConflictException(
				        "idempotency key was already used with another dispense payload");
			return dispenseView(row, order);
		}
		Context.refreshEntity(order);
		if (order.getVoided() || !order.isActive())
			throw new OperationsService.OperationsConflictException("prescription is not active (discontinued or expired)");
		if (visitCancelled(encounter.getVisit()))
			throw new OperationsService.OperationsConflictException("visit was cancelled; dispensing is blocked");
		if (order.getQuantity() == null || order.getQuantity() <= 0)
			throw bad("prescription has no dispensable quantity");
		BigDecimal prescribed = BigDecimal.valueOf(order.getQuantity());
		BigDecimal already = dispensed(order);
		if (already.add(quantity).compareTo(prescribed) > 0)
			throw new OperationsService.OperationsConflictException(
			        "quantity exceeds the remaining prescribed quantity " + prescribed.subtract(already).stripTrailingZeros()
			                .toPlainString());
		String batch = optionalString(body, "batchNumber");
		batch = batch == null || batch.trim().isEmpty() ? null : batch.trim();
		limit(batch, 64, "batchNumber");
		LocalDate expiry = null;
		String rawExpiry = optionalString(body, "expiryDate");
		if (rawExpiry != null && !rawExpiry.trim().isEmpty()) {
			expiry = day(rawExpiry.trim());
			if (expiry.isBefore(LocalDate.now(CareService.CLINIC_ZONE)))
				throw bad("batch is already expired");
		}
		String note = optionalString(body, "note");
		note = note == null || note.trim().isEmpty() ? null : note.trim();
		limit(note, 1000, "note");
		Location location = encounter.getLocation() != null ? encounter.getLocation()
		        : encounter.getVisit() == null ? null : encounter.getVisit().getLocation();
		if (location == null)
			throw VinshcService.misconfigured("prescription encounter is not bound to a location");
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_dispense(dispense_uuid,order_id,patient_id,visit_id,facility_location_id,quantity,batch_number,"
		            + "expiry_date,note,status,idempotency_key,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,'completed',?,?,?)",
		    uuid, order.getOrderId(), order.getPatient().getPatientId(),
		    encounter.getVisit() == null ? null : encounter.getVisit().getVisitId(), location.getLocationId(), quantity, batch,
		    expiry == null ? null : java.sql.Date.valueOf(expiry), note, key, Context.getAuthenticatedUser().getUserId(),
		    Timestamp.from(Instant.now()));
		ClinicalEvents.record(sessionFactory, "medication_dispensed", order.getPatient(), encounter, uuid, null,
		    "order " + order.getUuid() + "; quantity " + quantity.stripTrailingZeros().toPlainString()
		            + (batch == null ? "" : "; batch " + batch));
		return dispenseView(jdbc.queryForMap("SELECT * FROM vinshc_dispense WHERE dispense_uuid=?", uuid), order);
	}

	public Map<String, Object> dispenseRecord(String uuid) {
		AuthorizationService.requireOperation("dispensing", "read");
		List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM vinshc_dispense WHERE dispense_uuid=?",
		    canonicalUuid(uuid, "dispense"));
		if (rows.isEmpty())
			throw bad("dispense does not exist");
		DrugOrder order = (DrugOrder) Context.getOrderService().getOrder(((Number) rows.get(0).get("order_id")).intValue());
		AuthorizationService.requireEncounterScopeStatic(order.getEncounter());
		return dispenseView(rows.get(0), order);
	}

public Map<String, Object> reviseDispense(String dispenseUuid, Map<String, Object> body, boolean voiding) {
		AuthorizationService.requireOperation("dispensing", voiding ? "void" : "update");
		if (body == null
		        || body.keySet().stream()
		                .anyMatch(key -> !("reason".equals(key) || "quantity".equals(key) || "batchNumber".equals(key)
		                        || "expiryDate".equals(key) || "expectedVersion".equals(key)
		                        || "idempotencyKey".equals(key))))
			throw bad("unsupported dispense revision field");
		String key = CareService.idempotency(body);
		String reason = requiredString(body, "reason");
		if (reason.trim().isEmpty())
			throw bad("revision reason is required");
		reason = reason.trim();
		limit(reason, 1000, "reason");
		if (!(body.get("expectedVersion") instanceof Number))
			throw bad("expectedVersion is required");
		int expected = ((Number) body.get("expectedVersion")).intValue();
		if (expected < 0)
			throw bad("expectedVersion cannot be negative");
		List<Map<String, Object>> origins = jdbc.queryForList("SELECT * FROM vinshc_dispense WHERE dispense_uuid=?",
		    canonicalUuid(dispenseUuid, "dispense"));
		if (origins.isEmpty())
			throw bad("dispense does not exist");
		Map<String, Object> origin = origins.get(0);
		DrugOrder order = (DrugOrder) Context.getOrderService().getOrder(((Number) origin.get("order_id")).intValue());
		AuthorizationService.requireEncounterScopeStatic(order.getEncounter());
		TransactionLocks.lock(sessionFactory, "dispense-order:" + order.getOrderId());
		List<Map<String, Object>> existing = jdbc
		        .queryForList("SELECT * FROM vinshc_dispense_revision WHERE idempotency_key=?", key);
		if (!existing.isEmpty()) {
			Map<String, Object> row = existing.get(0);
			BigDecimal requested = voiding ? BigDecimal.ZERO : quantity(body.get("quantity"));
			if (!row.get("dispense_id").equals(origin.get("dispense_id"))
			        || ((Number) row.get("version_number")).intValue() != expected + 1
			        || ((BigDecimal) row.get("effective_quantity")).compareTo(requested) != 0
			        || !row.get("action").equals(voiding ? "voided" : "corrected") || !row.get("reason").equals(reason))
				throw new OperationsService.OperationsConflictException("revision key reused with a different payload");
			return dispenseRecord(dispenseUuid);
		}
		List<Map<String, Object>> revisions = jdbc.queryForList(
		    "SELECT * FROM vinshc_dispense_revision WHERE dispense_id=? ORDER BY version_number DESC LIMIT 1",
		    origin.get("dispense_id"));
		int current = revisions.isEmpty() ? 0 : ((Number) revisions.get(0).get("version_number")).intValue();
		if (current != expected)
			throw new OperationsService.OperationsConflictException("dispense revision changed; reload the latest version");
		BigDecimal old = revisions.isEmpty() ? (BigDecimal) origin.get("quantity")
		        : (BigDecimal) revisions.get(0).get("effective_quantity");
		BigDecimal replacement = voiding ? BigDecimal.ZERO : quantity(body.get("quantity"));
		if (voiding && (body.containsKey("quantity") || body.containsKey("batchNumber") || body.containsKey("expiryDate")))
			throw bad("void accepts only reason, version and idempotency key");
		if (!voiding && !order.isActive() && replacement.compareTo(old) > 0)
			throw new OperationsService.OperationsConflictException("cannot increase dispense on inactive order");
		if (old.compareTo(BigDecimal.ZERO) == 0 && replacement.signum() > 0)
			throw new OperationsService.OperationsConflictException("voided dispense cannot be reactivated");
		BigDecimal revisedTotal = dispensed(order).subtract(old).add(replacement);
		BigDecimal prescribed = BigDecimal.valueOf(order.getQuantity());
		if (revisedTotal.signum() < 0 || revisedTotal.compareTo(prescribed) > 0)
			throw new OperationsService.OperationsConflictException("corrected quantity is outside prescribed range");
		String batch = revisions.isEmpty() ? (String) origin.get("batch_number")
		        : (String) revisions.get(0).get("batch_number");
		java.sql.Date expiry = revisions.isEmpty() ? (java.sql.Date) origin.get("expiry_date")
		        : (java.sql.Date) revisions.get(0).get("expiry_date");
		if (body.containsKey("batchNumber")) {
			batch = optionalString(body, "batchNumber");
			limit(batch, 64, "batchNumber");
		}
		if (body.containsKey("expiryDate")) {
			String raw = optionalString(body, "expiryDate");
			expiry = raw == null ? null : java.sql.Date.valueOf(day(raw));
		}
		String revisionUuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_dispense_revision"
		            + "(revision_uuid,dispense_id,version_number,effective_quantity,batch_number,expiry_date,"
		            + "reason,action,idempotency_key,creator,date_created)" + " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
		    revisionUuid, origin.get("dispense_id"), current + 1, replacement, batch, expiry, reason,
		    voiding ? "voided" : "corrected", key, Context.getAuthenticatedUser().getUserId(),
		    Timestamp.from(Instant.now()));
		ClinicalEvents.record(sessionFactory, voiding ? "medication_dispense_voided" : "medication_dispense_corrected",
		    order.getPatient(), order.getEncounter(), revisionUuid, null,
		    "original " + dispenseUuid + "; version " + (current + 1));
		return dispenseRecord(dispenseUuid);
	}

	// ---------------------------------------------------------------- views

	private Map<String, Object> prescriptionView(DrugOrder order, boolean withDispenses) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", order.getUuid());
		out.put("orderUuid", order.getUuid());
		out.put("orderNumber", order.getOrderNumber());
		out.put("patient", CareService.patientSummary(order.getPatient()));
		out.put("patientUuid", order.getPatient().getUuid());
		out.put("patientName", CareService.fullName(order.getPatient().getPersonName()));
		Encounter encounter = order.getEncounter();
		out.put("encounterUuid", encounter.getUuid());
		Visit visit = encounter.getVisit();
		out.put("visitUuid", visit == null ? null : visit.getUuid());
		out.put("visitStatus", visit == null ? null : visit.getStopDatetime() == null ? "open" : "closed");
		out.put("visitCancelled", visitCancelled(visit));
		Map<String, Object> drug = new LinkedHashMap<>();
		drug.put("uuid", order.getDrug() == null ? null : order.getDrug().getUuid());
		drug.put("name", order.getDrug() == null ? null : order.getDrug().getName());
		drug.put("strength", order.getDrug() == null ? null : order.getDrug().getStrength());
		out.put("drug", drug);
		out.put("drugName", drug.get("name"));
		out.put("dose", order.getDose());
		out.put("doseUnits", display(order.getDoseUnits()));
		out.put("route", display(order.getRoute()));
		out.put("frequency", order.getFrequency() == null ? null : display(order.getFrequency().getConcept()));
		out.put("duration", order.getDuration());
		out.put("durationUnits", display(order.getDurationUnits()));
		out.put("quantity", order.getQuantity());
		out.put("quantityUnits", display(order.getQuantityUnits()));
		out.put("asNeeded", order.getAsNeeded());
		out.put("dosingInstructions", order.getDosingInstructions());
		out.put("orderer", order.getOrderer() == null ? null : CareService.providerView(order.getOrderer(), null));
		out.put("dateActivated", CareService.iso(order.getDateActivated()));
		out.put("status", order.getVoided() ? "voided"
		        : order.getDateStopped() != null ? "discontinued" : order.isExpired() ? "expired" : "active");
		BigDecimal dispensed = dispensed(order);
		BigDecimal prescribed = order.getQuantity() == null ? BigDecimal.ZERO : BigDecimal.valueOf(order.getQuantity());
		out.put("dispensedQuantity", number(dispensed));
		out.put("remainingQuantity", number(prescribed.subtract(dispensed).max(BigDecimal.ZERO)));
		out.put("dispenseStatus", dispensed.signum() == 0 ? "pending" : dispensed.compareTo(prescribed) >= 0 ? "complete"
		        : "partial");
		Number finalized = jdbc.queryForObject("SELECT count(*) FROM vinshc_clinical_event WHERE encounter_id=?"
		        + " AND event_type='consultation_finalized'", Number.class, encounter.getEncounterId());
		out.put("consultationFinalized", finalized.longValue() > 0);
		if (withDispenses) {
			List<Map<String, Object>> dispenses = new ArrayList<>();
			for (Map<String, Object> row : jdbc
			        .queryForList("SELECT * FROM vinshc_dispense WHERE order_id=? ORDER BY dispense_id", order.getOrderId()))
				dispenses.add(dispenseRow(row));
			out.put("dispenses", dispenses);
		}
		return out;
	}

	private Map<String, Object> dispenseView(Map<String, Object> row, DrugOrder order) {
		Map<String, Object> out = dispenseRow(row);
		out.put("prescription", prescriptionView(order, false));
		return out;
	}

	private Map<String, Object> dispenseRow(Map<String, Object> row) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", row.get("dispense_uuid"));
		out.put("quantity", number((BigDecimal) row.get("quantity")));
		List<Map<String, Object>> revisions = jdbc
		        .queryForList("SELECT r.revision_uuid,r.version_number,r.effective_quantity,r.batch_number,r.expiry_date,"
		                + "r.reason,r.action,r.date_created,u.uuid AS actor_uuid"
		                + " FROM vinshc_dispense_revision r JOIN users u ON u.user_id=r.creator"
		                + " WHERE r.dispense_id=? ORDER BY r.version_number",
		            row.get("dispense_id"));
		Map<String, Object> last = revisions.isEmpty() ? null : revisions.get(revisions.size() - 1);
		out.put("effectiveQuantity",
		    number(last == null ? (BigDecimal) row.get("quantity") : (BigDecimal) last.get("effective_quantity")));
		out.put("revisionVersion", last == null ? 0 : ((Number) last.get("version_number")).intValue());
		out.put("effectiveStatus", last != null && "voided".equals(last.get("action")) ? "voided" : "completed");
		out.put("batchNumber", last == null ? row.get("batch_number") : last.get("batch_number"));
		Object expiry = last == null ? row.get("expiry_date") : last.get("expiry_date");
		out.put("expiryDate", expiry == null ? null : expiry.toString());
		out.put("revisions", revisions);
		out.put("note", row.get("note"));
		out.put("status", row.get("status"));
		out.put("dispensedAt", CareService.iso((java.util.Date) row.get("date_created")));
		out.put("dispensedByUserUuid",
		    jdbc.queryForObject("SELECT uuid FROM users WHERE user_id=?", String.class, row.get("creator")));
		return out;
	}

	// ---------------------------------------------------------------- helpers

	private BigDecimal dispensed(Order order) {
		BigDecimal value = jdbc.queryForObject(
		    "SELECT COALESCE(sum(COALESCE((SELECT r.effective_quantity FROM vinshc_dispense_revision r"
		            + " WHERE r.dispense_id=x.dispense_id ORDER BY r.version_number DESC LIMIT 1),x.quantity)),0)"
		            + " FROM vinshc_dispense x WHERE x.order_id=? AND x.status='completed'",
		    BigDecimal.class, order.getOrderId());
		return value == null ? BigDecimal.ZERO : value;
	}

	private boolean visitCancelled(Visit visit) {
		if (visit == null || visit.getVisitId() == null)
			return false;
		Number count = jdbc.queryForObject("SELECT count(*) FROM obs o JOIN encounter e ON e.encounter_id=o.encounter_id"
		        + " JOIN concept q ON q.concept_id=o.concept_id JOIN concept a ON a.concept_id=o.value_coded"
		        + " WHERE e.visit_id=? AND o.voided=false AND e.voided=false AND q.uuid=? AND a.uuid=?",
		    Number.class, visit.getVisitId(), CLOSE_REASON, CANCELLED_VISIT_ANSWER);
		return count.longValue() > 0;
	}

	private static DrugOrder drugOrder(String uuid) {
		Order order = Context.getOrderService().getOrderByUuid(canonicalUuid(uuid, "order"));
		if (!(order instanceof DrugOrder) || order.getVoided() || order.getAction() != Order.Action.NEW)
			throw bad("drug order does not exist");
		return (DrugOrder) order;
	}

	private static BigDecimal quantity(Object raw) {
		if (!(raw instanceof Number) || raw instanceof Boolean)
			throw bad("quantity must be a JSON number");
		BigDecimal value;
		try {
			value = new BigDecimal(raw.toString());
		}
		catch (NumberFormatException ex) {
			throw bad("quantity must be a JSON number");
		}
		if (value.signum() <= 0 || value.scale() > 4 || value.compareTo(BigDecimal.valueOf(100000)) > 0)
			throw bad("quantity must be > 0, at most 100000 and have at most 4 decimals");
		return value;
	}

	private static LocalDate day(String value) {
		try {
			return LocalDate.parse(value);
		}
		catch (DateTimeParseException ex) {
			throw bad("date must be YYYY-MM-DD");
		}
	}

	/** JSON-friendly number: integral quantities as integers, never exponent notation. */
	private static Number number(BigDecimal value) {
		BigDecimal stripped = value.stripTrailingZeros();
		return stripped.scale() <= 0 ? (Number) stripped.longValueExact() : (Number) stripped.doubleValue();
	}
	
	private static String display(Concept concept) {
		return concept == null ? null : concept.getDisplayString();
	}
}
