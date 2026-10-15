package org.openmrs.module.vinshc.service;

import static org.openmrs.module.vinshc.service.VinshcService.bad;
import static org.openmrs.module.vinshc.service.VinshcService.canonicalUuid;
import static org.openmrs.module.vinshc.service.VinshcService.objectMap;
import static org.openmrs.module.vinshc.service.VinshcService.optionalString;
import static org.openmrs.module.vinshc.service.VinshcService.requiredString;

import java.io.File;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.openmrs.CareSetting;
import org.openmrs.Concept;
import org.openmrs.DrugOrder;
import org.openmrs.Encounter;
import org.openmrs.EncounterProvider;
import org.openmrs.Location;
import org.openmrs.Order;
import org.openmrs.OrderType;
import org.openmrs.Patient;
import org.openmrs.PatientIdentifier;
import org.openmrs.Provider;
import org.openmrs.TestOrder;
import org.openmrs.User;
import org.openmrs.Visit;
import org.openmrs.api.context.Context;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * B8 clinic-operations adapter. Upstream appointment, queue and billing module schemas are not a
 * stable cross-module contract, so VinSHC owns the transaction boundaries, validation and audit
 * projections while keeping clinical orders in native OpenMRS Order storage.
 */
@Transactional
public class OperationsService {

	private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

	private static final String OUTPATIENT_CARE_SETTING = "6f0c9a92-6f24-11e3-af88-005056821db0";

	private static final long MAX_MONEY = 9007199254740991L;

	private static final long MAX_ATTACHMENT = 20971520L;

	private static final Set<String> APPOINTMENT_STATES = set("booked", "confirmed", "arrived", "fulfilled", "cancelled",
	    "no_show");

	private static final Set<String> QUEUE_STATES = set("waiting", "called", "in_service", "completed", "cancelled", "left");

	private static final Set<String> EXIT_REASONS = set("patient_requested", "duplicate_registration", "service_unavailable",
	    "referred_elsewhere", "other");

	private static final Set<String> ORDER_STATES = set("requested", "assigned", "in_progress", "completed", "cancelled",
	    "entered-in-error");

	private static final Set<String> RESULT_STATES = set("draft", "preliminary", "final", "corrected", "entered-in-error");

	private static final Set<String> BILL_STATES = set("unpaid", "partially_paid", "paid", "refunded", "cancelled");

	private static final ObjectMapper JSON = new ObjectMapper();

	private static final Map<String, Set<String>> APPOINTMENT_TRANSITIONS = transitions("booked",
	    set("confirmed", "arrived", "cancelled"), "confirmed", set("arrived", "cancelled", "no_show"), "arrived",
	    set("fulfilled", "cancelled"));

	private static final Map<String, Set<String>> QUEUE_TRANSITIONS = transitions("waiting",
	    set("called", "cancelled", "left"), "called", set("in_service", "waiting", "cancelled", "left"), "in_service",
	    set("completed", "cancelled", "left"));

	private static final Map<String, Set<String>> ORDER_TRANSITIONS = transitions("requested",
	    set("assigned", "cancelled", "entered-in-error"), "assigned", set("in_progress", "cancelled", "entered-in-error"),
	    "in_progress", set("completed", "cancelled", "entered-in-error"));

	private final JdbcTemplate jdbc;

	private final SessionFactory sessionFactory;

	private final NotificationService notifications;

	private volatile Metadata metadata;

	public OperationsService(SessionFactory sessionFactory, NotificationService notifications) {
		ConnectionProvider provider = ((SessionFactoryImplementor) sessionFactory).getServiceRegistry()
		        .getService(ConnectionProvider.class);
		this.jdbc = new JdbcTemplate(provider.unwrap(javax.sql.DataSource.class));
		this.sessionFactory = sessionFactory;
		this.notifications = notifications;
	}

	// ---------------------------------------------------------------- configuration

	public Map<String, Object> configuration() {
		AuthorizationService.requireAuthenticated();
		Metadata m = metadata();
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("version", "0.3.0");
		out.put("timezone", CLINIC_ZONE.getId());
		out.put("currency", "VND");
		out.put("testOnly", true);
		out.put("productionUploadEnabled", false);
		out.put("attachmentMimeTypes", Arrays.asList("application/pdf", "image/jpeg", "image/png"));
		out.put("attachmentMaxBytes", MAX_ATTACHMENT);
		out.put("workflowConfigs", new ArrayList<>(m.configs.values()));
		out.put("adapterStrategy",
		    "VinSHC transaction adapter over pinned OpenMRS modules; native TestOrder for ServiceRequest");
		out.put("upstreamBoundaries",
		    Arrays.asList("appointments/queue/billing schemas are not used as an application contract",
		        "attachment bytes are private files under /openmrs/data with database metadata",
		        "production catalogues, malware scanning and external integrations remain disabled"));
		return out;
	}

	// ---------------------------------------------------------------- appointments

	public Map<String, Object> createAppointment(Map<String, Object> body) {
		require("appointment", "create");
		Patient patient = patient(requiredString(body, "patient"));
		String facilityUuid = canonicalUuid(requiredString(body, "facility"), "facility");
		Location facility = facilityLocation(facilityUuid);
		AuthorizationService.requireLocationScopeStatic(facility);
		Provider provider = provider(requiredString(body, "provider"));
		Map<String, Object> service = service(requiredString(body, "service"));
		if (!facilityUuid.equals(service.get("facilityUuid")))
			throw bad("service is not active for this facility");
		String type = requiredString(body, "appointmentType");
		if (!metadata().appointmentTypes.contains(type))
			throw bad("unknown appointmentType");
		Instant start = instant(body.get("startAt"), "startAt");
		Instant end = instant(body.get("endAt"), "endAt");
		if (!start.isBefore(end))
			throw bad("appointment startAt must precede endAt");
		String key = idempotency(body);
		Map<String, Object> existing = one("SELECT * FROM vinshc_appointment WHERE idempotency_key=?", key);
		if (existing != null) {
			if (!number(existing.get("patient_id")).equals(patient.getPatientId())
			        || !number(existing.get("provider_id")).equals(provider.getProviderId())
			        || !timestamp(existing.get("start_at")).toInstant().equals(start)
			        || !timestamp(existing.get("end_at")).toInstant().equals(end))
				throw conflict("idempotency key was already used with another appointment payload");
			return appointmentView(existing);
		}
		// A slot is exclusive per provider and per patient; other providers of the same facility stay
		// bookable. Locks are always taken provider-first so two bookings cannot deadlock.
		lock("appointment:provider:" + provider.getProviderId());
		lock("appointment:patient:" + patient.getPatientId());
		Number overlaps = jdbc.queryForObject(
		    "SELECT count(*) FROM vinshc_appointment WHERE status NOT IN ('cancelled','no_show')"
		            + " AND start_at<? AND end_at>? AND (provider_id=? OR patient_id=?)",
		    Number.class, Timestamp.from(end), Timestamp.from(start), provider.getProviderId(), patient.getPatientId());
		if (overlaps.longValue() != 0)
			throw conflict("provider or patient has an overlapping appointment");
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_appointment(appointment_uuid,patient_id,facility_location_id,provider_id,service_uuid,appointment_type,start_at,end_at,status,note,idempotency_key,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    uuid, patient.getPatientId(), facility.getLocationId(), provider.getProviderId(), service.get("uuid"), type,
		    Timestamp.from(start), Timestamp.from(end), "booked", bounded(optionalString(body, "note"), 1000, "note"), key,
		    actorId(), now());
		return appointment(uuid);
	}

	public Map<String, Object> transitionAppointment(String uuid, Map<String, Object> body) {
		String target = requiredString(body, "status");
		require("appointment", "cancelled".equals(target) ? "cancel" : "update");
		if (!APPOINTMENT_STATES.contains(target))
			throw bad("invalid appointment status");
		Map<String, Object> row = appointmentRow(uuid);
		lock("appointment:" + row.get("appointment_id"));
		row = appointmentRow(uuid);
		String current = string(row.get("status"));
		if (!APPOINTMENT_TRANSITIONS.getOrDefault(current, Collections.<String> emptySet()).contains(target))
			throw conflict("invalid appointment transition " + current + " -> " + target);
		if ("no_show".equals(target) && Instant.now().isBefore(timestamp(row.get("start_at")).toInstant()))
			throw conflict("no_show cannot be recorded before the slot starts");
		jdbc.update("UPDATE vinshc_appointment SET status=?,changed_by=?,date_changed=? WHERE appointment_id=?", target,
		    actorId(), now(), row.get("appointment_id"));
		return appointment(uuid);
	}

	public Map<String, Object> appointment(String uuid) {
		require("appointment", "read");
		return appointmentView(appointmentRow(uuid));
	}

	/** Loads an appointment and enforces that it belongs to the caller's facility workspace. */
	private Map<String, Object> appointmentRow(String uuid) {
		Map<String, Object> row = required("vinshc_appointment", "appointment_uuid", canonicalUuid(uuid, "appointment"),
		    "appointment");
		requireLocationIdScope(row.get("facility_location_id"));
		return row;
	}

	private Map<String, Object> appointmentView(Map<String, Object> row) {
		Map<String, Object> out = baseView(row, "appointment_uuid");
		out.put("patientUuid", uuid("patient", "patient_id", row.get("patient_id")));
		out.put("visitUuid", uuidNullable("visit", "visit_id", row.get("visit_id")));
		out.put("facilityLocationUuid", uuid("location", "location_id", row.get("facility_location_id")));
		out.put("providerUuid", uuidNullable("provider", "provider_id", row.get("provider_id")));
		out.put("serviceUuid", row.get("service_uuid"));
		out.put("appointmentType", row.get("appointment_type"));
		out.put("startAt", iso(row.get("start_at")));
		out.put("endAt", iso(row.get("end_at")));
		out.put("status", row.get("status"));
		out.put("note", row.get("note"));
		return out;
	}

	// ---------------------------------------------------------------- queue

	public Map<String, Object> createQueue(Map<String, Object> body) {
		require("queue", "create");
		Patient patient = patient(requiredString(body, "patient"));
		Visit visit = visit(requiredString(body, "visit"));
		if (!visit.getPatient().getPatientId().equals(patient.getPatientId()))
			throw bad("visit belongs to another patient");
		AuthorizationService.requireLocationScopeStatic(visit.getLocation());
		return createQueueInternal(patient, visit, requiredString(body, "config"), requiredString(body, "point"),
		    optionalString(body, "provider"), idempotency(body));
	}

	public Map<String, Object> transitionQueue(String uuid, Map<String, Object> body) {
		String target = requiredString(body, "state");
		require("queue", "cancelled".equals(target) || "left".equals(target) ? "cancel" : "update");
		if (!QUEUE_STATES.contains(target))
			throw bad("invalid queue state");
		Map<String, Object> row = queueRow(uuid);
		lock("queue-item:" + row.get("queue_item_id"));
		row = queueRow(uuid);
		String current = string(row.get("state"));
		if (!QUEUE_TRANSITIONS.getOrDefault(current, Collections.<String> emptySet()).contains(target))
			throw conflict("invalid queue transition " + current + " -> " + target);
		String reason = optionalString(body, "exitReason");
		if (("cancelled".equals(target) || "left".equals(target)) && !EXIT_REASONS.contains(reason))
			throw bad("cancelled/left queue state requires a known exitReason");
		if (!("cancelled".equals(target) || "left".equals(target)) && reason != null)
			throw bad("exitReason is only valid for cancelled/left");
		jdbc.update("UPDATE vinshc_queue_item SET state=?,exit_reason=?,changed_by=?,date_changed=? WHERE queue_item_id=?",
		    target, reason, actorId(), now(), row.get("queue_item_id"));
		return queue(uuid);
	}

