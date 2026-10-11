package org.openmrs.module.vinshc.service;

import java.io.File;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.hibernate.SessionFactory;
import org.hibernate.engine.jdbc.connections.spi.ConnectionProvider;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.openmrs.Concept;
import org.openmrs.Encounter;
import org.openmrs.Obs;
import org.openmrs.Patient;
import org.openmrs.Person;
import org.openmrs.PersonAddress;
import org.openmrs.api.APIAuthenticationException;
import org.openmrs.api.context.Context;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * Extension-owned persistence and validated write operations. All mutable records are append-only:
 * an update closes the current version and inserts a new version with the same immutable row key.
 */
public class VinshcService {
	
	public static final String READ_PRIVILEGE = "VinSHC: Read patient administration";
	
	public static final String WRITE_PRIVILEGE = "VinSHC: Write patient administration";
	
	public static final String VITALS_PRIVILEGE = "VinSHC: Record vitals";
	
	private static final String CATALOGUE_VERSION = "VN-19-2025-2025-07-01";
	
	private static final Set<String> SOURCE_KINDS = set("manual", "paper", "legacy_import", "migration", "api");
	
	private static final Set<String> CONTEXTS = set("patient", "contact", "identifier", "address");
	
	private static final Set<String> DATA_STATUSES = set("not_recorded", "not_asked", "unknown", "refused", "not_applicable",
	    "masked", "unreadable");
	
	private static final Map<String, String> VITAL_CONCEPTS = map("vitals.mach", "263e4d0b-61d2-5517-bcb1-992cfb60675b",
	    "vitals.ha_tam_thu", "f8da18ad-2e26-55cd-954b-51d6e0738815", "vitals.ha_tam_truong",
	    "f97478e4-cce6-5cc5-89fa-cfd10bfe8794", "vitals.nhiet_do", "55a6de05-e371-5a48-9440-a81d7ef2e364", "vitals.nhip_tho",
	    "b82f1a4a-bbc9-55f0-8204-079bf1130457", "vitals.spo2", "4ebf4ddf-fcbe-5bed-893b-114d6ec5f739", "vitals.can_nang",
	    "88853161-b7db-5a20-b5c5-666b69999a25", "vitals.chieu_cao", "e13865bd-3100-5aca-8e82-e8a6fb58321d");
	
	private static final Map<String, String> STATUS_CONCEPTS = map("vitals.mach", "1452453f-cf72-5b97-b366-7541414f42c9",
	    "vitals.ha_tam_thu", "a0e3f46e-b74e-5bcd-85b5-c8a3a385b964", "vitals.ha_tam_truong",
	    "3f3c8a87-d446-59ba-a877-c03a1dcf82c0", "vitals.nhiet_do", "78f5da85-8751-5492-a6a5-e5bdb1d61ea3", "vitals.nhip_tho",
	    "d3aa7eda-24b2-573b-91ad-1c8c4cdf8f57", "vitals.spo2", "7002d377-77a5-5914-bcbc-90ddd8c5d47e", "vitals.can_nang",
	    "6ad2f977-bd1a-5a3e-9f61-53a13c624a38", "vitals.chieu_cao", "a66b0680-1700-587e-9293-f62634761b4c");
	
	private static final Map<String, String> STATUS_ANSWERS = map("recorded", "87756945-c977-581e-ac81-61886e594ff0",
	    "not_recorded", "c6c1126e-1d5f-5029-948c-87c86be16bde", "not_asked", "dd1df938-28dc-5c9d-997e-253ed6a57ac3",
	    "unknown", "d3dd7619-b5de-59d4-a843-f01029cef193", "refused", "675d6c23-50b4-568b-a887-bd76e0e1c38f",
	    "not_applicable", "e8be81d1-f0a7-5859-a184-50e424050ad1", "masked", "b609c06d-f653-5451-ae15-9a53b813c9e6",
	    "unreadable", "2aa97847-e32b-5974-bfbc-cfed9e55d065");
	
	private static final Set<String> POSITIVE_VITALS = set("vitals.mach", "vitals.ha_tam_thu", "vitals.ha_tam_truong",
	    "vitals.nhip_tho", "vitals.can_nang", "vitals.chieu_cao");
	
	private final JdbcTemplate jdbc;

	private final SessionFactory sessionFactory;

	private volatile Map<String, Map<String, Object>> addressRecords;
	
	private volatile Map<String, Map<String, Object>> relationshipRecords;
	
	private volatile Map<String, Map<String, Object>> fieldPolicies;
	
	public VinshcService(SessionFactory sessionFactory) {
		ConnectionProvider provider = ((SessionFactoryImplementor) sessionFactory).getServiceRegistry()
		        .getService(ConnectionProvider.class);
		this.jdbc = new JdbcTemplate(provider.unwrap(javax.sql.DataSource.class));
		this.sessionFactory = sessionFactory;
	}
	
	public Map<String, Object> identity(String patientUuid, boolean includeHistory) {
		requireDirectPrivilege(READ_PRIVILEGE);
		Patient patient = patient(patientUuid);
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("patientUuid", patient.getUuid());
		String current = includeHistory ? "" : " AND is_current=true";
		result.put("contacts", jdbc.queryForList("SELECT * FROM vinshc_contact WHERE patient_id=?" + current
		        + " ORDER BY priority NULLS LAST, row_key, version_number",
		    patient.getPatientId()));
		result.put("fieldStates", jdbc.queryForList("SELECT * FROM vinshc_field_state WHERE patient_id=?" + current
		        + " ORDER BY field_code, row_key, version_number",
		    patient.getPatientId()));
		result.put("addresses",
		    jdbc.queryForList(
		        "SELECT * FROM vinshc_address_snapshot WHERE patient_id=?" + current + " ORDER BY row_key, version_number",
		        patient.getPatientId()));
		return result;
	}
	
