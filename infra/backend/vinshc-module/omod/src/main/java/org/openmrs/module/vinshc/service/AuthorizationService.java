package org.openmrs.module.vinshc.service;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.servlet.http.HttpServletRequest;

import org.hibernate.SessionFactory;
import org.openmrs.Encounter;
import org.openmrs.Location;
import org.openmrs.Patient;
import org.openmrs.Role;
import org.openmrs.User;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Server-side B5 workspace, facility-scope and authorization policy. */
@Transactional
public class AuthorizationService {

	public static final String MANAGE_PRIVILEGE = "VinSHC: Manage authorization";
	public static final String AUDIT_PRIVILEGE = "VinSHC: Read audit log";
	public static final String ROLE_HEADER = "X-VinSHC-Workspace-Role";
	public static final String FACILITY_HEADER = "X-VinSHC-Workspace-Facility";
	private static final String ROLE_PREFIX = "VinSHC App: ";
	private static volatile AuthorizationService instance;
	private final SessionFactory sessionFactory;
	private final Map<String, List<String>> legacyRoles = new HashMap<>();

	public AuthorizationService(SessionFactory sessionFactory) {
		this.sessionFactory = sessionFactory;
		legacyRoles.put(VinshcService.READ_PRIVILEGE,
		    Arrays.asList("reception", "cashier", "nurse", "doctor", "lab", "pharmacy"));
		legacyRoles.put(VinshcService.WRITE_PRIVILEGE, Collections.singletonList("reception"));
		legacyRoles.put(VinshcService.VITALS_PRIVILEGE, Collections.singletonList("nurse"));
		legacyRoles.put(ClinicalService.READ_PRIVILEGE, Arrays.asList("nurse", "doctor"));
		legacyRoles.put(ClinicalService.CONSULTATION_PRIVILEGE, Collections.singletonList("doctor"));
		legacyRoles.put(ClinicalService.FINALIZE_PRIVILEGE, Collections.singletonList("doctor"));
		legacyRoles.put(ClinicalService.DIAGNOSIS_PRIVILEGE, Collections.singletonList("doctor"));
		legacyRoles.put(ClinicalService.ALLERGY_PRIVILEGE, Collections.singletonList("doctor"));
		legacyRoles.put(ClinicalService.PRESCRIBE_PRIVILEGE, Collections.singletonList("doctor"));
		instance = this;
	}

	public static void requireLegacy(String privilege) {
		AuthorizationService service = instance;
		if (service == null)
			throw new IllegalStateException("authorization service is not initialized");
		service.require(privilege);
	}

	public static void requirePatientScopeStatic(Patient patient) {
		instance.requirePatientScope(patient);
	}

	public static void requireEncounterScopeStatic(Encounter encounter) {
		instance.requireEncounterScope(encounter);
	}

	public static void auditReadStatic(String resource, Patient patient, Encounter encounter, String entityUuid,
	        String detail) {
		instance.auditRead(resource, patient, encounter, entityUuid, detail);
	}

	private void require(String privilege) {
		User user = authenticatedUser();
		if (isSystemAdministrator(user) || (workspaceRole(false) == null && user.hasPrivilege(privilege)))
			return;
		String role = activeWorkspace(true).get("role").toString();
		List<String> allowed = legacyRoles.get(privilege);
		if (allowed == null || !allowed.contains(role))
			throw forbidden(privilege);
	}

