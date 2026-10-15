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
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.openmrs.Person;
import org.openmrs.PersonName;
import org.openmrs.Role;
import org.openmrs.User;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/**
 * P1 staff account administration. Only System Developer can provision Core users. No Core
 * privilege or role UUID is accepted from a request; responses use an allowlisted projection that
 * can never include hashed passwords or salts.
 */
@Transactional
public class StaffAccountService {

	public static final String FORCE_PASSWORD_PROPERTY = "forcePassword";

	private static final Set<String> STAFF_ROLES = Collections.unmodifiableSet(
	    new HashSet<>(Arrays.asList("reception", "cashier", "nurse", "doctor", "lab", "pharmacy", "manager", "admin")));

	private static final String PREFIX = "VinSHC App: ";

	private final SessionFactory sessionFactory;

	public StaffAccountService(SessionFactory sessionFactory) {
		this.sessionFactory = sessionFactory;
	}

	static String field(Map<String, Object> body, String key, int max) {
		if (body == null || !(body.get(key) instanceof String))
			throw VinshcService.bad(key + " is required");
		String value = ((String) body.get(key)).trim();
		if (value.isEmpty() || value.length() > max || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0)
			throw VinshcService.bad(key + " is invalid");
		return value;
	}

	static String staffRole(String value) {
		if (!STAFF_ROLES.contains(value))
			throw VinshcService.bad("role is not in VinSHC staff allowlist");
		return value;
	}

	static void credentials(Map<String, Object> body, String... allowed) {
		if (body == null)
			throw VinshcService.bad("request body is required");
		for (String key : body.keySet())
			if (!Arrays.asList(allowed).contains(key))
				throw VinshcService.bad("unsupported account field: " + key);
	}

	private static void systemOnly() {
		AuthorizationService.requireAuthenticated();
		if (!Context.getAuthenticatedUser().hasPrivilege("System Developer"))
			throw new org.openmrs.api.APIAuthenticationException("Privileges required: System Developer");
	}

	private static String validPassword(Map<String, Object> body) {
		return validPassword(body, "password");
	}

	private static String validPassword(Map<String, Object> body, String key) {
		// Clinic policy: length only, no character classes. OpenMRS core rules are relaxed to match in
		// configuration/globalproperties/vinshc/security.xml.
		String password = field(body, key, 256);
		if (password.length() < 6)
			throw VinshcService.bad("password must have at least 6 characters");
		return password;
	}

	private static Map<String, Object> safeView(User user) {
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("uuid", user.getUuid());
		result.put("username", user.getUsername());
		result.put("display", user.getPerson() == null || user.getPerson().getPersonName() == null ? user.getUsername()
		        : user.getPerson().getPersonName().getFullName());
		result.put("personUuid", user.getPerson() == null ? null : user.getPerson().getUuid());
		result.put("retired", Boolean.TRUE.equals(user.getRetired()));
		result.put("mustChangePassword", Boolean.parseBoolean(user.getUserProperty(FORCE_PASSWORD_PROPERTY)));
		List<String> roles = new ArrayList<>();
		for (Role role : user.getRoles())
			if (role.getRole().startsWith(PREFIX))
				roles.add(role.getRole().substring(PREFIX.length()));
		Collections.sort(roles);
		result.put("roles", roles);
		return result;
	}

