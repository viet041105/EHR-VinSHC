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

import static org.openmrs.module.vinshc.service.VinshcService.bad;
import static org.openmrs.module.vinshc.service.VinshcService.canonicalUuid;
import static org.openmrs.module.vinshc.service.VinshcService.limit;
import static org.openmrs.module.vinshc.service.VinshcService.map;
import static org.openmrs.module.vinshc.service.VinshcService.objectMap;
import static org.openmrs.module.vinshc.service.VinshcService.optionalString;
import static org.openmrs.module.vinshc.service.VinshcService.requiredString;
import static org.openmrs.module.vinshc.service.VinshcService.strictInt;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.openmrs.Concept;
import org.openmrs.Encounter;
import org.openmrs.EncounterProvider;
import org.openmrs.EncounterRole;
import org.openmrs.EncounterType;
import org.openmrs.Location;
import org.openmrs.Obs;
import org.openmrs.Patient;
import org.openmrs.PatientIdentifier;
import org.openmrs.PatientIdentifierType;
import org.openmrs.Person;
import org.openmrs.PersonAttribute;
import org.openmrs.PersonAttributeType;
import org.openmrs.PersonName;
import org.openmrs.Provider;
import org.openmrs.User;
import org.openmrs.Visit;
import org.openmrs.VisitType;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.context.Context;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * Staff-facing patient registration/search and visit/encounter lifecycle. Core REST/FHIR stay
 * closed to app roles; this adapter applies the VinSHC workspace policy (role privilege and
 * facility scope), registers patients at a facility, keeps at most one open visit per patient and
 * records visit closure as native administrative Obs (group.administrative).
 */
@Transactional
public class CareService {

	static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

	static final String INTERNAL_ID_TYPE = "ca12ea64-d279-5cce-a2a9-e2c46446ac34";

	private static final String IDGEN_SOURCE = "3bfdfcf4-987a-521d-8e5d-7d60e782b6fa";

	/**
	 * Secondary identifier key → [type UUID, accepted syntax]. Syntax mirrors the Initializer metadata.
	 */
	private static final Map<String, String[]> IDENTIFIER_TYPES = identifierTypes();

	static final String PHONE_ATTRIBUTE = "1aeef034-d2a0-56b4-a4c8-d856f17dc261";

	private static final Map<String, String> ATTRIBUTES = map("phone", PHONE_ATTRIBUTE, "birthRaw",
	    "a4e0addf-5506-52d0-a6a8-d139d663d251", "birthPrecision", "6abda66e-da8a-5cd6-bd91-fa4199332d9f", "birthYear",
	    "e87a0244-d7e5-5f32-915c-96be9320a0bb", "birthMonth", "8a36009d-bebd-5d87-b625-f35f55e165d3", "occupation",
	    "f3dbdece-1705-5587-a3f9-eb492606fc8b", "addressRaw", "b0591671-9096-5c68-a12b-a334646b8856", "addressLegacy",
	    "3437b782-2af8-5e10-85fb-87b8335b0821");

	private static final Set<String> GENDERS = VinshcService.set("M", "F", "O", "U");

	private static final Set<String> BIRTH_PRECISIONS = VinshcService.set("day", "month", "year", "unknown");

	static final Map<String, String> VISIT_TYPES = map("outpatient", "20a5a7e6-76e0-584c-9b28-e1f637660fee", "followup",
	    "33478305-9827-573f-8c63-22bc136da6ba");

	static final Map<String, String> ENCOUNTER_TYPES = map("administrative", "70ddd463-1bae-58c4-83d6-18a0391869d2",
	    "vitals", "8368ff74-1b50-592b-8e78-2f0f2ddc1e06", "consultation", "c3dba376-453f-5f2c-bee7-70c09a2d5f61", "results",
	    "b6ba54a0-c595-5f17-88ff-29812ccad8d0");

	static final Map<String, String> ENCOUNTER_ROLES = map("clinician", "21dc99b5-a544-5c12-9dcc-3d12fe1d164b", "nurse",
	    "3d09e225-5185-5db6-a9cc-89a6962dc014", "technician", "2dc83c7f-83bf-5c36-a769-433274c63809");

	private static final String ADMINISTRATIVE_GROUP = "cbc0dada-ce5e-5c76-9378-d4a02d2a8c0a";

	private static final String CLOSE_REASON = "e54c1088-b2ad-534d-923e-8fb82019751f";

	private static final String CLOSE_NOTE = "b3ccfa9b-2d9e-5f86-8816-70a74f30e6cf";

	static final Map<String, String> CLOSE_REASONS = map("completed", "ce25786a-650f-588e-b554-3d42ac81bc33", "left_early",
	    "cf8f5dc1-e869-5990-ab3d-e704fccf0707", "cancelled", "8ad6ff22-bfca-5a8d-aa90-06a2bbd7de4e", "referred",
	    "5af6b517-7dae-526e-92f2-afff2ed64a5c");

	/** Roles that may see the administrative projection of a patient; others get minimal identity. */
	private static final Set<String> FULL_IDENTITY_ROLES = VinshcService.set("reception", "doctor");

	private static final int DEFAULT_PAGE = 25;

	private static final int MAX_PAGE = 100;

	/** Clock skew tolerated for client-supplied "now" timestamps. */
	private static final long SKEW_SECONDS = 120;

	/** Vietnamese/Latin letters with diacritics and their folded ASCII form, for SQL translate(). */
	static final String FOLD_FROM;

	static final String FOLD_TO;

	static {
		StringBuilder from = new StringBuilder("đĐ"), to = new StringBuilder("dd");
		for (char c = 'À'; c <= 'ɏ'; c++)
			fold(c, from, to);
		for (char c = 'Ḁ'; c <= 'ỿ'; c++)
			fold(c, from, to);
		FOLD_FROM = from.toString();
		FOLD_TO = to.toString();
	}

	private final JdbcTemplate jdbc;

	private final SessionFactory sessionFactory;

	private final VinshcService administration;

	public CareService(SessionFactory sessionFactory, VinshcService administration) {
		ConnectionProvider provider = ((SessionFactoryImplementor) sessionFactory).getServiceRegistry()
		        .getService(ConnectionProvider.class);
		this.jdbc = new JdbcTemplate(provider.unwrap(javax.sql.DataSource.class));
		this.sessionFactory = sessionFactory;
		this.administration = administration;
	}

	// ---------------------------------------------------------------- patients

