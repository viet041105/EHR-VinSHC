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

	private static final int AUDIT_DEFAULT_LIMIT = 200;

	private static final int AUDIT_MAX_LIMIT = 1000;

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

	// ---------------------------------------------------------------- static entry points for other services

	private static AuthorizationService instance() {
		AuthorizationService service = instance;
		if (service == null)
			throw new VinshcExceptions.Configuration("authorization service is not initialized");
		return service;
	}

	public static void requireLegacy(String privilege) {
		instance().require(privilege);
	}

	public static void requireAuthenticated() {
		authenticatedUser();
	}

	public static void requirePatientScopeStatic(Patient patient) {
		instance().requirePatientScope(patient);
	}

	public static void requireEncounterScopeStatic(Encounter encounter) {
		instance().requireEncounterScope(encounter);
	}

	public static void requireLocationScopeStatic(Location location) {
		instance().requireLocationScope(location);
	}

	public static void auditReadStatic(String resource, Patient patient, Encounter encounter, String entityUuid,
	        String detail) {
		instance().auditRead(resource, patient, encounter, entityUuid, detail);
	}

	/** Active app role of a scoped caller, or null for system developers and legacy unscoped users. */
	public static String activeRoleStatic() {
		AuthorizationService service = instance();
		return service.bypassWorkspace() ? null : service.workspaceRole(true);
	}

	/**
	 * Facility that listings are restricted to. Scoped callers always get their assigned facility;
	 * unscoped callers get the facility named by the workspace header when present (a display filter,
	 * not a security boundary), otherwise null meaning every facility.
	 */
	public static Location listingFacilityStatic() {
		AuthorizationService service = instance();
		if (!service.bypassWorkspace())
			return service.assignedFacility();
		String uuid = header(FACILITY_HEADER);
		if (uuid == null || uuid.isEmpty())
			return null;
		Location location = Context.getLocationService().getLocationByUuid(uuid);
		if (location == null || location.getRetired())
			throw VinshcService.bad("workspace facility does not exist");
		return location;
	}

	public static void requireOperation(String resource, String action) {
		AuthorizationService service = instance();
		User user = authenticatedUser();
		if (isSystemAdministrator(user))
			return;
		String privilege = "VinSHC " + resource + " " + action;
		if (service.workspaceRole(false) == null && !service.hasAppRole(user) && user.hasPrivilege(privilege))
			return;
		service.evaluate(resource, action);
	}

	// ---------------------------------------------------------------- endpoints

	public Map<String, Object> assign(Map<String, Object> body) {
		requireAdministrator(MANAGE_PRIVILEGE, "metadata_admin", "update");
		User target = Context.getUserService().getUserByUuid(required(body, "user"));
		Location facility = Context.getLocationService().getLocationByUuid(required(body, "facility"));
		String role = required(body, "role");
		Role openmrsRole = Context.getUserService().getRole(ROLE_PREFIX + role);
		if (target == null || target.getRetired())
			throw VinshcService.bad("user does not exist");
		if (facility == null || facility.getRetired())
			throw VinshcService.bad("facility does not exist");
		if (openmrsRole == null || !target.hasRole(openmrsRole.getRole()))
			throw VinshcService.bad("user does not hold the requested role");
		int actor = authenticatedUser().getUserId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement close = connection.prepareStatement("UPDATE vinshc_workspace_assignment SET active=false"
			        + " WHERE user_id=? AND role_name=? AND facility_location_id=? AND active=true")) {
				close.setInt(1, target.getUserId());
				close.setString(2, role);
				close.setInt(3, facility.getLocationId());
				close.executeUpdate();
			}
			try (PreparedStatement insert = connection.prepareStatement(
			    "INSERT INTO vinshc_workspace_assignment(assignment_uuid,user_id,role_name,facility_location_id,active,creator,date_created)"
			            + " VALUES (?,?,?,?,true,?,?)")) {
				insert.setString(1, UUID.randomUUID().toString());
				insert.setInt(2, target.getUserId());
				insert.setString(3, role);
				insert.setInt(4, facility.getLocationId());
				insert.setInt(5, actor);
				insert.setTimestamp(6, Timestamp.from(Instant.now()));
				insert.executeUpdate();
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
			throw VinshcService.bad("assignment target does not exist");
		int changed = sessionFactory.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_workspace_assignment SET active=false"
		                + " WHERE user_id=:user AND role_name=:role AND facility_location_id=:facility AND active=true")
		        .setParameter("user", target.getUserId()).setParameter("role", role)
		        .setParameter("facility", facility.getLocationId()).executeUpdate();
		if (changed != 1)
			throw VinshcService.bad("active workspace assignment does not exist");
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
		result.put("resource", resource);
		result.put("action", action);
		result.put("privilege", privilege);
		result.put("allowed", true);
		return result;
	}

	/**
	 * Newest events first. An unknown patient/encounter UUID is a client error rather than an
	 * unfiltered dump of the whole log.
	 */
	public List<Map<String, Object>> audit(String patientUuid, String encounterUuid, Integer limit, Integer offset) {
		requireAdministrator(AUDIT_PRIVILEGE, "metadata_admin", "read");
		Patient patient = null;
		if (patientUuid != null) {
			patient = Context.getPatientService().getPatientByUuid(VinshcService.canonicalUuid(patientUuid, "patient"));
			if (patient == null)
				throw VinshcService.bad("patient does not exist");
		}
		Encounter encounter = null;
		if (encounterUuid != null) {
			encounter = Context.getEncounterService()
			        .getEncounterByUuid(VinshcService.canonicalUuid(encounterUuid, "encounter"));
			if (encounter == null)
				throw VinshcService.bad("encounter does not exist");
		}
		int pageSize = limit == null ? AUDIT_DEFAULT_LIMIT : limit;
		int skip = offset == null ? 0 : offset;
		if (pageSize < 1 || pageSize > AUDIT_MAX_LIMIT)
			throw VinshcService.bad("limit must be between 1 and " + AUDIT_MAX_LIMIT);
		if (skip < 0)
			throw VinshcService.bad("offset must be >= 0");
		Integer patientId = patient == null ? null : patient.getPatientId();
		Integer encounterId = encounter == null ? null : encounter.getEncounterId();
		return sessionFactory.getCurrentSession().doReturningWork(connection -> {
			String sql = "SELECT a.event_uuid,a.resource_type,a.entity_uuid,a.action,a.detail,a.date_created,u.uuid user_uuid"
			        + " FROM vinshc_access_event a JOIN users u ON u.user_id=a.creator WHERE 1=1"
			        + (patientId == null ? "" : " AND a.patient_id=?") + (encounterId == null ? "" : " AND a.encounter_id=?")
			        + " ORDER BY a.event_id DESC LIMIT ? OFFSET ?";
			try (PreparedStatement statement = connection.prepareStatement(sql)) {
				int index = 1;
				if (patientId != null)
					statement.setInt(index++, patientId);
				if (encounterId != null)
					statement.setInt(index++, encounterId);
				statement.setInt(index++, pageSize);
				statement.setInt(index, skip);
				List<Map<String, Object>> rows = new ArrayList<>();
				try (ResultSet result = statement.executeQuery()) {
					while (result.next()) {
						Map<String, Object> row = new LinkedHashMap<>();
						row.put("uuid", result.getString(1));
						row.put("resource", result.getString(2));
						row.put("entityUuid", result.getString(3));
						row.put("action", result.getString(4));
						row.put("detail", result.getString(5));
						row.put("at", result.getTimestamp(6).toInstant().toString());
						row.put("byUserUuid", result.getString(7));
						rows.add(row);
					}
				}
				return rows;
			}
		});
	}

	// ---------------------------------------------------------------- scope and audit

	private void require(String privilege) {
		User user = authenticatedUser();
		if (isSystemAdministrator(user) || (workspaceRole(false) == null && user.hasPrivilege(privilege)))
			return;
		String role = activeWorkspace(true).get("role").toString();
		List<String> allowed = legacyRoles.get(privilege);
		if (allowed == null || !allowed.contains(role))
			throw forbidden(privilege);
	}

	/**
	 * A patient is in scope when it was registered at the workspace facility (or its descendants)
	 * through the VinSHC adapter, or has a non-voided visit there.
	 */
	public void requirePatientScope(Patient patient) {
		requireAgentAssignment(patient);
		if (bypassWorkspace())
			return;
		Location facility = assignedFacility();
		Long count = sessionFactory.getCurrentSession().doReturningWork(connection -> {
			try (PreparedStatement statement = connection
			        .prepareStatement("WITH RECURSIVE tree AS (SELECT location_id FROM location WHERE location_id=?"
			                + " UNION SELECT l.location_id FROM location l JOIN tree t ON l.parent_location=t.location_id)"
			                + " SELECT (SELECT count(*) FROM visit v JOIN location l ON l.location_id=v.location_id"
			                + " WHERE v.patient_id=? AND v.voided=false AND l.retired=false"
			                + " AND v.location_id IN (SELECT location_id FROM tree))"
			                + " + (SELECT count(*) FROM vinshc_patient_registration r WHERE r.patient_id=?"
			                + " AND r.facility_location_id IN (SELECT location_id FROM tree))")) {
				statement.setInt(1, facility.getLocationId());
				statement.setInt(2, patient.getPatientId());
				statement.setInt(3, patient.getPatientId());
				try (ResultSet result = statement.executeQuery()) {
					result.next();
					return result.getLong(1);
				}
			}
		});
		if (count == 0)
			throw forbidden("same_facility");
	}

	public void requireEncounterScope(Encounter encounter) {
		requireAgentAssignment(encounter.getPatient());
		if (bypassWorkspace())
			return;
		Location location = encounter.getLocation();
		if (location == null && encounter.getVisit() != null)
			location = encounter.getVisit().getLocation();
		requireLocationScope(location);
	}

	/**
	 * A record bound to a location is in scope when that location is the workspace facility or below
	 * it.
	 */
	public void requireLocationScope(Location location) {
		if (bypassWorkspace())
			return;
		if (!sameOrDescendant(location, assignedFacility()))
			throw forbidden("same_facility");
	}

	public void auditRead(String resource, Patient patient, Encounter encounter, String entityUuid, String detail) {
		User user = authenticatedUser();
		Integer patientId = patient == null ? null : patient.getPatientId();
		Integer encounterId = encounter == null ? null : encounter.getEncounterId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(
			    "INSERT INTO vinshc_access_event(event_uuid,resource_type,patient_id,encounter_id,entity_uuid,action,detail,creator,date_created)"
			            + " VALUES (?,?,?,?,?,'read',?,?,?)")) {
				statement.setString(1, UUID.randomUUID().toString());
				statement.setString(2, resource);
				statement.setObject(3, patientId);
				statement.setObject(4, encounterId);
				statement.setString(5, entityUuid);
				statement.setString(6, truncate(
				    ("agent".equals(header("X-VinSHC-Request-Origin")) ? "agent:" : "") + (detail == null ? "" : detail)));
				statement.setInt(7, user.getUserId());
				statement.setTimestamp(8, Timestamp.from(Instant.now()));
				statement.executeUpdate();
			}
		});
	}

	// ---------------------------------------------------------------- helpers

	private void requireAdministrator(String legacy, String resource, String action) {
		User user = authenticatedUser();
		if (isSystemAdministrator(user) || user.hasPrivilege(legacy))
			return;
		evaluate(resource, action);
	}

	private Map<String, Object> activeWorkspace(boolean required) {
		User user = authenticatedUser();
		String role = workspaceRole(required);
		String facilityUuid = header(FACILITY_HEADER);
		if (role == null)
			return null;
		if (facilityUuid == null || facilityUuid.isEmpty())
			throw forbidden("active facility workspace");
		Role openmrsRole = Context.getUserService().getRole(ROLE_PREFIX + role);
		boolean developerAdmin = isSystemAdministrator(user) && "admin".equals(role);
		if (!developerAdmin && (openmrsRole == null || !user.hasRole(openmrsRole.getRole())))
			throw forbidden("active role workspace");
		Location facility = Context.getLocationService().getLocationByUuid(facilityUuid);
		if (facility == null || facility.getRetired())
			throw forbidden("active facility workspace");
		Number count = (Number) sessionFactory.getCurrentSession()
		        .createSQLQuery("SELECT count(*) FROM vinshc_workspace_assignment"
		                + " WHERE user_id=:user AND role_name=:role AND facility_location_id=:facility AND active=true")
		        .setParameter("user", user.getUserId()).setParameter("role", role)
		        .setParameter("facility", facility.getLocationId()).uniqueResult();
		if (!developerAdmin && count.longValue() != 1)
			throw forbidden("workspace assignment");
		return assignment(user, role, facility);
	}

	private void requireAgentAssignment(Patient patient) {
		if (!"agent".equals(header("X-VinSHC-Request-Origin")) || !"doctor".equals(workspaceRole(false)))
			return;
		activeWorkspace(true);
		Number count = (Number) sessionFactory.getCurrentSession().createSQLQuery(
		    "SELECT count(*) FROM encounter e JOIN encounter_provider ep ON ep.encounter_id=e.encounter_id "
		            + "JOIN provider p ON p.provider_id=ep.provider_id JOIN users u ON u.person_id=p.person_id "
		            + "WHERE e.patient_id=:patient AND u.user_id=:user AND e.voided=false AND ep.voided=false AND p.retired=false")
		        .setParameter("patient", patient.getPatientId()).setParameter("user", authenticatedUser().getUserId())
		        .uniqueResult();
		if (count.longValue() == 0)
			throw forbidden("assigned_patient");
	}

	private Location assignedFacility() {
		return Context.getLocationService().getLocationByUuid(activeWorkspace(true).get("facilityUuid").toString());
	}

	/** System developers and users without any VinSHC app role keep the legacy, unscoped behaviour. */
	private boolean bypassWorkspace() {
		User user = authenticatedUser();
		return isSystemAdministrator(user) || (workspaceRole(false) == null && !hasAppRole(user));
	}

	private boolean hasAppRole(User user) {
		for (Role role : user.getAllRoles())
			if (role.getRole().startsWith(ROLE_PREFIX))
				return true;
		return false;
	}

	private String workspaceRole(boolean required) {
		String value = header(ROLE_HEADER);
		if (required && (value == null || value.isEmpty()))
			throw forbidden("active role workspace");
		return value == null || value.isEmpty() ? null : value;
	}

	private static String header(String name) {
		ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
		if (attributes == null)
			return null;
		HttpServletRequest request = attributes.getRequest();
		return request.getHeader(name);
	}

	private static User authenticatedUser() {
		if (!Context.isAuthenticated() || Context.getAuthenticatedUser() == null)
			throw new VinshcExceptions.NotAuthenticated();
		return Context.getAuthenticatedUser();
	}

	private static boolean isSystemAdministrator(User user) {
		return user.hasPrivilege("System Developer");
	}

	private static boolean sameOrDescendant(Location candidate, Location facility) {
		for (Location value = candidate; value != null; value = value.getParentLocation())
			if (value.getLocationId().equals(facility.getLocationId()))
				return true;
		return false;
	}

	private static Map<String, Object> assignment(User user, String role, Location facility) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("userUuid", user.getUuid());
		out.put("role", role);
		out.put("facilityUuid", facility.getUuid());
		out.put("roleName", ROLE_PREFIX + role);
		return out;
	}

	private static String required(Map<String, Object> body, String name) {
		Object value = body.get(name);
		if (!(value instanceof String) || ((String) value).trim().isEmpty())
			throw VinshcService.bad(name + " is required");
		return ((String) value).trim();
	}

	private static String truncate(String value) {
		return value == null ? null : value.length() > 1000 ? value.substring(0, 1000) : value;
	}

	private static APIAuthenticationException forbidden(String privilege) {
		return new APIAuthenticationException("Privileges required: " + privilege);
	}
}
