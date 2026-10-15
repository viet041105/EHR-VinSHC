package org.openmrs.module.vinshc.service;

import static org.openmrs.module.vinshc.service.AccessStore.*;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.openmrs.Location;
import org.openmrs.Patient;
import org.openmrs.Role;
import org.openmrs.User;
import org.openmrs.Visit;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/** Doctor handoff -> system administrator provisions the existing patient's own portal account. */
@Transactional
public class PatientAccessService {
    private final AccessStore db;
    private final AuthorizationService authorization;
    private final PortalService portal;
    private final NotificationService notifications;

    public PatientAccessService(SessionFactory sessions, AuthorizationService authorization, PortalService portal,
                                NotificationService notifications) {
        db = new AccessStore(sessions); this.authorization = authorization; this.portal = portal; this.notifications = notifications;
    }

    private User actor() { AuthorizationService.requireAuthenticated(); return Context.getAuthenticatedUser(); }
    private Map<String, Object> workspace() {
        actor(); Map<String, Object> ws = authorization.workspace();
        if (!"doctor".equals(ws.get("role")) && !"admin".equals(ws.get("role"))) throw denied();
        AuthorizationService.requireOperation("doctor".equals(ws.get("role")) ? "visit" : "metadata_admin", "read");
        return ws;
    }
    private int facility(Map<String, Object> ws) {
        return Context.getLocationService().getLocationByUuid(ws.get("facilityUuid").toString()).getLocationId();
    }
    private static APIAuthenticationException denied() { return new APIAuthenticationException("patient account request is not in your workspace"); }
    private static VinshcExceptions.Conflict conflict(String message) { return new VinshcExceptions.Conflict(message, Collections.emptyList()); }
    private static String text(Map<String, Object> body, String key, int max) { return StaffAccountService.field(body, key, max); }
    private static String optional(Map<String, Object> body, String key) {
        if (body.get(key) == null) return null;
        if (!(body.get(key) instanceof String) || body.get(key).toString().length() > 1000) throw VinshcService.bad(key + " must be text (max 1000)");
        return body.get(key).toString().trim();
    }
    private void lock(int patient) { TransactionLocks.lock(db.sessions, "patient-access:" + patient); }
    private Patient patient(int id) {
        Patient p = Context.getPatientService().getPatient(id);
        if (p == null || p.getVoided()) throw VinshcService.bad("patient does not exist");
        return p;
    }

    private void doctorVisit(Patient patient, Visit visit, int facility) {
        if (visit == null || visit.getVoided() || !visit.getPatient().getPatientId().equals(patient.getPatientId()))
            throw VinshcService.bad("visit must belong to this patient");
        AuthorizationService.requireLocationScopeStatic(visit.getLocation());
        // Explicit P1 provider link, never user UUID == provider UUID or an arbitrary facility visit.
        Map<String, Object> assigned = db.one("SELECT 1 AS n FROM vinshc_provider_link x JOIN provider p ON p.provider_id=x.provider_id"
            + " WHERE x.user_id=? AND x.facility_location_id=? AND x.active=true AND p.retired=false AND ("
            + " EXISTS(SELECT 1 FROM encounter e JOIN encounter_provider ep ON ep.encounter_id=e.encounter_id"
            + " WHERE e.visit_id=? AND e.voided=false AND ep.voided=false AND ep.provider_id=x.provider_id)"
            + " OR EXISTS(SELECT 1 FROM vinshc_queue_item q WHERE q.visit_id=? AND q.provider_id=x.provider_id"
            + " AND q.state IN('waiting','called','in_service'))) LIMIT 1", actor().getUserId(), facility, visit.getVisitId(), visit.getVisitId());
        if (assigned == null) throw denied();
    }

