package org.openmrs.module.vinshc.service;

import static org.openmrs.module.vinshc.service.AccessStore.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.openmrs.User;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/** A notification never contains credentials, clinical text or a client-supplied recipient/URL. */
@Transactional
public class NotificationService {
    private final AccessStore db;
    private final AuthorizationService authorization;
    private final PortalService portal;

    public NotificationService(SessionFactory sessions, AuthorizationService authorization, PortalService portal) {
        this.db = new AccessStore(sessions); this.authorization = authorization; this.portal = portal;
    }

    private Object[] recipient() {
        AuthorizationService.requireAuthenticated();
        User user = Context.getAuthenticatedUser();
        if (user.hasRole(PortalService.ROLE, true)) {
            portal.me(); // Includes active verified link, retirement and staff-role isolation checks.
            return new Object[] {user.getUserId(), "patient", null};
        }
        Map<String, Object> workspace = authorization.workspace();
        return new Object[] {user.getUserId(), workspace.get("role"),
            Context.getLocationService().getLocationByUuid(workspace.get("facilityUuid").toString()).getLocationId()};
    }

    private static final String SCOPE = "recipient_id=? AND recipient_role=? AND (facility_location_id=? OR recipient_role='patient')";

    public Map<String, Object> list(Integer limit, Integer offset) {
        Object[] scope = recipient(); int size = limit(limit), skip = offset(offset);
        List<Map<String, Object>> rows = db.query("SELECT * FROM vinshc_notification WHERE " + SCOPE
            + " ORDER BY notification_id DESC LIMIT ? OFFSET ?", scope[0], scope[1], scope[2], size + 1, skip);
        boolean more = rows.size() > size;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows.subList(0, Math.min(size, rows.size()))) {
            String kind = (String) row.get("target_kind");
            Object target = kind == null ? null : map("kind", kind,
                "patient_access_request".equals(kind) ? "requestUuid" : "visitUuid", row.get("target_uuid"));
            out.add(map("uuid", row.get("notification_uuid"), "type", row.get("event_type"), "title", row.get("title"),
                "message", row.get("message"), "createdAt", time(row.get("date_created")),
                "readAt", time(row.get("read_at")), "target", target));
        }
        return map("results", out, "hasMore", more, "limit", size, "offset", skip, "unreadCount", unread(scope));
    }

    private Object unread(Object[] scope) {
        return db.one("SELECT count(*) AS n FROM vinshc_notification WHERE " + SCOPE + " AND read_at IS NULL", scope).get("n");
    }

    public Map<String, Object> read(String uuid) {
        Object[] scope = recipient(); String id = VinshcService.canonicalUuid(uuid, "notification");
        Map<String, Object> row = db.one("SELECT notification_id FROM vinshc_notification WHERE " + SCOPE
            + " AND notification_uuid=?", scope[0], scope[1], scope[2], id);
        if (row == null) throw new org.openmrs.api.APIAuthenticationException("notification is not available");
        db.update("UPDATE vinshc_notification SET read_at=COALESCE(read_at,?) WHERE notification_id=?", now(), row.get("notification_id"));
        return map("uuid", id, "read", true, "unreadCount", unread(scope));
    }

    public Map<String, Object> readAll() {
        Object[] scope = recipient();
        Object watermark = db.one("SELECT COALESCE(max(notification_id),0) AS n FROM vinshc_notification WHERE " + SCOPE, scope).get("n");
        db.update("UPDATE vinshc_notification SET read_at=? WHERE " + SCOPE + " AND read_at IS NULL AND notification_id<=?",
            now(), scope[0], scope[1], scope[2], watermark);
        return map("read", true, "unreadCount", unread(scope));
    }

    // Internal event writers. Recipient identities and event keys are derived from persisted work.
    public void add(int recipient, String role, Integer facility, String event, String key, String title,
                    String message, String targetKind, String targetUuid) {
        db.update("INSERT INTO vinshc_notification(notification_uuid,recipient_id,recipient_role,facility_location_id,"
            + "event_type,event_key,title,message,target_kind,target_uuid,date_created) VALUES(?,?,?,?,?,?,?,?,?,?,?)"
            + " ON CONFLICT(recipient_id,event_key) DO NOTHING", UUID.randomUUID().toString(), recipient, role, facility,
            event, key, title, message, targetKind, targetUuid, now());
    }

    public void administrators(int facility, String requestUuid) {
        for (Map<String, Object> row : db.query("SELECT DISTINCT w.user_id FROM vinshc_workspace_assignment w"
            + " JOIN users u ON u.user_id=w.user_id WHERE w.active=true AND w.role_name='admin'"
            + " AND w.facility_location_id=? AND u.retired=false", facility))
            add(number(row.get("user_id")), "admin", facility, "patient_account_requested", "request:" + requestUuid,
                "Yêu cầu tài khoản người bệnh", "Bác sĩ vừa gửi một yêu cầu cần xử lý.", "patient_access_request", requestUuid);
    }

    public void assignedDoctor(int providerId, int locationId, String queueUuid, String visitUuid) {
        for (Map<String, Object> row : db.query("WITH RECURSIVE tree AS (SELECT location_id,parent_location FROM location WHERE location_id=?"
            + " UNION SELECT l.location_id,l.parent_location FROM location l JOIN tree t ON l.location_id=t.parent_location)"
            + " SELECT DISTINCT x.user_id,x.facility_location_id FROM vinshc_provider_link x"
            + " JOIN vinshc_workspace_assignment w ON w.user_id=x.user_id AND w.facility_location_id=x.facility_location_id"
            + " JOIN users u ON u.user_id=x.user_id JOIN provider p ON p.provider_id=x.provider_id"
            + " WHERE x.active=true AND x.provider_id=? AND x.facility_location_id IN(SELECT location_id FROM tree)"
            + " AND w.active=true AND w.role_name='doctor' AND u.retired=false AND p.retired=false", locationId, providerId))
            add(number(row.get("user_id")), "doctor", number(row.get("facility_location_id")), "visit_assigned", "queue:" + queueUuid,
                "Có lượt khám mới", "Một lượt khám đã được chuyển đến bạn.", "visit", visitUuid);
    }
}