	public Map<String, Object> advanceQueue(String uuid, Map<String, Object> body) {
		require("queue", "update");
		Map<String, Object> row = queueRow(uuid);
		lock("queue-item:" + row.get("queue_item_id"));
		row = queueRow(uuid);
		String target = requiredString(body, "nextPoint");
		Map<String, Object> replay = one("SELECT * FROM vinshc_queue_item WHERE idempotency_key=?", idempotency(body));
		if (replay != null && number(replay.get("visit_id")).equals(number(row.get("visit_id")))
		        && target.equals(replay.get("point_code")))
			return queueView(replay);
		if (!"in_service".equals(row.get("state")))
			throw conflict("only an in_service queue item can advance");
		assertLaterPoint(string(row.get("config_code")), string(row.get("point_code")), target);
		jdbc.update("UPDATE vinshc_queue_item SET state='completed',changed_by=?,date_changed=? WHERE queue_item_id=?",
		    actorId(), now(), row.get("queue_item_id"));
		Patient patient = Context.getPatientService().getPatient(number(row.get("patient_id")).intValue());
		Visit visit = Context.getVisitService().getVisit(number(row.get("visit_id")).intValue());
		String key = idempotency(body);
		return createQueueInternal(patient, visit, string(row.get("config_code")), target, optionalString(body, "provider"),
		    key);
	}

	public Map<String, Object> queue(String uuid) {
		require("queue", "read");
		return queueView(queueRow(uuid));
	}

	private Map<String, Object> queueRow(String uuid) {
		Map<String, Object> row = required("vinshc_queue_item", "queue_item_uuid", canonicalUuid(uuid, "queue item"),
		    "queue item");
		requireLocationIdScope(row.get("facility_location_id"));
		return row;
	}

