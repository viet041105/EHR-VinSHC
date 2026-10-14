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
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.openmrs.Location;
import org.openmrs.Person;
import org.openmrs.Provider;
import org.openmrs.User;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/** Staff-provider assignments are facility-scoped; business UUID is never a Location UUID. */
@Transactional
public class DirectoryService {

	private final SessionFactory sessionFactory;

	public DirectoryService(SessionFactory sessionFactory) {
		this.sessionFactory = sessionFactory;
	}

	private static void developer() {
		AuthorizationService.requireAuthenticated();
		if (!Context.getAuthenticatedUser().hasPrivilege("System Developer"))
			throw new org.openmrs.api.APIAuthenticationException("Privileges required: System Developer");
	}

	private static void admin() {
		AuthorizationService.requireOperation("metadata_admin", "update");
	}

	private static String value(Map<String, Object> body, String key, int max) {
		return StaffAccountService.field(body, key, max);
	}

	private static void only(Map<String, Object> body, String... keys) {
		StaffAccountService.credentials(body, keys);
	}

	private void audit(String action, String entityUuid, String detail) {
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement stmt = connection.prepareStatement(
			    "INSERT INTO vinshc_admin_event(event_uuid,action,entity_uuid,detail,creator,date_created)"
			            + " VALUES (?,?,?,?,?,?)")) {
				stmt.setString(1, UUID.randomUUID().toString());
				stmt.setString(2, action);
				stmt.setString(3, entityUuid);
				stmt.setString(4, detail);
				stmt.setInt(5, Context.getAuthenticatedUser().getUserId());
				stmt.setTimestamp(6, Timestamp.from(Instant.now()));
				stmt.executeUpdate();
			}
		});
	}

	private static User user(String uuid) {
		User user = Context.getUserService().getUserByUuid(VinshcService.canonicalUuid(uuid, "user"));
		if (user == null || Boolean.TRUE.equals(user.getRetired()))
			throw VinshcService.bad("active user does not exist");
		return user;
	}

	private static Provider provider(String uuid) {
		Provider provider = Context.getProviderService().getProviderByUuid(VinshcService.canonicalUuid(uuid, "provider"));
		if (provider == null)
			throw VinshcService.bad("provider does not exist");
		return provider;
	}

	private static Location location(String uuid) {
		Location location = Context.getLocationService().getLocationByUuid(VinshcService.canonicalUuid(uuid, "location"));
		if (location == null || Boolean.TRUE.equals(location.getRetired()))
			throw VinshcService.bad("active OpenMRS location does not exist");
		return location;
	}

	private static boolean clinical(User user) {
		return user.hasRole("VinSHC App: nurse") || user.hasRole("VinSHC App: doctor") || user.hasRole("VinSHC App: lab");
	}

	private static Map<String, Object> providerView(Provider provider, User user, Location facility) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", provider.getUuid());
		out.put("identifier", provider.getIdentifier());
		out.put("personUuid", provider.getPerson() == null ? null : provider.getPerson().getUuid());
		out.put("retired", provider.getRetired());
		if (user != null)
			out.put("userUuid", user.getUuid());
		if (facility != null)
			out.put("facilityLocationUuid", facility.getUuid());
		return out;
	}

	/**
	 * Prefer the existing employee Person. A Patient must never become a Provider. A separate linked
	 * Person cannot be silently substituted for the User's identity.
	 */
	public Map<String, Object> createProvider(Map<String, Object> body) {
		developer();
		only(body, "userUuid", "facilityLocationUuid", "identifier");
		User user = user(value(body, "userUuid", 38));
		Location facility = location(value(body, "facilityLocationUuid", 38));
		if (!clinical(user))
			throw VinshcService.bad("user does not hold an eligible clinical role");
		Person person = user.getPerson();
		if (person == null || person.isPatient())
			throw VinshcService.bad("clinical user must have a non-patient Person");
		if (!Context.getProviderService().getProvidersByPerson(person, false).isEmpty())
			throw VinshcService.bad("Person already has an active Provider; link it instead");
		String identifier = value(body, "identifier", 60);
		if (!identifier.matches("[A-Za-z0-9._-]{3,60}"))
			throw VinshcService.bad("provider identifier is invalid");
		Provider created = new Provider();
		created.setPerson(person);
		created.setIdentifier(identifier);
		created = Context.getProviderService().saveProvider(created);
		linkInternal(user, created, facility);
		audit("provider.created", created.getUuid(), "staff provider provisioned");
		return providerView(created, user, facility);
	}

	private void linkInternal(User user, Provider provider, Location facility) {
		if (!clinical(user) || provider.getRetired() || provider.getPerson() == null || user.getPerson() == null
		        || !provider.getPerson().equals(user.getPerson()))
			throw VinshcService.bad("provider must belong to the eligible user's own non-patient Person");
		AuthorizationService.requireLocationScopeStatic(facility);
		sessionFactory.getCurrentSession().createSQLQuery(
		    "UPDATE vinshc_provider_link SET active=false WHERE user_id=:user AND facility_location_id=:facility AND active=true")
		        .setParameter("user", user.getUserId()).setParameter("facility", facility.getLocationId()).executeUpdate();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement stmt = connection.prepareStatement(
			    "INSERT INTO vinshc_provider_link(link_uuid,user_id,provider_id,facility_location_id,active,creator,date_created)"
			            + " VALUES(?,?,?,?,true,?,?)")) {
				stmt.setString(1, UUID.randomUUID().toString());
				stmt.setInt(2, user.getUserId());
				stmt.setInt(3, provider.getProviderId());
				stmt.setInt(4, facility.getLocationId());
				stmt.setInt(5, Context.getAuthenticatedUser().getUserId());
				stmt.setTimestamp(6, Timestamp.from(Instant.now()));
				stmt.executeUpdate();
			}
		});
	}

	public Map<String, Object> linkProvider(Map<String, Object> body) {
		developer();
		only(body, "userUuid", "providerUuid", "facilityLocationUuid");
		User user = user(value(body, "userUuid", 38));
		Provider provider = provider(value(body, "providerUuid", 38));
		Location facility = location(value(body, "facilityLocationUuid", 38));
		linkInternal(user, provider, facility);
		audit("provider.linked", provider.getUuid(), "facility=" + facility.getUuid() + ";user=" + user.getUuid());
		return providerView(provider, user, facility);
	}

	/** Provider identity stays stable; only its administrative identifier may be corrected. */
	public Map<String, Object> updateProvider(String uuid, Map<String, Object> body) {
		developer();
		only(body, "identifier");
		Provider target = provider(uuid);
		if (target.getRetired())
			throw VinshcService.bad("retired provider is read-only");
		String identifier = value(body, "identifier", 60);
		if (!identifier.matches("[A-Za-z0-9._-]{3,60}"))
			throw VinshcService.bad("provider identifier is invalid");
		target.setIdentifier(identifier);
		target = Context.getProviderService().saveProvider(target);
		audit("provider.updated", target.getUuid(), "identifier corrected");
		return providerView(target, null, null);
	}

	public Map<String, Object> unlinkProvider(Map<String, Object> body) {
		developer();
		only(body, "userUuid", "providerUuid", "facilityLocationUuid");
		User user = user(value(body, "userUuid", 38));
		Provider provider = provider(value(body, "providerUuid", 38));
		Location facility = location(value(body, "facilityLocationUuid", 38));
		int changed = sessionFactory.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_provider_link SET active=false WHERE user_id=:user AND provider_id=:provider"
		                + " AND facility_location_id=:facility AND active=true")
		        .setParameter("user", user.getUserId()).setParameter("provider", provider.getProviderId())
		        .setParameter("facility", facility.getLocationId()).executeUpdate();
		if (changed != 1)
			throw VinshcService.bad("active provider link does not exist");
		audit("provider.unlinked", provider.getUuid(), "facility=" + facility.getUuid() + ";user=" + user.getUuid());
		return providerView(provider, user, facility);
	}

	public Map<String, Object> retireProvider(String uuid, Map<String, Object> body) {
		developer();
		only(body, "reason");
		Provider provider = provider(uuid);
		if (provider.getRetired())
			throw VinshcService.bad("provider is already retired");
		Context.getProviderService().retireProvider(provider, value(body, "reason", 250));
		sessionFactory.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_provider_link SET active=false WHERE provider_id=:provider")
		        .setParameter("provider", provider.getProviderId()).executeUpdate();
		audit("provider.retired", provider.getUuid(), "all facility links revoked");
		return providerView(provider, null, null);
	}

	public Map<String, Object> providerLinks(String userUuid) {
		developer();
		User target = user(userUuid);
		List<Map<String, Object>> links = sessionFactory.getCurrentSession().doReturningWork(connection -> {
			List<Map<String, Object>> records = new ArrayList<>();
			try (PreparedStatement stmt = connection.prepareStatement(
			    "SELECT p.uuid,l.uuid FROM vinshc_provider_link x" + " JOIN provider p ON p.provider_id=x.provider_id"
			            + " JOIN location l ON l.location_id=x.facility_location_id"
			            + " WHERE x.user_id=? AND x.active=true AND p.retired=false AND l.retired=false")) {
				stmt.setInt(1, target.getUserId());
				try (ResultSet rs = stmt.executeQuery()) {
					while (rs.next()) {
						Map<String, Object> row = new LinkedHashMap<>();
						row.put("providerUuid", rs.getString(1));
						row.put("facilityLocationUuid", rs.getString(2));
						records.add(row);
					}
				}
			}
			return records;
		});
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("userUuid", target.getUuid());
		out.put("links", links);
		return out;
	}

	public Map<String, Object> createFacility(Map<String, Object> body) {
		developer();
		only(body, "code", "legalName", "name", "address", "phone", "timezone", "effectiveFrom", "parentLocationUuid");
		String code = value(body, "code", 40).toUpperCase(java.util.Locale.ROOT);
		if (!code.matches("[A-Z0-9_-]{2,40}"))
			throw VinshcService.bad("facility code is invalid");
		String name = value(body, "name", 255);
		String legalName = value(body, "legalName", 255);
		String address = value(body, "address", 500);
		String zone = value(body, "timezone", 64);
		try {
			ZoneId.of(zone);
		}
		catch (RuntimeException error) {
			throw VinshcService.bad("timezone is invalid");
		}
		LocalDate effective;
		try {
			effective = LocalDate.parse(value(body, "effectiveFrom", 10));
		}
		catch (RuntimeException error) {
			throw VinshcService.bad("effectiveFrom must be YYYY-MM-DD");
		}
		String phone = body.containsKey("phone") ? value(body, "phone", 32) : null;
		Location loc = new Location();
		loc.setName(name);
		loc.setDescription(legalName);
		loc.setAddress1(address);
		if (body.containsKey("parentLocationUuid"))
			loc.setParentLocation(location(value(body, "parentLocationUuid", 38)));
		loc = Context.getLocationService().saveLocation(loc);
		String facilityUuid = UUID.randomUUID().toString();
		int locId = loc.getLocationId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement stmt = connection.prepareStatement(
			    "INSERT INTO vinshc_business_facility(facility_uuid,location_id,facility_code,legal_name,"
			            + "address_text,phone,timezone,active,effective_from,creator,date_created)"
			            + " VALUES(?,?,?,?,?,?,?,true,?,?,?)")) {
				stmt.setString(1, facilityUuid);
				stmt.setInt(2, locId);
				stmt.setString(3, code);
				stmt.setString(4, legalName);
				stmt.setString(5, address);
				stmt.setString(6, phone);
				stmt.setString(7, zone);
				stmt.setDate(8, java.sql.Date.valueOf(effective));
				stmt.setInt(9, Context.getAuthenticatedUser().getUserId());
				stmt.setTimestamp(10, Timestamp.from(Instant.now()));
				stmt.executeUpdate();
			}
		});
		audit("facility.created", facilityUuid, "code=" + code + ";location=" + loc.getUuid());
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("facilityUuid", facilityUuid);
		out.put("locationUuid", loc.getUuid());
		out.put("code", code);
		out.put("legalName", legalName);
		out.put("active", true);
		return out;
	}

	/** Returns business IDs and Location IDs side-by-side, including retired facilities. */
	public Map<String, Object> facilities() {
		developer();
		List<Map<String, Object>> records = sessionFactory.getCurrentSession().doReturningWork(c -> {
			List<Map<String, Object>> all = new ArrayList<>();
			try (PreparedStatement stmt = c
			        .prepareStatement("SELECT f.facility_uuid,l.uuid,f.facility_code,f.legal_name,f.address_text,"
			                + "f.phone,f.timezone,f.active,f.effective_from,f.effective_to,l.name"
			                + " FROM vinshc_business_facility f JOIN location l ON l.location_id=f.location_id"
			                + " ORDER BY f.facility_code")) {
				try (ResultSet rs = stmt.executeQuery()) {
					while (rs.next()) {
						Map<String, Object> out = new LinkedHashMap<>();
						out.put("facilityUuid", rs.getString(1));
						out.put("locationUuid", rs.getString(2));
						out.put("code", rs.getString(3));
						out.put("legalName", rs.getString(4));
						out.put("address", rs.getString(5));
						out.put("phone", rs.getString(6));
						out.put("timezone", rs.getString(7));
						out.put("active", rs.getBoolean(8));
						out.put("effectiveFrom", rs.getDate(9).toString());
						out.put("effectiveTo", rs.getDate(10) == null ? null : rs.getDate(10).toString());
						out.put("name", rs.getString(11));
						all.add(out);
					}
				}
			}
			return all;
		});
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("results", records);
		return result;
	}

	/** Facility UUID, code and historical documents are immutable after registration. */
	public Map<String, Object> updateFacility(String uuid, Map<String, Object> body) {
		developer();
		only(body, "legalName", "name", "address", "phone", "timezone");
		String id = VinshcService.canonicalUuid(uuid, "business facility");
		Map<String, Object> current = facilityRecord(id);
		if (!Boolean.TRUE.equals(current.get("active")))
			throw VinshcService.bad("retired facility is read-only");
		if (body.isEmpty())
			throw VinshcService.bad("at least one facility field is required");
		String legal = body.containsKey("legalName") ? value(body, "legalName", 255) : current.get("legalName").toString();
		String address = body.containsKey("address") ? value(body, "address", 500) : current.get("address").toString();
		String zone = body.containsKey("timezone") ? value(body, "timezone", 64) : current.get("timezone").toString();
		try {
			ZoneId.of(zone);
		}
		catch (RuntimeException ex) {
			throw VinshcService.bad("timezone is invalid");
		}
		String phone = body.containsKey("phone") ? value(body, "phone", 32) : (String) current.get("phone");
		Location loc = location(current.get("locationUuid").toString());
		if (body.containsKey("name")) {
			loc.setName(value(body, "name", 255));
		}
		loc.setDescription(legal);
		loc.setAddress1(address);
		Context.getLocationService().saveLocation(loc);
		sessionFactory.getCurrentSession().doWork(c -> {
			try (PreparedStatement stmt = c
			        .prepareStatement("UPDATE vinshc_business_facility SET legal_name=?,address_text=?,phone=?,timezone=?"
			                + " WHERE facility_uuid=? AND active=true")) {
				stmt.setString(1, legal);
				stmt.setString(2, address);
				stmt.setString(3, phone);
				stmt.setString(4, zone);
				stmt.setString(5, id);
				if (stmt.executeUpdate() != 1)
					throw VinshcService.bad("facility changed during update");
			}
		});
		audit("facility.updated", id, "administrative fields");
		return facilityRecord(id);
	}

	public Map<String, Object> retireFacility(String uuid, Map<String, Object> body) {
		developer();
		only(body, "reason", "effectiveTo");
		String id = VinshcService.canonicalUuid(uuid, "business facility");
		Map<String, Object> existing = facilityRecord(id);
		if (!Boolean.TRUE.equals(existing.get("active")))
			throw VinshcService.bad("facility already retired");
		String reason = value(body, "reason", 255);
		String date = value(body, "effectiveTo", 10);
		LocalDate effective;
		try {
			effective = LocalDate.parse(date);
		}
		catch (RuntimeException ex) {
			throw VinshcService.bad("effectiveTo must be YYYY-MM-DD");
		}
		if (effective.isBefore(LocalDate.parse(existing.get("effectiveFrom").toString())))
			throw VinshcService.bad("effectiveTo predates effectiveFrom");
		Location loc = location(existing.get("locationUuid").toString());
		// Retiring a clinic with an unfinished visit would strand clinical work.
		Number open = (Number) sessionFactory.getCurrentSession()
		        .createSQLQuery(
		            "SELECT count(*) FROM visit WHERE location_id=:location AND voided=false AND date_stopped IS NULL")
		        .setParameter("location", loc.getLocationId()).uniqueResult();
		if (open.longValue() > 0)
			throw VinshcService.bad("facility has unfinished visits");
		sessionFactory.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_business_facility SET active=false,effective_to=:effective"
		                + " WHERE facility_uuid=:uuid AND active=true")
		        .setParameter("effective", java.sql.Date.valueOf(effective)).setParameter("uuid", id).executeUpdate();
		sessionFactory.getCurrentSession()
		        .createSQLQuery("UPDATE vinshc_workspace_assignment SET active=false"
		                + " WHERE facility_location_id=:location AND active=true")
		        .setParameter("location", loc.getLocationId()).executeUpdate();
		sessionFactory.getCurrentSession()
		        .createSQLQuery(
		            "UPDATE vinshc_provider_link SET active=false" + " WHERE facility_location_id=:location AND active=true")
		        .setParameter("location", loc.getLocationId()).executeUpdate();
		Context.getLocationService().retireLocation(loc, reason);
		audit("facility.retired", id, "new clinical work blocked");
		return facilityRecord(id);
	}

	public Map<String, Object> facilityRecord(String uuid) {
		developer();
		String id = VinshcService.canonicalUuid(uuid, "business facility");
		for (Map<String, Object> item : (List<Map<String, Object>>) facilities().get("results"))
			if (id.equals(item.get("facilityUuid")))
				return item;
		throw VinshcService.bad("business facility does not exist");
	}
}