	/**
	 * Patients registered at, or seen in, the caller's facility. The query matches an exact identifier,
	 * a diacritic-insensitive part of the Vietnamese-order full name, or the last digits of the
	 * patient's phone. An empty query lists the most recently registered patients.
	 */
	public Map<String, Object> searchPatients(String query, Integer limit, Integer offset) {
		AuthorizationService.requireOperation("patient_identity", "read");
		String q = query == null ? "" : Normalizer.normalize(query.trim(), Normalizer.Form.NFC);
		if (q.length() == 1)
			throw bad("query must contain at least 2 characters");
		limit(q, 100, "query");
		int size = page(limit), skip = offset(offset);
		Location facility = AuthorizationService.listingFacilityStatic();
		List<Object> args = new ArrayList<>();
		StringBuilder sql = new StringBuilder();
		if (facility != null) {
			sql.append(TREE_CTE);
			args.add(facility.getLocationId());
		}
		sql.append("SELECT p.patient_id FROM patient p JOIN person ps ON ps.person_id=p.patient_id")
		        .append(" WHERE p.voided=false AND ps.voided=false");
		if (facility != null)
			sql.append(IN_FACILITY_SCOPE);
		if (!q.isEmpty()) {
			sql.append(" AND (EXISTS (SELECT 1 FROM patient_identifier pi WHERE pi.patient_id=p.patient_id")
			        .append(" AND pi.voided=false AND upper(pi.identifier)=upper(?))");
			args.add(q);
			sql.append(" OR EXISTS (SELECT 1 FROM person_name n WHERE n.person_id=p.patient_id AND n.voided=false AND ")
			        .append(foldedNameSql("n")).append(" LIKE ? ESCAPE '\\')");
			args.add(FOLD_FROM);
			args.add(FOLD_TO);
			args.add("%" + likeEscape(fold(q)) + "%");
			String digits = q.replaceAll("[^0-9]", "");
			if (digits.length() >= 6 && q.matches("[0-9+ .()\\-]+")) {
				sql.append(" OR EXISTS (SELECT 1 FROM person_attribute a JOIN person_attribute_type t")
				        .append(" ON t.person_attribute_type_id=a.person_attribute_type_id WHERE a.person_id=p.patient_id")
				        .append(" AND a.voided=false AND t.uuid=? AND regexp_replace(a.value,'[^0-9]','','g') LIKE ?)");
				args.add(PHONE_ATTRIBUTE);
				args.add("%" + (digits.length() > 9 ? digits.substring(digits.length() - 9) : digits));
			}
			sql.append(")");
		}
		sql.append(" ORDER BY ps.date_created DESC, p.patient_id DESC LIMIT ? OFFSET ?");
		args.add(size + 1);
		args.add(skip);
		List<Integer> ids = jdbc.queryForList(sql.toString(), Integer.class, args.toArray());
		boolean full = fullIdentity();
		List<Map<String, Object>> results = new ArrayList<>();
		for (Integer id : ids.subList(0, Math.min(size, ids.size())))
			results.add(patientView(Context.getPatientService().getPatient(id), full, facility));
		AuthorizationService.auditReadStatic("patient_search", null, null, null,
		    "results=" + results.size() + (q.isEmpty() ? " recent" : " query"));
		return page(results, ids.size() > size, size, skip);
	}

	public Map<String, Object> patient(String uuid) {
		AuthorizationService.requireOperation("patient_identity", "read");
		Patient patient = patientByUuid(uuid);
		AuthorizationService.requirePatientScopeStatic(patient);
		AuthorizationService.auditReadStatic("patient_identity", patient, null, patient.getUuid(), "profile");
		return patientView(patient, fullIdentity(), AuthorizationService.listingFacilityStatic());
	}

	/**
	 * Registers a new patient at the workspace facility with an idgen-issued internal record number. A
	 * secondary identifier (CCCD/BHXH/BHYT) that already belongs to a patient is rejected; a same
	 * name/gender/birth-year match in the facility is rejected until the caller confirms with
	 * allowPossibleDuplicate=true. A retried request with the same idempotency key returns the patient
	 * it created.
	 */
	public Map<String, Object> registerPatient(Map<String, Object> body) {
		AuthorizationService.requireOperation("patient_identity", "create");
		Location facility = AuthorizationService.listingFacilityStatic();
		if (facility == null)
			throw bad("an active facility workspace is required to register a patient");
		String key = idempotency(body);
		lock("patient-registration:" + key);
		List<Map<String, Object>> replay = jdbc.queryForList(
		    "SELECT patient_id, facility_location_id FROM vinshc_patient_registration WHERE idempotency_key=?", key);
		Names names = names(body, null);
		String gender = gender(body, null);
		if (!replay.isEmpty()) {
			Patient existing = Context.getPatientService().getPatient(number(replay.get(0).get("patient_id")).intValue());
			PersonName name = existing.getPersonName();
			if (number(replay.get(0).get("facility_location_id")).intValue() != facility.getLocationId()
			        || !names.family.equals(name.getFamilyName()) || !names.given.equals(name.getGivenName())
			        || !gender.equals(existing.getGender()))
				throw conflict("idempotency key was already used with another registration payload", null);
			return patientView(existing, true, facility);
		}
		Birth birth = birth(body);
		Map<String, String> identifiers = secondaryIdentifiers(body.get("identifiers"));
		if (!identifiers.containsKey("cccd"))
			throw bad("cccd identifier is required when registering a patient");
		Map<String, String> attributes = attributes(body);
		boolean allowDuplicate = Boolean.TRUE.equals(body.get("allowPossibleDuplicate"));
		lock("patient-name:" + facility.getLocationId() + ":" + fold(names.display()));
		for (Map.Entry<String, String> id : identifiers.entrySet()) {
			lock("patient-identifier:" + id.getKey() + ":" + id.getValue().toUpperCase(Locale.ROOT));
			assertIdentifierFree(id.getKey(), id.getValue(), null, facility);
		}
		if (!allowDuplicate) {
			List<Map<String, Object>> similar = possibleDuplicates(names, gender, birth, facility);
			if (!similar.isEmpty())
				throw conflict("possible duplicate patient in this facility; review the matches or confirm with "
				        + "allowPossibleDuplicate=true",
				    similar);
		}
		Patient patient = new Patient();
		PersonName name = new PersonName(names.given, names.middle, names.family);
		name.setPreferred(true);
		patient.addName(name);
		patient.setGender(gender);
		applyBirth(patient, birth);
		PatientIdentifier internal = new PatientIdentifier(generateInternalIdentifier(), identifierType(INTERNAL_ID_TYPE),
		        facility);
		internal.setPreferred(true);
		patient.addIdentifier(internal);
		for (Map.Entry<String, String> id : identifiers.entrySet())
			patient.addIdentifier(
			    new PatientIdentifier(id.getValue(), identifierType(IDENTIFIER_TYPES.get(id.getKey())[0]), null));
		for (Map.Entry<String, String> attribute : attributes.entrySet())
			if (attribute.getValue() != null)
				patient.addAttribute(new PersonAttribute(attributeType(attribute.getKey()), attribute.getValue()));
		Context.getPatientService().savePatient(patient);
		Context.flushSession();
		String registration = UUID.randomUUID().toString();
		jdbc.update(
		    "INSERT INTO vinshc_patient_registration(registration_uuid,patient_id,facility_location_id,"
		            + "idempotency_key,creator,date_created) VALUES (?,?,?,?,?,?)",
		    registration, patient.getPatientId(), facility.getLocationId(), key, actorId(), now());
		ClinicalEvents.record(sessionFactory, "patient_registered", patient, null, patient.getUuid(), null,
		    "facility " + facility.getUuid() + (allowDuplicate ? "; possible duplicate confirmed" : ""));
		Object address = body.get("address");
		if (address != null) {
			Map<String, Object> request = new HashMap<>(objectMap(address));
			request.put("patient", patient.getUuid());
			request.putIfAbsent("source", Collections.singletonMap("kind", "manual"));
			request.putIfAbsent("recordedAt", OffsetDateTime.now(CLINIC_ZONE).toString());
			administration.saveAddress(null, request);
		}
		return patientView(patient, true, facility);
	}

