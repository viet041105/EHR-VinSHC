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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.openmrs.Location;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/** VinSHC-owned immutable form definitions; handoff forms.json is not an O3 production schema. */
@Transactional
public class FormWorkflowService {

	private final SessionFactory sessions;

	private final ObjectMapper json = new ObjectMapper();

	public FormWorkflowService(SessionFactory sessions) {
		this.sessions = sessions;
	}

	private static String required(Map<String, Object> body, String key, int max) {
		return StaffAccountService.field(body, key, max);
	}

	private static void checkKeys(Map<String, Object> body, String... keys) {
		StaffAccountService.credentials(body, keys);
	}

	private static Location facility(String uuid) {
		Location l = Context.getLocationService().getLocationByUuid(VinshcService.canonicalUuid(uuid, "location"));
		if (l == null || l.getRetired())
			throw VinshcService.bad("active facility location not found");
		AuthorizationService.requireLocationScopeStatic(l);
		return l;
	}

	private static void admin() {
		AuthorizationService.requireOperation("metadata_admin", "update");
	}

	private void audit(String action, String uuid, String detail) {
		sessions.getCurrentSession().doWork(c -> {
			try (PreparedStatement ps = c.prepareStatement(
			    "INSERT INTO vinshc_admin_event(event_uuid,action,entity_uuid,detail,creator,date_created)"
			            + " VALUES(?,?,?,?,?,?)")) {
				ps.setString(1, UUID.randomUUID().toString());
				ps.setString(2, action);
				ps.setString(3, uuid);
				ps.setString(4, detail);
				ps.setInt(5, Context.getAuthenticatedUser().getUserId());
				ps.setTimestamp(6, Timestamp.from(Instant.now()));
				ps.executeUpdate();
			}
		});
	}

	private static String digest(String value) {
		try {
			byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
			StringBuilder b = new StringBuilder();
			for (byte x : bytes)
				b.append(String.format("%02x", x & 0xff));
			return b.toString();
		}
		catch (java.security.NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 unavailable", ex);
		}
	}

