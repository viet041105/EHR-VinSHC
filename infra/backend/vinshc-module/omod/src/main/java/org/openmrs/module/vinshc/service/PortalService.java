/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at http://mozilla.org/MPL/2.0/. OpenMRS is also distributed under
 * the terms of the Healthcare Disclaimer located at http://openmrs.org/license.
 *
 * Copyright (C) OpenMRS Inc. OpenMRS is a registered trademark and the OpenMRS
 * graphic logo is a trademark of OpenMRS Inc.
 */
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
		// Until cross-facility delegated identity verification is approved, only
		// System Developer may activate or revoke patient-account links.
		if (!actor().hasPrivilege("System Developer"))
			throw new APIAuthenticationException("System Developer required for patient identity links");
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
		// Account-to-patient identity is never inferred from contacts or demographics.
		// Verification is a separate explicit step: linking alone cannot expose a chart.
		TransactionLocks.lock(sessions, "portal-link:" + user.getUserId());
		List<Map<String, Object>> rows = query("SELECT patient_id,active FROM vinshc_portal_account WHERE user_id=?",
		    user.getUserId());
		if (!rows.isEmpty() && ((Number) rows.get(0).get("patient_id")).intValue() != p.getPatientId())
			throw VinshcService.bad("account is already linked to another patient");
		List<Map<String, Object>> previous = query(
		    "SELECT status,version_number FROM vinshc_portal_link_event WHERE user_id=?"
		            + " ORDER BY version_number DESC LIMIT 1",
		    user.getUserId());
		if (!previous.isEmpty() && !"revoked".equals(previous.get(0).get("status")))
			return map("userUuid", user.getUuid(), "patientUuid", p.getUuid(), "status", previous.get(0).get("status"),
			    "active", "active".equals(previous.get(0).get("status")));
		execute(
		    "INSERT INTO vinshc_portal_account(user_id,patient_id,active,creator,date_created)"
		            + " VALUES (?,?,false,?,?) ON CONFLICT(user_id) DO UPDATE SET active=false",
		    user.getUserId(), p.getPatientId(), actor().getUserId(), Timestamp.from(Instant.now()));
		linkEvent(user.getUserId(), p.getPatientId(), "pending", null, null);
		return map("userUuid", user.getUuid(), "patientUuid", p.getUuid(), "status", "pending", "active", false);
	}

	/** Immutable link history is available only to the identity-verification administrator. */
	public Map<String, Object> linkHistory(String userUuid) {
		administrator();
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(userUuid, "user"));
		if (user == null)
			throw VinshcService.bad("account does not exist");
		List<Map<String, Object>> rows = query(
		    "SELECT l.event_uuid,l.version_number,l.status,l.verification_method,l.reason,"
		            + "u.uuid AS actor_uuid,l.date_created"
		            + " FROM vinshc_portal_link_event l JOIN users u ON u.user_id=l.creator"
		            + " WHERE l.user_id=? ORDER BY l.version_number",
		    user.getUserId());
		return map("userUuid", user.getUuid(), "results", rows);
	}

	/** Activation needs explicit identity verification; creating a link does not grant access. */
	public Map<String, Object> verify(String userUuid, Map<String, Object> body) {
		administrator();
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(userUuid, "user"));
		if (user == null || user.getRetired())
			throw VinshcService.bad("eligible account required");
		String method = body == null ? null : (String) body.get("verificationMethod");
		if (!java.util.Arrays.asList("in_person_document", "verified_eid", "verified_clinic_record").contains(method))
			throw VinshcService.bad("approved verificationMethod required");
		TransactionLocks.lock(sessions, "portal-link:" + user.getUserId());
		List<Map<String, Object>> rows = query("SELECT patient_id,active FROM vinshc_portal_account WHERE user_id=?",
		    user.getUserId());
		if (rows.size() != 1)
			throw VinshcService.bad("pending link required");
		List<Map<String, Object>> latest = query(
		    "SELECT status FROM vinshc_portal_link_event WHERE user_id=?" + " ORDER BY version_number DESC LIMIT 1",
		    user.getUserId());
		if (latest.isEmpty() || !"pending".equals(latest.get(0).get("status")))
			throw VinshcService.bad("only pending link may be verified");
		int patientId = ((Number) rows.get(0).get("patient_id")).intValue();
		if (user.getPerson() == null || user.getPerson().getPersonId() != patientId)
			throw VinshcService.bad("account person mismatch");
		linkEvent(user.getUserId(), patientId, "active", method, null);
		execute("UPDATE vinshc_portal_account SET active=true WHERE user_id=?", user.getUserId());
		return map("userUuid", user.getUuid(), "patientUuid", Context.getPatientService().getPatient(patientId).getUuid(),
		    "status", "active", "active", true);
	}

	private void linkEvent(int user, int patient, String status, String method, String reason) {
		Number next = (Number) query(
		    "SELECT coalesce(max(version_number),0)+1 AS version" + " FROM vinshc_portal_link_event WHERE user_id=?", user)
		        .get(0).get("version");
		execute(
		    "INSERT INTO vinshc_portal_link_event(event_uuid,user_id,patient_id,version_number,status,"
		            + "verification_method,reason,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?)",
		    UUID.randomUUID().toString(), user, patient, next.intValue(), status, method, reason, actor().getUserId(),
		    Timestamp.from(Instant.now()));
	}

	public Map<String, Object> unlink(String userUuid) {
		return unlink(userUuid, "Revoked by clinic administrator");
	}

	public Map<String, Object> unlink(String userUuid, String reason) {
		administrator();
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(userUuid, "user"));
		if (user == null)
			throw VinshcService.bad("account does not exist");
		if (reason == null || reason.trim().isEmpty() || reason.length() > 1000)
			throw VinshcService.bad("revocation reason required (max 1000 characters)");
		TransactionLocks.lock(sessions, "portal-link:" + user.getUserId());
		List<Map<String, Object>> rows = query("SELECT patient_id FROM vinshc_portal_account WHERE user_id=?",
		    user.getUserId());
		if (rows.isEmpty())
			throw VinshcService.bad("link does not exist");
		linkEvent(user.getUserId(), ((Number) rows.get(0).get("patient_id")).intValue(), "revoked", null, reason.trim());
		execute("UPDATE vinshc_portal_account SET active=false WHERE user_id=?", user.getUserId());
		return map("userUuid", user.getUuid(), "status", "revoked", "active", false);
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
		List<Map<String, Object>> current = query(
		    "SELECT status FROM vinshc_portal_link_event WHERE user_id=?" + " ORDER BY version_number DESC LIMIT 1",
		    user.getUserId());
		if (current.isEmpty() || !"active".equals(current.get(0).get("status")))
			throw new APIAuthenticationException("verified active account-patient link required");
		Patient p = patient(rows.get(0).get("uuid").toString());
		if (user.getPerson() == null || !p.getPersonId().equals(user.getPerson().getPersonId()))
			throw new APIAuthenticationException("account-patient mismatch");
		return p;
	}

	public Map<String, Object> session() {
		Patient p = self();
		return map("persona", "patient", "patientUuid", p.getUuid());
	}

	/** Do not expose identity documents, demographic contacts or staff chart metadata. */
	public Map<String, Object> me() {
		Patient p = self();
		User user = actor();
		return map("persona", "patient", "userUuid", user.getUuid(), "patientUuid", p.getUuid(), "linkStatus", "active",
		    "verified", true);
	}

	/** Read only one explicit, currently active publication belonging to the authenticated patient. */
	private Map<String, Object> publication(String uuid) {
		Patient p = self();
		List<Map<String, Object>> rows = query(
		    "SELECT x.payload_json FROM vinshc_portal_publication x"
		            + " JOIN visit v ON v.visit_id=x.visit_id JOIN encounter e ON e.encounter_id=x.encounter_id"
		            + " WHERE x.publication_uuid=? AND x.patient_id=? AND x.active=true"
		            + " AND v.voided=false AND e.voided=false" + " AND x.source_revision=(SELECT coalesce(max(event_id),0)"
		            + " FROM vinshc_clinical_event WHERE encounter_id=x.encounter_id)",
		    VinshcService.canonicalUuid(uuid, "publication"), p.getPatientId());
		if (rows.size() != 1)
			throw new APIAuthenticationException("published resource unavailable");
		try {
			return json.readValue(rows.get(0).get("payload_json").toString(), new TypeReference<Map<String, Object>>() {});
		}
		catch (java.io.IOException ex) {
			throw new VinshcExceptions.Configuration("publication cannot be read", ex);
		}
	}

	public Map<String, Object> publicationVisit(String visitUuid) {
		Patient p = self();
		List<Map<String, Object>> rows = publications(p, visitUuid, 1, 0);
		if (rows.size() != 1)
			throw new APIAuthenticationException("published resource unavailable");
		audit(p, "published_visit");
		Map<String, Object> row = rows.get(0);
		return map("visitUuid", row.get("visitUuid"), "publishedAt", row.get("publishedAt"), "facilityName",
		    row.get("facilityName"), "version", row.get("version"), "items", row.get("items"), "prescriptions",
		    row.get("prescriptions"), "results", row.get("results"));
	}

	@SuppressWarnings("unchecked")
	public Map<String, Object> publicationItems(String uuid, String category) {
		Map<String, Object> snapshot = publication(uuid);
		Patient p = self();
		if (!"prescriptions".equals(category) && !"results".equals(category))
			throw VinshcService.bad("unapproved publication category");
		audit(p, category + ":publication");
		return map("visitUuid", snapshot.get("visitUuid"), "version", snapshot.get("version"), "publishedAt",
		    snapshot.get("publishedAt"), "results", snapshot.get(category));
	}

	/** No patient file download until the P2 malware scan and document approval gates pass. */
	public void denyUnscannedAttachment(String uuid) {
		self();
		throw new APIAuthenticationException("attachment publication unavailable");
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
		// Explicit section selection: finalization never publishes the whole chart.
		Object requested = body.get("sections");
		if (!(requested instanceof List<?>) || ((List<?>) requested).isEmpty())
			throw VinshcService.bad("sections must explicitly select approved publication types");
		for (Object section : (List<?>) requested)
			if (!"instructions".equals(section) && !"prescriptions".equals(section) && !"results".equals(section))
				throw VinshcService.bad("publication section is not approved");
		boolean includeInstructions = ((List<?>) requested).contains("instructions");
		boolean includePrescriptions = ((List<?>) requested).contains("prescriptions");
		boolean includeResults = ((List<?>) requested).contains("results");
		List<Map<String, Object>> instructions = new ArrayList<>();
		String[][] fields = { { "exam.loi_dan", "Lời dặn" }, { "followup.ngay_tai_kham", "Ngày tái khám" },
		        { "followup.loi_dan", "Lời dặn tái khám" } };
		for (String[] f : fields)
			if (includeInstructions && values.get(f[0]) != null && !values.get(f[0]).toString().trim().isEmpty())
				instructions.add(map("field", f[0], "label", f[1], "text", values.get(f[0]).toString()));
		List<Map<String, Object>> prescriptions = new ArrayList<>();
		if (includePrescriptions)
			for (Map<String, Object> order : (List<Map<String, Object>>) summary.get("drugOrders")) {
				if (!"active".equals(order.get("status")))
					throw VinshcService.bad("inactive or discontinued prescription cannot be published");
				Map<String, Object> drug = (Map<String, Object>) order.get("drug");
				prescriptions.add(map("uuid", order.get("uuid"), "visitUuid", v.getUuid(), "drugName", drug.get("name"),
				    "strength", drug.get("strength"), "dose", join(order.get("dose"), display(order.get("doseUnits"))),
				    "frequency", display(order.get("frequency")), "route", display(order.get("route")), "duration",
				    join(order.get("duration"), display(order.get("durationUnits"))), "instructions",
				    order.get("dosingInstructions"), "status", order.get("status")));
			}
		// Only reviewer-approved, completed, most-recent structured diagnostic results.
		// No binary attachment is ever included until a malware-scanning policy exists.
		List<Map<String, Object>> results = new ArrayList<>();
		if (includeResults) {
			List<Map<String, Object>> rows = query(
			    "SELECT r.result_uuid,r.version_number,r.state,r.numeric_value,r.text_value,r.unit,"
			            + "r.recorded_at,r.reviewed_at,s.service_name,o.uuid AS order_uuid"
			            + " FROM vinshc_service_order s JOIN orders o ON o.order_id=s.order_id"
			            + " JOIN LATERAL (SELECT * FROM vinshc_result_revision WHERE service_order_id=s.service_order_id"
			            + " ORDER BY version_number DESC LIMIT 1) r ON true"
			            + " WHERE s.visit_id=? AND s.encounter_id=? AND s.patient_id=?"
			            + " AND s.state='completed' AND r.state IN ('final','corrected')"
			            + " AND r.reviewer_provider_id IS NOT NULL AND r.reviewed_at IS NOT NULL",
			    v.getVisitId(), e.getEncounterId(), v.getPatient().getPatientId());
			for (Map<String, Object> row : rows)
				results.add(map("resultUuid", row.get("result_uuid"), "sourceOrderUuid", row.get("order_uuid"),
				    "serviceName", row.get("service_name"), "version", row.get("version_number"), "state", row.get("state"),
				    "numericValue", row.get("numeric_value"), "textValue", row.get("text_value"), "unit", row.get("unit"),
				    "recordedAt", ((Timestamp) row.get("recorded_at")).toInstant().toString(), "reviewedAt",
				    ((Timestamp) row.get("reviewed_at")).toInstant().toString()));
		}
		List<Map<String, Object>> existing = query(
		    "SELECT coalesce(max(version),0)+1 AS version FROM vinshc_portal_publication WHERE visit_id=?", v.getVisitId());
		int version = ((Number) existing.get(0).get("version")).intValue();
		Instant now = Instant.now();
		for (Map<String, Object> item : prescriptions)
			item.put("confirmedAt", now.toString());
		if (instructions.isEmpty() && prescriptions.isEmpty() && results.isEmpty())
			throw VinshcService.bad("selected publication has no eligible items");
		Map<String, Object> snapshot = map("visitUuid", v.getUuid(), "startDatetime",
		    v.getStartDatetime().toInstant().toString(), "facilityName",
		    e.getLocation() == null ? "Phòng khám" : e.getLocation().getName(), "serviceName", "Khám bệnh", "publishedAt",
		    now.toString(), "version", version, "sourceEncounterUuid", e.getUuid(), "sourceRevision", sourceRevision,
		    "sections", requested, "items", instructions, "prescriptions", prescriptions, "results", results);
		if (watermark(e) != sourceRevision)
			throw new VinshcExceptions.Conflict("clinical source changed; reload before publishing", null);
		List<Map<String, Object>> superseded = query(
		    "SELECT publication_id FROM vinshc_portal_publication WHERE visit_id=? AND active=true", v.getVisitId());
		for (Map<String, Object> old : superseded)
			publicationEvent(((Number) old.get("publication_id")).longValue(), "superseded", "new approved revision");
		execute("UPDATE vinshc_portal_publication SET active=false WHERE visit_id=?", v.getVisitId());
		String publication = UUID.randomUUID().toString();
		try {
			execute(
			    "INSERT INTO vinshc_portal_publication(publication_uuid,patient_id,visit_id,encounter_id,version,source_revision,"
			            + "payload_json,active,creator,date_created,source_type,source_uuid,source_version,facility_location_id) "
			            + "VALUES (?,?,?,?,?,?,?,true,?,?,?,?,?,?)",
			    publication, v.getPatient().getPatientId(), v.getVisitId(), e.getEncounterId(), version, sourceRevision,
			    json.writeValueAsString(snapshot), user.getUserId(), Timestamp.from(now), "consultation", e.getUuid(),
			    version, e.getLocation() == null ? v.getLocation().getLocationId() : e.getLocation().getLocationId());
		}
		catch (java.io.IOException ex) {
			throw new VinshcExceptions.Configuration("publication serialization failed", ex);
		}
		Number publicationId = (Number) query(
		    "SELECT publication_id FROM vinshc_portal_publication WHERE publication_uuid=?", publication).get(0)
		        .get("publication_id");
		publicationEvent(publicationId.longValue(), "published", null);
		return map("uuid", publication, "visitUuid", v.getUuid(), "version", version, "publishedAt", now.toString(),
		    "sections", requested, "active", true);
	}

	private void publicationEvent(long publicationId, String state, String reason) {
		execute(
		    "INSERT INTO vinshc_portal_publication_event"
		            + "(event_uuid,publication_id,status,reason,creator,date_created) VALUES (?,?,?,?,?,?)",
		    UUID.randomUUID().toString(), publicationId, state, reason, actor().getUserId(), Timestamp.from(Instant.now()));
	}

	public Map<String, Object> publicationHistory(String visitUuid) {
		Visit v = visit(visitUuid);
		Map<String, Object> ws = authorization.workspace();
		if (!"doctor".equals(ws.get("role")))
			throw new APIAuthenticationException("doctor required");
		AuthorizationService.requireLegacy(ClinicalService.FINALIZE_PRIVILEGE);
		AuthorizationService.requireLocationScopeStatic(v.getLocation());
		List<Map<String, Object>> history = query(
		    "SELECT p.publication_uuid,p.version,p.source_uuid,p.source_revision,p.source_type,"
		            + "e.status,e.reason,u.uuid AS actor_uuid,e.date_created"
		            + " FROM vinshc_portal_publication p JOIN vinshc_portal_publication_event e"
		            + " ON e.publication_id=p.publication_id JOIN users u ON u.user_id=e.creator"
		            + " WHERE p.visit_id=? ORDER BY e.event_id",
		    v.getVisitId());
		return map("visitUuid", v.getUuid(), "results", history);
	}

	public Map<String, Object> revoke(String visitUuid, String reason) {
		Visit v = visit(visitUuid);
		Map<String, Object> ws = authorization.workspace();
		if (!"doctor".equals(ws.get("role")))
			throw new APIAuthenticationException("doctor required");
		AuthorizationService.requireLegacy(ClinicalService.FINALIZE_PRIVILEGE);
		AuthorizationService.requireLocationScopeStatic(v.getLocation());
		if (reason == null || reason.trim().isEmpty() || reason.length() > 1000)
			throw VinshcService.bad("publication revocation reason required");
		query("SELECT visit_id FROM visit WHERE visit_id=? FOR UPDATE", v.getVisitId());
		List<Map<String, Object>> active = query(
		    "SELECT publication_id FROM vinshc_portal_publication WHERE visit_id=? AND active=true", v.getVisitId());
		for (Map<String, Object> row : active)
			publicationEvent(((Number) row.get("publication_id")).longValue(), "revoked", reason.trim());
		execute("UPDATE vinshc_portal_publication SET active=false WHERE visit_id=?", v.getVisitId());
		return map("visitUuid", v.getUuid(), "active", false);
	}

	private List<Map<String, Object>> publications(Patient p, String visitUuid) {
		return publications(p, visitUuid, 100, 0);
	}

	@SuppressWarnings("unchecked")
	private List<Map<String, Object>> publications(Patient p, String visitUuid, int limit, int offset) {
		String sql = "SELECT x.payload_json,x.encounter_id FROM vinshc_portal_publication x JOIN visit v ON v.visit_id=x.visit_id JOIN encounter e ON e.encounter_id=x.encounter_id "
		        + "WHERE x.patient_id=? AND x.active=true AND v.voided=false AND e.voided=false "
		        + "AND x.source_revision=(SELECT coalesce(max(event_id),0) FROM vinshc_clinical_event WHERE encounter_id=x.encounter_id)";
		List<Map<String, Object>> rows = visitUuid == null
		        ? query(sql + " ORDER BY x.date_created DESC LIMIT ? OFFSET ?", p.getPatientId(), limit, offset)
		        : query(sql + " AND v.uuid=? ORDER BY x.date_created DESC LIMIT ? OFFSET ?", p.getPatientId(),
		            VinshcService.canonicalUuid(visitUuid, "visit"), limit, offset);
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

	private static int pageSize(Integer limit) {
		int size = limit == null ? 30 : limit;
		if (size < 1 || size > 100)
			throw VinshcService.bad("limit must be 1..100");
		return size;
	}

	private static int pageOffset(Integer offset) {
		int skip = offset == null ? 0 : offset;
		if (skip < 0 || skip > 1000000)
			throw VinshcService.bad("offset must be 0..1000000");
		return skip;
	}

	public Map<String, Object> visits() {
		return visits(null, null);
	}

	public Map<String, Object> visits(Integer limit, Integer offset) {
		Patient p = self();
		int size = pageSize(limit), skip = pageOffset(offset);
		List<Map<String, Object>> source = publications(p, null, size + 1, skip);
		boolean more = source.size() > size;
		List<Map<String, Object>> visits = new ArrayList<>();
		for (Map<String, Object> pub : source.subList(0, Math.min(size, source.size())))
			visits.add(map("uuid", pub.get("visitUuid"), "startDatetime", pub.get("startDatetime"), "facilityName",
			    pub.get("facilityName"), "serviceName", pub.get("serviceName"), "publishedAt", pub.get("publishedAt"),
			    "version", pub.get("version")));
		audit(p, "visits");
		return map("patientUuid", p.getUuid(), "results", visits, "limit", size, "offset", skip, "hasMore", more);
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

	public Map<String, Object> prescriptions(String visitUuid) {
		return prescriptions(visitUuid, null, null);
	}

	@SuppressWarnings("unchecked")
	public Map<String, Object> prescriptions(String visitUuid, Integer limit, Integer offset) {
		Patient p = self();
		int size = pageSize(limit), skip = pageOffset(offset);
		// Pages are over publication snapshots, so a patient's approved order
		// lines remain an atomic snapshot and cannot mix revisions.
		List<Map<String, Object>> snapshots = publications(p, visitUuid, size + 1, skip);
		boolean more = snapshots.size() > size;
		List<Map<String, Object>> result = new ArrayList<>();
		for (Map<String, Object> pub : snapshots.subList(0, Math.min(size, snapshots.size())))
			result.addAll((List<Map<String, Object>>) pub.get("prescriptions"));
		audit(p, "prescriptions");
		return map("patientUuid", p.getUuid(), "results", result, "limit", size, "offset", skip, "hasMore", more,
		    "paginationUnit", "publication");
	}

	public Map<String, Object> results(String visitUuid, Integer limit, Integer offset) {
		Patient p = self();
		int size = pageSize(limit), skip = pageOffset(offset);
		List<Map<String, Object>> snapshots = publications(p, visitUuid, size + 1, skip);
		boolean more = snapshots.size() > size;
		List<Map<String, Object>> approved = new ArrayList<>();
		for (Map<String, Object> pub : snapshots.subList(0, Math.min(size, snapshots.size()))) {
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> items = (List<Map<String, Object>>) pub.get("results");
			if (items != null)
				approved.addAll(items);
		}
		audit(p, "results");
		return map("patientUuid", p.getUuid(), "results", approved, "limit", size, "offset", skip, "hasMore", more,
		    "paginationUnit", "publication");
	}

	public Map<String, Object> appointments() {
		Patient p = self();
		// Appointment publication requires its own approved, versioned policy.
		// Never leak unreviewed operational bookings just because the user is linked.
		audit(p, "appointments");
		return map("patientUuid", p.getUuid(), "results", Collections.emptyList(), "publicationRequired", true);
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
