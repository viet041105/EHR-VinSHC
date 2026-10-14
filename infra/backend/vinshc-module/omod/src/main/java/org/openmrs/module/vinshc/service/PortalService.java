package org.openmrs.module.vinshc.service;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.SessionFactory;
import org.openmrs.Encounter;
import org.openmrs.Patient;
import org.openmrs.Role;
import org.openmrs.User;
import org.openmrs.Visit;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/**
 * Authenticated self-service reads from explicit, versioned publications, never the staff chart.
 */
@Transactional
public class PortalService {
	
	public static final String ROLE = "VinSHC Portal: patient";
	
	private final SessionFactory sessions;
	
	private final ClinicalService clinical;
	
	private final AuthorizationService authorization;
	
	private final ObjectMapper json = new ObjectMapper();
	
	public PortalService(SessionFactory sessions, ClinicalService clinical, AuthorizationService authorization) {
		this.sessions = sessions;
		this.clinical = clinical;
		this.authorization = authorization;
	}
	
	private User actor() {
		AuthorizationService.requireAuthenticated();
		return Context.getAuthenticatedUser();
	}
	
	private void administrator() {
		AuthorizationService.requireOperation("metadata_admin", "update");
	}
	
	private Patient patient(String uuid) {
		Patient p = Context.getPatientService().getPatientByUuid(VinshcService.canonicalUuid(uuid, "patient"));
		if (p == null || p.getVoided())
			throw VinshcService.bad("patient does not exist");
		return p;
	}
	
	public Map<String, Object> link(Map<String, Object> body) {
		administrator();
		User user = Context.getUserService().getUserByUuid(required(body, "userUuid"));
		Patient p = patient(required(body, "patientUuid"));
		if (user == null || user.getRetired() || user.hasPrivilege("System Developer"))
			throw VinshcService.bad("eligible patient account required");
		for (Role role : user.getAllRoles())
			if (role.getRole().startsWith("VinSHC App: "))
				throw VinshcService.bad("staff account cannot be a portal account");
		if (user.getPerson() == null || !p.getPersonId().equals(user.getPerson().getPersonId()))
			throw VinshcService.bad("account person must be the patient; relatives require their own accounts");
		Role role = Context.getUserService().getRole(ROLE);
		if (role == null)
			role = Context.getUserService().saveRole(new Role(ROLE, "Access only own published patient records"));
		user.addRole(role);
		Context.getUserService().saveUser(user);
		// Never silently rebind an account to another person. Repeat linking is idempotent.
		List<Map<String, Object>> rows = query("SELECT patient_id FROM vinshc_portal_account WHERE user_id=?",
		    user.getUserId());
		if (!rows.isEmpty() && ((Number) rows.get(0).get("patient_id")).intValue() != p.getPatientId())
			throw VinshcService.bad("account is already linked to another patient");
		execute(
		    "INSERT INTO vinshc_portal_account(user_id,patient_id,active,creator,date_created) VALUES (?,?,true,?,?) "
		            + "ON CONFLICT(user_id) DO UPDATE SET active=true",
		    user.getUserId(), p.getPatientId(), actor().getUserId(), Timestamp.from(Instant.now()));
		return map("userUuid", user.getUuid(), "patientUuid", p.getUuid(), "active", true);
	}
	