	/**
	 * Partial demographic update. Supplied names replace the preferred name (the old one is voided with
	 * the reason); a null attribute clears it; a secondary identifier replaces the current one of its
	 * type. Core keeps every superseded value voided for audit.
	 */
	public Map<String, Object> updatePatient(String uuid, Map<String, Object> body) {
		AuthorizationService.requireOperation("patient_identity", "update");
		Patient patient = patientByUuid(uuid);
		AuthorizationService.requirePatientScopeStatic(patient);
		lock("vinshc-patient-admin:" + patient.getPatientId());
		Context.refreshEntity(patient);
		String reason = optionalString(body, "reason");
		reason = reason == null || reason.trim().isEmpty() ? "VinSHC administrative update" : reason.trim();
		limit(reason, 255, "reason");
		List<String> changed = new ArrayList<>();
		if (body.containsKey("familyName") || body.containsKey("givenName") || body.containsKey("middleName")) {
			PersonName current = patient.getPersonName();
			Names names = names(body, current);
			if (current == null || !names.family.equals(current.getFamilyName())
			        || !names.given.equals(current.getGivenName())
			        || !java.util.Objects.equals(names.middle, current.getMiddleName())) {
				PersonName replacement = new PersonName(names.given, names.middle, names.family);
				replacement.setPreferred(true);
				if (current != null) {
					current.setPreferred(false);
					voidData(current, reason);
				}
				patient.addName(replacement);
				changed.add("name");
			}
		}
		if (body.containsKey("gender")) {
			String gender = gender(body, patient.getGender());
			if (!gender.equals(patient.getGender())) {
				patient.setGender(gender);
				changed.add("gender");
			}
		}
		if (body.containsKey("birthPrecision")) {
			applyBirth(patient, birth(body));
			changed.add("birth");
		}
		for (Map.Entry<String, String> attribute : attributes(body).entrySet()) {
			PersonAttributeType type = attributeType(attribute.getKey());
			PersonAttribute current = patient.getAttribute(type);
			String value = attribute.getValue();
			if (current != null && value != null && value.equals(current.getValue()))
				continue;
			if (current == null && value == null)
				continue;
			if (current != null)
				current.voidAttribute(reason);
			if (value != null)
				patient.addAttribute(new PersonAttribute(type, value));
			changed.add(attribute.getKey());
		}
		Location facility = AuthorizationService.listingFacilityStatic();
		for (Map.Entry<String, String> id : secondaryIdentifiers(body.get("identifiers")).entrySet()) {
			PatientIdentifierType type = identifierType(IDENTIFIER_TYPES.get(id.getKey())[0]);
			PatientIdentifier current = patient.getPatientIdentifier(type);
			if (current != null && id.getValue().equalsIgnoreCase(current.getIdentifier()))
				continue;
			lock("patient-identifier:" + id.getKey() + ":" + id.getValue().toUpperCase(Locale.ROOT));
			assertIdentifierFree(id.getKey(), id.getValue(), patient, facility);
			if (current != null)
				voidData(current, reason);
			patient.addIdentifier(new PatientIdentifier(id.getValue(), type, null));
			changed.add(id.getKey());
		}
		if (changed.isEmpty())
			throw bad("update does not change any value");
		Context.getPatientService().savePatient(patient);
		ClinicalEvents.record(sessionFactory, "patient_updated", patient, null, patient.getUuid(), reason,
		    String.join(",", changed));
		return patientView(patient, true, facility);
	}

	// ---------------------------------------------------------------- visits

	/**
	 * Opens an outpatient visit at the workspace facility. A patient has at most one open visit; an
	 * optional booked appointment is checked in (arrived) and linked to the new visit.
	 */
	public Map<String, Object> openVisit(Map<String, Object> body) {
		AuthorizationService.requireOperation("visit", "create");
		Patient patient = patientByUuid(requiredString(body, "patient"));
		AuthorizationService.requirePatientScopeStatic(patient);
		Location facility = AuthorizationService.listingFacilityStatic();
		if (facility == null)
			throw bad("an active facility workspace is required to open a visit");
		String typeKey = requiredString(body, "visitType");
		String typeUuid = VISIT_TYPES.containsKey(typeKey) ? VISIT_TYPES.get(typeKey) : typeKey;
		if (!VISIT_TYPES.containsValue(typeUuid))
			throw bad("visitType must be outpatient or followup");
		VisitType type = Context.getVisitService().getVisitTypeByUuid(typeUuid);
		if (type == null || type.getRetired())
			throw VinshcService.misconfigured("visit type is not provisioned: " + typeUuid);
		Date start = pastOrNow(body.get("startDatetime"), "startDatetime");
		lock("visit-open:patient:" + patient.getPatientId());
		List<Map<String, Object>> open = new ArrayList<>();
		boolean openElsewhere = false;
		for (Visit visit : Context.getVisitService().getActiveVisitsByPatient(patient))
			if (!visit.getVoided() && visit.getStopDatetime() == null) {
				if (inFacility(visit.getLocation(), facility))
					open.add(visitView(visit, false));
				else
					openElsewhere = true;
			}
		if (!open.isEmpty())
			throw conflict("patient already has an open visit in this facility", open);
		if (openElsewhere)
			throw conflict("patient has an open visit at another facility; close it there first", null);
		Map<String, Object> appointment = null;
		String appointmentUuid = optionalString(body, "appointment");
		if (appointmentUuid != null) {
			AuthorizationService.requireOperation("appointment", "update");
			appointment = checkInAppointment(appointmentUuid, patient);
		}
		Visit visit = new Visit(patient, type, start);
		visit.setLocation(facility);
		Context.getVisitService().saveVisit(visit);
		Context.flushSession();
		if (appointment != null)
			jdbc.update(
			    "UPDATE vinshc_appointment SET status='arrived',visit_id=?,changed_by=?,date_changed=? WHERE appointment_id=?",
			    visit.getVisitId(), actorId(), now(), appointment.get("appointment_id"));
		ClinicalEvents.record(sessionFactory, "visit_opened", patient, null, visit.getUuid(), null,
		    typeKeyOf(visit) + (appointment == null ? "" : "; appointment " + appointment.get("appointment_uuid")));
		return visitView(visit, true);
	}

	public Map<String, Object> visit(String uuid) {
		AuthorizationService.requireOperation("visit", "read");
		Visit visit = visitByUuid(uuid);
		AuthorizationService.requireLocationScopeStatic(visit.getLocation());
		AuthorizationService.auditReadStatic("visit", visit.getPatient(), null, visit.getUuid(), "visit");
		return visitView(visit, true);
	}

	/**
	 * Visits of the caller's facility. status=open (default) | closed | all; date (yyyy-MM-dd, clinic
	 * time) filters on the start; patient narrows to one patient.
	 */
	public Map<String, Object> visits(String patientUuid, String status, String date, Integer limit, Integer offset) {
		AuthorizationService.requireOperation("visit", "read");
		int size = page(limit), skip = offset(offset);
		Location facility = AuthorizationService.listingFacilityStatic();
		List<Object> args = new ArrayList<>();
		StringBuilder sql = new StringBuilder();
		if (facility != null) {
			sql.append(TREE_CTE);
			args.add(facility.getLocationId());
		}
		sql.append("SELECT v.visit_id FROM visit v WHERE v.voided=false");
		if (facility != null)
			sql.append(" AND v.location_id IN (SELECT location_id FROM tree)");
		Patient patient = null;
		if (patientUuid != null) {
			patient = patientByUuid(patientUuid);
			AuthorizationService.requirePatientScopeStatic(patient);
			sql.append(" AND v.patient_id=?");
			args.add(patient.getPatientId());
		}
		String state = status == null ? "open" : status;
		if ("open".equals(state))
			sql.append(" AND v.date_stopped IS NULL");
		else if ("closed".equals(state))
			sql.append(" AND v.date_stopped IS NOT NULL");
		else if (!"all".equals(state))
			throw bad("status must be open, closed or all");
		if (date != null) {
			LocalDate day = day(date);
			sql.append(" AND v.date_started>=? AND v.date_started<?");
			args.add(Timestamp.from(day.atStartOfDay(CLINIC_ZONE).toInstant()));
			args.add(Timestamp.from(day.plusDays(1).atStartOfDay(CLINIC_ZONE).toInstant()));
		}
		sql.append(" ORDER BY v.date_started DESC, v.visit_id DESC LIMIT ? OFFSET ?");
		args.add(size + 1);
		args.add(skip);
		List<Integer> ids = jdbc.queryForList(sql.toString(), Integer.class, args.toArray());
		List<Map<String, Object>> results = new ArrayList<>();
		for (Integer id : ids.subList(0, Math.min(size, ids.size())))
			results.add(visitView(Context.getVisitService().getVisit(id), true));
		AuthorizationService.auditReadStatic("visit_list", patient, null, null, "results=" + results.size());
		return page(results, ids.size() > size, size, skip);
	}