	private void audit(String action, String entity, String detail) {
		int actor = Context.getAuthenticatedUser().getUserId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(
			    "INSERT INTO vinshc_admin_event(event_uuid,action,entity_uuid,detail,creator,date_created)"
			            + " VALUES (?,?,?,?,?,?)")) {
				statement.setString(1, UUID.randomUUID().toString());
				statement.setString(2, action);
				statement.setString(3, entity);
				statement.setString(4, detail);
				statement.setInt(5, actor);
				statement.setTimestamp(6, Timestamp.from(Instant.now()));
				statement.executeUpdate();
			}
		});
	}

	/** 3-50 chars (OpenMRS core limit), starts with a letter or digit; same rule for create and rename. */
	static String validUsername(Map<String, Object> body) {
		String username = field(body, "username", 60);
		if (!username.matches("[A-Za-z0-9][A-Za-z0-9._-]{2,49}"))
			throw VinshcService.bad("username format is invalid");
		return username;
	}

	public Map<String, Object> create(Map<String, Object> body) {
		systemOnly();
		credentials(body, "username", "password", "role", "personUuid", "givenName", "familyName", "gender");
		String username = validUsername(body);
		String role = staffRole(field(body, "role", 40));
		String password = validPassword(body);
		if (Context.getUserService().getUserByUsername(username) != null)
			throw new VinshcExceptions.Conflict("username already exists", Collections.emptyList());
		Role openmrsRole = Context.getUserService().getRole(PREFIX + role);
		if (openmrsRole == null)
			throw VinshcService.misconfigured("production staff role is missing");

		Person person;
		if (body.containsKey("personUuid")) {
			person = Context.getPersonService().getPersonByUuid(field(body, "personUuid", 38));
			if (person == null || Boolean.TRUE.equals(person.getVoided()) || person.isPatient())
				throw VinshcService.bad("person must be an existing non-patient person");
		} else {
			String given = field(body, "givenName", 100);
			String family = field(body, "familyName", 100);
			String gender = field(body, "gender", 1);
			if (!Arrays.asList("M", "F", "U").contains(gender))
				throw VinshcService.bad("gender must be M, F or U");
			person = new Person();
			person.setGender(gender);
			person.addName(new PersonName(given, null, family));
			person = Context.getPersonService().savePerson(person);
		}
		User user = new User(person);
		user.setUsername(username);
		user.setSystemId("VINSHC-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase(Locale.ROOT));
		user.addRole(openmrsRole);
		User created = Context.getUserService().createUser(user, password);
		audit("user.created", created.getUuid(), "role=" + role);
		return safeView(created);
	}

	public Map<String, Object> search(String q, Integer limit, Integer offset) {
		systemOnly();
		int size = limit == null ? 25 : limit;
		int skip = offset == null ? 0 : offset;
		if (size < 1 || size > 100 || skip < 0)
			throw VinshcService.bad("limit must be 1..100 and offset nonnegative");
		String term = q == null ? "" : q.trim();
		if (term.length() > 100)
			throw VinshcService.bad("query too long");
		List<User> users = Context.getUserService().getUsers(term, null, true, skip, size + 1);
		List<Map<String, Object>> records = new ArrayList<>();
		for (int i = 0; i < Math.min(size, users.size()); i++) {
			Map<String, Object> record = safeView(users.get(i));
			record.put("workspace", activeWorkspace(users.get(i).getUserId()));
			records.add(record);
		}
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("results", records);
		result.put("limit", size);
		result.put("offset", skip);
		result.put("hasMore", users.size() > size);
		return result;
	}

	/** The account's single active workspace (role + facility), or null when it is not assigned yet. */
	private Map<String, Object> activeWorkspace(int userId) {
		return sessionFactory.getCurrentSession().doReturningWork(connection -> {
			try (PreparedStatement stmt = connection.prepareStatement("SELECT w.role_name,l.uuid,l.name"
			        + " FROM vinshc_workspace_assignment w JOIN location l ON l.location_id=w.facility_location_id"
			        + " WHERE w.user_id=? AND w.active=true")) {
				stmt.setInt(1, userId);
				try (java.sql.ResultSet rs = stmt.executeQuery()) {
					if (!rs.next())
						return null;
					Map<String, Object> workspace = new LinkedHashMap<>();
					workspace.put("role", rs.getString(1));
					workspace.put("facilityUuid", rs.getString(2));
					workspace.put("facilityName", rs.getString(3));
					return workspace;
				}
			}
		});
	}

	private static User target(String uuid) {
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(uuid, "user"));
		if (user == null)
			throw VinshcService.bad("user does not exist");
		return user;
	}

	public Map<String, Object> changeState(String uuid, Map<String, Object> body) {
		systemOnly();
		credentials(body, "active", "reason");
		User user = target(uuid);
		if (!(body.get("active") instanceof Boolean))
			throw VinshcService.bad("active must be boolean");
		boolean active = (Boolean) body.get("active");
		if (user.getUserId().equals(Context.getAuthenticatedUser().getUserId()))
			throw VinshcService.bad("cannot change your own administrative account state");
		if (active == !Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("user is already in the requested state");
		if (active)
			Context.getUserService().unretireUser(user);
		else {
			Context.getUserService().retireUser(user, field(body, "reason", 255));
			// Existing sessions must lose application access as soon as the account is retired.
			sessionFactory.getCurrentSession()
			        .createSQLQuery("UPDATE vinshc_workspace_assignment SET active=false WHERE user_id=:user")
			        .setParameter("user", user.getUserId()).executeUpdate();
			sessionFactory.getCurrentSession()
			        .createSQLQuery("UPDATE vinshc_provider_link SET active=false WHERE user_id=:user")
			        .setParameter("user", user.getUserId()).executeUpdate();
		}
		audit(active ? "user.activated" : "user.retired", user.getUuid(), "state change");
		return safeView(user);
	}

	/**
	 * Renames another staff account. Own account is refused: the caller's session is HTTP Basic, so
	 * renaming it would invalidate the credentials of the request in flight.
	 */
	public Map<String, Object> rename(String uuid, Map<String, Object> body) {
		systemOnly();
		credentials(body, "username");
		User user = target(uuid);
		if (Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("cannot rename a retired user");
		if (user.getUserId().equals(Context.getAuthenticatedUser().getUserId()))
			throw VinshcService.bad("cannot rename your own account while signed in");
		String username = validUsername(body);
		if (username.equals(user.getUsername()))
			throw VinshcService.bad("username is unchanged");
		User existing = Context.getUserService().getUserByUsername(username);
		if (existing != null && !existing.getUserId().equals(user.getUserId()))
			throw new VinshcExceptions.Conflict("username already exists", Collections.emptyList());
		String previous = user.getUsername();
		user.setUsername(username);
		Context.getUserService().saveUser(user);
		audit("user.username_changed", user.getUuid(), "from=" + previous + " to=" + username);
		return safeView(user);
	}

	public Map<String, Object> resetPassword(String uuid, Map<String, Object> body) {
		systemOnly();
		credentials(body, "password");
		User user = target(uuid);
		if (Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("cannot reset password of a retired user");
		if (user.getUserId().equals(Context.getAuthenticatedUser().getUserId()))
			throw VinshcService.bad("use the self-service password change to change your own password");
		String password = validPassword(body);
		Context.getUserService().changePassword(user, password);
		audit("user.password_reset", user.getUuid(), "admin-initiated; secret never logged");
		return safeView(user);
	}

	/** Changes the signed-in user's temporary password and unlocks VinSHC application APIs. */
	public Map<String, Object> changeOwnPassword(Map<String, Object> body) {
		if (!Context.isAuthenticated() || Context.getAuthenticatedUser() == null)
			throw new org.openmrs.api.APIAuthenticationException("Authentication required");
		credentials(body, "currentPassword", "newPassword");
		User user = Context.getAuthenticatedUser();
		if (Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("retired user cannot change password");
		String current = field(body, "currentPassword", 256);
		String replacement = validPassword(body, "newPassword");
		if (current.equals(replacement))
			throw VinshcService.bad("new password must differ from the temporary password");
		Context.getUserService().changePassword(user, current, replacement);
		Context.getUserService().removeUserProperty(user, FORCE_PASSWORD_PROPERTY);
		audit("user.password_changed", user.getUuid(), "self-service; secret never logged");
		return safeView(user);
	}

	/** Append-only administrative audit. Never stores credentials. */
	public Map<String, Object> auditEvents(Integer limit) {
		systemOnly();
		int size = limit == null ? 100 : limit;
		if (size < 1 || size > 200)
			throw VinshcService.bad("limit must be 1..200");
		List<Map<String, Object>> records = sessionFactory.getCurrentSession().doReturningWork(connection -> {
			List<Map<String, Object>> result = new ArrayList<>();
			try (PreparedStatement stmt = connection
			        .prepareStatement("SELECT a.event_uuid,a.action,a.entity_uuid,a.detail,u.uuid,a.date_created"
			                + " FROM vinshc_admin_event a JOIN users u ON u.user_id=a.creator"
			                + " ORDER BY a.event_id DESC LIMIT ?")) {
				stmt.setInt(1, size);
				try (java.sql.ResultSet rs = stmt.executeQuery()) {
					while (rs.next()) {
						Map<String, Object> row = new LinkedHashMap<>();
						row.put("uuid", rs.getString(1));
						row.put("action", rs.getString(2));
						row.put("entityUuid", rs.getString(3));
						row.put("detail", rs.getString(4));
						row.put("actorUuid", rs.getString(5));
						row.put("at", rs.getTimestamp(6).toInstant().toString());
						result.add(row);
					}
				}
			}
			return result;
		});
		Map<String, Object> view = new LinkedHashMap<>();
		view.put("results", records);
		return view;
	}

	public Map<String, Object> grantRole(String uuid, Map<String, Object> body) {
		systemOnly();
		credentials(body, "role");
		User user = target(uuid);
		if (Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("cannot modify retired user");
		String role = staffRole(field(body, "role", 40));
		Role openmrsRole = Context.getUserService().getRole(PREFIX + role);
		if (openmrsRole == null)
			throw VinshcService.misconfigured("production role is missing");
		// ignoreSuperUser: a superuser answers true to hasRole(anyName) without holding the role.
		if (user.hasRole(openmrsRole.getRole(), true))
			throw VinshcService.bad("user already has the role");
		user.addRole(openmrsRole);
		Context.getUserService().saveUser(user);
		audit("user.role_granted", user.getUuid(), role);
		return safeView(user);
	}
}