    public Map<String, Object> create(Map<String, Object> body) {
        Map<String, Object> ws = workspace(); if (!"doctor".equals(ws.get("role"))) throw denied();
        StaffAccountService.credentials(body, "type", "patientUuid", "visitUuid", "note", "idempotencyKey");
        String type = text(body, "type", 32);
        if (!"patient_account_create".equals(type) && !"patient_password_reset".equals(type)) throw VinshcService.bad("unknown request type");
        String patientUuid = VinshcService.canonicalUuid(text(body, "patientUuid", 38), "patient");
        Patient patient = Context.getPatientService().getPatientByUuid(patientUuid);
        if (patient == null || patient.getVoided()) throw VinshcService.bad("patient does not exist");
        Visit visit = Context.getVisitService().getVisitByUuid(VinshcService.canonicalUuid(text(body, "visitUuid", 38), "visit"));
        int facility = facility(ws); doctorVisit(patient, visit, facility);
        String key = text(body, "idempotencyKey", 100), note = optional(body, "note");
        TransactionLocks.lock(db.sessions, "patient-access-key:" + actor().getUserId() + ":" + key);
        Map<String, Object> prior = db.one("SELECT * FROM vinshc_patient_access_request WHERE requester=? AND idempotency_key=?", actor().getUserId(), key);
        if (prior != null) {
            if (number(prior.get("patient_id")) != patient.getPatientId() || number(prior.get("visit_id")) != visit.getVisitId()
                || !type.equals(prior.get("request_type")) || !java.util.Objects.equals(note, prior.get("note")))
                throw conflict("idempotency key was used for another account request");
            return view(prior);
        }
        lock(patient.getPatientId());
        if (db.one("SELECT 1 FROM vinshc_patient_access_request WHERE patient_id=? AND request_type=? AND status='pending'", patient.getPatientId(), type) != null)
            throw conflict("Đã có yêu cầu đang chờ quản trị xử lý cho người bệnh này.");
        User portalUser = portalUser(patient);
        if ("patient_account_create".equals(type) && existingUser(patient)) throw conflict("Người bệnh đã có tài khoản. Hãy yêu cầu hỗ trợ mật khẩu hoặc liên kết tài khoản hiện có.");
        if ("patient_password_reset".equals(type) && portalUser == null) throw conflict("Người bệnh chưa có tài khoản portal đang hoạt động.");
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO vinshc_patient_access_request(request_uuid,request_type,patient_id,visit_id,facility_location_id,requester,idempotency_key,note,date_created) VALUES(?,?,?,?,?,?,?,?,?)",
            id, type, patient.getPatientId(), visit.getVisitId(), facility, actor().getUserId(), key, note, now());
        notifications.administrators(facility, id); audit("patient_account.requested", id, type);
        return view(db.one("SELECT * FROM vinshc_patient_access_request WHERE request_uuid=?", id));
    }

    private Map<String, Object> scoped(String uuid, Map<String, Object> ws) {
        Map<String, Object> row = db.one("SELECT * FROM vinshc_patient_access_request WHERE request_uuid=?", VinshcService.canonicalUuid(uuid, "request"));
        if (row == null || number(row.get("facility_location_id")) != facility(ws)
            || ("doctor".equals(ws.get("role")) && number(row.get("requester")) != actor().getUserId())) throw denied();
        return row;
    }

    public Map<String, Object> get(String uuid) { return view(scoped(uuid, workspace())); }

    public Map<String, Object> list(String status, String patientUuid, Integer limit, Integer offset) {
        Map<String, Object> ws = workspace(); int size = limit(limit), skip = offset(offset);
        boolean doctor = "doctor".equals(ws.get("role"));
        String where = "facility_location_id=?"; List<Object> args = new ArrayList<>(); args.add(facility(ws));
        if (doctor) { where += " AND requester=?"; args.add(actor().getUserId()); }
        if (status != null && !status.isEmpty()) {
            if (!java.util.Arrays.asList("pending", "fulfilled", "rejected").contains(status)) throw VinshcService.bad("unknown status");
            where += " AND status=?"; args.add(status);
        }
        if (patientUuid != null && !patientUuid.isEmpty()) {
            Patient p = Context.getPatientService().getPatientByUuid(VinshcService.canonicalUuid(patientUuid, "patient"));
            if (p == null) throw VinshcService.bad("patient does not exist");
            AuthorizationService.requirePatientScopeStatic(p); where += " AND patient_id=?"; args.add(p.getPatientId());
        }
        args.add(size + 1); args.add(skip);
        List<Map<String, Object>> rows = db.query("SELECT * FROM vinshc_patient_access_request WHERE " + where + " ORDER BY date_created DESC,request_uuid DESC LIMIT ? OFFSET ?", args.toArray());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows.subList(0, Math.min(size, rows.size()))) out.add(view(row));
        boolean system = !doctor && actor().hasPrivilege("System Developer");
        return map("results", out, "hasMore", rows.size() > size, "limit", size, "offset", skip,
            "capabilities", map("request", doctor, "fulfill", system, "reject", system));
    }

    public Map<String, Object> fulfill(String uuid, Map<String, Object> body) {
        Map<String, Object> ws = workspace(); administrator(ws);
        StaffAccountService.credentials(body, "username", "password", "verificationMethod", "idempotencyKey");
        String key = text(body, "idempotencyKey", 100);
        Map<String, Object> row = scoped(uuid, ws); lock(number(row.get("patient_id"))); row = scoped(uuid, ws);
        uuid = row.get("request_uuid").toString();
        if ("fulfilled".equals(row.get("status")) && key.equals(row.get("fulfill_key"))) {
            if (body.get("username") != null && !text(body,"username",50).equals(Context.getUserService().getUser(number(row.get("user_id"))).getUsername()))
                throw conflict("idempotency key was used for another username");
            return view(row); // Never reset a password again when replaying a completed request.
        }
        if (!"pending".equals(row.get("status"))) throw conflict("Yêu cầu đã được xử lý. Hãy tải lại danh sách.");
        String password = patientPassword(body), method = text(body, "verificationMethod", 60);
        if (!java.util.Arrays.asList("in_person_document", "verified_eid", "verified_clinic_record").contains(method)) throw VinshcService.bad("approved verificationMethod required");
        Patient patient = patient(number(row.get("patient_id"))); User user;
        if ("patient_account_create".equals(row.get("request_type"))) {
            if (existingUser(patient)) throw conflict("Người bệnh đã có tài khoản. Không tạo thêm tài khoản trùng.");
            String username = StaffAccountService.validUsername(body);
            if (Context.getUserService().getUserByUsername(username) != null) throw conflict("Tên đăng nhập đã được sử dụng.");
            user = new User(patient); user.setUsername(username);
            user = Context.getUserService().createUser(user, password);
            db.sessions.getCurrentSession().flush();
            portal.link(map("userUuid", user.getUuid(), "patientUuid", patient.getUuid()));
            portal.verify(user.getUuid(), map("verificationMethod", method));
            notifications.add(user.getUserId(), "patient", null, "portal_account_created", "account:" + user.getUuid(),
                "Tài khoản đã được cấp", "Bạn có thể xem các hồ sơ được phòng khám công bố.", null, null);
        } else {
            user = portalUser(patient);
            if (user == null) throw conflict("Tài khoản portal không còn hoạt động. Cần kiểm tra lại liên kết trước khi đặt mật khẩu.");
            if (body.get("username") != null) throw VinshcService.bad("username cannot be changed by a password reset");
            Context.getUserService().changePassword(user, password);
            notifications.add(user.getUserId(), "patient", null, "portal_password_reset", "reset:" + uuid,
                "Mật khẩu đã được đặt lại", "Phòng khám đã xử lý yêu cầu hỗ trợ đăng nhập của bạn.", null, null);
        }
        db.sessions.getCurrentSession().flush();
        db.update("UPDATE vinshc_patient_access_request SET status='fulfilled',user_id=?,processed_by=?,processed_at=?,fulfill_key=? WHERE request_uuid=?",
            user.getUserId(), actor().getUserId(), now(), key, row.get("request_uuid"));
        processed(row, "fulfilled"); audit("patient_account.fulfilled", uuid, row.get("request_type").toString());
        return view(db.one("SELECT * FROM vinshc_patient_access_request WHERE request_uuid=?", uuid));
    }

    public Map<String, Object> reject(String uuid, Map<String, Object> body) {
        Map<String, Object> ws = workspace(); administrator(ws);
        StaffAccountService.credentials(body, "reason"); String reason = text(body, "reason", 1000);
        Map<String, Object> row = scoped(uuid, ws); lock(number(row.get("patient_id"))); row = scoped(uuid, ws);
        uuid = row.get("request_uuid").toString();
        if ("rejected".equals(row.get("status")) && reason.equals(row.get("reason"))) return view(row);
        if (!"pending".equals(row.get("status"))) throw conflict("Yêu cầu đã được xử lý. Hãy tải lại danh sách.");
        db.update("UPDATE vinshc_patient_access_request SET status='rejected',reason=?,processed_by=?,processed_at=? WHERE request_uuid=?",
            reason, actor().getUserId(), now(), row.get("request_uuid"));
        processed(row, "rejected"); audit("patient_account.rejected", uuid, "rejected");
        return view(db.one("SELECT * FROM vinshc_patient_access_request WHERE request_uuid=?", uuid));
    }

    private void administrator(Map<String, Object> ws) {
        if (!"admin".equals(ws.get("role")) || !actor().hasPrivilege("System Developer")) throw denied();
    }

    private boolean existingUser(Patient p) {
        return db.one("SELECT 1 FROM users WHERE person_id=? AND retired=false LIMIT 1", p.getPersonId()) != null;
    }

    private User portalUser(Patient p) {
        List<Map<String, Object>> rows = db.query("SELECT a.user_id FROM vinshc_portal_account a JOIN users u ON u.user_id=a.user_id"
            + " WHERE a.patient_id=? AND a.active=true AND u.retired=false AND u.person_id=a.patient_id"
            + " AND (SELECT e.status FROM vinshc_portal_link_event e WHERE e.user_id=a.user_id ORDER BY e.version_number DESC LIMIT 1)='active'", p.getPatientId());
        if (rows.size() != 1) return null;
        User user = Context.getUserService().getUser(number(rows.get(0).get("user_id")));
        if (!user.hasRole(PortalService.ROLE, true) || user.hasPrivilege("System Developer")) return null;
        for (Role role : user.getAllRoles()) if (role.getRole().startsWith("VinSHC App: ")) return null;
        return user;
    }

    static String patientPassword(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("password");
        if (!(raw instanceof String) || ((String) raw).length() < 12 || ((String) raw).length() > 256
            || !raw.equals(((String) raw).trim())) throw VinshcService.bad("password must have 12..256 characters without edge whitespace");
        return (String) raw;
    }

    private Map<String, Object> view(Map<String, Object> row) {
        Patient p = patient(number(row.get("patient_id"))); User requester = Context.getUserService().getUser(number(row.get("requester")));
        User account = row.get("user_id") == null ? null : Context.getUserService().getUser(number(row.get("user_id")));
        Visit visit = Context.getVisitService().getVisit(number(row.get("visit_id")));
        return map("uuid", row.get("request_uuid"), "type", row.get("request_type"), "status", row.get("status"),
            "patientUuid", p.getUuid(), "patientName", CareService.fullName(p.getPersonName()),
            "patientIdentifier", p.getPatientIdentifier() == null ? null : p.getPatientIdentifier().getIdentifier(),
            "visitUuid", visit.getUuid(), "requesterName", requester.getPersonName() == null ? requester.getUsername() : CareService.fullName(requester.getPersonName()),
            "createdAt", time(row.get("date_created")), "processedAt", time(row.get("processed_at")), "note", row.get("note"),
            "reason", row.get("reason"), "username", account == null ? null : account.getUsername());
    }

    private void processed(Map<String, Object> row, String state) {
        notifications.add(number(row.get("requester")), "doctor", number(row.get("facility_location_id")), "patient_account_" + state,
            "request:" + row.get("request_uuid") + ":" + state, "Yêu cầu tài khoản đã được xử lý",
            "fulfilled".equals(state) ? "Quản trị đã hoàn tất yêu cầu của bạn." : "Quản trị đã từ chối yêu cầu. Liên hệ quản trị để biết thêm.",
            "visit", Context.getVisitService().getVisit(number(row.get("visit_id"))).getUuid());
    }

    private void audit(String action, String uuid, String detail) {
        db.update("INSERT INTO vinshc_admin_event(event_uuid,action,entity_uuid,detail,creator,date_created) VALUES(?,?,?,?,?,?)",
            UUID.randomUUID().toString(), action, uuid, detail, actor().getUserId(), now());
    }
}