	/**
	 * Ends an open visit with a coded reason (and a note unless completed), stored as an administrative
	 * encounter. A completed visit must not leave unfinished service orders or unpaid bills; any other
	 * reason closes the visit and reports them as warnings. Open queue tickets of the visit are closed.
	 */
	public Map<String, Object> closeVisit(String uuid, Map<String, Object> body) {
		String reason = requiredString(body, "closeReason");
		if (!CLOSE_REASONS.containsKey(reason))
			throw bad("closeReason must be completed, left_early, cancelled or referred");
		AuthorizationService.requireOperation("visit", "cancelled".equals(reason) ? "cancel" : "update");
		Visit visit = visitByUuid(uuid);
		AuthorizationService.requireLocationScopeStatic(visit.getLocation());
		lock("visit:" + visit.getVisitId());
		Context.refreshEntity(visit);
		if (visit.getStopDatetime() != null)
			throw conflict("visit is already closed", null);
		String note = optionalString(body, "note");
		if (note != null && note.trim().isEmpty())
			note = null;
		if (note != null)
			limit(note.trim(), 1000, "note");
		if (!"completed".equals(reason) && note == null)
			throw bad("note is required unless the visit is completed");
		Date stop = pastOrNow(body.get("stopDatetime"), "stopDatetime");
		if (stop.before(visit.getStartDatetime()))
			throw bad("stopDatetime cannot be before the visit start");
		for (Encounter encounter : visit.getNonVoidedEncounters())
			if (encounter.getEncounterDatetime().after(stop))
				throw bad("stopDatetime cannot be before an encounter of the visit");
		Number openOrders = jdbc.queryForObject("SELECT count(*) FROM vinshc_service_order WHERE visit_id=?"
		        + " AND state IN ('requested','assigned','in_progress')",
		    Number.class, visit.getVisitId());
		Number unpaidBills = jdbc.queryForObject(
		    "SELECT count(*) FROM vinshc_bill WHERE visit_id=?" + " AND status IN ('unpaid','partially_paid')", Number.class,
		    visit.getVisitId());
		List<String> warnings = new ArrayList<>();
		if (openOrders.longValue() > 0)
			warnings.add(openOrders + " service order(s) not completed");
		if (unpaidBills.longValue() > 0)
			warnings.add(unpaidBills + " bill(s) not fully paid");
		if ("completed".equals(reason) && !warnings.isEmpty())
			throw conflict("visit cannot be completed: " + String.join("; ", warnings), null);
		String queueState = "completed".equals(reason) ? "completed" : "cancelled".equals(reason) ? "cancelled" : "left";
		String exitReason = "completed".equals(reason) ? null
		        : "referred".equals(reason) ? "referred_elsewhere"
		                : "left_early".equals(reason) ? "patient_requested" : "other";
		int closedTickets = jdbc.update(
		    "UPDATE vinshc_queue_item SET state=?,exit_reason=?,changed_by=?,date_changed=? WHERE visit_id=?"
		            + " AND state IN ('waiting','called','in_service')",
		    queueState, exitReason, actorId(), now(), visit.getVisitId());
		Patient patient = visit.getPatient();
		Encounter closure = new Encounter();
		closure.setPatient(patient);
		closure.setVisit(visit);
		closure.setEncounterType(encounterType("administrative"));
		closure.setLocation(visit.getLocation());
		closure.setEncounterDatetime(stop);
		Obs group = obs(patient, closure, stop, concept(ADMINISTRATIVE_GROUP));
		Obs coded = obs(patient, closure, stop, concept(CLOSE_REASON));
		coded.setValueCoded(concept(CLOSE_REASONS.get(reason)));
		group.addGroupMember(coded);
		if (note != null) {
			Obs text = obs(patient, closure, stop, concept(CLOSE_NOTE));
			text.setValueText(note.trim());
			group.addGroupMember(text);
		}
		closure.addObs(group);
		visit.addEncounter(closure);
		Context.getEncounterService().saveEncounter(closure);
		Context.getVisitService().endVisit(visit, stop);
		ClinicalEvents.record(sessionFactory, "visit_closed", patient, closure, visit.getUuid(),
		    note == null ? null : note.trim(), reason + (warnings.isEmpty() ? "" : "; " + String.join("; ", warnings))
		            + "; queue tickets closed=" + closedTickets);
		Map<String, Object> view = visitView(visit, true);
		view.put("warnings", warnings);
		return view;
	}

	// ---------------------------------------------------------------- encounters

	/**
	 * Returns the caller's encounter of the given type in an open visit, creating it on first use.
	 * vitals needs the nurse vitals privilege, consultation the doctor consultation privilege and
	 * administrative the visit update privilege. Clinical encounters record the acting provider, which
	 * must belong to the signed-in account unless the caller is a system developer.
	 */
	public Map<String, Object> ensureEncounter(String visitUuid, Map<String, Object> body) {
		String typeKey = requiredString(body, "encounterType");
		String roleKey;
		if ("vitals".equals(typeKey)) {
			VinshcService.requireDirectPrivilege(VinshcService.VITALS_PRIVILEGE);
			roleKey = "nurse";
		} else if ("consultation".equals(typeKey)) {
			VinshcService.requireDirectPrivilege(ClinicalService.CONSULTATION_PRIVILEGE);
			roleKey = "clinician";
		} else if ("administrative".equals(typeKey)) {
			AuthorizationService.requireOperation("visit", "update");
			roleKey = null;
		} else
			throw bad("encounterType must be vitals, consultation or administrative");
		Visit visit = visitByUuid(visitUuid);
		AuthorizationService.requireLocationScopeStatic(visit.getLocation());
		lock("visit:" + visit.getVisitId());
		Context.refreshEntity(visit);
		if (visit.getStopDatetime() != null)
			throw conflict("visit is closed", null);
		EncounterType type = encounterType(typeKey);
		Provider provider = roleKey == null ? null : actingProvider(optionalString(body, "provider"), visit.getLocation());
		EncounterRole role = roleKey == null ? null : encounterRole(roleKey);
		for (Encounter existing : visit.getNonVoidedEncounters())
			if (existing.getEncounterType().equals(type)
			        && (provider == null || existing.getProvidersByRole(role).contains(provider))) {
				Map<String, Object> view = encounterView(existing);
				view.put("created", false);
				return view;
			}
		Date at = pastOrNow(body.get("encounterDatetime"), "encounterDatetime");
		if (at.before(visit.getStartDatetime()))
			throw bad("encounterDatetime cannot be before the visit start");
		Encounter encounter = new Encounter();
		encounter.setPatient(visit.getPatient());
		encounter.setEncounterType(type);
		encounter.setLocation(visit.getLocation());
		encounter.setEncounterDatetime(at);
		if (provider != null)
			encounter.addProvider(role, provider);
		visit.addEncounter(encounter);
		Context.getEncounterService().saveEncounter(encounter);
		ClinicalEvents.record(sessionFactory, "encounter_created", visit.getPatient(), encounter, encounter.getUuid(), null,
		    typeKey);
		Map<String, Object> view = encounterView(encounter);
		view.put("created", true);
		return view;
	}