	private Map<String, Object> createQueueInternal(Patient patient, Visit visit, String config, String point,
	        String providerUuid, String key) {
		workflowConfig(config);
		Map<String, Object> pointRecord = metadata().queuePoints.get(point);
		if (pointRecord == null)
			throw bad("unknown queue point");
		assertPointInConfig(config, point);
		Map<String, Object> existing = one("SELECT * FROM vinshc_queue_item WHERE idempotency_key=?", key);
		if (existing != null) {
			if (!number(existing.get("visit_id")).equals(visit.getVisitId()) || !point.equals(existing.get("point_code")))
				throw conflict("idempotency key was already used with another queue payload");
			return queueView(existing);
		}
		Provider provider = providerUuid == null ? null : provider(providerUuid);
		Location location = Context.getLocationService().getLocationByUuid(string(pointRecord.get("locationUuid")));
		if (location == null || location.getRetired())
			throw new VinshcExceptions.Configuration("queue point location is not provisioned: " + point);
		AuthorizationService.requireLocationScopeStatic(location);
		lock("queue:" + location.getUuid() + ":" + point + ":" + LocalDate.now(CLINIC_ZONE));
		Number iteration = jdbc.queryForObject(
		    "SELECT COALESCE(max(iteration),0)+1 FROM vinshc_queue_item WHERE visit_id=? AND point_code=?", Number.class,
		    visit.getVisitId(), point);
		Number queueNumber = jdbc.queryForObject(
		    "SELECT COALESCE(max(queue_number),0)+1 FROM vinshc_queue_item WHERE facility_location_id=? AND point_code=? AND date_created>=? AND date_created<?",
		    Number.class, location.getLocationId(), point, Timestamp.from(dayStart(LocalDate.now(CLINIC_ZONE))),
		    Timestamp.from(dayStart(LocalDate.now(CLINIC_ZONE).plusDays(1))));
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_queue_item(queue_item_uuid,patient_id,visit_id,facility_location_id,provider_id,config_code,point_code,iteration,queue_number,state,idempotency_key,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,?,'waiting',?,?,?)",
		    uuid, patient.getPatientId(), visit.getVisitId(), location.getLocationId(),
		    provider == null ? null : provider.getProviderId(), config, point, iteration.intValue(), queueNumber.intValue(),
		    key, actorId(), now());
		if (provider != null)
			notifications.assignedDoctor(provider.getProviderId(), location.getLocationId(), uuid, visit.getUuid());
		return queue(uuid);
	}

	private Map<String, Object> queueView(Map<String, Object> row) {
		Map<String, Object> out = baseView(row, "queue_item_uuid");
		out.put("patientUuid", uuid("patient", "patient_id", row.get("patient_id")));
		out.put("visitUuid", uuid("visit", "visit_id", row.get("visit_id")));
		out.put("locationUuid", uuid("location", "location_id", row.get("facility_location_id")));
		out.put("providerUuid", uuidNullable("provider", "provider_id", row.get("provider_id")));
		out.put("config", row.get("config_code"));
		out.put("point", row.get("point_code"));
		out.put("iteration", row.get("iteration"));
		out.put("queueNumber", row.get("queue_number"));
		out.put("state", row.get("state"));
		out.put("exitReason", row.get("exit_reason"));
		return out;
	}

	// ---------------------------------------------------------------- billing

	public Map<String, Object> createBill(Map<String, Object> body) {
		require("billing", "create");
		Patient patient = patient(requiredString(body, "patient"));
		Visit visit = visit(requiredString(body, "visit"));
		if (!visit.getPatient().getPatientId().equals(patient.getPatientId()))
			throw bad("visit belongs to another patient");
		String facility = canonicalUuid(requiredString(body, "facility"), "facility");
		Location facilityLocation = facilityLocation(facility);
		AuthorizationService.requireLocationScopeStatic(facilityLocation);
		if (!sameOrBelow(visit.getLocation(), facilityLocation))
			throw bad("visit does not belong to this facility");
		String timing = requiredString(body, "paymentTiming");
		if (!"prepay".equals(timing) && !"postpay".equals(timing))
			throw bad("paymentTiming must be prepay or postpay");
		Object rawLines = body.get("lines");
		if (!(rawLines instanceof List) || ((List<?>) rawLines).isEmpty())
			throw bad("bill requires at least one line");
		List<Map<String, Object>> lines = new ArrayList<>();
		long total = 0;
		for (Object raw : (List<?>) rawLines) {
			Map<String, Object> requested = objectMap(raw);
			Map<String, Object> service = service(requiredString(requested, "service"));
			Map<String, Object> price = priceFor(string(service.get("uuid")), facility);
			int quantity = integer(requested.get("quantity"), "quantity");
			if (quantity < 1 || quantity > 10000)
				throw bad("quantity must be between 1 and 10000");
			long gross = multiplyMoney(money(price.get("amountVnd"), "unitPriceVnd", true), quantity);
			long discount = requested.get("discountVnd") == null ? 0
			        : money(requested.get("discountVnd"), "discountVnd", true);
			if (discount > gross)
				throw bad("discountVnd cannot exceed line gross");
			long net = gross - discount;
			total = addMoney(total, net);
			Map<String, Object> line = new LinkedHashMap<>();
			line.put("serviceUuid", service.get("uuid"));
			line.put("serviceCode", service.get("code"));
			line.put("serviceName", service.get("name"));
			line.put("priceUuid", price.get("uuid"));
			line.put("priceVersion", price.get("version"));
			line.put("unitPriceVnd", price.get("amountVnd"));
			line.put("quantity", quantity);
			line.put("discountVnd", discount);
			line.put("netVnd", net);
			line.put("facilityUuid", facility);
			line.put("recordedAt", Instant.now().toString());
			lines.add(line);
		}
		String key = idempotency(body);
		Map<String, Object> replay = one("SELECT * FROM vinshc_bill WHERE idempotency_key=?", key);
		if (replay != null) {
			if (!number(replay.get("patient_id")).equals(patient.getPatientId())
			        || number(replay.get("total_vnd")).longValue() != total)
				throw conflict("idempotency key was already used with another bill payload");
			return billView(replay);
		}
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_bill(bill_uuid,patient_id,visit_id,facility_uuid,currency,payment_timing,lines_json,total_vnd,status,idempotency_key,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,'unpaid',?,?,?)",
		    uuid, patient.getPatientId(), visit.getVisitId(), facility, "VND", timing, json(lines), total, key, actorId(),
		    now());
		return bill(uuid);
	}

	public Map<String, Object> bill(String uuid) {
		require("billing", "read");
		return billView(billRow(uuid));
	}

	/**
	 * Pending receipts of a cancelled bill are cancelled too, so they can never be settled later and
	 * flip the bill back to paid.
	 */
	public Map<String, Object> cancelBill(String uuid, Map<String, Object> body) {
		require("billing", "cancel");
		String reason = bounded(requiredString(body, "reason"), 1000, "reason");
		Map<String, Object> bill = lockedBill(billRow(uuid).get("bill_id"));
		if ("cancelled".equals(bill.get("status")))
			throw conflict("bill is already cancelled");
		if (settledReceipts(bill) > 0)
			throw conflict("paid bill requires explicit refund and cannot be cancelled");
		jdbc.update(
		    "UPDATE vinshc_payment SET status='cancelled',reason='bill cancelled'"
		            + " WHERE bill_id=? AND kind='receipt' AND status='pending'",
		    bill.get("bill_id"));
		jdbc.update("UPDATE vinshc_bill SET status='cancelled',cancel_reason=?,changed_by=?,date_changed=? WHERE bill_id=?",
		    reason, actorId(), now(), bill.get("bill_id"));
		return bill(uuid);
	}

	public Map<String, Object> receipt(String billUuid, Map<String, Object> body) {
		require("payment", "create");
		long amount = money(body.get("amountVnd"), "amountVnd", false);
		String method = requiredString(body, "method");
		if (!"cash".equals(method) && !"bank_transfer".equals(method))
			throw bad("method must be cash or bank_transfer");
		String status = optionalString(body, "status");
		if (status == null)
			status = "cash".equals(method) ? "settled" : "pending";
		if (!"settled".equals(status) && !("bank_transfer".equals(method) && "pending".equals(status)))
			throw bad("cash must settle immediately; bank_transfer may be pending or settled");
		String key = idempotency(body);
		Map<String, Object> bill = lockedBill(billRow(billUuid).get("bill_id"));
		// A retried request must get its original receipt back even when that receipt filled the bill.
		Map<String, Object> replay = one("SELECT * FROM vinshc_payment WHERE idempotency_key=?", key);
		if (replay != null) {
			if (!"receipt".equals(replay.get("kind")) || !sameId(replay.get("bill_id"), bill.get("bill_id"))
			        || number(replay.get("amount_vnd")).longValue() != amount)
				throw conflict("idempotency key was already used with another payment payload");
			return paymentView(replay);
		}
		if ("cancelled".equals(bill.get("status")))
			throw conflict("cancelled bill cannot receive payment");
		if (settledReceipts(bill) + amount > number(bill.get("total_vnd")).longValue())
			throw conflict("payment exceeds outstanding bill balance");
		String uuid = UUID.randomUUID().toString();
		Timestamp settled = "settled".equals(status) ? now() : null;
		jdbc.update(
		    "INSERT INTO vinshc_payment(payment_uuid,bill_id,kind,amount_vnd,method,status,idempotency_key,creator,date_created,settled_by,settled_at)"
		            + " VALUES (?,?,'receipt',?,?,?,?,?,?,?,?)",
		    uuid, bill.get("bill_id"), amount, method, status, key, actorId(), now(), settled == null ? null : actorId(),
		    settled);
		recalculateBill(bill);
		return payment(uuid);
	}

	public Map<String, Object> settlePayment(String uuid) {
		require("payment", "create");
		Map<String, Object> payment = paymentRow(uuid);
		Map<String, Object> bill = lockedBill(payment.get("bill_id"));
		payment = required("vinshc_payment", "payment_id", payment.get("payment_id"), "payment");
		if (!"receipt".equals(payment.get("kind")) || !"pending".equals(payment.get("status")))
			throw conflict("only a pending receipt can be settled");
		if ("cancelled".equals(bill.get("status")))
			throw conflict("cancelled bill cannot be settled");
		if (settledReceipts(bill) + number(payment.get("amount_vnd")).longValue() > number(bill.get("total_vnd"))
		        .longValue())
			throw conflict("settlement exceeds outstanding bill balance");
		jdbc.update("UPDATE vinshc_payment SET status='settled',settled_by=?,settled_at=? WHERE payment_id=?", actorId(),
		    now(), payment.get("payment_id"));
		recalculateBill(bill);
		return payment(uuid);
	}

	public Map<String, Object> refund(String receiptUuid, Map<String, Object> body) {
		require("payment", "create");
		long amount = money(body.get("amountVnd"), "amountVnd", false);
		String key = idempotency(body);
		Map<String, Object> receipt = paymentRow(receiptUuid);
		lockedBill(receipt.get("bill_id"));
		receipt = required("vinshc_payment", "payment_id", receipt.get("payment_id"), "payment");
		Map<String, Object> replay = one("SELECT * FROM vinshc_payment WHERE idempotency_key=?", key);
		if (replay != null) {
			if (!"refund".equals(replay.get("kind")) || !sameId(replay.get("original_payment_id"), receipt.get("payment_id"))
			        || number(replay.get("amount_vnd")).longValue() != amount)
				throw conflict("idempotency key was already used with another refund payload");
			return paymentView(replay);
		}
		if (!"receipt".equals(receipt.get("kind")) || !"settled".equals(receipt.get("status")))
			throw conflict("refund requires a settled receipt");
		String reason = bounded(requiredString(body, "reason"), 1000, "reason");
		String method = requiredString(body, "method");
		if (!"cash".equals(method) && !"bank_transfer".equals(method))
			throw bad("method must be cash or bank_transfer");
		Number prior = jdbc.queryForObject(
		    "SELECT COALESCE(sum(amount_vnd),0) FROM vinshc_payment WHERE original_payment_id=? AND kind='refund' AND status='settled'",
		    Number.class, receipt.get("payment_id"));
		if (prior.longValue() + amount > number(receipt.get("amount_vnd")).longValue())
			throw conflict("refund exceeds remaining refundable amount");
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_payment(payment_uuid,bill_id,kind,original_payment_id,amount_vnd,method,status,reason,idempotency_key,creator,date_created,settled_by,settled_at)"
		            + " VALUES (?,?,'refund',?,?,?,'settled',?,?,?,?,?,?)",
		    uuid, receipt.get("bill_id"), receipt.get("payment_id"), amount, method, reason, key, actorId(), now(),
		    actorId(), now());
		Map<String, Object> bill = required("vinshc_bill", "bill_id", receipt.get("bill_id"), "bill");
		recalculateBill(bill);
		return payment(uuid);
	}

	public Map<String, Object> payment(String uuid) {
		require("payment", "read");
		return paymentView(paymentRow(uuid));
	}

	private Map<String, Object> billView(Map<String, Object> row) {
		Map<String, Object> out = baseView(row, "bill_uuid");
		out.put("patientUuid", uuid("patient", "patient_id", row.get("patient_id")));
		out.put("visitUuid", uuid("visit", "visit_id", row.get("visit_id")));
		out.put("facilityUuid", row.get("facility_uuid"));
		out.put("currency", row.get("currency"));
		out.put("paymentTiming", row.get("payment_timing"));
		out.put("lines", list(row.get("lines_json")));
		out.put("totalVnd", row.get("total_vnd"));
		out.put("status", row.get("status"));
		out.put("cancelReason", row.get("cancel_reason"));
		long received = settledReceipts(row), refunded = settledRefunds(row);
		out.put("settledVnd", received);
		out.put("refundedVnd", refunded);
		out.put("outstandingVnd", Math.max(0, number(row.get("total_vnd")).longValue() - received));
		out.put("netCollectedVnd", received - refunded);
		out.put("payments", jdbc.queryForList(
		    "SELECT payment_uuid,kind,amount_vnd,method,status,reason,settled_at FROM vinshc_payment WHERE bill_id=? ORDER BY payment_id",
		    row.get("bill_id")));
		return out;
	}

	private Map<String, Object> paymentView(Map<String, Object> row) {
		Map<String, Object> out = baseView(row, "payment_uuid");
		out.put("billUuid", uuid("vinshc_bill", "bill_id", row.get("bill_id"), "bill_uuid"));
		out.put("kind", row.get("kind"));
		out.put("originalReceiptUuid",
		    uuidNullable("vinshc_payment", "payment_id", row.get("original_payment_id"), "payment_uuid"));
		out.put("amountVnd", row.get("amount_vnd"));
		out.put("method", row.get("method"));
		out.put("status", row.get("status"));
		out.put("reason", row.get("reason"));
		out.put("recordedByUserUuid", uuid("users", "user_id", row.get("creator")));
		out.put("settledByUserUuid", uuidNullable("users", "user_id", row.get("settled_by")));
		out.put("settledAt", iso(row.get("settled_at")));
		return out;
	}

	/** Derives the payment status; a cancelled bill keeps its terminal status. */
	private void recalculateBill(Map<String, Object> snapshot) {
		Map<String, Object> bill = required("vinshc_bill", "bill_id", snapshot.get("bill_id"), "bill");
		if ("cancelled".equals(bill.get("status")))
			return;
		long received = settledReceipts(bill), refunded = settledRefunds(bill),
		        total = number(bill.get("total_vnd")).longValue();
		String state = received == 0 ? "unpaid"
		        : received < total ? "partially_paid" : refunded >= received ? "refunded" : "paid";
		jdbc.update("UPDATE vinshc_bill SET status=?,changed_by=?,date_changed=? WHERE bill_id=?", state, actorId(), now(),
		    bill.get("bill_id"));
	}

	private long settledReceipts(Map<String, Object> bill) {
		return aggregatePayments(bill, "receipt");
	}

	private long settledRefunds(Map<String, Object> bill) {
		return aggregatePayments(bill, "refund");
	}

	private long aggregatePayments(Map<String, Object> bill, String kind) {
		Number value = jdbc.queryForObject(
		    "SELECT COALESCE(sum(amount_vnd),0) FROM vinshc_payment WHERE bill_id=? AND kind=? AND status='settled'",
		    Number.class, bill.get("bill_id"), kind);
		return value.longValue();
	}

	// ---------------------------------------------------------------- diagnostic orders and results

	public Map<String, Object> createServiceOrder(Map<String, Object> body) {
		require("diagnostic_order", "create");
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = encounter(requiredString(body, "encounter"));
		if (!encounter.getPatient().getPatientId().equals(patient.getPatientId()) || encounter.getVisit() == null)
			throw bad("encounter/visit belongs to another patient or is missing");
		AuthorizationService.requireEncounterScopeStatic(encounter);
		Provider orderer = provider(requiredString(body, "orderer"));
		boolean recorded = false;
		for (EncounterProvider item : encounter.getActiveEncounterProviders())
			if (item.getProvider().equals(orderer))
				recorded = true;
		if (!recorded)
			throw bad("orderer must be recorded on the encounter");
		String facility = canonicalUuid(requiredString(body, "facility"), "facility");
		AuthorizationService.requireLocationScopeStatic(facilityLocation(facility));
		Map<String, Object> service = service(requiredString(body, "service"));
		if (!facility.equals(service.get("facilityUuid")))
			throw bad("service is not active for this facility");
		String config = requiredString(body, "config");
		Map<String, Object> workflow = workflowConfig(config);
		Map<String, Object> bill = null;
		String billUuid = optionalString(body, "bill");
		if (billUuid != null) {
			bill = billRow(billUuid);
			if (!number(bill.get("patient_id")).equals(patient.getPatientId()))
				throw bad("bill belongs to another patient");
		}
		if ("prepay".equals(workflow.get("paymentTiming"))) {
			if (bill == null || !billContainsPaidService(bill, string(service.get("uuid"))))
				throw conflict("prepay workflow requires a settled matching service bill");
		}
		String key = idempotency(body);
		Map<String, Object> replay = one("SELECT * FROM vinshc_service_order WHERE idempotency_key=?", key);
		if (replay != null) {
			if (!number(replay.get("patient_id")).equals(patient.getPatientId())
			        || !service.get("uuid").equals(replay.get("service_uuid")))
				throw conflict("idempotency key was already used with another service order payload");
			return serviceOrderView(replay);
		}
		Concept concept = Context.getConceptService().getConceptByUuid(string(service.get("orderConceptUuid")));
		if (concept == null || concept.getRetired())
			throw new VinshcExceptions.Configuration("service order concept is not provisioned");
		TestOrder order = new TestOrder();
		order.setPatient(patient);
		order.setEncounter(encounter);
		order.setOrderer(orderer);
		order.setConcept(concept);
		order.setCareSetting(outpatient());
		order.setOrderType(testOrderType());
		order.setDateActivated(Date.from(Instant.now()));
		order.setClinicalHistory(bounded(optionalString(body, "clinicalHistory"), 1000, "clinicalHistory"));
		TestOrder saved = (TestOrder) Context.getOrderService().saveOrder(order, null);
		jdbc.update(
		    "INSERT INTO vinshc_service_order(order_id,patient_id,encounter_id,visit_id,facility_uuid,service_uuid,service_code,service_name,state,bill_id,idempotency_key,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,'requested',?,?,?,?)",
		    saved.getOrderId(), patient.getPatientId(), encounter.getEncounterId(), encounter.getVisit().getVisitId(),
		    facility, service.get("uuid"), service.get("code"), service.get("name"),
		    bill == null ? null : bill.get("bill_id"), key, actorId(), now());
		return serviceOrder(saved.getUuid());
	}

	/**
	 * A cancelled/entered-in-error service order keeps its reason and discontinues the native
	 * TestOrder, so REST/FHIR consumers no longer see it as active.
	 */
	public Map<String, Object> transitionServiceOrder(String uuid, Map<String, Object> body) {
		require("diagnostic_order", "update");
		String target = requiredString(body, "state");
		if (!ORDER_STATES.contains(target))
			throw bad("invalid service order state");
		Map<String, Object> row = serviceOrderRow(uuid);
		lock("service-order:" + row.get("service_order_id"));
		row = serviceOrderRow(uuid);
		String current = string(row.get("state"));
		if (!ORDER_TRANSITIONS.getOrDefault(current, Collections.<String> emptySet()).contains(target))
			throw conflict("invalid service order transition " + current + " -> " + target);
		Provider assigned = null;
		if ("assigned".equals(target))
			assigned = provider(requiredString(body, "assignedProvider"));
		boolean stopping = "cancelled".equals(target) || "entered-in-error".equals(target);
		String reason = optionalString(body, "reason");
		if (reason != null && reason.trim().isEmpty())
			reason = null;
		if (stopping && reason == null)
			throw bad("cancellation/error requires reason");
		if (!stopping && reason != null)
			throw bad("reason is only accepted for cancelled/entered-in-error");
		if (reason != null)
			reason = bounded(reason.trim(), 1000, "reason");
		if (stopping)
			discontinueNative(nativeOrder(row), reason);
		if ("completed".equals(target)) {
			List<String> latestStates = jdbc.queryForList("SELECT state FROM vinshc_result_revision WHERE service_order_id=?"
			        + " ORDER BY version_number DESC LIMIT 1",
			    String.class, row.get("service_order_id"));
			if (latestStates.isEmpty() || !("final".equals(latestStates.get(0)) || "corrected".equals(latestStates.get(0))))
				throw conflict("service order cannot complete unless its latest result is final or corrected");
		}
		jdbc.update(
		    "UPDATE vinshc_service_order SET state=?,state_reason=COALESCE(?,state_reason),assigned_provider_id=COALESCE(?,assigned_provider_id),changed_by=?,date_changed=? WHERE service_order_id=?",
		    target, reason, assigned == null ? null : assigned.getProviderId(), actorId(), now(),
		    row.get("service_order_id"));
		ClinicalEvents.record(sessionFactory, "diagnostic_order_" + target,
		    Context.getPatientService().getPatient(number(row.get("patient_id")).intValue()),
		    Context.getEncounterService().getEncounter(number(row.get("encounter_id")).intValue()), uuid, reason,
		    assigned == null ? null : "assignedProvider=" + assigned.getUuid());
		return serviceOrder(uuid);
	}

	private void discontinueNative(Order order, String reason) {
		if (order == null || order.getVoided() || !order.isActive())
			return;
		try {
			Context.getOrderService().discontinueOrder(order, reason, null, order.getOrderer(), order.getEncounter());
		}
		catch (org.openmrs.api.APIAuthenticationException ex) {
			throw ex;
		}
		catch (org.openmrs.api.APIException ex) {
			throw conflict("native order cannot be discontinued: " + ex.getMessage());
		}
		catch (RuntimeException ex) {
			throw ex;
		}
		catch (Exception ex) {
			throw new IllegalStateException("cannot discontinue native order", ex);
		}
	}

	public Map<String, Object> createResult(String orderUuid, Map<String, Object> body) {
		require("diagnostic_result", "create");
		Map<String, Object> order = serviceOrderRow(orderUuid);
		lock("service-order:" + order.get("service_order_id"));
		order = serviceOrderRow(orderUuid);
		if (!"in_progress".equals(order.get("state")) && !"assigned".equals(order.get("state")))
			throw conflict("result requires assigned/in_progress service order");
		if (jdbc.queryForObject("SELECT count(*) FROM vinshc_result_revision WHERE service_order_id=?", Number.class,
		    order.get("service_order_id")).longValue() != 0)
			throw conflict("result already exists; use correction");
		return insertResult(order, body, null, 1, false);
	}

	public Map<String, Object> correctResult(String resultUuid, Map<String, Object> body) {
		require("diagnostic_result", "update");
		if (optionalString(body, "reason") == null)
			throw bad("result correction requires reason");
		Map<String, Object> old = resultRow(resultUuid);
		lock("service-order:" + old.get("service_order_id"));
		old = resultRow(resultUuid);
		if (!"final".equals(old.get("state")) && !"corrected".equals(old.get("state")))
			throw conflict("only final/corrected result can be corrected");
		Number latest = jdbc.queryForObject(
		    "SELECT max(version_number) FROM vinshc_result_revision WHERE service_order_id=?", Number.class,
		    old.get("service_order_id"));
		if (latest.intValue() != number(old.get("version_number")).intValue())
			throw conflict("result has a newer revision; correct the latest revision instead");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", old.get("service_order_id"),
		    "service order");
		return insertResult(order, body, old, number(old.get("version_number")).intValue() + 1, true);
	}

	private void ensureActiveProviderAssignment(int actor, Provider provider, Location facility, String field) {
		Number count = jdbc.queryForObject(
		    "SELECT count(*) FROM vinshc_provider_link x JOIN users u ON u.user_id=x.user_id"
		            + " WHERE x.active=true AND u.retired=false AND x.user_id=? AND x.provider_id=?"
		            + " AND x.facility_location_id=?",
		    Number.class, actor, provider.getProviderId(), facility.getLocationId());
		if (count == null || count.longValue() != 1)
			throw new org.openmrs.api.APIAuthenticationException(field + " is not assigned to the actor at this facility");
	}