	@Transactional
	public Map<String, Object> saveContact(String rowKey, Map<String, Object> body) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		Map<String, Object> old = rowKey == null ? null : current("vinshc_contact", "row_key", canonicalUuid(rowKey));
		if (rowKey != null && old == null)
			throw bad("rowKey does not exist");
		if (old == null)
			requireNewRecordProvenance(body);
		Patient patient = resolvePatient(body, old);
		if (old != null && number(old.get("patient_id")).intValue() != patient.getPatientId()) {
			throw bad("rowKey belongs to another patient");
		}
		String key = old == null ? UUID.randomUUID().toString() : string(old.get("row_key"));
		Map<String, Object> merged = merge(old, body);
		String fullName = requiredString(merged, "fullName", "full_name");
		limit(fullName, 255, "fullName");
		int priority = requiredInt(merged, "priority");
		if (priority < 1 || priority > 9999)
			throw bad("priority must be between 1 and 9999");
		boolean primary = bool(merged, "isPrimary", "is_primary", false);
		boolean emergency = bool(merged, "emergencyContact", "emergency_contact", false);
		String relationship = optionalString(merged, "relationshipCode", "relationship_code");
		Map<String, Object> relationshipRecord = relationship == null ? null : relationships().get(relationship);
		if (relationship != null && relationshipRecord == null)
			throw bad("unknown or retired relationshipCode");
		Person linked = null;
		String linkedUuid = optionalString(merged, "linkedPersonUuid", "linked_person_uuid");
		if (linkedUuid != null && (linked = Context.getPersonService().getPersonByUuid(linkedUuid)) == null)
			throw bad("linkedPersonUuid does not exist");
		String phone = optionalString(merged, "phone", "phone_raw");
		Phone normalized = normalizePhone(phone, sourceKind(merged).equals("manual"));
		limit(phone, 64, "phone");
		limit(optionalString(merged, "addressText", "address_text"), 2000, "addressText");
		validateSource(merged);
		assertContactUniqueness(patient.getPatientId(), key, priority, primary);
		Timestamp recorded = timestamp(merged.get("recordedAt"), old == null ? null : old.get("recorded_at"));
		int version = old == null ? 1 : number(old.get("version_number")).intValue() + 1;
		if (old != null)
			close("vinshc_contact", "contact_id", old.get("contact_id"));
		jdbc.update(
		    "INSERT INTO vinshc_contact(row_key,version_number,patient_id,full_name,relationship_code,relationship_name,relationship_version,phone_raw,phone_normalized,phone_normalization_status,address_text,priority,is_primary,emergency_contact,linked_person_id,source_kind,source_document_uuid,source_page,source_row_code,source_reference,recorded_at,status,void_reason,is_current,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    key, version, patient.getPatientId(), fullName, relationship,
		    relationshipRecord == null ? null : string(relationshipRecord.get("nameVi")),
		    relationshipRecord == null ? null : string(relationshipRecord.get("version")), phone, normalized.value,
		    normalized.status, optionalString(merged, "addressText", "address_text"), priority, primary, emergency,
		    linked == null ? null : linked.getPersonId(), sourceKind(merged), sourceValue(merged, "documentUuid"),
		    sourceValue(merged, "page"), sourceValue(merged, "sourceRowCode"), sourceValue(merged, "sourceReference"),
		    recorded, "active", null, true, actor(), new Timestamp(System.currentTimeMillis()));
		clearStateWhenContactValueSupplied(patient.getPatientId(), key, body, "relationshipCode", "contact.quan_he");
		clearStateWhenContactValueSupplied(patient.getPatientId(), key, body, "phone", "contact.dien_thoai");
		clearStateWhenContactValueSupplied(patient.getPatientId(), key, body, "addressText", "contact.dia_chi");
		return current("vinshc_contact", "row_key", key);
	}
	
	@Transactional
	public Map<String, Object> voidContact(String rowKey, String reason) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		if (reason == null || reason.trim().isEmpty())
			throw bad("voidReason is required");
		Map<String, Object> old = requiredCurrent("vinshc_contact", rowKey);
		close("vinshc_contact", "contact_id", old.get("contact_id"));
		jdbc.update(
		    "INSERT INTO vinshc_contact(row_key,version_number,patient_id,full_name,relationship_code,relationship_name,relationship_version,phone_raw,phone_normalized,phone_normalization_status,address_text,priority,is_primary,emergency_contact,linked_person_id,source_kind,source_document_uuid,source_page,source_row_code,source_reference,recorded_at,status,void_reason,is_current,creator,date_created) SELECT row_key,version_number+1,patient_id,full_name,relationship_code,relationship_name,relationship_version,phone_raw,phone_normalized,phone_normalization_status,address_text,priority,false,emergency_contact,linked_person_id,source_kind,source_document_uuid,source_page,source_row_code,source_reference,?, 'void', ?, true, ?, ? FROM vinshc_contact WHERE contact_id=?",
		    Timestamp.from(Instant.now()), reason.trim(), actor(), new Timestamp(System.currentTimeMillis()),
		    old.get("contact_id"));
		return current("vinshc_contact", "row_key", canonicalUuid(rowKey));
	}
	
	@Transactional
	public Map<String, Object> saveFieldState(Map<String, Object> body) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		requireNewRecordProvenance(body);
		Patient patient = patient(requiredString(body, "patient"));
		String field = requiredString(body, "fieldCode");
		String context = requiredString(body, "context");
		String status = requiredString(body, "dataStatus");
		if (!CONTEXTS.contains(context))
			throw bad("invalid context");
		if (!DATA_STATUSES.contains(status))
			throw bad("invalid dataStatus");
		Map<String, Object> policy = fieldPolicies().get(field);
		if (policy == null)
			throw bad("fieldCode has no B2 missing-state policy");
		if (!"field_states".equals(policy.get("mode")))
			throw bad("fieldCode does not permit fieldStates");
		if (!context.equals(policy.get("context")))
			throw bad("context does not match the field policy");
		@SuppressWarnings("unchecked")
		List<String> allowedStates = (List<String>) policy.get("allowedStates");
		if (allowedStates == null || !allowedStates.contains(status))
			throw bad("dataStatus is not permitted for fieldCode");
		String rowKey = optionalString(body, "rowKey");
		boolean rowKeyRequired = Boolean.TRUE.equals(policy.get("rowKeyRequired"));
		if (!rowKeyRequired && rowKey != null)
			throw bad(context + " field-state rowKey must be null");
		if (rowKeyRequired && rowKey == null)
			throw bad(context + " field-state requires rowKey");
		if (rowKey != null)
			rowKey = canonicalUuid(rowKey);
		assertOwnedRow(patient.getPatientId(), context, rowKey);
		assertFieldHasNoValue(patient.getPatientId(), field, context, rowKey);
		validateSource(body);
		List<Map<String, Object>> rows = jdbc.queryForList(
		    "SELECT * FROM vinshc_field_state WHERE patient_id=? AND field_code=? AND context=? AND COALESCE(row_key,'')=COALESCE(?,'') AND is_current=true",
		    patient.getPatientId(), field, context, rowKey);
		Map<String, Object> old = rows.isEmpty() ? null : rows.get(0);
		if (old != null)
			close("vinshc_field_state", "field_state_id", old.get("field_state_id"));
		int version = old == null ? 1 : number(old.get("version_number")).intValue() + 1;
		jdbc.update(
		    "INSERT INTO vinshc_field_state(version_number,patient_id,field_code,row_key,context,data_status,source_kind,source_document_uuid,source_page,source_row_code,source_reference,recorded_at,is_current,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    version, patient.getPatientId(), field, rowKey, context, status, sourceKind(body),
		    sourceValue(body, "documentUuid"), sourceValue(body, "page"), sourceValue(body, "sourceRowCode"),
		    sourceValue(body, "sourceReference"), timestamp(body.get("recordedAt"), null), true, actor(),
		    new Timestamp(System.currentTimeMillis()));
		return jdbc.queryForMap(
		    "SELECT * FROM vinshc_field_state WHERE patient_id=? AND field_code=? AND context=? AND COALESCE(row_key,'')=COALESCE(?,'') AND is_current=true",
		    patient.getPatientId(), field, context, rowKey);
	}
	
	@Transactional
	public void clearFieldState(String patientUuid, String fieldCode, String context, String rowKey) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		Patient patient = patient(patientUuid);
		Map<String, Object> policy = fieldPolicies().get(fieldCode);
		if (policy == null || !"field_states".equals(policy.get("mode")) || !context.equals(policy.get("context")))
			throw bad("fieldCode/context does not permit fieldStates");
		if (rowKey != null)
			rowKey = canonicalUuid(rowKey);
		jdbc.update(
		    "UPDATE vinshc_field_state SET is_current=false WHERE patient_id=? AND field_code=? AND context=? AND COALESCE(row_key,'')=COALESCE(?,'') AND is_current=true",
		    patient.getPatientId(), fieldCode, context, rowKey);
	}
	
	@Transactional
	public Map<String, Object> saveAddress(String rowKey, Map<String, Object> body) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		Map<String, Object> old = rowKey == null ? null
		        : current("vinshc_address_snapshot", "row_key", canonicalUuid(rowKey));
		if (rowKey != null && old == null)
			throw bad("rowKey does not exist");
		if (old == null)
			requireNewRecordProvenance(body);
		Patient patient = resolvePatient(body, old);
		if (old != null && number(old.get("patient_id")).intValue() != patient.getPatientId())
			throw bad("rowKey belongs to another patient");
		Map<String, Object> merged = merge(old, body);
		String provinceCode = optionalString(merged, "provinceCode", "province_code");
		String communeCode = optionalString(merged, "communeCode", "commune_code");
		String catalogueVersion = optionalString(merged, "catalogueVersion", "catalogue_version");
		String provinceName = null;
		String communeName = null;
		if (provinceCode != null || communeCode != null || catalogueVersion != null) {
			if (provinceCode == null || communeCode == null || !CATALOGUE_VERSION.equals(catalogueVersion))
				throw bad("coded address requires provinceCode, communeCode and supported catalogueVersion");
			Map<String, Object> province = addresses().get(provinceCode);
			Map<String, Object> commune = addresses().get(communeCode);
			if (province == null || !"province".equals(province.get("level")))
				throw bad("unknown provinceCode");
			if (commune == null || !"commune".equals(commune.get("level")))
				throw bad("unknown communeCode");
			if (!provinceCode.equals(commune.get("parentCode")))
				throw bad("commune does not belong to province");
			provinceName = string(province.get("name"));
			communeName = string(commune.get("name"));
		}
		String key = old == null ? UUID.randomUUID().toString() : string(old.get("row_key"));
		int version = old == null ? 1 : number(old.get("version_number")).intValue() + 1;
		if (old != null)
			close("vinshc_address_snapshot", "address_id", old.get("address_id"));
		String asOf = requiredString(merged, "addressAsOfDate", "address_as_of_date");
		Date asOfDate;
		try {
			asOfDate = Date.valueOf(asOf);
		}
		catch (Exception ex) {
			throw bad("addressAsOfDate must be an ISO date");
		}
		if (catalogueVersion != null && asOfDate.before(Date.valueOf("2025-07-01")))
			throw bad("coded address predates the catalogue effective date");
		String addressText = optionalString(merged, "addressText", "address_text");
		String legacyText = optionalString(merged, "legacyAddressText", "legacy_address_text");
		if (addressText == null && legacyText == null)
			throw bad("addressText or legacyAddressText is required");
		limit(addressText, 2000, "addressText");
		limit(legacyText, 2000, "legacyAddressText");
		validateSource(merged);
		jdbc.update(
		    "INSERT INTO vinshc_address_snapshot(row_key,version_number,patient_id,address_text,legacy_address_text,province_code,province_name,commune_code,commune_name,catalogue_version,address_as_of_date,source_kind,source_document_uuid,source_page,source_row_code,source_reference,recorded_at,status,void_reason,is_current,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		    key, version, patient.getPatientId(), addressText, legacyText, provinceCode, provinceName, communeCode,
		    communeName, catalogueVersion, asOfDate, sourceKind(merged), sourceValue(merged, "documentUuid"),
		    sourceValue(merged, "page"), sourceValue(merged, "sourceRowCode"), sourceValue(merged, "sourceReference"),
		    timestamp(merged.get("recordedAt"), old == null ? null : old.get("recorded_at")), "active", null, true, actor(),
		    new Timestamp(System.currentTimeMillis()));
		if (hasNonNull(body, "addressText", "address_text"))
			clearCurrentState(patient.getPatientId(), "patient.dia_chi", "address", key);
		Map<String, Object> saved = current("vinshc_address_snapshot", "row_key", key);
		projectAddress(patient, saved);
		return saved;
	}
	
	public Map<String, Object> configurationStatus() {
		requireDirectPrivilege(READ_PRIVILEGE);
		Map<String, Object> status = new LinkedHashMap<>();
		status.put("addressHierarchyEntries",
		    jdbc.queryForObject("SELECT count(*) FROM address_hierarchy_entry", Integer.class));
		status.put("addressHierarchyCodedEntries",
		    jdbc.queryForObject("SELECT count(user_generated_id) FROM address_hierarchy_entry", Integer.class));
		status.put("addressHierarchyDistinctCodes",
		    jdbc.queryForObject("SELECT count(DISTINCT user_generated_id) FROM address_hierarchy_entry", Integer.class));
		status.put("fhirPatientIdentifierSystems", jdbc.queryForList(
		    "SELECT url FROM fhir_patient_identifier_system WHERE url LIKE 'urn:uuid:%' ORDER BY url", String.class));
		status.put("catalogueVersion", CATALOGUE_VERSION);
		return status;
	}
	
	public List<Map<String, Object>> addressCatalogue(String parentCode) {
		requireDirectPrivilege(READ_PRIVILEGE);
		return addresses().values().stream()
		        .filter(r -> parentCode == null ? "province".equals(r.get("level")) : parentCode.equals(r.get("parentCode")))
		        .sorted((a, b) -> string(a.get("code")).compareTo(string(b.get("code")))).collect(Collectors.toList());
	}
	
	@Transactional
	public Map<String, Object> voidAddress(String rowKey, String reason) {
		requireDirectPrivilege(WRITE_PRIVILEGE);
		if (reason == null || reason.trim().isEmpty())
			throw bad("voidReason is required");
		Map<String, Object> old = requiredCurrent("vinshc_address_snapshot", rowKey);
		close("vinshc_address_snapshot", "address_id", old.get("address_id"));
		jdbc.update(
		    "INSERT INTO vinshc_address_snapshot(row_key,version_number,patient_id,address_text,legacy_address_text,province_code,province_name,commune_code,commune_name,catalogue_version,address_as_of_date,source_kind,source_document_uuid,source_page,source_row_code,source_reference,recorded_at,status,void_reason,is_current,creator,date_created) SELECT row_key,version_number+1,patient_id,address_text,legacy_address_text,province_code,province_name,commune_code,commune_name,catalogue_version,address_as_of_date,source_kind,source_document_uuid,source_page,source_row_code,source_reference,?, 'void', ?, true, ?, ? FROM vinshc_address_snapshot WHERE address_id=?",
		    Timestamp.from(Instant.now()), reason.trim(), actor(), new Timestamp(System.currentTimeMillis()),
		    old.get("address_id"));
		Map<String, Object> saved = current("vinshc_address_snapshot", "row_key", canonicalUuid(rowKey));
		projectAddress(resolvePatient(Collections.<String, Object> emptyMap(), saved), saved);
		return saved;
	}
	
	/**
	 * Mirrors the current snapshot into a native PersonAddress whose UUID equals the snapshot row key,
	 * so REST/FHIR Patient reads show the current address. The snapshot table remains the source of
	 * history; legacy-only or voided snapshots void the projection instead of exposing old text as
	 * current.
	 */
	private void projectAddress(Patient patient, Map<String, Object> snapshot) {
		String rowKey = string(snapshot.get("row_key"));
		boolean active = "active".equals(snapshot.get("status")) && snapshot.get("address_text") != null;
		PersonAddress address = Context.getPersonService().getPersonAddressByUuid(rowKey);
		if (address != null && !address.getPerson().getPersonId().equals(patient.getPersonId()))
			throw new IllegalStateException("address projection belongs to another person: " + rowKey);
		if (!active) {
			if (address != null && !address.getVoided()) {
				Context.getPersonService().voidPersonAddress(address,
				    snapshot.get("void_reason") == null ? "VinSHC address has no current text"
				            : string(snapshot.get("void_reason")));
				evictAddressCache(patient);
			}
			return;
		}
		if (address == null) {
			address = new PersonAddress();
			address.setUuid(rowKey);
			patient.addAddress(address);
		} else if (address.getVoided()) {
			address = Context.getPersonService().unvoidPersonAddress(address);
		}
		for (PersonAddress other : patient.getAddresses())
			if (!other.getVoided() && !rowKey.equals(other.getUuid()) && Boolean.TRUE.equals(other.getPreferred())) {
				other.setPreferred(false);
				Context.getPersonService().savePersonAddress(other);
			}
		address.setPreferred(true);
		address.setAddress1(string(snapshot.get("address_text")));
		address.setCityVillage(snapshot.get("commune_name") == null ? null : string(snapshot.get("commune_name")));
		address.setStateProvince(snapshot.get("province_name") == null ? null : string(snapshot.get("province_name")));
		address.setCountry("Việt Nam");
		address.setStartDate((java.util.Date) snapshot.get("address_as_of_date"));
		Context.getPersonService().savePersonAddress(address);
		evictAddressCache(patient);
	}

	/**
	 * Person.addresses is an inverse collection with a read-write second-level cache. Writes through
	 * PersonService do not invalidate it, so FHIR Patient reads kept returning the old address list
	 * (observed on Core 2.8.8). Flush, then evict the collection and owner explicitly.
	 */
	private void evictAddressCache(Patient patient) {
		Context.flushSession();
		sessionFactory.getCache().evictCollectionData(Person.class.getName() + ".addresses", patient.getPersonId());
		sessionFactory.getCache().evictEntityData(Person.class, patient.getPersonId());
		sessionFactory.getCache().evictEntityData(Patient.class, patient.getPatientId());
	}
	
	@Transactional
	public Map<String, Object> recordVitals(Map<String, Object> body) {
		requireDirectPrivilege(VITALS_PRIVILEGE);
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = Context.getEncounterService().getEncounterByUuid(requiredString(body, "encounter"));
		if (encounter == null)
			throw bad("encounter does not exist");
		if (!patient.getPatientId().equals(encounter.getPatient().getPatientId()))
			throw bad("encounter belongs to another patient");
		if (!"8368ff74-1b50-592b-8e78-2f0f2ddc1e06".equals(encounter.getEncounterType().getUuid()))
			throw bad("encounter is not a VinSHC vitals encounter");
		Map<String, Object> values = objectMap(body.get("values"));
		Map<String, Object> states = objectMap(body.get("states"));
		if (values.isEmpty() && states.isEmpty())
			throw bad("at least one value or state is required");
		for (String key : values.keySet())
			if (!VITAL_CONCEPTS.containsKey(key))
				throw bad("unknown vital field: " + key);
		for (String key : states.keySet())
			if (!VITAL_CONCEPTS.containsKey(key))
				throw bad("unknown vital state field: " + key);
		java.util.Date measuredAt = body.get("measuredAt") == null ? encounter.getEncounterDatetime()
		        : java.util.Date.from(parseInstant(string(body.get("measuredAt"))));
		
		Obs group = baseObs(patient, encounter, measuredAt, concept("7a7cebb3-1a82-5aab-975e-58d93c68eafc"));
		boolean needsVerification = false;
		for (String field : VITAL_CONCEPTS.keySet()) {
			boolean hasValue = values.containsKey(field) && values.get(field) != null;
			String state = states.containsKey(field) ? string(states.get(field)) : null;
			if (hasValue) {
				Object raw = values.get(field);
				if (!(raw instanceof Number) || raw instanceof Boolean)
					throw bad(field + " must be a JSON number");
				double value = ((Number) raw).doubleValue();
				if (!Double.isFinite(value))
					throw bad(field + " must be finite");
				if (POSITIVE_VITALS.contains(field) && value <= 0)
					throw bad(field + " must be > 0");
				if ("vitals.spo2".equals(field) && (value < 0 || value > 100))
					throw bad("vitals.spo2 must be between 0 and 100");
				if (state != null && !"recorded".equals(state))
					throw bad(field + " has a value so state must be recorded");
				Obs numeric = baseObs(patient, encounter, measuredAt, concept(VITAL_CONCEPTS.get(field)));
				numeric.setValueNumeric(value);
				group.addGroupMember(numeric);
				state = "recorded";
			} else if (state == null) {
				continue;
			} else if ("recorded".equals(state)) {
				throw bad(field + " state recorded requires a numeric value");
			}
			if (!STATUS_ANSWERS.containsKey(state))
				throw bad("invalid state for " + field);
			Obs statusObs = baseObs(patient, encounter, measuredAt, concept(STATUS_CONCEPTS.get(field)));
			statusObs.setValueCoded(concept(STATUS_ANSWERS.get(state)));
			group.addGroupMember(statusObs);
		}
		Object systolic = values.get("vitals.ha_tam_thu");
		Object diastolic = values.get("vitals.ha_tam_truong");
		if ((systolic != null) != (diastolic != null)) {
			String missing = systolic == null ? "vitals.ha_tam_thu" : "vitals.ha_tam_truong";
			if (!states.containsKey(missing) || "recorded".equals(string(states.get(missing))))
				throw bad("missing blood-pressure partner requires an explicit missing state");
		}
		if (systolic instanceof Number && diastolic instanceof Number
		        && ((Number) systolic).doubleValue() <= ((Number) diastolic).doubleValue())
			needsVerification = true;
		if (group.getGroupMembers().isEmpty())
			throw bad("no supported vital observations supplied");
		Obs saved = Context.getObsService().saveObs(group, "VinSHC validated vital-sign write");
		Map<String, Object> response = new LinkedHashMap<>();
		response.put("uuid", saved.getUuid());
		response.put("patient", patient.getUuid());
		response.put("encounter", encounter.getUuid());
		response.put("needsVerification", needsVerification);
		response.put("members", saved.getGroupMembers().stream().map(Obs::getUuid).collect(Collectors.toList()));
		return response;
	}
	
	private Obs baseObs(Patient patient, Encounter encounter, java.util.Date date, Concept concept) {
		Obs obs = new Obs();
		obs.setPerson(patient);
		obs.setEncounter(encounter);
		obs.setObsDatetime(date);
		obs.setLocation(encounter.getLocation());
		obs.setConcept(concept);
		return obs;
	}
	
	private Concept concept(String uuid) {
		Concept concept = Context.getConceptService().getConceptByUuid(uuid);
		if (concept == null)
			throw new IllegalStateException("required metadata concept missing: " + uuid);
		return concept;
	}
	
	private Patient resolvePatient(Map<String, Object> body, Map<String, Object> old) {
		String requestedUuid = optionalString(body, "patient");
		if (old == null)
			return patient(requiredString(body, "patient"));
		Patient stored = Context.getPatientService().getPatient(number(old.get("patient_id")).intValue());
		if (stored == null || stored.getVoided())
			throw bad("patient does not exist");
		if (requestedUuid != null && !stored.getUuid().equals(requestedUuid))
			throw bad("rowKey belongs to another patient");
		return stored;
	}
	
	private void assertContactUniqueness(int patientId, String rowKey, int priority, boolean primary) {
		Integer duplicatePriority = jdbc.queryForObject(
		    "SELECT count(*) FROM vinshc_contact WHERE patient_id=? AND priority=? AND row_key<>? AND is_current=true AND status='active'",
		    Integer.class, patientId, priority, rowKey);
		if (duplicatePriority != null && duplicatePriority > 0)
			throw bad("priority is already used by another active contact");
		if (primary) {
			Integer duplicatePrimary = jdbc.queryForObject(
			    "SELECT count(*) FROM vinshc_contact WHERE patient_id=? AND row_key<>? AND is_current=true AND status='active' AND is_primary=true",
			    Integer.class, patientId, rowKey);
			if (duplicatePrimary != null && duplicatePrimary > 0)
				throw bad("patient already has an active primary contact");
		}
	}
	
	private void assertOwnedRow(int patientId, String context, String rowKey) {
		if (rowKey == null || "identifier".equals(context))
			return;
		String table = "contact".equals(context) ? "vinshc_contact"
		        : "address".equals(context) ? "vinshc_address_snapshot" : null;
		if (table == null)
			return;
		Integer count = jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE patient_id=? AND row_key=?",
		    Integer.class, patientId, rowKey);
		if (count == null || count == 0)
			throw bad("rowKey does not belong to patient/context");
	}
	
	private void assertFieldHasNoValue(int patientId, String field, String context, String rowKey) {
		String table = null;
		String column = null;
		if ("contact".equals(context)) {
			table = "vinshc_contact";
			column = "contact.quan_he".equals(field) ? "relationship_code"
			        : "contact.dien_thoai".equals(field) ? "phone_raw"
			                : "contact.dia_chi".equals(field) ? "address_text" : null;
		} else if ("address".equals(context) && "patient.dia_chi".equals(field)) {
			table = "vinshc_address_snapshot";
			column = "address_text";
		}
		if (table == null || column == null)
			return;
		Integer count = jdbc.queryForObject("SELECT count(*) FROM " + table
		        + " WHERE patient_id=? AND row_key=? AND is_current=true AND " + column + " IS NOT NULL",
		    Integer.class, patientId, rowKey);
		if (count != null && count > 0)
			throw bad("fieldStates cannot coexist with a stored value");
	}
	
	private void clearStateWhenContactValueSupplied(int patientId, String rowKey, Map<String, Object> body, String property,
	        String fieldCode) {
		String snake = property.replaceAll("([A-Z])", "_$1").toLowerCase();
		if (hasNonNull(body, property, snake))
			clearCurrentState(patientId, fieldCode, "contact", rowKey);
	}
	
	private void clearCurrentState(int patientId, String fieldCode, String context, String rowKey) {
		jdbc.update(
		    "UPDATE vinshc_field_state SET is_current=false WHERE patient_id=? AND field_code=? AND context=? AND row_key=? AND is_current=true",
		    patientId, fieldCode, context, rowKey);
	}
	
	@SuppressWarnings("unchecked")
	private Map<String, Map<String, Object>> relationships() {
		if (relationshipRecords != null)
			return relationshipRecords;
		synchronized (this) {
			if (relationshipRecords != null)
				return relationshipRecords;
			String path = metadataPath("VINSHC_RELATIONSHIP_CATALOGUE", "contact-relationships.json");
			try {
				Map<String, Object> root = new ObjectMapper().readValue(new File(path),
				    new TypeReference<Map<String, Object>>() {});
				List<Map<String, Object>> items = (List<Map<String, Object>>) root.get("items");
				if (items == null || items.size() != 7 || !"1.0.0".equals(root.get("version")))
					throw new IllegalStateException("unexpected contact relationship catalogue");
				Map<String, Map<String, Object>> indexed = new LinkedHashMap<>();
				for (Map<String, Object> item : items)
					if (!Boolean.TRUE.equals(item.get("retired")) && item.get("effectiveTo") == null)
						indexed.put(string(item.get("code")), Collections.unmodifiableMap(item));
				relationshipRecords = Collections.unmodifiableMap(indexed);
				return relationshipRecords;
			}
			catch (Exception ex) {
				throw new IllegalStateException("cannot load contact relationship catalogue: " + path, ex);
			}
		}
	}
	
	@SuppressWarnings("unchecked")
	private Map<String, Map<String, Object>> fieldPolicies() {
		if (fieldPolicies != null)
			return fieldPolicies;
		synchronized (this) {
			if (fieldPolicies != null)
				return fieldPolicies;
			String path = metadataPath("VINSHC_METADATA_PACK", "pack.json");
			try {
				Map<String, Object> root = new ObjectMapper().readValue(new File(path),
				    new TypeReference<Map<String, Object>>() {});
				List<Map<String, Object>> fields = (List<Map<String, Object>>) root.get("fields");
				Map<String, Map<String, Object>> indexed = new LinkedHashMap<>();
				for (Map<String, Object> field : fields) {
					Object policy = field.get("b2Missing");
					if (policy instanceof Map)
						indexed.put(string(field.get("code")), Collections.unmodifiableMap((Map<String, Object>) policy));
				}
				if (indexed.size() != 37)
					throw new IllegalStateException("expected 37 B2 missing-state policies");
				fieldPolicies = Collections.unmodifiableMap(indexed);
				return fieldPolicies;
			}
			catch (Exception ex) {
				throw new IllegalStateException("cannot load B2 field policies: " + path, ex);
			}
		}
	}
	
	@SuppressWarnings("unchecked")
	private Map<String, Map<String, Object>> addresses() {
		if (addressRecords != null)
			return addressRecords;
		synchronized (this) {
			if (addressRecords != null)
				return addressRecords;
			String path = metadataPath("VINSHC_ADDRESS_CATALOGUE", "address-vn-19-2025.json");
			try {
				Map<String, Object> root = new ObjectMapper().readValue(new File(path),
				    new TypeReference<Map<String, Object>>() {});
				List<Map<String, Object>> records = (List<Map<String, Object>>) root.get("records");
				if (records == null || records.size() != 3355 || !CATALOGUE_VERSION.equals(root.get("version")))
					throw new IllegalStateException("unexpected address catalogue version/count");
				Map<String, Map<String, Object>> indexed = new LinkedHashMap<>();
				for (Map<String, Object> record : records)
					indexed.put(string(record.get("code")), Collections.unmodifiableMap(record));
				addressRecords = Collections.unmodifiableMap(indexed);
				return addressRecords;
			}
			catch (Exception ex) {
				throw new IllegalStateException("cannot load pinned address catalogue: " + path, ex);
			}
		}
	}
	
	private static String metadataPath(String environmentName, String fileName) {
		String path = System.getenv(environmentName);
		return path == null || path.isEmpty() ? "/openmrs/distribution/vinshc_metadata/" + fileName : path;
	}
	
	private Patient patient(String uuid) {
		Patient patient = Context.getPatientService().getPatientByUuid(uuid);
		if (patient == null || patient.getVoided())
			throw bad("patient does not exist");
		return patient;
	}
	
	static void requireDirectPrivilege(String privilege) {
		if (!Context.isAuthenticated() || Context.getAuthenticatedUser() == null
		        || !Context.getAuthenticatedUser().hasPrivilege(privilege))
			throw new APIAuthenticationException("Privileges required: " + privilege);
	}
	
	private Map<String, Object> current(String table, String keyColumn, String key) {
		List<Map<String, Object>> rows = jdbc
		        .queryForList("SELECT * FROM " + table + " WHERE " + keyColumn + "=? AND is_current=true", key);
		return rows.isEmpty() ? null : rows.get(0);
	}
	
	private Map<String, Object> requiredCurrent(String table, String rowKey) {
		Map<String, Object> row = current(table, "row_key", canonicalUuid(rowKey));
		if (row == null)
			throw bad("rowKey does not exist");
		return row;
	}
	
	private void close(String table, String idColumn, Object id) {
		jdbc.update("UPDATE " + table + " SET is_current=false WHERE " + idColumn + "=? AND is_current=true", id);
	}
	
	private int actor() {
		return Context.getAuthenticatedUser().getUserId();
	}
	
	private static Map<String, Object> merge(Map<String, Object> old, Map<String, Object> body) {
		Map<String, Object> out = new HashMap<>();
		if (old != null)
			out.putAll(old);
		out.putAll(body);
		return out;
	}
	
	@SuppressWarnings("unchecked")
	static Map<String, Object> objectMap(Object value) {
		if (value == null)
			return Collections.emptyMap();
		if (!(value instanceof Map))
			throw bad("values/states must be JSON objects");
		return (Map<String, Object>) value;
	}
	
	@SuppressWarnings("unchecked")
	private static String sourceValue(Map<String, Object> body, String key) {
		Object source = body.get("source");
		if (source instanceof Map && ((Map<String, Object>) source).get(key) != null)
			return string(((Map<String, Object>) source).get(key));
		String column = "documentUuid".equals(key) ? "source_document_uuid"
		        : "page".equals(key) ? "source_page"
		                : "sourceRowCode".equals(key) ? "source_row_code"
		                        : "sourceReference".equals(key) ? "source_reference" : key;
		return optionalString(body, column, key);
	}
	
	@SuppressWarnings("unchecked")
	private static String sourceKind(Map<String, Object> body) {
		Object source = body.get("source");
		String kind = source instanceof Map ? optionalString((Map<String, Object>) source, "kind")
		        : optionalString(body, "sourceKind", "source_kind");
		if (kind == null)
			kind = "api";
		if (!SOURCE_KINDS.contains(kind))
			throw bad("invalid source.kind");
		return kind;
	}
	
	private static void validateSource(Map<String, Object> body) {
		String kind = sourceKind(body);
		if ("paper".equals(kind) && (sourceValue(body, "documentUuid") == null || sourceValue(body, "page") == null))
			throw bad("paper source requires documentUuid and page");
		if (("legacy_import".equals(kind) || "migration".equals(kind)) && sourceValue(body, "sourceReference") == null)
			throw bad(kind + " source requires sourceReference");
		String documentUuid = sourceValue(body, "documentUuid");
		if (documentUuid != null)
			canonicalUuid(documentUuid);
		limit(sourceValue(body, "page"), 64, "source.page");
		limit(sourceValue(body, "sourceRowCode"), 255, "source.sourceRowCode");
		limit(sourceValue(body, "sourceReference"), 255, "source.sourceReference");
	}
	
	private static void requireNewRecordProvenance(Map<String, Object> body) {
		if (!(body.get("source") instanceof Map) && optionalString(body, "sourceKind", "source_kind") == null)
			throw bad("source is required");
		requiredString(body, "recordedAt");
	}
	
	private static Phone normalizePhone(String raw, boolean rejectInvalid) {
		if (raw == null || raw.trim().isEmpty())
			return new Phone(null, "missing");
		String parsed = raw.replaceAll("[ .()\u002D]", "");
		if (parsed.startsWith("0084"))
			parsed = "+84" + parsed.substring(4);
		else if (parsed.matches("0[1-9][0-9]{8,9}"))
			parsed = "+84" + parsed.substring(1);
		boolean valid = parsed.matches("\\+[1-9][0-9]{7,14}")
		        && (!parsed.startsWith("+84") || parsed.matches("\\+84[1-9][0-9]{8,9}"));
		if (!valid && rejectInvalid)
			throw bad("manual phone does not satisfy the B2 syntax contract");
		return new Phone(valid ? parsed : null, valid ? "normalized" : "needs_review");
	}
	
	private static Timestamp timestamp(Object preferred, Object fallback) {
		if (preferred != null)
			return Timestamp.from(parseInstant(string(preferred)));
		if (fallback instanceof java.util.Date)
			return new Timestamp(((java.util.Date) fallback).getTime());
		return Timestamp.from(Instant.now());
	}
	
	static Instant parseInstant(String value) {
		try {
			return OffsetDateTime.parse(value).toInstant();
		}
		catch (Exception ex) {
			throw bad("timestamp must be ISO-8601 with offset");
		}
	}
	
	static String canonicalUuid(String value) {
		try {
			return UUID.fromString(value).toString();
		}
		catch (Exception ex) {
			throw bad("rowKey must be a UUID");
		}
	}
	
	static String requiredString(Map<String, Object> map, String... keys) {
		String value = optionalString(map, keys);
		if (value == null || value.trim().isEmpty())
			throw bad(keys[0] + " is required");
		return value;
	}
	
	static String optionalString(Map<String, Object> map, String... keys) {
		for (String key : keys)
			if (map.containsKey(key) && map.get(key) != null)
				return string(map.get(key));
		return null;
	}
	
	private static int requiredInt(Map<String, Object> map, String key) {
		Object value = map.get(key);
		if (!(value instanceof Number))
			value = map.get(key.replaceAll("([A-Z])", "_$1").toLowerCase());
		if (!(value instanceof Number))
			throw bad(key + " must be an integer");
		return ((Number) value).intValue();
	}
	
	private static boolean bool(Map<String, Object> map, String camel, String snake, boolean fallback) {
		Object value = map.containsKey(camel) ? map.get(camel) : map.get(snake);
		return value == null ? fallback : Boolean.TRUE.equals(value);
	}
	
	private static boolean hasNonNull(Map<String, Object> map, String... keys) {
		for (String key : keys)
			if (map.containsKey(key) && map.get(key) != null)
				return true;
		return false;
	}
	
	static Number number(Object value) {
		return (Number) value;
	}
	
	static String string(Object value) {
		return String.valueOf(value);
	}
	
	static void limit(String value, int maximum, String field) {
		if (value != null && value.length() > maximum)
			throw bad(field + " exceeds " + maximum + " characters");
	}
	
	static IllegalArgumentException bad(String message) {
		return new IllegalArgumentException(message);
	}
	
	static Set<String> set(String... values) {
		return Collections.unmodifiableSet(Arrays.stream(values).collect(Collectors.toSet()));
	}
	
	static Map<String, String> map(String... values) {
		Map<String, String> map = new LinkedHashMap<>();
		for (int i = 0; i < values.length; i += 2)
			map.put(values[i], values[i + 1]);
		return Collections.unmodifiableMap(map);
	}
	
	private static final class Phone {
		
		final String value;
		
		final String status;
		
		Phone(String value, String status) {
			this.value = value;
			this.status = status;
		}
	}
}