	/** Providers linked to the signed-in account, for choosing the acting clinician/nurse. */
	public Map<String, Object> myProviders() {
		AuthorizationService.requireAuthenticated();
		User user = Context.getAuthenticatedUser();
		List<Map<String, Object>> providers = new ArrayList<>();
		if (user.getPerson() != null)
			for (Provider provider : Context.getProviderService().getProvidersByPerson(user.getPerson(), false))
				providers.add(providerView(provider, null));
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("userUuid", user.getUuid());
		out.put("providers", providers);
		return out;
	}

	private Provider actingProvider(String requested, Location encounterLocation) {
		User user = Context.getAuthenticatedUser();
		List<Provider> own = user.getPerson() == null ? Collections.<Provider> emptyList()
		        : new ArrayList<>(Context.getProviderService().getProvidersByPerson(user.getPerson(), false));
		boolean unscoped = AuthorizationService.activeRoleStatic() == null;
		if (!unscoped) {
			// Only administrators can create links. A header or client-supplied UUID cannot grant one.
			List<Integer> linked = new ArrayList<>();
			for (Location location = encounterLocation; location != null; location = location.getParentLocation()) {
				@SuppressWarnings("unchecked")
				List<Number> matches = sessionFactory.getCurrentSession()
				        .createSQLQuery("SELECT p.provider_id FROM vinshc_provider_link x JOIN provider p"
				                + " ON p.provider_id=x.provider_id"
				                + " WHERE x.active=true AND p.retired=false AND x.user_id=:user"
				                + " AND x.facility_location_id=:facility")
				        .setParameter("user", user.getUserId()).setParameter("facility", location.getLocationId()).list();
				for (Number number : matches)
					if (!linked.contains(number.intValue()))
						linked.add(number.intValue());
			}
			if (linked.size() != 1)
				throw new APIAuthenticationException("Privileges required: one active provider assigned at facility");
			Provider provider = Context.getProviderService().getProvider(linked.get(0));
			if (provider == null || provider.getRetired() || !own.contains(provider))
				throw new APIAuthenticationException("Privileges required: own active provider");
			if (requested != null && !provider.getUuid().equalsIgnoreCase(canonicalUuid(requested, "provider")))
				throw new APIAuthenticationException("Privileges required: assigned provider");
			return provider;
		}
		if (requested != null) {
			Provider provider = Context.getProviderService().getProviderByUuid(canonicalUuid(requested, "provider"));
			if (provider == null || provider.getRetired())
				throw bad("provider does not exist");
			return provider;
		}
		if (own.size() == 1)
			return own.get(0);
		if (own.isEmpty())
			throw bad("the signed-in account has no provider record; an administrator must link one before "
			        + "clinical encounters can be recorded");
		throw bad("the signed-in account has several provider records; choose provider");
	}

	// ---------------------------------------------------------------- views

	Map<String, Object> patientView(Patient patient, boolean full, Location facility) {
		Map<String, Object> out = patientSummary(patient);
		PersonName name = patient.getPersonName();
		out.put("familyName", name == null ? null : name.getFamilyName());
		out.put("middleName", name == null ? null : name.getMiddleName());
		out.put("givenName", name == null ? null : name.getGivenName());
		out.put("birthPrecision", attribute(patient, "birthPrecision"));
		out.put("birthYear", attribute(patient, "birthYear"));
		out.put("birthMonth", attribute(patient, "birthMonth"));
		out.put("projection", full ? "administrative" : "minimal");
		if (full) {
			out.put("phone", attribute(patient, "phone"));
			out.put("occupation", attribute(patient, "occupation"));
			out.put("birthRaw", attribute(patient, "birthRaw"));
			out.put("addressRaw", attribute(patient, "addressRaw"));
			out.put("addressLegacy", attribute(patient, "addressLegacy"));
			List<Map<String, Object>> identifiers = new ArrayList<>();
			for (PatientIdentifier identifier : patient.getActiveIdentifiers()) {
				Map<String, Object> item = new LinkedHashMap<>();
				item.put("type", identifierKey(identifier.getIdentifierType().getUuid()));
				item.put("typeName", identifier.getIdentifierType().getName());
				item.put("identifier", identifier.getIdentifier());
				identifiers.add(item);
			}
			out.put("identifiers", identifiers);
			out.put("address", patient.getPersonAddress() == null ? null : patient.getPersonAddress().getAddress1());
		}
		Map<String, Object> open = null;
		for (Visit visit : Context.getVisitService().getActiveVisitsByPatient(patient))
			if (!visit.getVoided() && visit.getStopDatetime() == null
			        && (facility == null || inFacility(visit.getLocation(), facility)))
				open = visitBrief(visit);
		out.put("openVisit", open);
		return out;
	}