private Map<String, Object> insertResult(Map<String, Object> order, Map<String, Object> body,
	        Map<String, Object> previous, int version, boolean correction) {
		String state = correction ? "corrected" : requiredString(body, "state");
		if (!RESULT_STATES.contains(state) || (!correction && "corrected".equals(state)))
			throw bad("invalid result state");
		Object numeric = body.get("numericValue");
		String text = optionalString(body, "textValue");
		if ((numeric == null) == (text == null))
			throw bad("result requires exactly one of numericValue or textValue");
		BigDecimal decimal = numeric == null ? null : decimal(numeric, "numericValue");
		String unit = optionalString(body, "unit");
		if (decimal != null && unit == null)
			throw bad("numeric result requires unit");
		if (text != null)
			text = bounded(text, 4000, "textValue");
		Provider author = provider(requiredString(body, "authorProvider"));
		Provider reviewer = null;
		Instant reviewed = null;
		Instant recorded = instant(body.get("recordedAt"), "recordedAt");
		if (recorded.isAfter(Instant.now().plusSeconds(300)))
			throw bad("recordedAt must not be more than five minutes in the future");
		if ("final".equals(state) || "corrected".equals(state)) {
			reviewer = provider(requiredString(body, "reviewerProvider"));
			reviewed = instant(body.get("reviewedAt"), "reviewedAt");
			if (reviewed.isBefore(recorded))
				throw bad("reviewedAt cannot precede recordedAt");
			if (reviewed.isAfter(Instant.now().plusSeconds(300)))
				throw bad("reviewedAt must not be more than five minutes in the future");
		}
		// A provider UUID supplied by the client never grants reviewer authority.
		// System Developer is the only unrestricted identity for synthetic setup.
		if (AuthorizationService.activeRoleStatic() != null) {
			int actor = Context.getAuthenticatedUser().getUserId();
			Location location = facilityLocation(string(order.get("facility_uuid")));
			ensureActiveProviderAssignment(actor, author, location, "authorProvider");
			if (reviewer != null)
				ensureActiveProviderAssignment(actor, reviewer, location, "reviewerProvider");
		}
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_result_revision(result_uuid,service_order_id,version_number,state,numeric_value,text_value,unit,previous_result_id,correction_reason,author_provider_id,reviewer_provider_id,recorded_at,reviewed_at,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    uuid, order.get("service_order_id"), version, state, decimal, text, unit,
		    previous == null ? null : previous.get("result_id"),
		    correction ? bounded(requiredString(body, "reason"), 1000, "reason") : null, author.getProviderId(),
		    reviewer == null ? null : reviewer.getProviderId(), Timestamp.from(recorded),
		    reviewed == null ? null : Timestamp.from(reviewed), actorId(), now());
		ClinicalEvents.record(sessionFactory, reviewer == null ? "diagnostic_result_recorded" : "diagnostic_result_reviewed",
		    Context.getPatientService().getPatient(number(order.get("patient_id")).intValue()),
		    Context.getEncounterService().getEncounter(number(order.get("encounter_id")).intValue()), uuid,
		    correction ? requiredString(body, "reason") : null, "version=" + version + ";state=" + state + ";author="
		            + author.getUuid() + (reviewer == null ? "" : ";reviewer=" + reviewer.getUuid()));
		return result(uuid);
	}

	public Map<String, Object> serviceOrder(String uuid) {
		require("diagnostic_order", "read");
		return serviceOrderView(serviceOrderRow(uuid));
	}

	public Map<String, Object> result(String uuid) {
		require("diagnostic_result", "read");
		return resultView(resultRow(uuid));
	}

	private Map<String, Object> serviceOrderView(Map<String, Object> row) {
		Map<String, Object> out = new LinkedHashMap<>();
		String nativeUuid = uuid("orders", "order_id", row.get("order_id"));
		out.put("uuid", nativeUuid);
		out.put("patientUuid", uuid("patient", "patient_id", row.get("patient_id")));
		out.put("encounterUuid", uuid("encounter", "encounter_id", row.get("encounter_id")));
		out.put("visitUuid", uuid("visit", "visit_id", row.get("visit_id")));
		out.put("facilityUuid", row.get("facility_uuid"));
		out.put("serviceUuid", row.get("service_uuid"));
		out.put("serviceCode", row.get("service_code"));
		out.put("serviceName", row.get("service_name"));
		out.put("state", row.get("state"));
		out.put("stateReason", row.get("state_reason"));
		out.put("assignedProviderUuid", uuidNullable("provider", "provider_id", row.get("assigned_provider_id")));
		out.put("billUuid", uuidNullable("vinshc_bill", "bill_id", row.get("bill_id"), "bill_uuid"));
		out.put("createdAt", iso(row.get("date_created")));
		out.put("results", jdbc.queryForList(
		    "SELECT result_uuid,version_number,state,recorded_at,reviewed_at FROM vinshc_result_revision WHERE service_order_id=? ORDER BY version_number",
		    row.get("service_order_id")));
		return out;
	}

	private Map<String, Object> resultView(Map<String, Object> row) {
		Map<String, Object> out = baseView(row, "result_uuid");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", row.get("service_order_id"),
		    "service order");
		out.put("orderUuid", uuid("orders", "order_id", order.get("order_id")));
		out.put("patientUuid", uuid("patient", "patient_id", order.get("patient_id")));
		out.put("visitUuid", uuid("visit", "visit_id", order.get("visit_id")));
		out.put("encounterUuid", uuid("encounter", "encounter_id", order.get("encounter_id")));
		out.put("version", row.get("version_number"));
		out.put("state", row.get("state"));
		out.put("numericValue", row.get("numeric_value"));
		out.put("textValue", row.get("text_value"));
		out.put("unit", row.get("unit"));
		out.put("previousResultUuid",
		    uuidNullable("vinshc_result_revision", "result_id", row.get("previous_result_id"), "result_uuid"));
		out.put("correctionReason", row.get("correction_reason"));
		out.put("authorProviderUuid", uuid("provider", "provider_id", row.get("author_provider_id")));
		out.put("reviewerProviderUuid", uuidNullable("provider", "provider_id", row.get("reviewer_provider_id")));
		out.put("recordedAt", iso(row.get("recorded_at")));
		out.put("reviewedAt", iso(row.get("reviewed_at")));
		out.put("attachments", jdbc.queryForList(
		    "SELECT attachment_uuid,original_name,mime_type,size_bytes,sha256 FROM vinshc_attachment WHERE result_id=? ORDER BY attachment_id",
		    row.get("result_id")));
		return out;
	}

	// ---------------------------------------------------------------- attachments

	public Map<String, Object> upload(String orderUuid, String resultUuid, String filename, String claimedMime,
	        byte[] bytes) {
		require("diagnostic_result", "update");
		Map<String, Object> order = serviceOrderRow(orderUuid);
		Map<String, Object> result = null;
		if (resultUuid != null) {
			result = resultRow(resultUuid);
			if (!number(result.get("service_order_id")).equals(number(order.get("service_order_id"))))
				throw bad("result belongs to another order");
		}
		if (bytes == null || bytes.length == 0 || bytes.length > MAX_ATTACHMENT)
			throw bad("attachment size must be 1..20971520 bytes");
		String mime = sniff(bytes);
		if (!mime.equals(claimedMime))
			throw bad("attachment MIME/sniff mismatch");
		String safeName = bounded(filename == null ? "attachment" : filename, 255, "filename");
		String uuid = UUID.randomUUID().toString();
		String extension = "application/pdf".equals(mime) ? ".pdf" : "image/png".equals(mime) ? ".png" : ".jpg";
		String key = uuid.substring(0, 2) + "/" + uuid + extension;
		Path root = Paths.get(metadataPath("VINSHC_ATTACHMENT_ROOT", "attachments"));
		Path target = root.resolve(key).normalize();
		if (!target.startsWith(root.normalize()))
			throw new IllegalStateException("attachment path escaped storage root");
		try {
			Files.createDirectories(target.getParent());
			Files.write(target, bytes);
		}
		catch (Exception ex) {
			throw new IllegalStateException("cannot persist attachment", ex);
		}
		deleteFileIfRolledBack(target);
		String hash = sha256(bytes);
		jdbc.update(
		    "INSERT INTO vinshc_attachment(attachment_uuid,service_order_id,result_id,storage_key,original_name,mime_type,size_bytes,sha256,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,?)",
		    uuid, order.get("service_order_id"), result == null ? null : result.get("result_id"), key, safeName, mime,
		    bytes.length, hash, actorId(), now());
		return attachment(uuid, false);
	}

	public Map<String, Object> attachment(String uuid, boolean includeBytes) {
		require("diagnostic_result", includeBytes ? "download" : "read");
		Map<String, Object> row = required("vinshc_attachment", "attachment_uuid", canonicalUuid(uuid, "attachment"),
		    "attachment");
		Map<String, Object> out = baseView(row, "attachment_uuid");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", row.get("service_order_id"),
		    "service order");
		requireFacilityScope(string(order.get("facility_uuid")));
		out.put("orderUuid", uuid("orders", "order_id", order.get("order_id")));
		out.put("resultUuid", uuidNullable("vinshc_result_revision", "result_id", row.get("result_id"), "result_uuid"));
		out.put("filename", row.get("original_name"));
		out.put("mimeType", row.get("mime_type"));
		out.put("sizeBytes", row.get("size_bytes"));
		out.put("sha256", row.get("sha256"));
		if (includeBytes) {
			Path path = Paths.get(metadataPath("VINSHC_ATTACHMENT_ROOT", "attachments"))
			        .resolve(string(row.get("storage_key"))).normalize();
			try {
				byte[] bytes = Files.readAllBytes(path);
				if (!sha256(bytes).equals(row.get("sha256")))
					throw new IllegalStateException("attachment checksum mismatch");
				out.put("bytes", bytes);
			}
			catch (IllegalStateException ex) {
				throw ex;
			}
			catch (Exception ex) {
				throw new IllegalStateException("cannot read attachment", ex);
			}
		}
		return out;
	}

	// ---------------------------------------------------------------- worklists

	private static final String TREE_CTE = "WITH RECURSIVE tree AS (SELECT location_id FROM location WHERE location_id=?"
	        + " UNION SELECT l.location_id FROM location l JOIN tree t ON l.parent_location=t.location_id) ";

	/** Minimal patient label for worklist rows: Vietnamese-order name and the internal record number. */
	private static String patientLabels(String alias) {
		return ", (SELECT concat_ws(' ', n.family_name, n.middle_name, n.given_name) FROM person_name n WHERE n.person_id="
		        + alias + ".patient_id AND n.voided=false ORDER BY n.preferred DESC, n.person_name_id LIMIT 1) AS patient_name"
		        + ", (SELECT pi.identifier FROM patient_identifier pi JOIN patient_identifier_type t"
		        + " ON t.patient_identifier_type_id=pi.identifier_type WHERE pi.patient_id=" + alias + ".patient_id"
		        + " AND pi.voided=false AND t.uuid='" + CareService.INTERNAL_ID_TYPE + "' ORDER BY pi.preferred DESC LIMIT 1)"
		        + " AS patient_identifier";
	}

	private static String providerLabel(String column, String as) {
		return ", (SELECT COALESCE(NULLIF(trim(concat_ws(' ', n.family_name, n.middle_name, n.given_name)),''), pr.name)"
		        + " FROM provider pr LEFT JOIN person_name n ON n.person_id=pr.person_id AND n.voided=false AND n.preferred=true"
		        + " WHERE pr.provider_id=" + column + " LIMIT 1) AS " + as;
	}

	private static void labels(Map<String, Object> out, Map<String, Object> row) {
		out.put("patientName", row.get("patient_name"));
		out.put("patientIdentifier", row.get("patient_identifier"));
	}

	/** Appointments of the caller's facility; one clinic day (default today) unless a patient is given. */
	public Map<String, Object> appointments(String date, String providerUuid, String patientUuid, String status,
	        Integer limit, Integer offset) {
		require("appointment", "read");
		Listing q = new Listing("a", "vinshc_appointment");
		q.select(patientLabels("a") + providerLabel("a.provider_id", "provider_name"));
		q.locationScope("a.facility_location_id");
		if (patientUuid != null)
			q.where("a.patient_id=?", scopedPatient(patientUuid).getPatientId());
		if (providerUuid != null)
			q.where("a.provider_id=?", provider(providerUuid).getProviderId());
		if (status != null) {
			if (!APPOINTMENT_STATES.contains(status))
				throw bad("invalid appointment status");
			q.where("a.status=?", status);
		}
		if (date != null || patientUuid == null)
			q.day("a.start_at", date == null ? LocalDate.now(CLINIC_ZONE) : day(date, "date"));
		List<Map<String, Object>> rows = new ArrayList<>();
		Page page = q.run("a.start_at, a.appointment_id", limit, offset);
		for (Map<String, Object> row : page.rows) {
			Map<String, Object> view = appointmentView(row);
			labels(view, row);
			view.put("providerName", row.get("provider_name"));
			view.put("serviceName", serviceName(row.get("service_uuid")));
			rows.add(view);
		}
		return page.view(rows);
	}

	/** Queue tickets of the caller's facility for one clinic day; state=active (default) | all | a state. */
	public Map<String, Object> queueList(String point, String state, String date, Integer limit, Integer offset) {
		require("queue", "read");
		Listing q = new Listing("q", "vinshc_queue_item");
		q.select(patientLabels("q"));
		q.locationScope("q.facility_location_id");
		if (point != null) {
			if (!metadata().queuePoints.containsKey(point))
				throw bad("unknown queue point");
			q.where("q.point_code=?", point);
		}
		states(q, "q.state", state, QUEUE_STATES, "waiting", "called", "in_service");
		q.day("q.date_created", date == null ? LocalDate.now(CLINIC_ZONE) : day(date, "date"));
		List<Map<String, Object>> rows = new ArrayList<>();
		Page page = q.run("q.queue_number, q.queue_item_id", limit, offset);
		for (Map<String, Object> row : page.rows) {
			Map<String, Object> view = queueView(row);
			labels(view, row);
			Map<String, Object> pointRecord = metadata().queuePoints.get(string(row.get("point_code")));
			view.put("pointName", pointRecord == null ? null : pointRecord.get("name"));
			rows.add(view);
		}
		return page.view(rows);
	}

	/** Bills of the caller's facility; status=open → unpaid/partially paid. One day unless patient/visit. */
	public Map<String, Object> bills(String status, String patientUuid, String visitUuid, String date, Integer limit,
	        Integer offset) {
		require("billing", "read");
		Listing q = new Listing("b", "vinshc_bill");
		q.select(patientLabels("b"));
		q.facilityScope("b.facility_uuid");
		if (patientUuid != null)
			q.where("b.patient_id=?", scopedPatient(patientUuid).getPatientId());
		if (visitUuid != null)
			q.where("b.visit_id=?", visit(visitUuid).getVisitId());
		if ("open".equals(status))
			q.where("b.status IN ('unpaid','partially_paid')");
		else if (status != null && !"all".equals(status)) {
			if (!BILL_STATES.contains(status))
				throw bad("invalid bill status");
			q.where("b.status=?", status);
		}
		if (date != null || (patientUuid == null && visitUuid == null))
			q.day("b.date_created", date == null ? LocalDate.now(CLINIC_ZONE) : day(date, "date"));
		List<Map<String, Object>> rows = new ArrayList<>();
		Page page = q.run("b.date_created DESC, b.bill_id DESC", limit, offset);
		for (Map<String, Object> row : page.rows) {
			Map<String, Object> view = billView(row);
			labels(view, row);
			rows.add(view);
		}
		return page.view(rows);
	}

	/** Receipts/refunds of the caller's facility; status=pending lists transfers awaiting settlement. */
	public Map<String, Object> payments(String status, String billUuid, String date, Integer limit, Integer offset) {
		require("payment", "read");
		Listing q = new Listing("p", "vinshc_payment");
		q.join(" JOIN vinshc_bill b ON b.bill_id=p.bill_id");
		q.select(", b.patient_id AS bill_patient_id" + patientLabels("b"));
		q.facilityScope("b.facility_uuid");
		if (billUuid != null)
			q.where("p.bill_id=?", billRow(billUuid).get("bill_id"));
		if (status != null && !"all".equals(status)) {
			if (!Arrays.asList("pending", "settled", "cancelled").contains(status))
				throw bad("status must be pending, settled, cancelled or all");
			q.where("p.status=?", status);
		}
		if (date != null || (billUuid == null && !"pending".equals(status)))
			q.day("p.date_created", date == null ? LocalDate.now(CLINIC_ZONE) : day(date, "date"));
		List<Map<String, Object>> rows = new ArrayList<>();
		Page page = q.run("p.date_created DESC, p.payment_id DESC", limit, offset);
		for (Map<String, Object> row : page.rows) {
			Map<String, Object> view = paymentView(row);
			labels(view, row);
			view.put("patientUuid", uuid("patient", "patient_id", row.get("bill_patient_id")));
			rows.add(view);
		}
		return page.view(rows);
	}

	/**
	 * Service orders of the caller's facility; state=active (default) | all | a state. A lab workspace
	 * only sees orders assigned to its own provider plus the unassigned (requested) pool.
	 */
	public Map<String, Object> serviceOrders(String state, String patientUuid, String visitUuid, String date,
	        Integer limit, Integer offset) {
		require("diagnostic_order", "read");
		Listing q = new Listing("s", "vinshc_service_order");
		q.select(patientLabels("s") + providerLabel("s.assigned_provider_id", "assigned_provider_name"));
		q.facilityScope("s.facility_uuid");
		if (patientUuid != null)
			q.where("s.patient_id=?", scopedPatient(patientUuid).getPatientId());
		if (visitUuid != null)
			q.where("s.visit_id=?", visit(visitUuid).getVisitId());
		states(q, "s.state", state, ORDER_STATES, "requested", "assigned", "in_progress");
		if (date != null)
			q.day("s.date_created", day(date, "date"));
		if ("lab".equals(AuthorizationService.activeRoleStatic())) {
			List<Integer> own = new ArrayList<>();
			User user = Context.getAuthenticatedUser();
			if (user.getPerson() != null)
				for (Provider provider : Context.getProviderService().getProvidersByPerson(user.getPerson(), false))
					own.add(provider.getProviderId());
			if (own.isEmpty())
				q.where("s.state='requested'");
			else
				q.where("(s.state='requested' OR s.assigned_provider_id IN (" + String.join(",",
				    Collections.nCopies(own.size(), "?")) + "))", own.toArray());
		}
		List<Map<String, Object>> rows = new ArrayList<>();
		Page page = q.run("s.date_created, s.service_order_id", limit, offset);
		for (Map<String, Object> row : page.rows) {
			Map<String, Object> view = serviceOrderView(row);
			labels(view, row);
			view.put("assignedProviderName", row.get("assigned_provider_name"));
			rows.add(view);
		}
		return page.view(rows);
	}

	private static void states(Listing q, String column, String state, Set<String> allowed, String... active) {
		if (state == null || "active".equals(state))
			q.where(column + " IN (" + String.join(",", Collections.nCopies(active.length, "?")) + ")", (Object[]) active);
		else if (!"all".equals(state)) {
			if (!allowed.contains(state))
				throw bad("invalid state filter");
			q.where(column + "=?", state);
		}
	}

	private Object serviceName(Object serviceUuid) {
		Map<String, Object> service = metadata().services.get(string(serviceUuid));
		return service == null ? null : service.get("name");
	}

	private Patient scopedPatient(String uuid) {
		Patient value = patient(uuid);
		AuthorizationService.requirePatientScopeStatic(value);
		return value;
	}

	private static LocalDate day(String value, String field) {
		try {
			return LocalDate.parse(value);
		}
		catch (Exception ex) {
			throw bad(field + " must be YYYY-MM-DD");
		}
	}

	/** Business facility UUID (billing/service-order tables) for a workspace facility location. */
	private String businessFacility(Location location) {
		for (Map<String, Object> facility : metadata().facilities.values())
			if (location.getUuid().equals(facility.get("locationUuid")))
				return string(facility.get("uuid"));
		throw bad("workspace facility is not a configured clinic");
	}

	/** Small builder for facility-scoped worklist queries with limit/offset paging. */
	private final class Listing {

		private final String alias, table;

		private final StringBuilder select = new StringBuilder(), joins = new StringBuilder(), where = new StringBuilder();

		private final List<Object> args = new ArrayList<>();

		private Location tree;

		Listing(String alias, String table) {
			this.alias = alias;
			this.table = table;
		}

		void select(String columns) {
			select.append(columns);
		}

		void join(String clause) {
			joins.append(clause);
		}

		void where(String condition, Object... values) {
			where.append(" AND ").append(condition);
			args.addAll(Arrays.asList(values));
		}

		void locationScope(String column) {
			Location facility = AuthorizationService.listingFacilityStatic();
			if (facility != null) {
				tree = facility;
				where.append(" AND ").append(column).append(" IN (SELECT location_id FROM tree)");
			}
		}

		void facilityScope(String column) {
			Location facility = AuthorizationService.listingFacilityStatic();
			if (facility != null)
				where(column + "=?", businessFacility(facility));
		}

		void day(String column, LocalDate day) {
			where(column + ">=? AND " + column + "<?", Timestamp.from(dayStart(day)), Timestamp.from(dayStart(day.plusDays(1))));
		}

		Page run(String order, Integer limit, Integer offset) {
			int size = CareService.page(limit), skip = CareService.offset(offset);
			List<Object> all = new ArrayList<>();
			if (tree != null)
				all.add(tree.getLocationId());
			all.addAll(args);
			all.add(size + 1);
			all.add(skip);
			String sql = (tree == null ? "" : TREE_CTE) + "SELECT " + alias + ".*" + select + " FROM " + table + " " + alias
			        + joins + " WHERE 1=1" + where + " ORDER BY " + order + " LIMIT ? OFFSET ?";
			List<Map<String, Object>> rows = jdbc.queryForList(sql, all.toArray());
			Page page = new Page();
			page.more = rows.size() > size;
			page.rows = rows.subList(0, Math.min(size, rows.size()));
			page.limit = size;
			page.offset = skip;
			return page;
		}
	}

	private static final class Page {

		List<Map<String, Object>> rows;

		boolean more;

		int limit, offset;

		Map<String, Object> view(List<Map<String, Object>> results) {
			return CareService.page(results, more, limit, offset);
		}
	}

	// ---------------------------------------------------------------- printable DTOs and daily report

	public Map<String, Object> document(String template, String sourceUuid) {
		if (!metadata().templates.contains(template))
			throw bad("unknown print template");
		String privilege = "receipt".equals(template) || "refund".equals(template) ? "billing"
		        : "appointment".equals(template) ? "appointment"
		                : "result".equals(template) ? "diagnostic_result"
		                        : "prescription".equals(template) ? "prescription" : "diagnostic_order";
		require(privilege, "print");
		String source = canonicalUuid(sourceUuid, "sourceUuid");
		// Building first validates the source and the caller's facility scope, also for reprints.
		Map<String, Object> payload = buildDocument(template, source);
		lock("document-source:" + template + ":" + source);
		Map<String, Object> prior = one(
		    "SELECT * FROM vinshc_document WHERE template_code=? AND source_uuid=? ORDER BY document_version DESC LIMIT 1",
		    template, source);
		if (prior != null)
			return map((String) prior.get("payload_json"));
		String facility = string(((Map<?, ?>) payload.get("facility")).get("uuid"));
		lock("document:" + facility + ":" + template + ":" + LocalDate.now(CLINIC_ZONE).getYear());
		Number sequence = jdbc.queryForObject(
		    "SELECT count(*)+1 FROM vinshc_document WHERE facility_uuid=? AND template_code=? AND EXTRACT(YEAR FROM date_created AT TIME ZONE 'Asia/Ho_Chi_Minh')=?",
		    Number.class, facility, template, LocalDate.now(CLINIC_ZONE).getYear());
		String number = string(metadata().facilities.get(facility).get("code")) + "-" + template.toUpperCase(Locale.ROOT)
		        + "-" + LocalDate.now(CLINIC_ZONE).getYear() + "-" + String.format("%06d", sequence.intValue());
		payload.put("templateCode", template);
		payload.put("templateVersion", "0.3.0");
		payload.put("documentNumber", number);
		payload.put("documentVersion", 1);
		payload.put("issuedAt", Instant.now().toString());
		payload.put("synthetic", true);
		String documentUuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_document(document_uuid,facility_uuid,template_code,source_uuid,document_number,document_version,payload_json,creator,date_created) VALUES (?,?,?,?,?,1,?,?,?)",
		    documentUuid, facility, template, source, number, json(payload), actorId(), now());
		return payload;
	}

	public Map<String, Object> dailyReport(String date, String facilityUuid) {
		require("reports", "read");
		LocalDate day = day(date, "date");
		facilityUuid = canonicalUuid(facilityUuid, "facility");
		Location location = facilityLocation(facilityUuid);
		AuthorizationService.requireLocationScopeStatic(location);
		return daily(day, facilityUuid, location);
	}

	/** Aggregate per day for up to 31 days plus totals; the same figures as the daily report. */
	public Map<String, Object> rangeReport(String from, String to, String facilityUuid) {
		require("reports", "read");
		LocalDate first = day(from, "from"), last = day(to, "to");
		if (last.isBefore(first))
			throw bad("to cannot be before from");
		if (first.plusDays(30).isBefore(last))
			throw bad("a report range covers at most 31 days");
		facilityUuid = canonicalUuid(facilityUuid, "facility");
		Location location = facilityLocation(facilityUuid);
		AuthorizationService.requireLocationScopeStatic(location);
		List<Map<String, Object>> days = new ArrayList<>();
		long opened = 0, completed = 0, gross = 0, refund = 0;
		for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
			Map<String, Object> row = daily(day, facilityUuid, location);
			opened += number(row.get("openedVisits")).longValue();
			completed += number(row.get("completedVisits")).longValue();
			gross += number(row.get("grossVnd")).longValue();
			refund += number(row.get("refundVnd")).longValue();
			days.add(row);
		}
		Map<String, Object> totals = new LinkedHashMap<>();
		totals.put("openedVisits", opened);
		totals.put("completedVisits", completed);
		totals.put("grossVnd", gross);
		totals.put("refundVnd", refund);
		totals.put("netVnd", gross - refund);
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("from", first.toString());
		out.put("to", last.toString());
		out.put("timezone", CLINIC_ZONE.getId());
		out.put("facilityUuid", facilityUuid);
		out.put("days", days);
		out.put("totals", totals);
		out.put("aggregateOnly", true);
		return out;
	}

	private Map<String, Object> daily(LocalDate day, String facilityUuid, Location location) {
		Instant start = dayStart(day), end = dayStart(day.plusDays(1));
		String locationCte = "WITH RECURSIVE locations AS (SELECT location_id FROM location WHERE location_id=? UNION ALL SELECT l.location_id FROM location l JOIN locations p ON l.parent_location=p.location_id) ";
		Number opened = jdbc.queryForObject(locationCte
		        + "SELECT count(DISTINCT v.visit_id) FROM visit v WHERE v.voided=false AND v.location_id IN (SELECT location_id FROM locations) AND v.date_started>=? AND v.date_started<?",
		    Number.class, location.getLocationId(), Timestamp.from(start), Timestamp.from(end));
		Number completed = jdbc.queryForObject(locationCte
		        + "SELECT count(DISTINCT v.visit_id) FROM visit v WHERE v.voided=false AND v.location_id IN (SELECT location_id FROM locations) AND v.date_stopped>=? AND v.date_stopped<?",
		    Number.class, location.getLocationId(), Timestamp.from(start), Timestamp.from(end));
		Number gross = jdbc.queryForObject(
		    "SELECT COALESCE(sum(p.amount_vnd),0) FROM vinshc_payment p JOIN vinshc_bill b ON b.bill_id=p.bill_id WHERE b.facility_uuid=? AND p.kind='receipt' AND p.status='settled' AND p.settled_at>=? AND p.settled_at<?",
		    Number.class, facilityUuid, Timestamp.from(start), Timestamp.from(end));
		Number refund = jdbc.queryForObject(
		    "SELECT COALESCE(sum(p.amount_vnd),0) FROM vinshc_payment p JOIN vinshc_bill b ON b.bill_id=p.bill_id WHERE b.facility_uuid=? AND p.kind='refund' AND p.status='settled' AND p.settled_at>=? AND p.settled_at<?",
		    Number.class, facilityUuid, Timestamp.from(start), Timestamp.from(end));
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("date", day.toString());
		out.put("timezone", CLINIC_ZONE.getId());
		out.put("facilityUuid", facilityUuid);
		out.put("openedVisits", opened.longValue());
		out.put("completedVisits", completed.longValue());
		out.put("grossVnd", gross.longValue());
		out.put("refundVnd", refund.longValue());
		out.put("netVnd", gross.longValue() - refund.longValue());
		out.put("aggregateOnly", true);
		return out;
	}

	private Map<String, Object> buildDocument(String template, String sourceUuid) {
		Map<String, Object> payload = new LinkedHashMap<>();
		Map<String, Object> facility;
		Patient patient;
		if ("appointment".equals(template)) {
			Map<String, Object> a = appointmentRow(sourceUuid);
			patient = Context.getPatientService().getPatient(number(a.get("patient_id")).intValue());
			facility = facilityByLocation(number(a.get("facility_location_id")).intValue());
			payload.put("status", a.get("status"));
			payload.put("appointmentUuid", sourceUuid);
			payload.put("startAt", iso(a.get("start_at")));
			payload.put("endAt", iso(a.get("end_at")));
			payload.put("service", service(string(a.get("service_uuid"))));
		} else if ("receipt".equals(template) || "refund".equals(template)) {
			Map<String, Object> p = paymentRow(sourceUuid);
			if (!("receipt".equals(template) ? "receipt" : "refund").equals(p.get("kind")))
				throw bad("payment kind does not match template");
			Map<String, Object> b = required("vinshc_bill", "bill_id", p.get("bill_id"), "bill");
			patient = Context.getPatientService().getPatient(number(b.get("patient_id")).intValue());
			facility = metadata().facilities.get(string(b.get("facility_uuid")));
			payload.put("status", p.get("status"));
			payload.put("transactionUuid", sourceUuid);
			payload.put("billUuid", b.get("bill_uuid"));
			payload.put("amountVnd", p.get("amount_vnd"));
			payload.put("paymentMethod", p.get("method"));
			payload.put("lines", list(b.get("lines_json")));
			payload.put("issuer", userIdentity(number(p.get("creator")).intValue()));
		} else if ("order".equals(template)) {
			Map<String, Object> o = serviceOrderRow(sourceUuid);
			patient = Context.getPatientService().getPatient(number(o.get("patient_id")).intValue());
			facility = metadata().facilities.get(string(o.get("facility_uuid")));
			payload.put("status", o.get("state"));
			payload.put("order", serviceOrderView(o));
			payload.put("practitioner", providerIdentity(nativeOrder(o).getOrderer()));
		} else if ("result".equals(template)) {
			Map<String, Object> r = resultRow(sourceUuid);
			Map<String, Object> o = required("vinshc_service_order", "service_order_id", r.get("service_order_id"),
			    "service order");
			patient = Context.getPatientService().getPatient(number(o.get("patient_id")).intValue());
			facility = metadata().facilities.get(string(o.get("facility_uuid")));
			payload.put("status", r.get("state"));
			payload.put("result", resultView(r));
			payload.put("practitioner", providerIdentity(Context.getProviderService().getProvider(
			    number(r.get("reviewer_provider_id") == null ? r.get("author_provider_id") : r.get("reviewer_provider_id"))
			            .intValue())));
		} else if ("prescription".equals(template)) {
			Order order = Context.getOrderService().getOrderByUuid(sourceUuid);
			if (!(order instanceof DrugOrder) || order.getVoided())
				throw bad("prescription source is not a drug order");
			DrugOrder drug = (DrugOrder) order;
			AuthorizationService.requireEncounterScopeStatic(drug.getEncounter());
			patient = drug.getPatient();
			Location location = drug.getEncounter().getLocation();
			if (location == null && drug.getEncounter().getVisit() != null)
				location = drug.getEncounter().getVisit().getLocation();
			if (location == null)
				throw new VinshcExceptions.Configuration("prescription encounter is not bound to a facility location");
			facility = facilityByLocation(location.getLocationId());
			payload.put("status", drug.isActive() ? "confirmed" : "discontinued");
			payload.put("practitioner", providerIdentity(drug.getOrderer()));
			Map<String, Object> line = new LinkedHashMap<>();
			line.put("drugCode", drug.getDrug().getUuid());
			line.put("drugName", drug.getDrug().getName());
			line.put("dose", drug.getDose());
			line.put("doseUnit", drug.getDoseUnits().getDisplayString());
			line.put("route", drug.getRoute().getDisplayString());
			line.put("frequency", drug.getFrequency().getConcept().getDisplayString());
			line.put("duration", drug.getDuration());
			line.put("quantity", drug.getQuantity());
			line.put("quantityUnit", drug.getQuantityUnits().getDisplayString());
			line.put("instructions", drug.getDosingInstructions());
			payload.put("lines", Collections.singletonList(line));
			payload.put("inventoryReconciled", false);
			payload.put("stockWarning", "KHÔNG ĐỐI CHIẾU TỒN KHO: số lô và hạn dùng chỉ ghi nhận; không xác nhận số tồn hoặc trừ kho.");
		} else
			throw bad("unsupported print template");
		payload.put("facility", publicFacility(facility));
		payload.put("patient", patientIdentity(patient));
		payload.put("sourceUuid", sourceUuid);
		return payload;
	}

	// ---------------------------------------------------------------- metadata and persistence helpers

	@SuppressWarnings("unchecked")
	private Metadata metadata() {
		if (metadata != null)
			return metadata;
		synchronized (this) {
			if (metadata != null)
				return metadata;
			try {
				Map<String, Object> facilities = read("facilities.json"), services = read("services.json"),
				        prices = read("prices.json"), workflow = read("workflow.json"),
				        printing = read("printing-reporting.json"), contract = read("b4-b9.json");
				if (!Boolean.TRUE.equals(facilities.get("testOnly"))
				        || Boolean.TRUE.equals(facilities.get("productionEnabled"))
				        || !Boolean.FALSE.equals(contract.get("productionUploadEnabled"))
				                && contract.get("productionUploadEnabled") != null)
					throw new VinshcExceptions.Configuration("B8 runtime only accepts the test metadata pack");
				Metadata loaded = new Metadata();
				loaded.facilities = index((List<Map<String, Object>>) facilities.get("records"), "uuid");
				loaded.services = index((List<Map<String, Object>>) services.get("records"), "uuid");
				loaded.prices = (List<Map<String, Object>>) prices.get("records");
				loaded.configs = index((List<Map<String, Object>>) workflow.get("configs"), "code");
				loaded.queuePoints = index((List<Map<String, Object>>) workflow.get("queuePoints"), "code");
				loaded.appointmentTypes = ((List<Map<String, Object>>) workflow.get("appointmentTypes")).stream()
				        .map(v -> string(v.get("code"))).collect(Collectors.toSet());
				loaded.templates = ((List<Map<String, Object>>) printing.get("templates")).stream()
				        .map(v -> string(v.get("code"))).collect(Collectors.toSet());
				metadata = loaded;
				return loaded;
			}
			catch (RuntimeException ex) {
				throw ex;
			}
			catch (Exception ex) {
				throw new VinshcExceptions.Configuration("cannot load B8 metadata", ex);
			}
		}
	}

	private static Map<String, Object> read(String name) throws Exception {
		return JSON.readValue(new File(metadataPath("VINSHC_B8_METADATA_ROOT", name)),
		    new TypeReference<Map<String, Object>>() {});
	}

	private static String metadataPath(String env, String name) {
		String root = System.getenv(env);
		if (root == null || root.isEmpty())
			root = "VINSHC_ATTACHMENT_ROOT".equals(env) ? "/openmrs/data/vinshc-attachments"
			        : "/openmrs/distribution/vinshc_metadata";
		return "VINSHC_ATTACHMENT_ROOT".equals(env) ? root : Paths.get(root, name).toString();
	}

	private static Map<String, Map<String, Object>> index(List<Map<String, Object>> records, String key) {
		Map<String, Map<String, Object>> out = new LinkedHashMap<>();
		for (Map<String, Object> r : records)
			out.put(string(r.get(key)), r);
		return out;
	}

	private Map<String, Object> service(String uuid) {
		Map<String, Object> value = metadata().services.get(canonicalUuid(uuid));
		if (value == null || !Boolean.TRUE.equals(value.get("active")) || !Boolean.TRUE.equals(value.get("orderable")))
			throw bad("service does not exist or is not orderable");
		return value;
	}

	private Map<String, Object> priceFor(String service, String facility) {
		for (Map<String, Object> p : metadata().prices)
			if (service.equals(p.get("serviceUuid")) && facility.equals(p.get("facilityUuid"))
			        && Boolean.TRUE.equals(p.get("active")))
				return p;
		throw new VinshcExceptions.Configuration("active price is not configured for service/facility");
	}

	private Map<String, Object> workflowConfig(String code) {
		Map<String, Object> value = metadata().configs.get(code);
		if (value == null)
			throw bad("unknown workflow config");
		return value;
	}

	@SuppressWarnings("unchecked")
	private List<String> normalizedFlow(String code) {
		List<String> out = new ArrayList<>();
		for (Object v : (List<Object>) workflowConfig(code).get("flow")) {
			String p = string(v);
			if (p.startsWith("LAB_"))
				p = "LAB";
			else if (p.startsWith("PHARMACY_"))
				p = "PHARMACY";
			else if (p.startsWith("CASHIER_"))
				p = "CASHIER";
			out.add(p);
		}
		return out;
	}

	private void assertPointInConfig(String config, String point) {
		if (!normalizedFlow(config).contains(point))
			throw bad("queue point is disabled by workflow config");
	}

	private void assertLaterPoint(String config, String current, String target) {
		List<String> flow = normalizedFlow(config);
		if (!flow.contains(target) || flow.indexOf(target) <= flow.indexOf(current))
			throw bad("nextPoint is not later in the configured workflow");
	}

	private Patient patient(String uuid) {
		Patient value = Context.getPatientService().getPatientByUuid(canonicalUuid(uuid));
		if (value == null || value.getVoided())
			throw bad("patient does not exist");
		return value;
	}

	private Visit visit(String uuid) {
		Visit value = Context.getVisitService().getVisitByUuid(canonicalUuid(uuid));
		if (value == null || value.getVoided())
			throw bad("visit does not exist");
		return value;
	}

	private Encounter encounter(String uuid) {
		Encounter value = Context.getEncounterService().getEncounterByUuid(canonicalUuid(uuid));
		if (value == null || value.getVoided())
			throw bad("encounter does not exist");
		return value;
	}

	private Provider provider(String uuid) {
		Provider value = Context.getProviderService().getProviderByUuid(canonicalUuid(uuid));
		if (value == null || value.getRetired())
			throw bad("provider does not exist");
		return value;
	}

	private Location facilityLocation(String facilityUuid) {
		Map<String, Object> record = metadata().facilities.get(canonicalUuid(facilityUuid));
		if (record == null)
			throw bad("facility does not exist");
		Location value = Context.getLocationService().getLocationByUuid(string(record.get("locationUuid")));
		if (value == null || value.getRetired())
			throw new VinshcExceptions.Configuration("facility location is not provisioned");
		return value;
	}

	private Map<String, Object> facilityByLocation(int locationId) {
		Location value = Context.getLocationService().getLocation(locationId);
		while (value != null) {
			for (Map<String, Object> f : metadata().facilities.values())
				if (value.getUuid().equals(f.get("locationUuid")))
					return f;
			value = value.getParentLocation();
		}
		throw new VinshcExceptions.Configuration("location is not bound to a facility");
	}

	private static CareSetting outpatient() {
		CareSetting value = Context.getOrderService().getCareSettingByUuid(OUTPATIENT_CARE_SETTING);
		if (value == null)
			throw new VinshcExceptions.Configuration("outpatient care setting missing");
		return value;
	}

	private static OrderType testOrderType() {
		OrderType value = Context.getOrderService().getOrderTypeByUuid(OrderType.TEST_ORDER_TYPE_UUID);
		if (value == null)
			throw new VinshcExceptions.Configuration("test order type missing");
		return value;
	}

	private Order nativeOrder(Map<String, Object> adapter) {
		return Context.getOrderService().getOrder(number(adapter.get("order_id")).intValue());
	}

	// Every *Row loader enforces the caller's facility workspace before the record is used.

	private Map<String, Object> billRow(String uuid) {
		Map<String, Object> row = required("vinshc_bill", "bill_uuid", canonicalUuid(uuid, "bill"), "bill");
		requireFacilityScope(string(row.get("facility_uuid")));
		return row;
	}

	private Map<String, Object> paymentRow(String uuid) {
		Map<String, Object> row = required("vinshc_payment", "payment_uuid", canonicalUuid(uuid, "payment"), "payment");
		Map<String, Object> bill = required("vinshc_bill", "bill_id", row.get("bill_id"), "bill");
		requireFacilityScope(string(bill.get("facility_uuid")));
		return row;
	}

	private Map<String, Object> serviceOrderRow(String nativeUuid) {
		Order nativeOrder = Context.getOrderService().getOrderByUuid(canonicalUuid(nativeUuid, "service order"));
		if (nativeOrder == null || nativeOrder.getVoided())
			throw bad("service order does not exist");
		Map<String, Object> row = required("vinshc_service_order", "order_id", nativeOrder.getOrderId(), "service order");
		requireFacilityScope(string(row.get("facility_uuid")));
		return row;
	}

	private Map<String, Object> resultRow(String uuid) {
		Map<String, Object> row = required("vinshc_result_revision", "result_uuid", canonicalUuid(uuid, "result"),
		    "result");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", row.get("service_order_id"),
		    "service order");
		requireFacilityScope(string(order.get("facility_uuid")));
		return row;
	}

	/**
	 * Single lock key for every money operation on a bill (receipt, settle, refund, cancel), then a
	 * fresh read so decisions never use a snapshot taken before the lock.
	 */
	private Map<String, Object> lockedBill(Object billId) {
		lock("bill:" + number(billId).longValue());
		return required("vinshc_bill", "bill_id", billId, "bill");
	}

	private void requireFacilityScope(String facilityUuid) {
		AuthorizationService.requireLocationScopeStatic(facilityLocation(facilityUuid));
	}

	private void requireLocationIdScope(Object locationId) {
		AuthorizationService
		        .requireLocationScopeStatic(Context.getLocationService().getLocation(number(locationId).intValue()));
	}

	private static boolean sameOrBelow(Location candidate, Location ancestor) {
		for (Location value = candidate; value != null; value = value.getParentLocation())
			if (value.getLocationId().equals(ancestor.getLocationId()))
				return true;
		return false;
	}

	private static boolean sameId(Object left, Object right) {
		return left != null && right != null && number(left).longValue() == number(right).longValue();
	}

	private boolean billContainsPaidService(Map<String, Object> bill, String service) {
		if (!"paid".equals(bill.get("status")) || settledReceipts(bill) < number(bill.get("total_vnd")).longValue())
			return false;
		for (Map<String, Object> line : list(bill.get("lines_json")))
			if (service.equals(line.get("serviceUuid")))
				return true;
		return false;
	}

	private Map<String, Object> required(String table, String column, Object value, String label) {
		Map<String, Object> row = one("SELECT * FROM " + table + " WHERE " + column + "=?", value);
		if (row == null)
			throw bad(label + " does not exist");
		return row;
	}

	private Map<String, Object> one(String sql, Object... args) {
		List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
		return rows.isEmpty() ? null : rows.get(0);
	}

	private void lock(String value) {
		TransactionLocks.lock(sessionFactory, value);
	}

	/** Removes a just-written attachment file when the surrounding transaction does not commit. */
	private static void deleteFileIfRolledBack(Path file) {
		if (!TransactionSynchronizationManager.isSynchronizationActive())
			return;
		TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {

			@Override
			public void afterCompletion(int status) {
				if (status != STATUS_COMMITTED)
					try {
						Files.deleteIfExists(file);
					}
					catch (Exception ex) {
						LoggerFactory.getLogger(OperationsService.class).warn("Cannot remove orphan attachment {}", file, ex);
					}
			}
		});
	}

	private static Map<String, Set<String>> transitions(Object... values) {
		Map<String, Set<String>> map = new LinkedHashMap<>();
		for (int i = 0; i < values.length; i += 2) {
			@SuppressWarnings("unchecked")
			Set<String> targets = (Set<String>) values[i + 1];
			map.put((String) values[i], targets);
		}
		return Collections.unmodifiableMap(map);
	}

	private static Timestamp now() {
		return Timestamp.from(Instant.now());
	}

	private static Instant dayStart(LocalDate day) {
		return day.atStartOfDay(CLINIC_ZONE).toInstant();
	}

	private static Instant instant(Object value, String field) {
		if (!(value instanceof String))
			throw bad(field + " must be ISO-8601 with offset");
		try {
			return OffsetDateTime.parse((String) value).toInstant();
		}
		catch (Exception ex) {
			throw bad(field + " must be ISO-8601 with offset");
		}
	}

	private static Timestamp timestamp(Object value) {
		return (Timestamp) value;
	}

	private static String iso(Object value) {
		return value == null ? null : ((java.util.Date) value).toInstant().toString();
	}

	private static Number number(Object value) {
		return (Number) value;
	}

	private static String string(Object value) {
		return String.valueOf(value);
	}

	private static int integer(Object value, String field) {
		return VinshcService.strictInt(value, field);
	}

	/** Integer VND within the JSON-safe range; a BigInteger beyond long must not wrap into range. */
	static long money(Object value, String field, boolean zeroAllowed) {
		if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long
		        || value instanceof java.math.BigInteger))
			throw bad(field + " must be an integer VND amount");
		if (value instanceof java.math.BigInteger && ((java.math.BigInteger) value).bitLength() > 63)
			throw bad(field + " is out of range");
		long n = ((Number) value).longValue();
		if (n < 0 || (!zeroAllowed && n == 0) || n > MAX_MONEY)
			throw bad(field + " is out of range");
		return n;
	}

	private static long addMoney(long a, long b) {
		if (b > MAX_MONEY - a)
			throw bad("bill total exceeds safe VND range");
		return a + b;
	}

	private static long multiplyMoney(long value, int quantity) {
		if (value != 0 && quantity > MAX_MONEY / value)
			throw bad("line total exceeds safe VND range");
		return value * quantity;
	}

	private static BigDecimal decimal(Object value, String field) {
		if (value instanceof Boolean || !(value instanceof Number))
			throw bad(field + " must be numeric");
		try {
			return new BigDecimal(value.toString());
		}
		catch (Exception ex) {
			throw bad(field + " must be numeric");
		}
	}

	private static String bounded(String value, int max, String field) {
		if (value != null && value.length() > max)
			throw bad(field + " exceeds " + max + " characters");
		return value;
	}

	private static String idempotency(Map<String, Object> body) {
		String value = bounded(requiredString(body, "idempotencyKey"), 128, "idempotencyKey");
		if (value.trim().length() < 8)
			throw bad("idempotencyKey must contain at least 8 characters");
		return value;
	}

	private static IllegalStateException conflict(String message) {
		return new OperationsConflictException(message);
	}

	private static void require(String resource, String action) {
		AuthorizationService.requireOperation(resource, action);
	}

	private static int actorId() {
		User user = Context.getAuthenticatedUser();
		if (user == null)
			throw new VinshcExceptions.NotAuthenticated();
		return user.getUserId();
	}

	private static Set<String> set(String... values) {
		return Collections.unmodifiableSet(Arrays.stream(values).collect(Collectors.toSet()));
	}

	private static String json(Object value) {
		try {
			return JSON.writeValueAsString(value);
		}
		catch (Exception ex) {
			throw new IllegalStateException("cannot serialize operation payload", ex);
		}
	}

	private static Map<String, Object> map(String value) {
		try {
			return JSON.readValue(value, new TypeReference<Map<String, Object>>() {});
		}
		catch (Exception ex) {
			throw new IllegalStateException("cannot read document snapshot", ex);
		}
	}

	private static List<Map<String, Object>> list(Object value) {
		try {
			return JSON.readValue(string(value), new TypeReference<List<Map<String, Object>>>() {});
		}
		catch (Exception ex) {
			throw new IllegalStateException("cannot read line snapshot", ex);
		}
	}

	private static Map<String, Object> baseView(Map<String, Object> row, String uuidColumn) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", row.get(uuidColumn));
		out.put("createdAt", iso(row.get("date_created")));
		return out;
	}

	private String uuid(String table, String id, Object value) {
		return uuid(table, id, value, "uuid");
	}

	private String uuid(String table, String id, Object value, String uuidColumn) {
		if ("patient".equals(table) && "patient_id".equals(id) && "uuid".equals(uuidColumn))
			return string(jdbc.queryForObject(
			    "SELECT p.uuid FROM patient x JOIN person p ON p.person_id=x.patient_id WHERE x.patient_id=?", Object.class,
			    value));
		return string(
		    jdbc.queryForObject("SELECT " + uuidColumn + " FROM " + table + " WHERE " + id + "=?", Object.class, value));
	}

	private String uuidNullable(String table, String id, Object value) {
		return uuidNullable(table, id, value, "uuid");
	}

	private String uuidNullable(String table, String id, Object value, String uuidColumn) {
		return value == null ? null : uuid(table, id, value, uuidColumn);
	}

	static String sniff(byte[] bytes) {
		if (bytes.length >= 5 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-')
			return "application/pdf";
		if (bytes.length >= 8 && (bytes[0] & 255) == 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71
		        && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10)
			return "image/png";
		if (bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255)
			return "image/jpeg";
		throw bad("attachment content is not an allowed PDF/JPEG/PNG");
	}

	private static String sha256(byte[] bytes) {
		try {
			byte[] hash = MessageDigest.getInstance("SHA-256").digest(bytes);
			StringBuilder out = new StringBuilder();
			for (byte b : hash)
				out.append(String.format("%02x", b));
			return out.toString();
		}
		catch (Exception ex) {
			throw new IllegalStateException("SHA-256 unavailable", ex);
		}
	}

	private static Map<String, Object> patientIdentity(Patient p) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", p.getUuid());
		PatientIdentifier id = p.getPatientIdentifier();
		out.put("identifier", id == null ? null : id.getIdentifier());
		out.put("fullName", p.getPersonName() == null ? null : p.getPersonName().getFullName());
		out.put("birthDisplay", p.getBirthdate() == null ? null : p.getBirthdate().toString());
		out.put("addressText", p.getPersonAddress() == null ? null : p.getPersonAddress().toString());
		return out;
	}

	private Map<String, Object> providerIdentity(Provider p) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", p.getUuid());
		out.put("fullName", p.getName());
		out.put("identifier", p.getIdentifier());
		out.put("title", null);
		out.put("licenceNumber", null);
		for (Map<String, Object> f : metadata().facilities.values())
			for (Object raw : (List<?>) f.getOrDefault("providers", Collections.emptyList())) {
				Map<String, Object> x = objectMap(raw);
				if (p.getUuid().equals(x.get("uuid"))) {
					out.put("title", x.get("title"));
					out.put("licenceNumber", x.get("licenceNumber"));
				}
			}
		return out;
	}

	/**
	 * Issuer identity for printed receipts. Read directly so a cashier does not need the Core
	 * "Get Users" privilege; the name parts follow PersonName.getFullName() order.
	 */
	private Map<String, Object> userIdentity(int id) {
		Map<String, Object> row = one("SELECT u.uuid, u.username, (SELECT NULLIF(trim(concat_ws(' ', n.prefix, n.given_name,"
		        + " n.middle_name, n.family_name_prefix, n.family_name, n.family_name2, n.family_name_suffix, n.degree)), '')"
		        + " FROM person_name n WHERE n.person_id=u.person_id AND n.voided=false"
		        + " ORDER BY n.preferred DESC, n.person_name_id LIMIT 1) AS full_name FROM users u WHERE u.user_id=?", id);
		if (row == null)
			throw new IllegalStateException("payment creator does not exist: " + id);
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", row.get("uuid"));
		out.put("fullName", row.get("full_name") == null ? row.get("username") : row.get("full_name"));
		out.put("title", "Thu ngân");
		out.put("licenceNumber", null);
		return out;
	}

	private static Map<String, Object> publicFacility(Map<String, Object> f) {
		Map<String, Object> out = new LinkedHashMap<>();
		for (String key : Arrays.asList("uuid", "code", "legalName", "addressText", "phone", "licenceNumber", "logoAsset"))
			out.put(key, f.get(key));
		return out;
	}

	private static final class Metadata {

		Map<String, Map<String, Object>> facilities, services, configs, queuePoints;

		List<Map<String, Object>> prices;

		Set<String> appointmentTypes, templates;
	}

	public static final class OperationsConflictException extends IllegalStateException {

		private static final long serialVersionUID = 1L;

		public OperationsConflictException(String message) {
			super(message);
		}
	}
}