	public Map<String, Object> unlink(String userUuid) {
		administrator();
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(userUuid, "user"));
		if (user == null)
			throw VinshcService.bad("account does not exist");
		execute("UPDATE vinshc_portal_account SET active=false WHERE user_id=?", user.getUserId());
		return map("userUuid", user.getUuid(), "active", false);
	}
	
	private Patient self() {
		User user = actor();
		if (user.getRetired() || !user.hasRole(ROLE) || user.hasPrivilege("System Developer"))
			throw new APIAuthenticationException("patient portal account required");
		for (Role role : user.getAllRoles())
			if (role.getRole().startsWith("VinSHC App: "))
				throw new APIAuthenticationException("staff cannot use patient portal");
		List<Map<String, Object>> rows = query(
		    "SELECT pe.uuid FROM vinshc_portal_account a JOIN patient p ON p.patient_id=a.patient_id JOIN person pe ON pe.person_id=p.patient_id "
		            + "WHERE a.user_id=? AND a.active=true AND pe.voided=false",
		    user.getUserId());
		if (rows.size() != 1)
			throw new APIAuthenticationException("active account-patient link required");
		Patient p = patient(rows.get(0).get("uuid").toString());
		if (user.getPerson() == null || !p.getPersonId().equals(user.getPerson().getPersonId()))
			throw new APIAuthenticationException("account-patient mismatch");
		return p;
	}
	
	public Map<String, Object> session() {
		Patient p = self();
		return map("persona", "patient", "patientUuid", p.getUuid());
	}
	
	private Visit visit(String uuid) {
		Visit v = Context.getVisitService().getVisitByUuid(VinshcService.canonicalUuid(uuid, "visit"));
		if (v == null || v.getVoided())
			throw VinshcService.bad("visit does not exist");
		return v;
	}
	
	private long watermark(Encounter e) {
		return ((Number) query(
		    "SELECT coalesce(max(event_id),0) AS revision FROM vinshc_clinical_event WHERE encounter_id=?",
		    e.getEncounterId()).get(0).get("revision")).longValue();
	}
	
	@SuppressWarnings("unchecked")
	public Map<String, Object> publish(String visitUuid, Map<String, Object> body) {
		// Publication is a doctor operation and never implied by finalization alone.
		User user = actor();
		Map<String, Object> workspace = authorization.workspace();
		if (!"doctor".equals(workspace.get("role")))
			throw new APIAuthenticationException("doctor finalization privilege required");
		AuthorizationService.requireLegacy(ClinicalService.FINALIZE_PRIVILEGE);
		Visit v = visit(visitUuid);
		Encounter e = Context.getEncounterService().getEncounterByUuid(required(body, "encounterUuid"));
		if (e == null || e.getVoided() || e.getVisit() == null || !v.getVisitId().equals(e.getVisit().getVisitId()))
			throw VinshcService.bad("encounter must belong to visit");
		AuthorizationService.requireEncounterScopeStatic(e);
		// Lock the visit before inspecting and assigning publication versions.
		query("SELECT visit_id FROM visit WHERE visit_id=? FOR UPDATE", v.getVisitId());
		TransactionLocks.lock(sessions, "vinshc-drug-orders:" + v.getPatient().getPatientId());
		TransactionLocks.lock(sessions, "vinshc-encounter:" + e.getEncounterId());
		long sourceRevision = watermark(e);
		Map<String, Object> summary = clinical.summary(e.getUuid());
		if (!"final".equals(summary.get("status")))
			throw VinshcService.bad("only finalized consultation can be published");
		Map<String, Object> consultation = (Map<String, Object>) summary.get("consultation");
		Map<String, Object> values = consultation == null ? Collections.emptyMap()
		        : (Map<String, Object>) consultation.get("values");
		if (values == null)
			values = Collections.emptyMap();
		List<Map<String, Object>> instructions = new ArrayList<>();
		String[][] fields = { { "exam.loi_dan", "Lời dặn" }, { "followup.ngay_tai_kham", "Ngày tái khám" },
		        { "followup.loi_dan", "Lời dặn tái khám" } };
		for (String[] f : fields)
			if (values.get(f[0]) != null && !values.get(f[0]).toString().trim().isEmpty())
				instructions.add(map("field", f[0], "label", f[1], "text", values.get(f[0]).toString()));
		List<Map<String, Object>> prescriptions = new ArrayList<>();
		for (Map<String, Object> order : (List<Map<String, Object>>) summary.get("drugOrders")) {
			if ("voided".equals(order.get("status")))
				continue;
			Map<String, Object> drug = (Map<String, Object>) order.get("drug");
			prescriptions.add(map("uuid", order.get("uuid"), "visitUuid", v.getUuid(), "drugName", drug.get("name"),
			    "strength", drug.get("strength"), "dose", join(order.get("dose"), display(order.get("doseUnits"))),
			    "frequency", display(order.get("frequency")), "route", display(order.get("route")), "duration",
			    join(order.get("duration"), display(order.get("durationUnits"))), "instructions",
			    order.get("dosingInstructions"), "status", order.get("status")));
		}
		List<Map<String, Object>> existing = query(
		    "SELECT coalesce(max(version),0)+1 AS version FROM vinshc_portal_publication WHERE visit_id=?", v.getVisitId());
		int version = ((Number) existing.get(0).get("version")).intValue();
		Instant now = Instant.now();
		for (Map<String, Object> item : prescriptions)
			item.put("confirmedAt", now.toString());
		Map<String, Object> snapshot = map("visitUuid", v.getUuid(), "startDatetime",
		    v.getStartDatetime().toInstant().toString(), "facilityName",
		    e.getLocation() == null ? "Phòng khám" : e.getLocation().getName(), "serviceName", "Khám bệnh", "publishedAt",
		    now.toString(), "version", version, "items", instructions, "prescriptions", prescriptions);
		if (watermark(e) != sourceRevision)
			throw new VinshcExceptions.Conflict("clinical source changed; reload before publishing", null);
		execute("UPDATE vinshc_portal_publication SET active=false WHERE visit_id=?", v.getVisitId());
		String publication = UUID.randomUUID().toString();
		try {
			execute(
			    "INSERT INTO vinshc_portal_publication(publication_uuid,patient_id,visit_id,encounter_id,version,source_revision,payload_json,active,creator,date_created) "
			            + "VALUES (?,?,?,?,?,?,?,true,?,?)",
			    publication, v.getPatient().getPatientId(), v.getVisitId(), e.getEncounterId(), version, sourceRevision,
			    json.writeValueAsString(snapshot), user.getUserId(), Timestamp.from(now));
		}
		catch (java.io.IOException ex) {
			throw new VinshcExceptions.Configuration("publication serialization failed", ex);
		}
		return map("uuid", publication, "visitUuid", v.getUuid(), "version", version, "publishedAt", now.toString(),
		    "active", true);
	}
	
	public Map<String, Object> revoke(String visitUuid) {
		Visit v = visit(visitUuid);
		Map<String, Object> ws = authorization.workspace();
		if (!"doctor".equals(ws.get("role")))
			throw new APIAuthenticationException("doctor required");
		AuthorizationService.requireLegacy(ClinicalService.FINALIZE_PRIVILEGE);
		AuthorizationService.requireLocationScopeStatic(v.getLocation());
		execute("UPDATE vinshc_portal_publication SET active=false WHERE visit_id=?", v.getVisitId());
		return map("visitUuid", v.getUuid(), "active", false);
	}
	
	@SuppressWarnings("unchecked")
	private List<Map<String, Object>> publications(Patient p, String visitUuid) {
		String sql = "SELECT x.payload_json,x.encounter_id FROM vinshc_portal_publication x JOIN visit v ON v.visit_id=x.visit_id JOIN encounter e ON e.encounter_id=x.encounter_id "
		        + "WHERE x.patient_id=? AND x.active=true AND v.voided=false AND e.voided=false "
		        + "AND x.source_revision=(SELECT coalesce(max(event_id),0) FROM vinshc_clinical_event WHERE encounter_id=x.encounter_id)";
		List<Map<String, Object>> rows = visitUuid == null
		        ? query(sql + " ORDER BY x.date_created DESC LIMIT 100", p.getPatientId())
		        : query(sql + " AND v.uuid=?", p.getPatientId(), VinshcService.canonicalUuid(visitUuid, "visit"));
		List<Map<String, Object>> output = new ArrayList<>();
		for (Map<String, Object> row : rows) {
			try {
				output.add(json.readValue(row.get("payload_json").toString(), new TypeReference<Map<String, Object>>() {}));
			}
			catch (java.io.IOException ex) {
				throw new VinshcExceptions.Configuration("publication cannot be read", ex);
			}
		}
		return output;
	}
	
	public Map<String, Object> visits() {
		Patient p = self();
		List<Map<String, Object>> visits = new ArrayList<>();
		for (Map<String, Object> pub : publications(p, null))
			visits.add(map("uuid", pub.get("visitUuid"), "startDatetime", pub.get("startDatetime"), "facilityName",
			    pub.get("facilityName"), "serviceName", pub.get("serviceName"), "publishedAt", pub.get("publishedAt"),
			    "version", pub.get("version")));
		audit(p, "visits");
		return map("patientUuid", p.getUuid(), "results", visits);
	}
	
	public Map<String, Object> instructions(String visitUuid) {
		Patient p = self();
		List<Map<String, Object>> pubs = publications(p, visitUuid);
		if (pubs.isEmpty())
			throw new APIAuthenticationException("published visit unavailable");
		Map<String, Object> pub = pubs.get(0);
		audit(p, "instructions");
		return map("patientUuid", p.getUuid(), "visitUuid", pub.get("visitUuid"), "publishedAt", pub.get("publishedAt"),
		    "version", pub.get("version"), "items", pub.get("items"));
	}
	
	@SuppressWarnings("unchecked")
	public Map<String, Object> prescriptions(String visitUuid) {
		Patient p = self();
		List<Map<String, Object>> result = new ArrayList<>();
		for (Map<String, Object> pub : publications(p, visitUuid))
			result.addAll((List<Map<String, Object>>) pub.get("prescriptions"));
		audit(p, "prescriptions");
		return map("patientUuid", p.getUuid(), "results", result);
	}
	
	public Map<String, Object> appointments() {
		Patient p = self();
		List<Map<String, Object>> results = query(
		    "SELECT appointment_uuid AS uuid,start_at,status,appointment_type AS service_name "
		            + "FROM vinshc_appointment WHERE patient_id=? ORDER BY start_at DESC LIMIT 100",
		    p.getPatientId());
		List<Map<String, Object>> out = new ArrayList<>();
		for (Map<String, Object> row : results)
			out.add(map("uuid", row.get("uuid"), "startAt", ((Timestamp) row.get("start_at")).toInstant().toString(),
			    "status", row.get("status"), "serviceName", row.get("service_name")));
		audit(p, "appointments");
		return map("patientUuid", p.getUuid(), "results", out);
	}
	
	private void audit(Patient p, String type) {
		AuthorizationService.auditReadStatic("patient_portal", p, null, p.getUuid(), type);
	}
	
	private List<Map<String, Object>> query(String sql, Object... args) {
		return sessions.getCurrentSession().doReturningWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(sql)) {
				for (int i = 0; i < args.length; i++)
					statement.setObject(i + 1, args[i]);
				List<Map<String, Object>> result = new ArrayList<>();
				try (ResultSet rs = statement.executeQuery()) {
					while (rs.next()) {
						Map<String, Object> row = new LinkedHashMap<>();
						for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++)
							row.put(rs.getMetaData().getColumnLabel(i), rs.getObject(i));
						result.add(row);
					}
				}
				return result;
			}
		});
	}
	
	private void execute(String sql, Object... args) {
		sessions.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(sql)) {
				for (int i = 0; i < args.length; i++)
					statement.setObject(i + 1, args[i]);
				statement.executeUpdate();
			}
		});
	}
	
	private static String required(Map<String, Object> body, String key) {
		if (!(body.get(key) instanceof String))
			throw VinshcService.bad(key + " required");
		return VinshcService.canonicalUuid(body.get(key).toString(), key);
	}
	
	private static String display(Object value) {
		Object text = value instanceof Map ? ((Map<?, ?>) value).get("display") : null;
		return text == null ? null : text.toString();
	}
	
	private static String join(Object a, Object b) {
		return a == null ? null : a.toString() + (b == null ? "" : " " + b.toString());
	}
	
	private static Map<String, Object> map(Object... values) {
		Map<String, Object> m = new LinkedHashMap<>();
		for (int i = 0; i < values.length; i += 2)
			m.put(values[i].toString(), values[i + 1]);
		return m;
	}
}