	/** Minimal identity used in every list: never phone, address or secondary identifiers. */
	static Map<String, Object> patientSummary(Patient patient) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", patient.getUuid());
		out.put("patientUuid", patient.getUuid());
		PatientIdentifier internal = null;
		for (PatientIdentifier identifier : patient.getActiveIdentifiers())
			if (INTERNAL_ID_TYPE.equals(identifier.getIdentifierType().getUuid()))
				internal = identifier;
		out.put("identifier", internal == null ? null : internal.getIdentifier());
		out.put("fullName", fullName(patient.getPersonName()));
		out.put("gender", patient.getGender());
		LocalDate birth = patient.getBirthdate() == null ? null : localDate(patient.getBirthdate());
		out.put("birthdate", birth == null ? null : birth.toString());
		out.put("birthdateEstimated", patient.getBirthdateEstimated());
		out.put("age", birth == null ? null : Period.between(birth, LocalDate.now(CLINIC_ZONE)).getYears());
		return out;
	}

	/** Vietnamese order: family, middle, given. */
	static String fullName(PersonName name) {
		if (name == null)
			return null;
		StringBuilder out = new StringBuilder();
		for (String part : Arrays.asList(name.getFamilyName(), name.getMiddleName(), name.getGivenName()))
			if (part != null && !part.trim().isEmpty())
				out.append(out.length() == 0 ? "" : " ").append(part.trim());
		return out.toString();
	}

	Map<String, Object> visitView(Visit visit, boolean withEncounters) {
		Map<String, Object> out = visitBrief(visit);
		out.put("patient", patientSummary(visit.getPatient()));
		out.put("patientUuid", visit.getPatient().getUuid());
		out.put("visitUuid", visit.getUuid());
		out.put("locationUuid", visit.getLocation() == null ? null : visit.getLocation().getUuid());
		out.put("stopDatetime", iso(visit.getStopDatetime()));
		String closeReason = null, closeNote = null;
		List<Map<String, Object>> encounters = new ArrayList<>();
		List<Encounter> sorted = new ArrayList<>(visit.getNonVoidedEncounters());
		sorted.sort(Comparator.comparing(Encounter::getEncounterDatetime));
		for (Encounter encounter : sorted) {
			if (ENCOUNTER_TYPES.get("administrative").equals(encounter.getEncounterType().getUuid()))
				for (Obs obs : closureObs(encounter)) {
					if (CLOSE_REASON.equals(obs.getConcept().getUuid()) && obs.getValueCoded() != null)
						for (Map.Entry<String, String> answer : CLOSE_REASONS.entrySet())
							if (answer.getValue().equals(obs.getValueCoded().getUuid()))
								closeReason = answer.getKey();
					if (CLOSE_NOTE.equals(obs.getConcept().getUuid()))
						closeNote = obs.getValueText();
				}
			if (withEncounters)
				encounters.add(encounterView(encounter));
		}
		out.put("closeReason", closeReason);
		out.put("closeNote", closeNote);
		if (withEncounters)
			out.put("encounters", encounters);
		return out;
	}

	/**
	 * Top-level obs and their members. A just-saved group's members are not in the encounter's obs set
	 * until it is reloaded, so they are reached through the group.
	 */
	private static Set<Obs> closureObs(Encounter encounter) {
		Set<Obs> all = new java.util.LinkedHashSet<>();
		for (Obs obs : encounter.getObsAtTopLevel(false)) {
			all.add(obs);
			if (obs.isObsGrouping())
				all.addAll(obs.getGroupMembers(false));
		}
		return all;
	}

	private static Map<String, Object> visitBrief(Visit visit) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", visit.getUuid());
		out.put("visitCode", String.format(Locale.ROOT, "VSHC-LK-%08d", visit.getVisitId()));
		Map<String, Object> type = new LinkedHashMap<>();
		type.put("uuid", visit.getVisitType().getUuid());
		type.put("key", typeKeyOf(visit));
		type.put("name", visit.getVisitType().getName());
		out.put("visitType", type);
		out.put("startDatetime", iso(visit.getStartDatetime()));
		out.put("status", visit.getStopDatetime() == null ? "open" : "closed");
		return out;
	}

	static Map<String, Object> encounterView(Encounter encounter) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", encounter.getUuid());
		out.put("encounterUuid", encounter.getUuid());
		Map<String, Object> type = new LinkedHashMap<>();
		type.put("uuid", encounter.getEncounterType().getUuid());
		type.put("key", key(ENCOUNTER_TYPES, encounter.getEncounterType().getUuid()));
		type.put("name", encounter.getEncounterType().getName());
		out.put("encounterType", type);
		out.put("encounterDatetime", iso(encounter.getEncounterDatetime()));
		out.put("visitUuid", encounter.getVisit() == null ? null : encounter.getVisit().getUuid());
		out.put("patientUuid", encounter.getPatient().getUuid());
		List<Map<String, Object>> providers = new ArrayList<>();
		for (EncounterProvider item : encounter.getActiveEncounterProviders())
			providers.add(providerView(item.getProvider(), item.getEncounterRole()));
		out.put("providers", providers);
		return out;
	}

	static Map<String, Object> providerView(Provider provider, EncounterRole role) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("uuid", provider.getUuid());
		out.put("identifier", provider.getIdentifier());
		out.put("name",
		    provider.getPerson() != null && provider.getPerson().getPersonName() != null
		            ? fullName(provider.getPerson().getPersonName())
		            : provider.getName());
		if (role != null)
			out.put("role", key(ENCOUNTER_ROLES, role.getUuid()));
		return out;
	}

	// ---------------------------------------------------------------- validation helpers

	private Names names(Map<String, Object> body, PersonName current) {
		Names names = new Names();
		names.family = nameField(body, "familyName", current == null ? null : current.getFamilyName(), true);
		names.given = nameField(body, "givenName", current == null ? null : current.getGivenName(), true);
		names.middle = nameField(body, "middleName", current == null ? null : current.getMiddleName(), false);
		return names;
	}

	private static String nameField(Map<String, Object> body, String key, String fallback, boolean required) {
		String value = body.containsKey(key) ? optionalString(body, key) : fallback;
		value = value == null ? null : Normalizer.normalize(value.trim().replaceAll("\\s+", " "), Normalizer.Form.NFC);
		if (value != null && value.isEmpty())
			value = null;
		if (required && value == null)
			throw bad(key + " is required");
		limit(value, 50, key);
		if (value != null && !value.matches("[\\p{L}\\p{M}' .\\-]+"))
			throw bad(key + " may only contain letters, spaces, apostrophes, dots and hyphens");
		return value;
	}

	private static String gender(Map<String, Object> body, String fallback) {
		String gender = body.containsKey("gender") ? optionalString(body, "gender") : fallback;
		if (gender == null || !GENDERS.contains(gender))
			throw bad("gender must be M, F, O or U");
		return gender;
	}

	private static Birth birth(Map<String, Object> body) {
		Birth birth = new Birth();
		birth.precision = requiredString(body, "birthPrecision");
		if (!BIRTH_PRECISIONS.contains(birth.precision))
			throw bad("birthPrecision must be day, month, year or unknown");
		LocalDate today = LocalDate.now(CLINIC_ZONE);
		if ("day".equals(birth.precision)) {
			if (body.get("birthYear") != null || body.get("birthMonth") != null)
				throw bad("birthYear/birthMonth are only used when birthPrecision is month or year");
			try {
				birth.date = LocalDate.parse(requiredString(body, "birthdate"));
			}
			catch (DateTimeParseException ex) {
				throw bad("birthdate must be an ISO date (yyyy-MM-dd)");
			}
		} else if ("month".equals(birth.precision) || "year".equals(birth.precision)) {
			if (body.get("birthdate") != null)
				throw bad("birthdate is only used when birthPrecision is day");
			birth.year = strictInt(body.get("birthYear"), "birthYear");
			if ("month".equals(birth.precision)) {
				birth.month = strictInt(body.get("birthMonth"), "birthMonth");
				if (birth.month < 1 || birth.month > 12)
					throw bad("birthMonth must be between 1 and 12");
			} else if (body.get("birthMonth") != null)
				throw bad("birthMonth is only used when birthPrecision is month");
			if (birth.year < 1 || birth.year > today.getYear())
				throw bad("birthYear is out of range");
			birth.date = LocalDate.of(birth.year, birth.month == null ? 1 : birth.month, 1);
		} else if (body.get("birthdate") != null || body.get("birthYear") != null || body.get("birthMonth") != null)
			throw bad("an unknown birth date cannot carry birthdate, birthYear or birthMonth");
		if (birth.date != null && (birth.date.isAfter(today) || birth.date.isBefore(today.minusYears(140))))
			throw bad("birth date must be within the last 140 years and not in the future");
		birth.raw = optionalString(body, "birthRaw");
		if (birth.raw != null && birth.raw.trim().isEmpty())
			birth.raw = null;
		limit(birth.raw, 50, "birthRaw");
		return birth;
	}

	private void applyBirth(Patient patient, Birth birth) {
		patient.setBirthdate(birth.date == null ? null : java.sql.Date.valueOf(birth.date));
		patient.setBirthdateEstimated(!"day".equals(birth.precision) && birth.date != null);
		setAttribute(patient, "birthPrecision", birth.precision);
		setAttribute(patient, "birthYear", birth.year == null ? null : String.valueOf(birth.year));
		setAttribute(patient, "birthMonth", birth.month == null ? null : String.valueOf(birth.month));
		setAttribute(patient, "birthRaw", birth.raw);
	}

	private void setAttribute(Patient patient, String key, String value) {
		PersonAttributeType type = attributeType(key);
		PersonAttribute current = patient.getAttribute(type);
		if (current != null && value != null && value.equals(current.getValue()))
			return;
		if (current != null && current.getPersonAttributeId() != null)
			current.voidAttribute("VinSHC birth details changed");
		else if (current != null)
			patient.removeAttribute(current);
		if (value != null)
			patient.addAttribute(new PersonAttribute(type, value));
	}

	/** Free-text attributes accepted on create/update; null clears an attribute on update. */
	private static Map<String, String> attributes(Map<String, Object> body) {
		Map<String, String> out = new LinkedHashMap<>();
		for (String key : Arrays.asList("phone", "occupation", "addressRaw", "addressLegacy")) {
			if (!body.containsKey(key))
				continue;
			String value = optionalString(body, key);
			value = value == null || value.trim().isEmpty() ? null : Normalizer.normalize(value.trim(), Normalizer.Form.NFC);
			limit(value, 50, key);
			if ("phone".equals(key) && value != null && !value.matches("\\+?[0-9 .()\\-]{6,20}"))
				throw bad("phone must contain 6-20 digits and may start with +");
			out.put(key, value);
		}
		return out;
	}

	private static Map<String, String> secondaryIdentifiers(Object raw) {
		Map<String, String> out = new LinkedHashMap<>();
		if (raw == null)
			return out;
		if (!(raw instanceof List))
			throw bad("identifiers must be a JSON array");
		for (Object item : (List<?>) raw) {
			Map<String, Object> identifier = objectMap(item);
			String type = requiredString(identifier, "type");
			String value = requiredString(identifier, "identifier").trim();
			String[] rule = IDENTIFIER_TYPES.get(type);
			if (rule == null)
				throw bad("identifier type must be cccd, bhxh or bhyt");
			if (!value.matches(rule[1]))
				throw bad(type + " identifier has an invalid format");
			if (out.put(type, value) != null)
				throw bad("only one " + type + " identifier may be supplied");
		}
		return out;
	}

	private void assertIdentifierFree(String type, String value, Patient self, Location facility) {
		List<Integer> owners = jdbc.queryForList(
		    "SELECT DISTINCT pi.patient_id FROM patient_identifier pi JOIN patient_identifier_type t"
		            + " ON t.patient_identifier_type_id=pi.identifier_type JOIN patient p ON p.patient_id=pi.patient_id"
		            + " WHERE t.uuid=? AND upper(pi.identifier)=upper(?) AND pi.voided=false AND p.voided=false",
		    Integer.class, IDENTIFIER_TYPES.get(type)[0], value);
		List<Map<String, Object>> visible = new ArrayList<>();
		boolean taken = false;
		for (Integer owner : owners) {
			if (self != null && owner.equals(self.getPatientId()))
				continue;
			taken = true;
			if (inScope(owner, facility))
				visible.add(patientSummary(Context.getPatientService().getPatient(owner)));
		}
		if (taken)
			throw conflict(type + " identifier already belongs to a registered patient"
			        + (visible.isEmpty() ? " outside this facility" : ""),
			    visible);
	}

	private List<Map<String, Object>> possibleDuplicates(Names names, String gender, Birth birth, Location facility) {
		List<Object> args = new ArrayList<>();
		StringBuilder sql = new StringBuilder(TREE_CTE);
		args.add(facility.getLocationId());
		sql.append("SELECT DISTINCT p.patient_id FROM patient p JOIN person ps ON ps.person_id=p.patient_id")
		        .append(" JOIN person_name n ON n.person_id=p.patient_id AND n.voided=false")
		        .append(" WHERE p.voided=false AND ps.voided=false AND ps.gender=? AND ").append(foldedNameSql("n"))
		        .append("=?").append(IN_FACILITY_SCOPE);
		args.add(gender);
		args.add(FOLD_FROM);
		args.add(FOLD_TO);
		args.add(fold(names.display()));
		if (birth.date != null) {
			sql.append(" AND (ps.birthdate IS NULL OR EXTRACT(YEAR FROM ps.birthdate)=?)");
			args.add(birth.date.getYear());
		}
		sql.append(" LIMIT 10");
		List<Map<String, Object>> out = new ArrayList<>();
		for (Integer id : jdbc.queryForList(sql.toString(), Integer.class, args.toArray()))
			out.add(patientSummary(Context.getPatientService().getPatient(id)));
		return out;
	}

	private boolean inScope(int patientId, Location facility) {
		if (facility == null)
			return AuthorizationService.activeRoleStatic() == null;
		Number count = jdbc.queryForObject(
		    TREE_CTE + "SELECT count(*) FROM patient p WHERE p.patient_id=?" + IN_FACILITY_SCOPE, Number.class,
		    facility.getLocationId(), patientId);
		return count.longValue() > 0;
	}

	private Map<String, Object> checkInAppointment(String uuid, Patient patient) {
		List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM vinshc_appointment WHERE appointment_uuid=?",
		    canonicalUuid(uuid, "appointment"));
		if (rows.isEmpty())
			throw bad("appointment does not exist");
		lock("appointment:" + rows.get(0).get("appointment_id"));
		Map<String, Object> row = jdbc.queryForMap("SELECT * FROM vinshc_appointment WHERE appointment_id=?",
		    rows.get(0).get("appointment_id"));
		AuthorizationService.requireLocationScopeStatic(
		    Context.getLocationService().getLocation(number(row.get("facility_location_id")).intValue()));
		if (number(row.get("patient_id")).intValue() != patient.getPatientId())
			throw bad("appointment belongs to another patient");
		if (row.get("visit_id") != null)
			throw conflict("appointment is already linked to a visit", null);
		if (!Arrays.asList("booked", "confirmed", "arrived").contains(String.valueOf(row.get("status"))))
			throw conflict("appointment in status " + row.get("status") + " cannot be checked in", null);
		return row;
	}

	/**
	 * Calls idgen through reflection so the module needs no compile-time dependency on it. A missing
	 * module or source is a configuration error.
	 */
	private static String generateInternalIdentifier() {
		try {
			Class<?> serviceClass = Context.loadClass("org.openmrs.module.idgen.service.IdentifierSourceService");
			Object service = Context.getService(serviceClass);
			Object source = serviceClass.getMethod("getIdentifierSourceByUuid", String.class).invoke(service, IDGEN_SOURCE);
			if (source == null)
				throw VinshcService.misconfigured("internal patient identifier source is not provisioned: " + IDGEN_SOURCE);
			for (Method method : serviceClass.getMethods())
				if ("generateIdentifier".equals(method.getName()) && method.getParameterCount() == 2
				        && method.getParameterTypes()[0].isInstance(source)
				        && method.getParameterTypes()[1] == String.class) {
					Object value = method.invoke(service, source, "VinSHC patient registration");
					if (value == null || value.toString().trim().isEmpty())
						throw VinshcService.misconfigured("idgen returned an empty identifier");
					return value.toString();
				}
			throw VinshcService.misconfigured("idgen generateIdentifier(source, comment) is unavailable");
		}
		catch (InvocationTargetException ex) {
			if (ex.getCause() instanceof RuntimeException)
				throw (RuntimeException) ex.getCause();
			throw new VinshcExceptions.Configuration("idgen failed to generate an identifier", ex.getCause());
		}
		catch (ReflectiveOperationException ex) {
			throw new VinshcExceptions.Configuration("idgen module is not available", ex);
		}
	}

	// ---------------------------------------------------------------- lookup helpers

	private static final String TREE_CTE = "WITH RECURSIVE tree AS (SELECT location_id FROM location WHERE location_id=?"
	        + " UNION SELECT l.location_id FROM location l JOIN tree t ON l.parent_location=t.location_id) ";

	private static final String IN_FACILITY_SCOPE = " AND (EXISTS (SELECT 1 FROM visit v WHERE v.patient_id=p.patient_id"
	        + " AND v.voided=false AND v.location_id IN (SELECT location_id FROM tree))"
	        + " OR EXISTS (SELECT 1 FROM vinshc_patient_registration r WHERE r.patient_id=p.patient_id"
	        + " AND r.facility_location_id IN (SELECT location_id FROM tree)))";

	private static String foldedNameSql(String alias) {
		return "lower(translate(concat_ws(' '," + alias + ".family_name," + alias + ".middle_name," + alias
		        + ".given_name),?,?))";
	}

	static String fold(String value) {
		String stripped = Normalizer.normalize(value.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
		        .replaceAll("\\p{M}", "");
		return stripped.toLowerCase(Locale.ROOT).trim().replaceAll("\\s+", " ");
	}

	private static void fold(char c, StringBuilder from, StringBuilder to) {
		String base = Normalizer.normalize(String.valueOf(c), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
		if (base.length() == 1 && base.charAt(0) < 128 && base.charAt(0) != c && Character.isLetter(base.charAt(0))) {
			from.append(c);
			to.append(Character.toLowerCase(base.charAt(0)));
		}
	}

	private static String likeEscape(String value) {
		return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	private static Patient patientByUuid(String uuid) {
		Patient patient = Context.getPatientService().getPatientByUuid(canonicalUuid(uuid, "patient"));
		if (patient == null || patient.getVoided())
			throw bad("patient does not exist");
		return patient;
	}

	private static Visit visitByUuid(String uuid) {
		Visit visit = Context.getVisitService().getVisitByUuid(canonicalUuid(uuid, "visit"));
		if (visit == null || visit.getVoided())
			throw bad("visit does not exist");
		return visit;
	}

	private static PatientIdentifierType identifierType(String uuid) {
		PatientIdentifierType type = Context.getPatientService().getPatientIdentifierTypeByUuid(uuid);
		if (type == null || type.getRetired())
			throw VinshcService.misconfigured("patient identifier type is not provisioned: " + uuid);
		return type;
	}

	private static PersonAttributeType attributeType(String key) {
		PersonAttributeType type = Context.getPersonService().getPersonAttributeTypeByUuid(ATTRIBUTES.get(key));
		if (type == null || type.getRetired())
			throw VinshcService.misconfigured("person attribute type is not provisioned: " + key);
		return type;
	}

	private static String attribute(Person person, String key) {
		PersonAttribute value = person.getAttribute(attributeType(key));
		return value == null ? null : value.getValue();
	}

	static EncounterType encounterType(String key) {
		EncounterType type = Context.getEncounterService().getEncounterTypeByUuid(ENCOUNTER_TYPES.get(key));
		if (type == null || type.getRetired())
			throw VinshcService.misconfigured("encounter type is not provisioned: " + key);
		return type;
	}

	static EncounterRole encounterRole(String key) {
		EncounterRole role = Context.getEncounterService().getEncounterRoleByUuid(ENCOUNTER_ROLES.get(key));
		if (role == null || role.getRetired())
			throw VinshcService.misconfigured("encounter role is not provisioned: " + key);
		return role;
	}

	private static Concept concept(String uuid) {
		Concept concept = Context.getConceptService().getConceptByUuid(uuid);
		if (concept == null)
			throw VinshcService.misconfigured("required metadata concept missing: " + uuid);
		return concept;
	}

	private static Obs obs(Patient patient, Encounter encounter, Date at, Concept concept) {
		Obs obs = new Obs();
		obs.setPerson(patient);
		obs.setEncounter(encounter);
		obs.setObsDatetime(at);
		obs.setLocation(encounter.getLocation());
		obs.setConcept(concept);
		return obs;
	}

	private static String identifierKey(String typeUuid) {
		if (INTERNAL_ID_TYPE.equals(typeUuid))
			return "internal";
		for (Map.Entry<String, String[]> entry : IDENTIFIER_TYPES.entrySet())
			if (entry.getValue()[0].equals(typeUuid))
				return entry.getKey();
		return "other";
	}

	private static String typeKeyOf(Visit visit) {
		return key(VISIT_TYPES, visit.getVisitType().getUuid());
	}

	private static String key(Map<String, String> values, String uuid) {
		for (Map.Entry<String, String> entry : values.entrySet())
			if (entry.getValue().equals(uuid))
				return entry.getKey();
		return null;
	}

	private static boolean inFacility(Location candidate, Location facility) {
		for (Location value = candidate; value != null; value = value.getParentLocation())
			if (value.getLocationId().equals(facility.getLocationId()))
				return true;
		return false;
	}

	private static boolean fullIdentity() {
		String role = AuthorizationService.activeRoleStatic();
		return role == null || FULL_IDENTITY_ROLES.contains(role);
	}

	private static void voidData(org.openmrs.Voidable data, String reason) {
		data.setVoided(true);
		data.setVoidedBy(Context.getAuthenticatedUser());
		data.setDateVoided(new Date());
		data.setVoidReason(reason);
	}

	private static Date pastOrNow(Object raw, String field) {
		if (raw == null)
			return new Date();
		Instant value = VinshcService.parseInstant(String.valueOf(raw));
		if (value.isAfter(Instant.now().plusSeconds(SKEW_SECONDS)))
			throw bad(field + " cannot be in the future");
		return Date.from(value.isAfter(Instant.now()) ? Instant.now() : value);
	}

	private static LocalDate day(String value) {
		try {
			return LocalDate.parse(value);
		}
		catch (DateTimeParseException ex) {
			throw bad("date must be YYYY-MM-DD");
		}
	}

	static LocalDate localDate(Date value) {
		if (value instanceof java.sql.Date)
			return ((java.sql.Date) value).toLocalDate();
		return new java.sql.Date(value.getTime()).toLocalDate();
	}

	static String iso(Date date) {
		return date == null ? null : Instant.ofEpochMilli(date.getTime()).atZone(CLINIC_ZONE).toOffsetDateTime().toString();
	}

	static int page(Integer limit) {
		int size = limit == null ? DEFAULT_PAGE : limit;
		if (size < 1 || size > MAX_PAGE)
			throw bad("limit must be between 1 and " + MAX_PAGE);
		return size;
	}

	static int offset(Integer offset) {
		int skip = offset == null ? 0 : offset;
		if (skip < 0)
			throw bad("offset must be >= 0");
		return skip;
	}

	static Map<String, Object> page(List<Map<String, Object>> results, boolean more, int limit, int offset) {
		Map<String, Object> out = new LinkedHashMap<>();
		out.put("results", results);
		out.put("limit", limit);
		out.put("offset", offset);
		out.put("hasMore", more);
		return out;
	}

	static String idempotency(Map<String, Object> body) {
		String value = requiredString(body, "idempotencyKey").trim();
		limit(value, 128, "idempotencyKey");
		if (value.length() < 8)
			throw bad("idempotencyKey must contain at least 8 characters");
		return value;
	}

	private static VinshcExceptions.Conflict conflict(String message, List<Map<String, Object>> matches) {
		return new VinshcExceptions.Conflict(message, matches);
	}

	private void lock(String key) {
		TransactionLocks.lock(sessionFactory, key);
	}

	private static int actorId() {
		return Context.getAuthenticatedUser().getUserId();
	}

	private static Timestamp now() {
		return Timestamp.from(Instant.now());
	}

	private static Number number(Object value) {
		return (Number) value;
	}

	private static Map<String, String[]> identifierTypes() {
		Map<String, String[]> out = new LinkedHashMap<>();
		out.put("cccd", new String[] { "4e5406dc-8ff9-5486-98fa-5d95c6fe8233", "[0-9]{12}" });
		out.put("bhxh", new String[] { "d7902062-a695-5bf3-8764-acf7f43e3238", "[A-Za-z0-9-]{1,32}" });
		out.put("bhyt", new String[] { "e2b901c3-d442-565b-bff5-841aff260d2d", "[A-Za-z0-9-]{1,32}" });
		return Collections.unmodifiableMap(out);
	}

	private static final class Names {

		String family, middle, given;

		String display() {
			StringBuilder out = new StringBuilder(family);
			if (middle != null)
				out.append(' ').append(middle);
			return out.append(' ').append(given).toString();
		}
	}

	private static final class Birth {

		String precision, raw;

		LocalDate date;

		Integer year, month;
	}
}