	public Map<String, Object> assign(Map<String, Object> body) {
		requireAdministrator(MANAGE_PRIVILEGE, "metadata_admin", "update");
		User target = Context.getUserService().getUserByUuid(required(body, "user"));
		Location facility = Context.getLocationService().getLocationByUuid(required(body, "facility"));
		String role = required(body, "role");
		Role openmrsRole = Context.getUserService().getRole(ROLE_PREFIX + role);
		if (target == null || target.getRetired())
			throw new IllegalArgumentException("user does not exist");
		if (facility == null || facility.getRetired())
			throw new IllegalArgumentException("facility does not exist");
		if (openmrsRole == null || !target.hasRole(openmrsRole.getRole()))
			throw new IllegalArgumentException("user does not hold the requested role");
		int actor = authenticatedUser().getUserId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement close = connection.prepareStatement(
			    "UPDATE vinshc_workspace_assignment SET active=false WHERE user_id=? AND role_name=? AND facility_location_id=? AND active=true")) {
				close.setInt(1, target.getUserId()); close.setString(2, role);
				close.setInt(3, facility.getLocationId()); close.executeUpdate();
			}
			try (PreparedStatement insert = connection.prepareStatement(
			    "INSERT INTO vinshc_workspace_assignment(assignment_uuid,user_id,role_name,facility_location_id,active,creator,date_created) VALUES (?,?,?,?,true,?,?)")) {
				insert.setString(1, UUID.randomUUID().toString()); insert.setInt(2, target.getUserId());
				insert.setString(3, role); insert.setInt(4, facility.getLocationId()); insert.setInt(5, actor);
				insert.setTimestamp(6, Timestamp.from(Instant.now())); insert.executeUpdate();
			}
		});
		return assignment(target, role, facility);
	}

	public Map<String, Object> revoke(Map<String, Object> body) {
		requireAdministrator(MANAGE_PRIVILEGE, "metadata_admin", "void");
		User target = Context.getUserService().getUserByUuid(required(body, "user"));
		Location facility = Context.getLocationService().getLocationByUuid(required(body, "facility"));
		String role = required(body, "role");
		if (target == null || facility == null)
			throw new IllegalArgumentException("assignment target does not exist");
		int changed = sessionFactory.getCurrentSession().createSQLQuery(
		    "UPDATE vinshc_workspace_assignment SET active=false WHERE user_id=:user AND role_name=:role AND facility_location_id=:facility AND active=true")
		        .setParameter("user", target.getUserId()).setParameter("role", role)
		        .setParameter("facility", facility.getLocationId()).executeUpdate();
		if (changed != 1)
			throw new IllegalArgumentException("active workspace assignment does not exist");
		Map<String, Object> result = assignment(target, role, facility);
		result.put("active", false);
		return result;
	}

	public Map<String, Object> workspace() {
		return activeWorkspace(true);
	}

	public Map<String, Object> evaluate(String resource, String action) {
		Map<String, Object> workspace = activeWorkspace(true);
		String role = workspace.get("role").toString();
		String privilege = "VinSHC " + resource + " " + action;
		Role exactRole = Context.getUserService().getRole(ROLE_PREFIX + role);
		boolean allowed = exactRole != null && exactRole.hasPrivilege(privilege)
		        && authenticatedUser().hasPrivilege(privilege);
		if (!allowed)
			throw forbidden(privilege);
		Map<String, Object> result = new LinkedHashMap<>(workspace);
		result.put("resource", resource); result.put("action", action);
		result.put("privilege", privilege); result.put("allowed", true);
		return result;
	}

	public void requirePatientScope(Patient patient) {
		if (bypassWorkspace()) return;
		Location facility = assignedFacility();
		List<Integer> ids = descendantIds(facility);
		if (ids.isEmpty()) throw forbidden("same_facility");
		Long count = sessionFactory.getCurrentSession().doReturningWork(connection -> {
			String marks = String.join(",", Collections.nCopies(ids.size(), "?"));
			try (PreparedStatement statement = connection.prepareStatement(
			    "SELECT count(*) FROM visit WHERE patient_id=? AND voided=false AND location_id IN (" + marks + ")")) {
				statement.setInt(1, patient.getPatientId());
				for (int index = 0; index < ids.size(); index++) statement.setInt(index + 2, ids.get(index));
				try (ResultSet result = statement.executeQuery()) { result.next(); return result.getLong(1); }
			}
		});
		if (count == 0) throw forbidden("same_facility");
	}

	public void requireEncounterScope(Encounter encounter) {
		if (bypassWorkspace()) return;
		Location location = encounter.getLocation();
		if (location == null && encounter.getVisit() != null) location = encounter.getVisit().getLocation();
		if (!sameOrDescendant(location, assignedFacility())) throw forbidden("same_facility");
	}

	public void auditRead(String resource, Patient patient, Encounter encounter, String entityUuid, String detail) {
		User user = authenticatedUser();
		Integer patientId = patient == null ? null : patient.getPatientId();
		Integer encounterId = encounter == null ? null : encounter.getEncounterId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(
			    "INSERT INTO vinshc_access_event(event_uuid,resource_type,patient_id,encounter_id,entity_uuid,action,detail,creator,date_created) VALUES (?,?,?,?,?,'read',?,?,?)")) {
				statement.setString(1, UUID.randomUUID().toString()); statement.setString(2, resource);
				statement.setObject(3, patientId); statement.setObject(4, encounterId);
				statement.setString(5, entityUuid); statement.setString(6, truncate(detail));
				statement.setInt(7, user.getUserId()); statement.setTimestamp(8, Timestamp.from(Instant.now()));
				statement.executeUpdate();
			}
		});
	}

	public List<Map<String, Object>> audit(String patientUuid, String encounterUuid) {
		requireAdministrator(AUDIT_PRIVILEGE, "metadata_admin", "read");
		Patient patient = patientUuid == null ? null : Context.getPatientService().getPatientByUuid(patientUuid);
		Encounter encounter = encounterUuid == null ? null : Context.getEncounterService().getEncounterByUuid(encounterUuid);
		return sessionFactory.getCurrentSession().doReturningWork(connection -> {
			String sql = "SELECT a.event_uuid,a.resource_type,a.entity_uuid,a.action,a.detail,a.date_created,u.uuid user_uuid"
			        + " FROM vinshc_access_event a JOIN users u ON u.user_id=a.creator WHERE 1=1"
			        + (patient == null ? "" : " AND a.patient_id=?") + (encounter == null ? "" : " AND a.encounter_id=?")
			        + " ORDER BY a.event_id";
			try (PreparedStatement statement = connection.prepareStatement(sql)) {
				int i=1; if(patient!=null) statement.setInt(i++,patient.getPatientId()); if(encounter!=null) statement.setInt(i,encounter.getEncounterId());
				List<Map<String,Object>> rows=new ArrayList<>();
				try(ResultSet rs=statement.executeQuery()){ while(rs.next()){
					Map<String,Object> row=new LinkedHashMap<>(); row.put("uuid",rs.getString(1)); row.put("resource",rs.getString(2));
					row.put("entityUuid",rs.getString(3)); row.put("action",rs.getString(4)); row.put("detail",rs.getString(5));
					row.put("at",rs.getTimestamp(6).toInstant().toString()); row.put("byUserUuid",rs.getString(7)); rows.add(row);
				} } return rows;
			}
		});
	}

	private void requireAdministrator(String legacy, String resource, String action) {
		User user=authenticatedUser(); if(isSystemAdministrator(user)||user.hasPrivilege(legacy)) return;
		evaluate(resource,action);
	}

	private Map<String,Object> activeWorkspace(boolean required) {
		User user=authenticatedUser(); String role=workspaceRole(required); String facilityUuid=header(FACILITY_HEADER);
		if(role==null) return null;
		if(facilityUuid==null||facilityUuid.isEmpty()) throw forbidden("active facility workspace");
		Role openmrsRole=Context.getUserService().getRole(ROLE_PREFIX+role);
		if(openmrsRole==null||!user.hasRole(openmrsRole.getRole())) throw forbidden("active role workspace");
		Location facility=Context.getLocationService().getLocationByUuid(facilityUuid);
		if(facility==null||facility.getRetired()) throw forbidden("active facility workspace");
		Number count=(Number)sessionFactory.getCurrentSession().createSQLQuery(
		    "SELECT count(*) FROM vinshc_workspace_assignment WHERE user_id=:user AND role_name=:role AND facility_location_id=:facility AND active=true")
		    .setParameter("user",user.getUserId()).setParameter("role",role).setParameter("facility",facility.getLocationId()).uniqueResult();
		if(count.longValue()!=1) throw forbidden("workspace assignment");
		return assignment(user,role,facility);
	}

	private Location assignedFacility(){ return Context.getLocationService().getLocationByUuid(activeWorkspace(true).get("facilityUuid").toString()); }
	private boolean bypassWorkspace(){ User user=authenticatedUser(); return isSystemAdministrator(user)||(workspaceRole(false)==null&&!hasAppRole(user)); }
	private boolean hasAppRole(User user){ for(Role role:user.getAllRoles()) if(role.getRole().startsWith(ROLE_PREFIX)) return true; return false; }
	private String workspaceRole(boolean required){ String value=header(ROLE_HEADER); if(required&&(value==null||value.isEmpty())) throw forbidden("active role workspace"); return value==null||value.isEmpty()?null:value; }
	private static String header(String name){ ServletRequestAttributes a=(ServletRequestAttributes)RequestContextHolder.getRequestAttributes(); if(a==null)return null; HttpServletRequest r=a.getRequest(); return r.getHeader(name); }
	private static User authenticatedUser(){ if(!Context.isAuthenticated()||Context.getAuthenticatedUser()==null) throw forbidden("authenticated user"); return Context.getAuthenticatedUser(); }
	private static boolean isSystemAdministrator(User user){ return user.hasPrivilege("System Developer"); }
	private List<Integer> descendantIds(Location facility){ List<Integer> ids=new ArrayList<>(); for(Location candidate:Context.getLocationService().getAllLocations(true)) if(!candidate.getRetired()&&sameOrDescendant(candidate,facility)) ids.add(candidate.getLocationId()); return ids; }
	private static boolean sameOrDescendant(Location candidate,Location facility){ for(Location value=candidate;value!=null;value=value.getParentLocation()) if(value.getLocationId().equals(facility.getLocationId())) return true; return false; }
	private static Map<String,Object> assignment(User user,String role,Location facility){ Map<String,Object> out=new LinkedHashMap<>(); out.put("userUuid",user.getUuid()); out.put("role",role); out.put("facilityUuid",facility.getUuid()); out.put("roleName",ROLE_PREFIX+role); return out; }
	private static String required(Map<String,Object> body,String name){ Object value=body.get(name); if(!(value instanceof String)||((String)value).trim().isEmpty()) throw new IllegalArgumentException(name+" is required"); return ((String)value).trim(); }
	private static String truncate(String value){ return value==null?null:value.length()>1000?value.substring(0,1000):value; }
	private static APIAuthenticationException forbidden(String privilege){ return new APIAuthenticationException("Privileges required: "+privilege); }
}