	/** Always inserts next version, never edits the schema of an existing active form. */
	public Map<String, Object> draft(Map<String, Object> body) {
		admin();
		checkKeys(body, "facilityLocationUuid", "code", "schemaJson");
		Location facility = facility(required(body, "facilityLocationUuid", 38));
		String code = required(body, "code", 80).toLowerCase(java.util.Locale.ROOT);
		if (!code.matches("[a-z][a-z0-9_-]{2,79}"))
			throw VinshcService.bad("form code format is invalid");
		String schema = required(body, "schemaJson", 60000);
		try {
			JsonNode root = json.readTree(schema);
			if (root == null || !root.isObject() || !root.has("fields") || !root.get("fields").isArray())
				throw VinshcService.bad("form must be a JSON object with fields array");
		}
		catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
			throw VinshcService.bad("form schemaJson is not valid JSON");
		}
		Number max = (Number) sessions.getCurrentSession()
		        .createSQLQuery("SELECT coalesce(max(version_number),0) FROM vinshc_form_definition"
		                + " WHERE form_code=:code AND facility_location_id=:facility")
		        .setParameter("code", code).setParameter("facility", facility.getLocationId()).uniqueResult();
		int version = max.intValue() + 1;
		String id = UUID.randomUUID().toString();
		sessions.getCurrentSession().doWork(c -> {
			try (PreparedStatement ps = c.prepareStatement("INSERT INTO vinshc_form_definition"
			        + "(form_uuid,form_code,facility_location_id,version_number,state,schema_json,schema_hash,creator,date_created)"
			        + " VALUES(?,?,?,?,'draft',?,?,?,?)")) {
				ps.setString(1, id);
				ps.setString(2, code);
				ps.setInt(3, facility.getLocationId());
				ps.setInt(4, version);
				ps.setString(5, schema);
				ps.setString(6, digest(schema));
				ps.setInt(7, Context.getAuthenticatedUser().getUserId());
				ps.setTimestamp(8, Timestamp.from(Instant.now()));
				ps.executeUpdate();
			}
		});
		audit("form.draft_created", id, code + " version " + version);
		return form(id);
	}

	public Map<String, Object> form(String uuid) {
		AuthorizationService.requireOperation("metadata_admin", "read");
		String id = VinshcService.canonicalUuid(uuid, "form");
		return sessions.getCurrentSession().doReturningWork(c -> {
			try (PreparedStatement ps = c.prepareStatement("SELECT f.form_uuid,f.form_code,l.uuid,"
			        + "f.version_number,f.state,f.schema_json,f.schema_hash,f.date_created"
			        + " FROM vinshc_form_definition f JOIN location l ON l.location_id=f.facility_location_id"
			        + " WHERE f.form_uuid=?")) {
				ps.setString(1, id);
				try (ResultSet rs = ps.executeQuery()) {
					if (!rs.next())
						throw VinshcService.bad("form version does not exist");
					Location location = facility(rs.getString(3));
					Map<String, Object> out = new LinkedHashMap<>();
					out.put("uuid", rs.getString(1));
					out.put("code", rs.getString(2));
					out.put("facilityLocationUuid", location.getUuid());
					out.put("version", rs.getInt(4));
					out.put("state", rs.getString(5));
					out.put("schemaJson", rs.getString(6));
					out.put("schemaSha256", rs.getString(7));
					out.put("createdAt", rs.getTimestamp(8).toInstant().toString());
					return out;
				}
			}
		});
	}

	/** Lists immutable form versions for one scoped facility. */
	@SuppressWarnings("unchecked")
	public Map<String, Object> forms(String locationUuid, String code, String state) {
		AuthorizationService.requireOperation("metadata_admin", "read");
		Location location = facility(locationUuid);
		String normalizedCode = code == null || code.trim().isEmpty() ? null
		        : code.trim().toLowerCase(java.util.Locale.ROOT);
		String normalizedState = state == null || state.trim().isEmpty() ? null
		        : state.trim().toLowerCase(java.util.Locale.ROOT);
		if (normalizedCode != null && !normalizedCode.matches("[a-z][a-z0-9_-]{2,79}"))
			throw VinshcService.bad("form code format is invalid");
		if (normalizedState != null && !java.util.Arrays.asList("draft", "active", "retired").contains(normalizedState))
			throw VinshcService.bad("form state is invalid");
		String sql = "SELECT form_uuid FROM vinshc_form_definition WHERE facility_location_id=:location"
		        + (normalizedCode == null ? "" : " AND form_code=:code")
		        + (normalizedState == null ? "" : " AND state=:state") + " ORDER BY form_code,version_number DESC";
		org.hibernate.SQLQuery query = sessions.getCurrentSession().createSQLQuery(sql).setParameter("location",
		    location.getLocationId());
		if (normalizedCode != null)
			query.setParameter("code", normalizedCode);
		if (normalizedState != null)
			query.setParameter("state", normalizedState);
		List<Map<String, Object>> records = new ArrayList<>();
		for (Object id : (List<Object>) query.list())
			records.add(form(id.toString()));
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("results", records);
		return result;
	}

	public Map<String, Object> activate(String uuid) {
		admin();
		String id = VinshcService.canonicalUuid(uuid, "form");
		Map<String, Object> target = form(id);
		if (!"draft".equals(target.get("state")))
			throw VinshcService.bad("only draft form can be activated");
		Location location = facility(target.get("facilityLocationUuid").toString());
		String code = target.get("code").toString();
		sessions.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_form_definition SET state='retired'"
		                + " WHERE facility_location_id=:location AND form_code=:code AND state='active'")
		        .setParameter("location", location.getLocationId()).setParameter("code", code).executeUpdate();
		sessions.getCurrentSession()
		        .createSQLQuery(
		            "UPDATE vinshc_form_definition SET state='active'" + " WHERE form_uuid=:uuid AND state='draft'")
		        .setParameter("uuid", id).executeUpdate();
		audit("form.activated", id, code);
		return form(id);
	}

	public Map<String, Object> retire(String uuid) {
		admin();
		String id = VinshcService.canonicalUuid(uuid, "form");
		Map<String, Object> current = form(id);
		if ("retired".equals(current.get("state")))
			throw VinshcService.bad("form already retired");
		sessions.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_form_definition SET state='retired'" + " WHERE form_uuid=:id")
		        .setParameter("id", id).executeUpdate();
		audit("form.retired", id, current.get("code").toString());
		return form(id);
	}

	public Map<String, Object> workflow(String locationUuid) {
		AuthorizationService.requireOperation("metadata_admin", "read");
		Location location = facility(locationUuid);
		return sessions.getCurrentSession().doReturningWork(c -> {
			try (PreparedStatement ps = c.prepareStatement("SELECT workflow_code,version_number,date_changed"
			        + " FROM vinshc_facility_workflow WHERE facility_location_id=?")) {
				ps.setInt(1, location.getLocationId());
				Map<String, Object> out = new LinkedHashMap<>();
				out.put("facilityLocationUuid", location.getUuid());
				try (ResultSet rs = ps.executeQuery()) {
					if (!rs.next()) {
						out.put("configured", false);
						return out;
					}
					out.put("configured", true);
					out.put("workflowCode", rs.getString(1));
					out.put("version", rs.getInt(2));
					out.put("changedAt", rs.getTimestamp(3).toInstant().toString());
					return out;
				}
			}
		});
	}

	public Map<String, Object> setWorkflow(Map<String, Object> body) {
		admin();
		checkKeys(body, "facilityLocationUuid", "workflowCode", "expectedVersion");
		Location loc = facility(required(body, "facilityLocationUuid", 38));
		String code = required(body, "workflowCode", 40);
		if (!code.equals("STANDARD_POSTPAY") && !code.equals("COMPACT_PREPAY"))
			throw VinshcService.bad("unsupported workflow configuration");
		int expected = 0;
		if (body.get("expectedVersion") != null) {
			if (!(body.get("expectedVersion") instanceof Number))
				throw VinshcService.bad("expectedVersion must be numeric");
			expected = ((Number) body.get("expectedVersion")).intValue();
		}
		int version = expected + 1;
		if (expected == 0) {
			sessions.getCurrentSession().doWork(c -> {
				try (PreparedStatement ps = c.prepareStatement("INSERT INTO vinshc_facility_workflow"
				        + "(facility_location_id,workflow_code,version_number,actor_id,date_changed)"
				        + " VALUES(?,?,1,?,?)")) {
					ps.setInt(1, loc.getLocationId());
					ps.setString(2, code);
					ps.setInt(3, Context.getAuthenticatedUser().getUserId());
					ps.setTimestamp(4, Timestamp.from(Instant.now()));
					ps.executeUpdate();
				}
			});
		} else {
			int changed = sessions.getCurrentSession()
			        .createSQLQuery("UPDATE vinshc_facility_workflow SET workflow_code=:code,version_number=:newVersion,"
			                + "actor_id=:actor,date_changed=:date WHERE facility_location_id=:location"
			                + " AND version_number=:expected")
			        .setParameter("code", code).setParameter("newVersion", version)
			        .setParameter("actor", Context.getAuthenticatedUser().getUserId())
			        .setParameter("date", Timestamp.from(Instant.now())).setParameter("location", loc.getLocationId())
			        .setParameter("expected", expected).executeUpdate();
			if (changed != 1)
				throw VinshcService.bad("workflow version changed; reload before saving");
		}
		audit("workflow.updated", loc.getUuid(), code + " version " + version);
		return workflow(loc.getUuid());
	}
}
