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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

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

	private static final ObjectMapper JSON = new ObjectMapper();

	private final JdbcTemplate jdbc;

	private volatile Metadata metadata;

	public OperationsService(SessionFactory sessionFactory) {
		ConnectionProvider provider = ((SessionFactoryImplementor) sessionFactory).getServiceRegistry()
		        .getService(ConnectionProvider.class);
		this.jdbc = new JdbcTemplate(provider.unwrap(javax.sql.DataSource.class));
	}

	// ---------------------------------------------------------------- configuration

	public Map<String, Object> configuration() {
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
		Location facility = facilityLocation(requiredString(body, "facility"));
		Provider provider = provider(requiredString(body, "provider"));
		Map<String, Object> service = service(requiredString(body, "service"));
		if (!requiredString(body, "facility").equals(service.get("facilityUuid")))
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
		lock("appointment:" + facility.getUuid() + ":" + provider.getUuid());
		Number overlaps = jdbc.queryForObject(
		    "SELECT count(*) FROM vinshc_appointment WHERE status NOT IN ('cancelled','no_show')"
		            + " AND start_at<? AND end_at>? AND (provider_id=? OR facility_location_id=?)",
		    Number.class, Timestamp.from(end), Timestamp.from(start), provider.getProviderId(), facility.getLocationId());
		if (overlaps.longValue() != 0)
			throw conflict("provider or location has an overlapping appointment");
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
		Map<String, Object> row = required("vinshc_appointment", "appointment_uuid", uuid, "appointment");
		String target = requiredString(body, "status");
		require("appointment", "cancelled".equals(target) ? "cancel" : "update");
		if (!APPOINTMENT_STATES.contains(target))
			throw bad("invalid appointment status");
		String current = string(row.get("status"));
		Map<String, Set<String>> transitions = new LinkedHashMap<>();
		transitions.put("booked", set("confirmed", "arrived", "cancelled"));
		transitions.put("confirmed", set("arrived", "cancelled", "no_show"));
		transitions.put("arrived", set("fulfilled", "cancelled"));
		if (!transitions.getOrDefault(current, Collections.<String> emptySet()).contains(target))
			throw conflict("invalid appointment transition " + current + " -> " + target);
		if ("no_show".equals(target) && Instant.now().isBefore(timestamp(row.get("start_at")).toInstant()))
			throw conflict("no_show cannot be recorded before the slot starts");
		jdbc.update("UPDATE vinshc_appointment SET status=?,changed_by=?,date_changed=? WHERE appointment_id=?", target,
		    actorId(), now(), row.get("appointment_id"));
		return appointment(uuid);
	}

	public Map<String, Object> appointment(String uuid) {
		require("appointment", "read");
		return appointmentView(required("vinshc_appointment", "appointment_uuid", uuid, "appointment"));
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
		return createQueueInternal(patient, visit, requiredString(body, "config"), requiredString(body, "point"),
		    optionalString(body, "provider"), idempotency(body));
	}

	public Map<String, Object> transitionQueue(String uuid, Map<String, Object> body) {
		Map<String, Object> row = required("vinshc_queue_item", "queue_item_uuid", uuid, "queue item");
		String target = requiredString(body, "state");
		require("queue", "cancelled".equals(target) || "left".equals(target) ? "cancel" : "update");
		if (!QUEUE_STATES.contains(target))
			throw bad("invalid queue state");
		String current = string(row.get("state"));
		Map<String, Set<String>> transitions = new LinkedHashMap<>();
		transitions.put("waiting", set("called", "cancelled", "left"));
		transitions.put("called", set("in_service", "waiting", "cancelled", "left"));
		transitions.put("in_service", set("completed", "cancelled", "left"));
		if (!transitions.getOrDefault(current, Collections.<String> emptySet()).contains(target))
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
		Map<String, Object> row = required("vinshc_queue_item", "queue_item_uuid", uuid, "queue item");
		if (!"in_service".equals(row.get("state")))
			throw conflict("only an in_service queue item can advance");
		String target = requiredString(body, "nextPoint");
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
		return queueView(required("vinshc_queue_item", "queue_item_uuid", uuid, "queue item"));
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
			throw new IllegalStateException("queue point location is not provisioned: " + point);
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
		String facility = requiredString(body, "facility");
		facilityLocation(facility);
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
		return billView(required("vinshc_bill", "bill_uuid", uuid, "bill"));
	}

	public Map<String, Object> cancelBill(String uuid, Map<String, Object> body) {
		require("billing", "cancel");
		Map<String, Object> bill = billRow(uuid);
		lock("bill:" + uuid);
		if (settledReceipts(bill) > 0)
			throw conflict("paid bill requires explicit refund and cannot be cancelled");
		if ("cancelled".equals(bill.get("status")))
			throw conflict("bill is already cancelled");
		String reason = bounded(requiredString(body, "reason"), 1000, "reason");
		jdbc.update("UPDATE vinshc_bill SET status='cancelled',cancel_reason=?,changed_by=?,date_changed=? WHERE bill_id=?",
		    reason, actorId(), now(), bill.get("bill_id"));
		return bill(uuid);
	}

	public Map<String, Object> receipt(String billUuid, Map<String, Object> body) {
		require("payment", "create");
		Map<String, Object> bill = billRow(billUuid);
		lock("bill:" + billUuid);
		if ("cancelled".equals(bill.get("status")))
			throw conflict("cancelled bill cannot receive payment");
		long amount = money(body.get("amountVnd"), "amountVnd", false);
		String method = requiredString(body, "method");
		if (!"cash".equals(method) && !"bank_transfer".equals(method))
			throw bad("method must be cash or bank_transfer");
		String status = optionalString(body, "status");
		if (status == null)
			status = "cash".equals(method) ? "settled" : "pending";
		if (!"settled".equals(status) && !("bank_transfer".equals(method) && "pending".equals(status)))
			throw bad("cash must settle immediately; bank_transfer may be pending or settled");
		if (settledReceipts(bill) + amount > number(bill.get("total_vnd")).longValue())
			throw conflict("payment exceeds outstanding bill balance");
		String key = idempotency(body);
		Map<String, Object> replay = one("SELECT * FROM vinshc_payment WHERE idempotency_key=?", key);
		if (replay != null) {
			if (number(replay.get("bill_id")).longValue() != number(bill.get("bill_id")).longValue()
			        || number(replay.get("amount_vnd")).longValue() != amount)
				throw conflict("idempotency key was already used with another payment payload");
			return paymentView(replay);
		}
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
		lock("bill:" + payment.get("bill_id"));
		if (!"receipt".equals(payment.get("kind")) || !"pending".equals(payment.get("status")))
			throw conflict("only a pending receipt can be settled");
		Map<String, Object> bill = required("vinshc_bill", "bill_id", payment.get("bill_id"), "bill");
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
		Map<String, Object> receipt = paymentRow(receiptUuid);
		if (!"receipt".equals(receipt.get("kind")) || !"settled".equals(receipt.get("status")))
			throw conflict("refund requires a settled receipt");
		lock("bill:" + receipt.get("bill_id"));
		long amount = money(body.get("amountVnd"), "amountVnd", false);
		Number prior = jdbc.queryForObject(
		    "SELECT COALESCE(sum(amount_vnd),0) FROM vinshc_payment WHERE original_payment_id=? AND kind='refund' AND status='settled'",
		    Number.class, receipt.get("payment_id"));
		if (prior.longValue() + amount > number(receipt.get("amount_vnd")).longValue())
			throw conflict("refund exceeds remaining refundable amount");
		String key = idempotency(body);
		Map<String, Object> replay = one("SELECT * FROM vinshc_payment WHERE idempotency_key=?", key);
		if (replay != null) {
			if (number(replay.get("original_payment_id")).longValue() != number(receipt.get("payment_id")).longValue()
			        || number(replay.get("amount_vnd")).longValue() != amount)
				throw conflict("idempotency key was already used with another refund payload");
			return paymentView(replay);
		}
		String reason = bounded(requiredString(body, "reason"), 1000, "reason");
		String method = requiredString(body, "method");
		if (!"cash".equals(method) && !"bank_transfer".equals(method))
			throw bad("method must be cash or bank_transfer");
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

	private void recalculateBill(Map<String, Object> bill) {
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
		String facility = requiredString(body, "facility");
		facilityLocation(facility);
		Map<String, Object> service = service(requiredString(body, "service"));
		if (!facility.equals(service.get("facilityUuid")))
			throw bad("service is not active for this facility");
		String config = requiredString(body, "config");
		Map<String, Object> workflow = workflowConfig(config);
		Map<String, Object> bill = null;
		String billUuid = optionalString(body, "bill");
		if (billUuid != null)
			bill = billRow(billUuid);
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
			throw new IllegalStateException("service order concept is not provisioned");
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

	public Map<String, Object> transitionServiceOrder(String uuid, Map<String, Object> body) {
		require("diagnostic_order", "update");
		Map<String, Object> row = serviceOrderRow(uuid);
		String target = requiredString(body, "state");
		if (!ORDER_STATES.contains(target))
			throw bad("invalid service order state");
		String current = string(row.get("state"));
		Map<String, Set<String>> transitions = new LinkedHashMap<>();
		transitions.put("requested", set("assigned", "cancelled", "entered-in-error"));
		transitions.put("assigned", set("in_progress", "cancelled", "entered-in-error"));
		transitions.put("in_progress", set("completed", "cancelled", "entered-in-error"));
		if (!transitions.getOrDefault(current, Collections.<String> emptySet()).contains(target))
			throw conflict("invalid service order transition " + current + " -> " + target);
		Provider assigned = null;
		if ("assigned".equals(target))
			assigned = provider(requiredString(body, "assignedProvider"));
		if (("cancelled".equals(target) || "entered-in-error".equals(target)) && optionalString(body, "reason") == null)
			throw bad("cancellation/error requires reason");
		if ("completed".equals(target)) {
			Number finals = jdbc.queryForObject(
			    "SELECT count(*) FROM vinshc_result_revision WHERE service_order_id=? AND state IN ('final','corrected')",
			    Number.class, row.get("service_order_id"));
			if (finals.longValue() == 0)
				throw conflict("service order cannot complete without a final result");
		}
		jdbc.update(
		    "UPDATE vinshc_service_order SET state=?,assigned_provider_id=COALESCE(?,assigned_provider_id),changed_by=?,date_changed=? WHERE service_order_id=?",
		    target, assigned == null ? null : assigned.getProviderId(), actorId(), now(), row.get("service_order_id"));
		return serviceOrder(uuid);
	}

	public Map<String, Object> createResult(String orderUuid, Map<String, Object> body) {
		require("diagnostic_result", "create");
		Map<String, Object> order = serviceOrderRow(orderUuid);
		if (!"in_progress".equals(order.get("state")) && !"assigned".equals(order.get("state")))
			throw conflict("result requires assigned/in_progress service order");
		if (jdbc.queryForObject("SELECT count(*) FROM vinshc_result_revision WHERE service_order_id=?", Number.class,
		    order.get("service_order_id")).longValue() != 0)
			throw conflict("result already exists; use correction");
		return insertResult(order, body, null, 1, false);
	}

	public Map<String, Object> correctResult(String resultUuid, Map<String, Object> body) {
		require("diagnostic_result", "update");
		Map<String, Object> old = resultRow(resultUuid);
		if (!"final".equals(old.get("state")) && !"corrected".equals(old.get("state")))
			throw conflict("only final/corrected result can be corrected");
		if (optionalString(body, "reason") == null)
			throw bad("result correction requires reason");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", old.get("service_order_id"),
		    "service order");
		return insertResult(order, body, old, number(old.get("version_number")).intValue() + 1, true);
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
		if ("final".equals(state) || "corrected".equals(state)) {
			reviewer = provider(requiredString(body, "reviewerProvider"));
			reviewed = instant(body.get("reviewedAt"), "reviewedAt");
		}
		Instant recorded = instant(body.get("recordedAt"), "recordedAt");
		String uuid = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_result_revision(result_uuid,service_order_id,version_number,state,numeric_value,text_value,unit,previous_result_id,correction_reason,author_provider_id,reviewer_provider_id,recorded_at,reviewed_at,creator,date_created)"
		            + " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    uuid, order.get("service_order_id"), version, state, decimal, text, unit,
		    previous == null ? null : previous.get("result_id"),
		    correction ? bounded(requiredString(body, "reason"), 1000, "reason") : null, author.getProviderId(),
		    reviewer == null ? null : reviewer.getProviderId(), Timestamp.from(recorded),
		    reviewed == null ? null : Timestamp.from(reviewed), actorId(), now());
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
		String hash = sha256(bytes);
		jdbc.update(
		    "INSERT INTO vinshc_attachment(attachment_uuid,service_order_id,result_id,storage_key,original_name,mime_type,size_bytes,sha256,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,?)",
		    uuid, order.get("service_order_id"), result == null ? null : result.get("result_id"), key, safeName, mime,
		    bytes.length, hash, actorId(), now());
		return attachment(uuid, false);
	}

	public Map<String, Object> attachment(String uuid, boolean includeBytes) {
		require("diagnostic_result", includeBytes ? "download" : "read");
		Map<String, Object> row = required("vinshc_attachment", "attachment_uuid", uuid, "attachment");
		Map<String, Object> out = baseView(row, "attachment_uuid");
		Map<String, Object> order = required("vinshc_service_order", "service_order_id", row.get("service_order_id"),
		    "service order");
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

	// ---------------------------------------------------------------- printable DTOs and daily report

	public Map<String, Object> document(String template, String sourceUuid) {
		if (!metadata().templates.contains(template))
			throw bad("unknown print template");
		String privilege = "receipt".equals(template) || "refund".equals(template) ? "billing"
		        : "appointment".equals(template) ? "appointment" : "diagnostic_order";
		require(privilege, "print");
		Map<String, Object> prior = one(
		    "SELECT * FROM vinshc_document WHERE template_code=? AND source_uuid=? ORDER BY document_version DESC LIMIT 1",
		    template, canonicalUuid(sourceUuid));
		if (prior != null)
			return map((String) prior.get("payload_json"));
		Map<String, Object> payload = buildDocument(template, sourceUuid);
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
		    documentUuid, facility, template, sourceUuid, number, json(payload), actorId(), now());
		return payload;
	}

	public Map<String, Object> dailyReport(String date, String facilityUuid) {
		require("reports", "read");
		LocalDate day;
		try {
			day = LocalDate.parse(date);
		}
		catch (Exception ex) {
			throw bad("date must be YYYY-MM-DD");
		}
		Location location = facilityLocation(facilityUuid);
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
			Map<String, Object> a = required("vinshc_appointment", "appointment_uuid", sourceUuid, "appointment");
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
			if (!(order instanceof DrugOrder))
				throw bad("prescription source is not a drug order");
			DrugOrder drug = (DrugOrder) order;
			patient = drug.getPatient();
			facility = facilityByLocation(drug.getEncounter().getLocation().getLocationId());
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
					throw new IllegalStateException("B8 runtime only accepts the test metadata pack");
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
				throw new IllegalStateException("cannot load B8 metadata", ex);
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
		throw new IllegalStateException("active price is not configured for service/facility");
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
			throw new IllegalStateException("facility location is not provisioned");
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
		throw new IllegalStateException("location is not bound to a facility");
	}

	private static CareSetting outpatient() {
		CareSetting value = Context.getOrderService().getCareSettingByUuid(OUTPATIENT_CARE_SETTING);
		if (value == null)
			throw new IllegalStateException("outpatient care setting missing");
		return value;
	}

	private static OrderType testOrderType() {
		OrderType value = Context.getOrderService().getOrderTypeByUuid(OrderType.TEST_ORDER_TYPE_UUID);
		if (value == null)
			throw new IllegalStateException("test order type missing");
		return value;
	}

	private Order nativeOrder(Map<String, Object> adapter) {
		return Context.getOrderService().getOrder(number(adapter.get("order_id")).intValue());
	}

	private Map<String, Object> billRow(String uuid) {
		return required("vinshc_bill", "bill_uuid", canonicalUuid(uuid), "bill");
	}

	private Map<String, Object> paymentRow(String uuid) {
		return required("vinshc_payment", "payment_uuid", canonicalUuid(uuid), "payment");
	}

	private Map<String, Object> serviceOrderRow(String nativeUuid) {
		Order nativeOrder = Context.getOrderService().getOrderByUuid(canonicalUuid(nativeUuid));
		if (nativeOrder == null || nativeOrder.getVoided())
			throw bad("service order does not exist");
		return required("vinshc_service_order", "order_id", nativeOrder.getOrderId(), "service order");
	}

	private Map<String, Object> resultRow(String uuid) {
		return required("vinshc_result_revision", "result_uuid", canonicalUuid(uuid), "result");
	}

	private boolean billContainsPaidService(Map<String, Object> bill, String service) {
		if (settledReceipts(bill) < number(bill.get("total_vnd")).longValue())
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
		jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtext(?))", value);
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
		if (!(value instanceof Number) || value instanceof Double || value instanceof Float
		        || ((Number) value).doubleValue() != ((Number) value).longValue())
			throw bad(field + " must be an integer");
		long n = ((Number) value).longValue();
		if (n < Integer.MIN_VALUE || n > Integer.MAX_VALUE)
			throw bad(field + " is out of range");
		return (int) n;
	}

	private static long money(Object value, String field, boolean zeroAllowed) {
		if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long
		        || value instanceof java.math.BigInteger))
			throw bad(field + " must be an integer VND amount");
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
			throw new IllegalStateException("authenticated user missing");
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
			    "SELECT p.uuid FROM patient x JOIN person p ON p.person_id=x.patient_id WHERE x.patient_id=?",
			    Object.class, value));
		return string(
		    jdbc.queryForObject("SELECT " + uuidColumn + " FROM " + table + " WHERE " + id + "=?", Object.class, value));
	}

	private String uuidNullable(String table, String id, Object value) {
		return uuidNullable(table, id, value, "uuid");
	}

	private String uuidNullable(String table, String id, Object value, String uuidColumn) {
		return value == null ? null : uuid(table, id, value, uuidColumn);
	}

	private static String sniff(byte[] bytes) {
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

	private static Map<String, Object> userIdentity(int id) {
		User u = Context.getUserService().getUser(id);
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", u.getUuid());
		out.put("fullName", u.getPerson() == null ? u.getUsername() : u.getPerson().getPersonName().getFullName());
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
