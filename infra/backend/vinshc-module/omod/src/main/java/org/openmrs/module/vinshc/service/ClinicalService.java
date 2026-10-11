package org.openmrs.module.vinshc.service;

import static org.openmrs.module.vinshc.service.VinshcService.bad;
import static org.openmrs.module.vinshc.service.VinshcService.canonicalUuid;
import static org.openmrs.module.vinshc.service.VinshcService.limit;
import static org.openmrs.module.vinshc.service.VinshcService.map;
import static org.openmrs.module.vinshc.service.VinshcService.objectMap;
import static org.openmrs.module.vinshc.service.VinshcService.optionalString;
import static org.openmrs.module.vinshc.service.VinshcService.requireDirectPrivilege;
import static org.openmrs.module.vinshc.service.VinshcService.requiredString;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.hibernate.SessionFactory;
import org.openmrs.Allergen;
import org.openmrs.AllergenType;
import org.openmrs.Allergy;
import org.openmrs.AllergyReaction;
import org.openmrs.CareSetting;
import org.openmrs.CodedOrFreeText;
import org.openmrs.Concept;
import org.openmrs.ConceptMap;
import org.openmrs.ConceptReferenceTerm;
import org.openmrs.ConceptSource;
import org.openmrs.ConditionVerificationStatus;
import org.openmrs.Diagnosis;
import org.openmrs.Drug;
import org.openmrs.DrugOrder;
import org.openmrs.Encounter;
import org.openmrs.EncounterRole;
import org.openmrs.Obs;
import org.openmrs.Order;
import org.openmrs.OrderFrequency;
import org.openmrs.OrderType;
import org.openmrs.Patient;
import org.openmrs.Provider;
import org.openmrs.SimpleDosingInstructions;
import org.openmrs.api.context.Context;
import org.springframework.transaction.annotation.Transactional;

/**
 * Validated B4 clinical writes. Consultation content stays native grouped Obs; diagnoses, allergies
 * and drug orders stay native OpenMRS objects. This layer enforces the VinSHC contract that Core
 * does not: history/allergy state coherence, finalization, catalogue membership and an audit event
 * per write. Catalogues are referenced through global properties so metadata can be delivered
 * without code changes; a missing catalogue is a configuration error (HTTP 503), never an
 * invitation to store free text.
 */
public class ClinicalService {
	
	public static final String READ_PRIVILEGE = "VinSHC: Read clinical record";
	
	public static final String CONSULTATION_PRIVILEGE = "VinSHC: Record consultation";
	
	public static final String FINALIZE_PRIVILEGE = "VinSHC: Finalize consultation";
	
	public static final String DIAGNOSIS_PRIVILEGE = "VinSHC: Record diagnosis";
	
	public static final String ALLERGY_PRIVILEGE = "VinSHC: Record allergy";
	
	public static final String PRESCRIBE_PRIVILEGE = "VinSHC: Prescribe medication";
	
	public static final String GP_ICD10_SOURCE = "vinshc.diagnosis.icd10ConceptSourceUuid";
	
	public static final String GP_ICD10_VERSION = "vinshc.diagnosis.icd10CatalogueVersion";
	
	public static final String GP_ALLERGEN_SET_PREFIX = "vinshc.allergy.allergenConceptSetUuid.";
	
	public static final String GP_REACTION_SET = "vinshc.allergy.reactionConceptSetUuid";
	
	public static final String GP_SEVERITY_SET = "vinshc.allergy.severityConceptSetUuid";
	
	public static final String GP_ALLOW_NON_CODED_ALLERGY = "vinshc.allergy.allowNonCoded";
	
	private static final String GP_DOSING_UNITS = "order.drugDosingUnitsConceptUuid";
	
	private static final String GP_ROUTES = "order.drugRoutesConceptUuid";
	
	private static final String GP_DURATION_UNITS = "order.durationUnitsConceptUuid";
	
	private static final String GP_DISPENSING_UNITS = "order.drugDispensingUnitsConceptUuid";
	
	private static final String CONSULTATION_ENCOUNTER_TYPE = "c3dba376-453f-5f2c-bee7-70c09a2d5f61";
	
	private static final String CLINICIAN_ROLE = "21dc99b5-a544-5c12-9dcc-3d12fe1d164b";
	
	private static final String CONSULTATION_GROUP = "7e49bbc6-53c8-59aa-b2f0-6e1f247d701b";
	
	private static final String OUTPATIENT_CARE_SETTING = "6f0c9a92-6f24-11e3-af88-005056821db0";
	
	private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
	
	private static final int TEXT_LIMIT = 4000;
	
	private static final Map<String, String> TEXT_FIELDS = map("visit.ly_do_kham", "ce6ac27d-a555-5ddd-bd82-6dd575066adc",
	    "history.benh_su", "c331d296-34b5-55ba-891f-094eadc1a2fc", "history.tien_su_ban_than",
	    "93f6d05e-cddd-5583-a22a-9f9e42ece100", "history.tien_su_gia_dinh", "4ebc119d-8d35-5473-9260-1c916d3b5bca",
	    "exam.trieu_chung", "7e32942f-1118-517c-ada7-4792b19ad7a5", "exam.toan_than", "796a194b-2788-5425-8246-2cfee4a22361",
	    "exam.bo_phan", "11b9a3fe-13aa-5b06-912a-da794a785771", "exam.tom_tat", "bd983586-db24-5e35-9822-d08ea8ebbf30",
	    "exam.huong_dieu_tri", "3c89f03a-d6b8-5dcc-941d-b57af6718eb2", "exam.loi_dan",
	    "d4b6c86d-4dd7-5339-b4de-2c75b267e2bd", "followup.loi_dan", "3dcc4c83-5342-5adc-87da-b8e9783bd367");
	
	private static final Map<String, String> STATUS_FIELDS = map("history.tien_su_ban_than_trang_thai",
	    "784c30c7-ccfc-5cf8-acb8-fbd50a583950", "history.tien_su_gia_dinh_trang_thai",
	    "93c7f2b7-2d10-5f92-a0c1-7ef3fa25a504", "allergy.trang_thai", "2351112f-d130-58d9-a55b-8d1f7d6872eb");
	
	private static final String FOLLOWUP_DATE = "followup.ngay_tai_kham";
	
	private static final String FOLLOWUP_DATE_CONCEPT = "16686840-88fc-514a-b30a-81bc1c7650c9";
	
	private static final Map<String, String> HISTORY_ANSWERS = map("not_asked", "8ea0e533-2ceb-58af-81df-36f941f3176e",
	    "none_reported", "43cebae2-7106-5c36-85f9-7bd21f8983fe", "present", "0c7202e7-5fc0-5825-8ef2-0a19409e9986",
	    "unknown", "7f353edf-c9d9-5975-9a6e-7dcec0f9cd53");
	
	private static final Map<String, String> ALLERGY_ANSWERS = map("not_asked", "49423217-efbd-5a55-958e-2d564725db06",
	    "no_known_allergy", "211345e1-bf3a-5520-a2d6-0cad885b5302", "present", "8c2a214d-1eb2-5918-b01d-4946a2c3d674",
	    "unknown", "dc642a73-0f1a-5b91-8709-7763ad1611e9");
	
	/** History status field → the text field it governs. */
	private static final Map<String, String> HISTORY_TEXT = map("history.tien_su_ban_than_trang_thai",
	    "history.tien_su_ban_than", "history.tien_su_gia_dinh_trang_thai", "history.tien_su_gia_dinh");
	
	private final SessionFactory sessionFactory;
	
	public ClinicalService(SessionFactory sessionFactory) {
		this.sessionFactory = sessionFactory;
	}
	
	// ---------------------------------------------------------------- consultation
	
	@Transactional
	public Map<String, Object> createConsultation(Map<String, Object> body) {
		requireDirectPrivilege(CONSULTATION_PRIVILEGE);
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = consultationEncounter(requiredString(body, "encounter"), patient);
		if (consultationGroup(encounter) != null)
			throw bad("encounter already has a consultation; correct the existing group instead");
		Map<String, Object> values = new LinkedHashMap<>();
		for (Map.Entry<String, Object> entry : objectMap(body.get("values")).entrySet())
			if (entry.getValue() != null)
				values.put(entry.getKey(), normalize(entry.getKey(), entry.getValue()));
		if (values.isEmpty())
			throw bad("at least one consultation value is required");
		validateConsultation(patient, encounter, values);
		Obs group = obs(patient, encounter, concept(CONSULTATION_GROUP));
		for (Map.Entry<String, Object> entry : values.entrySet())
			group.addGroupMember(member(patient, encounter, entry.getKey(), entry.getValue()));
		Obs saved = Context.getObsService().saveObs(group, null);
		event("consultation_created", patient, encounter, saved.getUuid(), null, String.join(",", values.keySet()));
		return consultationView(saved);
	}
	
	@Transactional
	public Map<String, Object> correctConsultation(String groupUuid, Map<String, Object> body) {
		requireDirectPrivilege(CONSULTATION_PRIVILEGE);
		Obs group = Context.getObsService().getObsByUuid(groupUuid);
		if (group == null || group.getVoided() || !CONSULTATION_GROUP.equals(group.getConcept().getUuid()))
			throw bad("consultation group does not exist");
		Encounter encounter = group.getEncounter();
		Patient patient = patient(encounter.getPatient().getUuid());
		boolean finalized = finalization(encounter) != null;
		String reason = reason(body, finalized, "finalized consultation corrections require reason");
		Map<String, Object> changes = objectMap(body.get("values"));
		if (changes.isEmpty())
			throw bad("at least one consultation change is required");
		Map<String, Obs> current = members(group);
		Map<String, Object> merged = values(current);
		for (Map.Entry<String, Object> entry : changes.entrySet()) {
			fieldConcept(entry.getKey());
			if (entry.getValue() == null)
				merged.remove(entry.getKey());
			else
				merged.put(entry.getKey(), normalize(entry.getKey(), entry.getValue()));
		}
		validateConsultation(patient, encounter, merged);
		if (finalized)
			validateFinal(patient, merged);
		String message = reason == null ? "VinSHC consultation correction" : reason;
		List<String> changed = new ArrayList<>();
		for (String key : changes.keySet()) {
			Obs old = current.get(key);
			Object next = merged.get(key);
			if (next == null) {
				if (old != null) {
					Context.getObsService().voidObs(old, message);
					changed.add(key);
				}
			} else if (old == null) {
				Obs added = member(patient, encounter, key, next);
				added.setObsGroup(group);
				Context.getObsService().saveObs(added, null);
				changed.add(key);
			} else if (!next.equals(decode(key, old))) {
				setValue(old, key, next);
				Context.getObsService().saveObs(old, message);
				changed.add(key);
			}
		}
		if (changed.isEmpty())
			throw bad("correction does not change any value");
		event("consultation_corrected", patient, encounter, group.getUuid(), reason, String.join(",", changed));
		Context.flushSession();
		Context.refreshEntity(group);
		return consultationView(group);
	}
	
	@Transactional
	public Map<String, Object> finalizeConsultation(String encounterUuid) {
		requireDirectPrivilege(FINALIZE_PRIVILEGE);
		Encounter encounter = encounter(encounterUuid);
		Patient patient = patient(encounter.getPatient().getUuid());
		consultationEncounter(encounterUuid, patient);
		if (finalization(encounter) != null)
			throw bad("consultation is already finalized");
		Obs group = consultationGroup(encounter);
		if (group == null)
			throw bad("encounter has no consultation to finalize");
		Map<String, Object> values = values(members(group));
		validateConsultation(patient, encounter, values);
		validateFinal(patient, values);
		long primary = activeDiagnoses(encounter).stream().filter(d -> Integer.valueOf(1).equals(d.getRank())).count();
		if (primary != 1)
			throw bad("finalization requires exactly one primary diagnosis");
		event("consultation_finalized", patient, encounter, group.getUuid(), null, null);
		return summary(encounterUuid);
	}
	
	@Transactional(readOnly = true)
	public Map<String, Object> summary(String encounterUuid) {
		requireDirectPrivilege(READ_PRIVILEGE);
		Encounter encounter = encounter(encounterUuid);
		Patient patient = encounter.getPatient();
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("encounterUuid", encounter.getUuid());
		result.put("patientUuid", patient.getUuid());
		result.put("visitUuid", encounter.getVisit() == null ? null : encounter.getVisit().getUuid());
		result.put("encounterDatetime", iso(encounter.getEncounterDatetime()));
		Map<String, Object> finalization = finalization(encounter);
		result.put("status", finalization == null ? "draft" : "final");
		result.put("finalization", finalization);
		Obs group = consultationGroup(encounter);
		result.put("consultation", group == null ? null : consultationView(group));
		result.put("diagnoses", activeDiagnoses(encounter).stream().map(this::diagnosisView).collect(Collectors.toList()));
		List<Map<String, Object>> orders = new ArrayList<>();
		for (Order order : encounter.getOrders())
			if (order instanceof DrugOrder && !order.getVoided() && order.getAction() == Order.Action.NEW)
				orders.add(drugOrderView((DrugOrder) order));
		result.put("drugOrders", orders);
		result.put("allergies", allergies(patient.getUuid()));
		result.put("events", events(encounter));
		return result;
	}
	
	private void validateConsultation(Patient patient, Encounter encounter, Map<String, Object> values) {
		for (Map.Entry<String, String> pair : HISTORY_TEXT.entrySet()) {
			Object status = values.get(pair.getKey());
			boolean hasText = values.get(pair.getValue()) != null;
			if (hasText && !"present".equals(status))
				throw bad(pair.getValue() + " requires " + pair.getKey() + "=present");
			if ("present".equals(status) && !hasText)
				throw bad(pair.getKey() + "=present requires " + pair.getValue());
		}
		if ("no_known_allergy".equals(values.get("allergy.trang_thai")) && !activeAllergies(patient).isEmpty())
			throw bad("allergy.trang_thai=no_known_allergy contradicts active allergies; void them first");
		Object followup = values.get(FOLLOWUP_DATE);
		if (followup != null && ((LocalDate) followup).isBefore(localDate(encounter.getEncounterDatetime())))
			throw bad(FOLLOWUP_DATE + " cannot be before the encounter date");
	}
	
	private void validateFinal(Patient patient, Map<String, Object> values) {
		if (values.get("visit.ly_do_kham") == null)
			throw bad("finalization requires visit.ly_do_kham");
		Object allergy = values.get("allergy.trang_thai");
		if (allergy == null)
			throw bad("finalization requires allergy.trang_thai");
		if ("present".equals(allergy) && activeAllergies(patient).isEmpty())
			throw bad("allergy.trang_thai=present requires at least one active allergy record");
	}
	
	private Object normalize(String key, Object raw) {
		fieldConcept(key);
		if (!(raw instanceof String))
			throw bad(key + " must be a JSON string");
		String value = ((String) raw).trim();
		if (value.isEmpty())
			throw bad(key + " must not be blank; omit it or record a missing state instead");
		if (TEXT_FIELDS.containsKey(key)) {
			limit(value, TEXT_LIMIT, key);
			return value;
		}
		if (STATUS_FIELDS.containsKey(key)) {
			if (!answers(key).containsKey(value))
				throw bad("invalid " + key + ": " + value);
			return value;
		}
		try {
			return LocalDate.parse(value);
		}
		catch (DateTimeParseException ex) {
			throw bad(key + " must be an ISO date (yyyy-MM-dd)");
		}
	}
	
	private static String fieldConcept(String key) {
		if (TEXT_FIELDS.containsKey(key))
			return TEXT_FIELDS.get(key);
		if (STATUS_FIELDS.containsKey(key))
			return STATUS_FIELDS.get(key);
		if (FOLLOWUP_DATE.equals(key))
			return FOLLOWUP_DATE_CONCEPT;
		throw bad("unknown consultation field: " + key);
	}
	
	private static Map<String, String> answers(String key) {
		return "allergy.trang_thai".equals(key) ? ALLERGY_ANSWERS : HISTORY_ANSWERS;
	}
	
	private Obs member(Patient patient, Encounter encounter, String key, Object value) {
		Obs member = obs(patient, encounter, concept(fieldConcept(key)));
		setValue(member, key, value);
		return member;
	}
	
	private void setValue(Obs obs, String key, Object value) {
		if (TEXT_FIELDS.containsKey(key))
			obs.setValueText((String) value);
		else if (STATUS_FIELDS.containsKey(key))
			obs.setValueCoded(concept(answers(key).get(value)));
		else
			obs.setValueDatetime(java.util.Date.from(((LocalDate) value).atStartOfDay(ZoneId.systemDefault()).toInstant()));
	}
	
	private static Object decode(String key, Obs obs) {
		if (TEXT_FIELDS.containsKey(key))
			return obs.getValueText();
		if (STATUS_FIELDS.containsKey(key)) {
			String uuid = obs.getValueCoded() == null ? null : obs.getValueCoded().getUuid();
			for (Map.Entry<String, String> answer : answers(key).entrySet())
				if (answer.getValue().equals(uuid))
					return answer.getKey();
			return null;
		}
		return obs.getValueDatetime() == null ? null : localDate(obs.getValueDatetime());
	}
	
	private static Map<String, Obs> members(Obs group) {
		Map<String, String> byConcept = new LinkedHashMap<>();
		for (String key : TEXT_FIELDS.keySet())
			byConcept.put(TEXT_FIELDS.get(key), key);
		for (String key : STATUS_FIELDS.keySet())
			byConcept.put(STATUS_FIELDS.get(key), key);
		byConcept.put(FOLLOWUP_DATE_CONCEPT, FOLLOWUP_DATE);
		Map<String, Obs> members = new LinkedHashMap<>();
		for (Obs member : group.getGroupMembers(false)) {
			String key = byConcept.get(member.getConcept().getUuid());
			if (key != null)
				members.put(key, member);
		}
		return members;
	}
	
	private static Map<String, Object> values(Map<String, Obs> members) {
		Map<String, Object> values = new LinkedHashMap<>();
		for (Map.Entry<String, Obs> entry : members.entrySet()) {
			Object value = decode(entry.getKey(), entry.getValue());
			if (value != null)
				values.put(entry.getKey(), value);
		}
		return values;
	}
	
	private Map<String, Object> consultationView(Obs group) {
		Map<String, Object> view = new LinkedHashMap<>();
		view.put("groupUuid", group.getUuid());
		view.put("encounterUuid", group.getEncounter().getUuid());
		view.put("patientUuid", group.getPerson().getUuid());
		Map<String, Object> values = new LinkedHashMap<>();
		Map<String, String> memberUuids = new LinkedHashMap<>();
		for (Map.Entry<String, Obs> entry : members(group).entrySet()) {
			Object value = decode(entry.getKey(), entry.getValue());
			values.put(entry.getKey(), value instanceof LocalDate ? value.toString() : value);
			memberUuids.put(entry.getKey(), entry.getValue().getUuid());
		}
		view.put("values", values);
		view.put("memberUuids", memberUuids);
		return view;
	}
	
	private static Obs consultationGroup(Encounter encounter) {
		for (Obs obs : encounter.getObsAtTopLevel(false))
			if (CONSULTATION_GROUP.equals(obs.getConcept().getUuid()))
				return obs;
		return null;
	}
	
	private static Encounter consultationEncounter(String uuid, Patient patient) {
		Encounter encounter = encounter(uuid);
		if (!patient.getPatientId().equals(encounter.getPatient().getPatientId()))
			throw bad("encounter belongs to another patient");
		if (!CONSULTATION_ENCOUNTER_TYPE.equals(encounter.getEncounterType().getUuid()))
			throw bad("encounter is not a VinSHC consultation encounter");
		return encounter;
	}
	
	// ---------------------------------------------------------------- diagnosis
	
	@Transactional
	public Map<String, Object> recordDiagnosis(Map<String, Object> body) {
		requireDirectPrivilege(DIAGNOSIS_PRIVILEGE);
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = consultationEncounter(requiredString(body, "encounter"), patient);
		String reason = reason(body, finalization(encounter) != null, "diagnosis changes after finalization require reason");
		Diagnosis diagnosis = buildDiagnosis(patient, encounter, body, null);
		Diagnosis saved = Context.getDiagnosisService().save(diagnosis);
		event("diagnosis_recorded", patient, encounter, saved.getUuid(), reason, icd10Code(saved.getDiagnosis().getCoded()));
		return diagnosisView(saved);
	}
	
	@Transactional
	public Map<String, Object> replaceDiagnosis(String uuid, Map<String, Object> body) {
		requireDirectPrivilege(DIAGNOSIS_PRIVILEGE);
		Diagnosis old = activeDiagnosis(uuid);
		String reason = reason(body, true, "diagnosis replacement requires reason");
		Map<String, Object> merged = new LinkedHashMap<>();
		merged.put("concept", old.getDiagnosis().getCoded().getUuid());
		merged.put("rank", Integer.valueOf(1).equals(old.getRank()) ? "primary" : "secondary");
		merged.put("certainty", old.getCertainty().name().toLowerCase(Locale.ROOT));
		merged.putAll(body);
		Patient patient = old.getPatient();
		Encounter encounter = old.getEncounter();
		Diagnosis replacement = buildDiagnosis(patient, encounter, merged, old);
		Context.getDiagnosisService().voidDiagnosis(old, reason);
		Diagnosis saved = Context.getDiagnosisService().save(replacement);
		event("diagnosis_replaced", patient, encounter, saved.getUuid(), reason, "replaces " + old.getUuid());
		return diagnosisView(saved);
	}
	
	@Transactional
	public Map<String, Object> voidDiagnosis(String uuid, String reason) {
		requireDirectPrivilege(DIAGNOSIS_PRIVILEGE);
		Diagnosis old = activeDiagnosis(uuid);
		String why = requiredReason(reason);
		if (Integer.valueOf(1).equals(old.getRank()) && finalization(old.getEncounter()) != null)
			throw bad("a finalized consultation must keep its primary diagnosis; replace it instead");
		Diagnosis voided = Context.getDiagnosisService().voidDiagnosis(old, why);
		event("diagnosis_voided", old.getPatient(), old.getEncounter(), old.getUuid(), why, null);
		return diagnosisView(voided);
	}
	
	private Diagnosis buildDiagnosis(Patient patient, Encounter encounter, Map<String, Object> body, Diagnosis replacing) {
		if (body.containsKey("nonCoded"))
			throw bad("free-text diagnosis is not accepted; choose an ICD-10 catalogue concept");
		Concept concept = Context.getConceptService().getConceptByUuid(requiredString(body, "concept"));
		if (concept == null || concept.getRetired())
			throw bad("diagnosis concept does not exist or is retired");
		icd10Code(concept);
		String rankCode = requiredString(body, "rank");
		if (!"primary".equals(rankCode) && !"secondary".equals(rankCode))
			throw bad("rank must be primary or secondary");
		int rank = "primary".equals(rankCode) ? 1 : 2;
		ConditionVerificationStatus certainty;
		try {
			certainty = ConditionVerificationStatus.valueOf(requiredString(body, "certainty").toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException ex) {
			throw bad("certainty must be provisional or confirmed");
		}
		for (Diagnosis existing : activeDiagnoses(encounter)) {
			if (replacing != null && existing.getUuid().equals(replacing.getUuid()))
				continue;
			if (existing.getDiagnosis().getCoded() != null
			        && existing.getDiagnosis().getCoded().getUuid().equals(concept.getUuid()))
				throw bad("encounter already has this diagnosis");
			if (rank == 1 && Integer.valueOf(1).equals(existing.getRank()))
				throw bad("encounter already has a primary diagnosis; replace or demote it first");
		}
		return new Diagnosis(encounter, new CodedOrFreeText(concept, null, null), certainty, rank, patient);
	}
	
	private static Diagnosis activeDiagnosis(String uuid) {
		Diagnosis diagnosis = Context.getDiagnosisService().getDiagnosisByUuid(uuid);
		if (diagnosis == null || diagnosis.getVoided())
			throw bad("diagnosis does not exist");
		return diagnosis;
	}
	
	private static List<Diagnosis> activeDiagnoses(Encounter encounter) {
		List<Diagnosis> result = new ArrayList<>();
		for (Diagnosis diagnosis : Context.getDiagnosisService().getDiagnosesByEncounter(encounter, false, false))
			if (!diagnosis.getVoided())
				result.add(diagnosis);
		return result;
	}
	
	private static ConceptSource icd10Source() {
		String uuid = globalProperty(GP_ICD10_SOURCE);
		if (uuid == null || globalProperty(GP_ICD10_VERSION) == null)
			throw new IllegalStateException(
			        "ICD-10 catalogue not configured: set " + GP_ICD10_SOURCE + " and " + GP_ICD10_VERSION);
		ConceptSource source = Context.getConceptService().getConceptSourceByUuid(uuid);
		if (source == null || source.getRetired())
			throw new IllegalStateException("configured ICD-10 concept source does not exist: " + uuid);
		return source;
	}
	
	private static String icd10Code(Concept concept) {
		ConceptSource source = icd10Source();
		for (ConceptMap map : concept.getConceptMappings()) {
			ConceptReferenceTerm term = map.getConceptReferenceTerm();
			if (term != null && !term.getRetired() && source.equals(term.getConceptSource())
			        && map.getConceptMapType() != null && "SAME-AS".equalsIgnoreCase(map.getConceptMapType().getName()))
				return term.getCode();
		}
		throw bad("diagnosis concept has no SAME-AS mapping in the configured ICD-10 source");
	}
	
	private Map<String, Object> diagnosisView(Diagnosis diagnosis) {
		Map<String, Object> view = new LinkedHashMap<>();
		Concept coded = diagnosis.getDiagnosis().getCoded();
		view.put("uuid", diagnosis.getUuid());
		view.put("patientUuid", diagnosis.getPatient().getUuid());
		view.put("encounterUuid", diagnosis.getEncounter().getUuid());
		view.put("concept", ref(coded));
		String code = null;
		Map<String, Object> system = new LinkedHashMap<>();
		try {
			ConceptSource source = icd10Source();
			code = icd10Code(coded);
			system.put("uuid", source.getUuid());
			system.put("name", source.getName());
			system.put("uri", source.getUniqueId());
			system.put("version", globalProperty(GP_ICD10_VERSION));
		}
		catch (RuntimeException ex) {
			system = null;
		}
		view.put("code", code);
		view.put("system", system);
		view.put("rank", Integer.valueOf(1).equals(diagnosis.getRank()) ? "primary" : "secondary");
		view.put("certainty",
		    diagnosis.getCertainty() == null ? null : diagnosis.getCertainty().name().toLowerCase(Locale.ROOT));
		view.put("voided", diagnosis.getVoided());
		view.put("voidReason", diagnosis.getVoidReason());
		view.put("dateCreated", iso(diagnosis.getDateCreated()));
		return view;
	}
	
	// ---------------------------------------------------------------- allergy
	
	@Transactional
	public Map<String, Object> recordAllergy(Map<String, Object> body) {
		requireDirectPrivilege(ALLERGY_PRIVILEGE);
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = null;
		String encounterUuid = optionalString(body, "encounter");
		if (encounterUuid != null) {
			encounter = encounter(encounterUuid);
			if (!patient.getPatientId().equals(encounter.getPatient().getPatientId()))
				throw bad("encounter belongs to another patient");
		}
		AllergenType type;
		try {
			type = AllergenType.valueOf(requiredString(body, "allergenType").toUpperCase(Locale.ROOT));
		}
		catch (IllegalArgumentException ex) {
			throw bad("allergenType must be DRUG, FOOD, ENVIRONMENT or OTHER");
		}
		Map<String, Object> allergenBody = objectMap(body.get("allergen"));
		Allergen allergen;
		String allergenConcept = optionalString(allergenBody, "concept");
		String allergenText = optionalString(allergenBody, "nonCoded");
		if ((allergenConcept == null) == (allergenText == null))
			throw bad("allergen requires exactly one of concept or nonCoded");
		if (allergenConcept != null) {
			if (type == AllergenType.OTHER)
				throw bad("coded allergens must use DRUG, FOOD or ENVIRONMENT");
			Concept set = conceptSet(GP_ALLERGEN_SET_PREFIX + type.name().toLowerCase(Locale.ROOT));
			allergen = new Allergen(type, setMember(set, allergenConcept, "allergen.concept"), null);
		} else {
			requireNonCodedAllowed();
			allergen = new Allergen(type, otherNonCodedConcept(), boundedText(allergenText, 255, "allergen.nonCoded"));
		}
		for (Allergy existing : activeAllergies(patient))
			if (existing.getAllergen().isSameAllergen(allergen))
				throw bad("patient already has an active allergy for this allergen");
		Allergy allergy = new Allergy();
		allergy.setPatient(patient);
		allergy.setAllergen(allergen);
		allergy.setEncounter(encounter);
		String severity = optionalString(body, "severity");
		if (severity != null)
			allergy.setSeverity(setMember(conceptSet(GP_SEVERITY_SET), severity, "severity"));
		String comment = optionalString(body, "comment");
		if (comment != null)
			allergy.setComments(boundedText(comment, 1024, "comment"));
		List<String> seenReactions = new ArrayList<>();
		Object reactions = body.get("reactions");
		if (reactions != null && !(reactions instanceof List))
			throw bad("reactions must be a JSON array");
		if (reactions != null)
			for (Object item : (List<?>) reactions) {
				Map<String, Object> reaction = objectMap(item);
				String conceptUuid = optionalString(reaction, "concept");
				String text = optionalString(reaction, "nonCoded");
				if ((conceptUuid == null) == (text == null))
					throw bad("each reaction requires exactly one of concept or nonCoded");
				String identity = conceptUuid != null ? conceptUuid : "text:" + text.trim().toLowerCase(Locale.ROOT);
				if (seenReactions.contains(identity))
					throw bad("duplicate reaction");
				seenReactions.add(identity);
				if (conceptUuid != null) {
					allergy.addReaction(
					    new AllergyReaction(allergy, setMember(conceptSet(GP_REACTION_SET), conceptUuid, "reaction"), null));
				} else {
					requireNonCodedAllowed();
					allergy.addReaction(
					    new AllergyReaction(allergy, otherNonCodedConcept(), boundedText(text, 255, "reaction.nonCoded")));
				}
			}
		Context.getPatientService().saveAllergy(allergy);
		event("allergy_recorded", patient, encounter, allergy.getUuid(), null, type.name());
		return allergyView(allergy);
	}
	
	@Transactional
	public Map<String, Object> voidAllergy(String uuid, String reason) {
		requireDirectPrivilege(ALLERGY_PRIVILEGE);
		Allergy allergy = Context.getPatientService().getAllergyByUuid(uuid);
		if (allergy == null || allergy.getVoided())
			throw bad("allergy does not exist");
		String why = requiredReason(reason);
		Context.getPatientService().voidAllergy(allergy, why);
		event("allergy_voided", allergy.getPatient(), allergy.getEncounter(), allergy.getUuid(), why, null);
		return allergyView(allergy);
	}
	
	@Transactional(readOnly = true)
	public Map<String, Object> allergies(String patientUuid) {
		requireDirectPrivilege(READ_PRIVILEGE);
		Patient patient = patient(patientUuid);
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("patientUuid", patient.getUuid());
		result.put("allergies", activeAllergies(patient).stream().map(this::allergyView).collect(Collectors.toList()));
		return result;
	}
	
	private static List<Allergy> activeAllergies(Patient patient) {
		List<Allergy> result = new ArrayList<>();
		for (Allergy allergy : Context.getPatientService().getAllergies(patient))
			if (!allergy.getVoided())
				result.add(allergy);
		return result;
	}
	
	private static void requireNonCodedAllowed() {
		if (!"true".equalsIgnoreCase(globalProperty(GP_ALLOW_NON_CODED_ALLERGY)))
			throw bad("non-coded allergy text is not permitted until facility policy sets " + GP_ALLOW_NON_CODED_ALLERGY
			        + "=true");
	}
	
	private static Concept otherNonCodedConcept() {
		Concept concept = Context.getConceptService().getConceptByUuid(Allergen.getOtherNonCodedConceptUuid());
		if (concept == null)
			throw new IllegalStateException("allergy.concept.otherNonCoded concept is missing");
		return concept;
	}
	
	private Map<String, Object> allergyView(Allergy allergy) {
		Map<String, Object> view = new LinkedHashMap<>();
		view.put("uuid", allergy.getUuid());
		view.put("patientUuid", allergy.getPatient().getUuid());
		view.put("encounterUuid", allergy.getEncounter() == null ? null : allergy.getEncounter().getUuid());
		view.put("allergenType", allergy.getAllergen().getAllergenType().name());
		Map<String, Object> allergen = new LinkedHashMap<>();
		if (allergy.getAllergen().isCoded())
			allergen.put("concept", ref(allergy.getAllergen().getCodedAllergen()));
		else
			allergen.put("nonCoded", allergy.getAllergen().getNonCodedAllergen());
		view.put("allergen", allergen);
		view.put("severity", ref(allergy.getSeverity()));
		List<Map<String, Object>> reactions = new ArrayList<>();
		for (AllergyReaction reaction : allergy.getReactions()) {
			Map<String, Object> item = new LinkedHashMap<>();
			if (reaction.getReactionNonCoded() != null)
				item.put("nonCoded", reaction.getReactionNonCoded());
			else
				item.put("concept", ref(reaction.getReaction()));
			reactions.add(item);
		}
		view.put("reactions", reactions);
		view.put("comment", allergy.getComments());
		view.put("voided", allergy.getVoided());
		view.put("voidReason", allergy.getVoidReason());
		return view;
	}
	
	// ---------------------------------------------------------------- drug order
	
	@Transactional
	public Map<String, Object> prescribe(Map<String, Object> body) {
		requireDirectPrivilege(PRESCRIBE_PRIVILEGE);
		Patient patient = patient(requiredString(body, "patient"));
		Encounter encounter = consultationEncounter(requiredString(body, "encounter"), patient);
		Provider orderer = clinician(encounter, requiredString(body, "orderer"));
		Drug drug = Context.getConceptService().getDrugByUuid(requiredString(body, "drug"));
		if (drug == null || drug.getRetired() || drug.getConcept() == null)
			throw bad("drug does not exist or is retired");
		DrugOrder order = new DrugOrder();
		order.setPatient(patient);
		order.setEncounter(encounter);
		order.setOrderer(orderer);
		order.setDrug(drug);
		order.setConcept(drug.getConcept());
		order.setCareSetting(outpatient());
		order.setOrderType(drugOrderType());
		order.setDosingType(SimpleDosingInstructions.class);
		order.setDose(positive(body, "dose"));
		order.setDoseUnits(setMember(conceptSet(GP_DOSING_UNITS), requiredString(body, "doseUnits"), "doseUnits"));
		order.setRoute(setMember(conceptSet(GP_ROUTES), requiredString(body, "route"), "route"));
		OrderFrequency frequency = Context.getOrderService().getOrderFrequencyByUuid(requiredString(body, "frequency"));
		if (frequency == null || frequency.getRetired())
			throw bad("frequency does not exist or is retired");
		order.setFrequency(frequency);
		Object duration = body.get("duration");
		if (duration != null) {
			int days = integer(duration, "duration");
			if (days < 1 || days > 3650)
				throw bad("duration must be between 1 and 3650");
			order.setDuration(days);
			order.setDurationUnits(
			    setMember(conceptSet(GP_DURATION_UNITS), requiredString(body, "durationUnits"), "durationUnits"));
		} else if (body.get("durationUnits") != null) {
			throw bad("durationUnits requires duration");
		}
		order.setQuantity(positive(body, "quantity"));
		order.setQuantityUnits(
		    setMember(conceptSet(GP_DISPENSING_UNITS), requiredString(body, "quantityUnits"), "quantityUnits"));
		int refills = body.get("numRefills") == null ? 0 : integer(body.get("numRefills"), "numRefills");
		if (refills < 0 || refills > 12)
			throw bad("numRefills must be between 0 and 12");
		order.setNumRefills(refills);
		boolean asNeeded = Boolean.TRUE.equals(body.get("asNeeded"));
		order.setAsNeeded(asNeeded);
		String asNeededCondition = optionalString(body, "asNeededCondition");
		if (asNeededCondition != null && !asNeeded)
			throw bad("asNeededCondition requires asNeeded=true");
		if (asNeededCondition != null)
			order.setAsNeededCondition(boundedText(asNeededCondition, 255, "asNeededCondition"));
		String instructions = optionalString(body, "dosingInstructions");
		if (instructions != null)
			order.setDosingInstructions(boundedText(instructions, 1024, "dosingInstructions"));
		
		for (Order active : Context.getOrderService().getActiveOrders(patient, drugOrderType(), outpatient(), null))
			if (active.getConcept().equals(drug.getConcept()))
				throw bad("patient already has an active order for this drug; discontinue it first");
		Allergy conflict = null;
		for (Allergy allergy : activeAllergies(patient))
			if (allergy.getAllergen().getAllergenType() == AllergenType.DRUG && allergy.getAllergen().isCoded()
			        && allergy.getAllergen().getCodedAllergen().equals(drug.getConcept()))
				conflict = allergy;
		String override = optionalString(body, "allergyOverrideReason");
		if (conflict != null && (override == null || override.trim().length() < 5))
			throw bad("drug matches active allergy " + conflict.getUuid() + "; allergyOverrideReason is required");
		if (conflict == null && override != null)
			throw bad("allergyOverrideReason is only accepted when the drug matches an active allergy");
		
		DrugOrder saved = (DrugOrder) Context.getOrderService().saveOrder(order, null);
		event("drug_order_created", patient, encounter, saved.getUuid(), null, drug.getUuid());
		if (conflict != null)
			event("drug_order_allergy_override", patient, encounter, saved.getUuid(),
			    boundedText(override, 1000, "allergyOverrideReason"), "allergy " + conflict.getUuid());
		return drugOrderView(saved);
	}
	
	@Transactional
	public Map<String, Object> discontinue(String uuid, Map<String, Object> body) {
		requireDirectPrivilege(PRESCRIBE_PRIVILEGE);
		Order order = Context.getOrderService().getOrderByUuid(uuid);
		if (!(order instanceof DrugOrder) || order.getVoided())
			throw bad("drug order does not exist");
		if (!order.isActive())
			throw bad("drug order is not active");
		String reason = requiredReason(optionalString(body, "reason"));
		Provider orderer = clinician(order.getEncounter(), requiredString(body, "orderer"));
		Order stop;
		try {
			stop = Context.getOrderService().discontinueOrder(order, reason, null, orderer, order.getEncounter());
		}
		catch (Exception ex) {
			throw bad("cannot discontinue order: " + ex.getMessage());
		}
		event("drug_order_discontinued", order.getPatient(), order.getEncounter(), order.getUuid(), reason,
		    "discontinuation " + stop.getUuid());
		Map<String, Object> view = drugOrderView((DrugOrder) order);
		view.put("discontinuationOrderUuid", stop.getUuid());
		return view;
	}
	
	private static Provider clinician(Encounter encounter, String providerUuid) {
		Provider provider = Context.getProviderService().getProviderByUuid(providerUuid);
		if (provider == null || provider.getRetired())
			throw bad("orderer provider does not exist");
		EncounterRole role = Context.getEncounterService().getEncounterRoleByUuid(CLINICIAN_ROLE);
		if (role == null)
			throw new IllegalStateException("clinician encounter role metadata missing");
		if (!encounter.getProvidersByRole(role).contains(provider))
			throw bad("orderer must be the clinician recorded on the consultation encounter");
		return provider;
	}
	
	private static CareSetting outpatient() {
		CareSetting setting = Context.getOrderService().getCareSettingByUuid(OUTPATIENT_CARE_SETTING);
		if (setting == null)
			throw new IllegalStateException("outpatient care setting missing");
		return setting;
	}
	
	private static OrderType drugOrderType() {
		OrderType type = Context.getOrderService().getOrderTypeByUuid(OrderType.DRUG_ORDER_TYPE_UUID);
		if (type == null)
			throw new IllegalStateException("drug order type missing");
		return type;
	}
	
	private Map<String, Object> drugOrderView(DrugOrder order) {
		Map<String, Object> view = new LinkedHashMap<>();
		view.put("uuid", order.getUuid());
		view.put("orderNumber", order.getOrderNumber());
		view.put("patientUuid", order.getPatient().getUuid());
		view.put("encounterUuid", order.getEncounter().getUuid());
		Map<String, Object> drug = new LinkedHashMap<>();
		drug.put("uuid", order.getDrug().getUuid());
		drug.put("name", order.getDrug().getName());
		drug.put("strength", order.getDrug().getStrength());
		drug.put("concept", ref(order.getDrug().getConcept()));
		view.put("drug", drug);
		view.put("dose", order.getDose());
		view.put("doseUnits", ref(order.getDoseUnits()));
		view.put("route", ref(order.getRoute()));
		Map<String, Object> frequency = new LinkedHashMap<>();
		frequency.put("uuid", order.getFrequency().getUuid());
		frequency.put("display", order.getFrequency().getConcept().getDisplayString());
		frequency.put("frequencyPerDay", order.getFrequency().getFrequencyPerDay());
		view.put("frequency", frequency);
		view.put("duration", order.getDuration());
		view.put("durationUnits", ref(order.getDurationUnits()));
		view.put("quantity", order.getQuantity());
		view.put("quantityUnits", ref(order.getQuantityUnits()));
		view.put("numRefills", order.getNumRefills());
		view.put("asNeeded", order.getAsNeeded());
		view.put("asNeededCondition", order.getAsNeededCondition());
		view.put("dosingInstructions", order.getDosingInstructions());
		Map<String, Object> orderer = new LinkedHashMap<>();
		orderer.put("uuid", order.getOrderer().getUuid());
		orderer.put("identifier", order.getOrderer().getIdentifier());
		orderer.put("display",
		    order.getOrderer().getPerson() == null ? order.getOrderer().getName()
		            : order.getOrderer().getPerson().getPersonName() == null ? null
		                    : order.getOrderer().getPerson().getPersonName().getFullName());
		view.put("orderer", orderer);
		view.put("dateActivated", iso(order.getDateActivated()));
		view.put("autoExpireDate", iso(order.getAutoExpireDate()));
		view.put("dateStopped", iso(order.getDateStopped()));
		String status = order.getVoided() ? "voided"
		        : order.getDateStopped() != null ? "discontinued" : order.isExpired() ? "expired" : "active";
		view.put("status", status);
		return view;
	}
	
	// ---------------------------------------------------------------- configuration readiness
	
	@Transactional(readOnly = true)
	public Map<String, Object> configurationStatus() {
		requireDirectPrivilege(READ_PRIVILEGE);
		Map<String, Object> status = new LinkedHashMap<>();
		Map<String, Object> diagnosis = new LinkedHashMap<>();
		diagnosis.put(GP_ICD10_SOURCE, globalProperty(GP_ICD10_SOURCE));
		diagnosis.put(GP_ICD10_VERSION, globalProperty(GP_ICD10_VERSION));
		diagnosis.put("ready", ready(() -> icd10Source()));
		status.put("diagnosis", diagnosis);
		Map<String, Object> allergy = new LinkedHashMap<>();
		for (String type : new String[] { "drug", "food", "environment" })
			allergy.put(GP_ALLERGEN_SET_PREFIX + type, setStatus(GP_ALLERGEN_SET_PREFIX + type));
		allergy.put(GP_REACTION_SET, setStatus(GP_REACTION_SET));
		allergy.put(GP_SEVERITY_SET, setStatus(GP_SEVERITY_SET));
		allergy.put(GP_ALLOW_NON_CODED_ALLERGY, "true".equalsIgnoreCase(globalProperty(GP_ALLOW_NON_CODED_ALLERGY)));
		status.put("allergy", allergy);
		Map<String, Object> orders = new LinkedHashMap<>();
		for (String gp : new String[] { GP_DOSING_UNITS, GP_ROUTES, GP_DURATION_UNITS, GP_DISPENSING_UNITS })
			orders.put(gp, setStatus(gp));
		orders.put("orderFrequencies", Context.getOrderService().getOrderFrequencies(false).size());
		orders.put("drugs", Context.getConceptService().getAllDrugs(false).size());
		status.put("drugOrder", orders);
		return status;
	}
	
	private static Map<String, Object> setStatus(String gp) {
		Map<String, Object> status = new LinkedHashMap<>();
		status.put("conceptUuid", globalProperty(gp));
		Object members;
		try {
			members = conceptSet(gp).getSetMembers().size();
		}
		catch (IllegalStateException ex) {
			members = null;
		}
		status.put("members", members);
		status.put("ready", members instanceof Integer && (Integer) members > 0);
		return status;
	}
	
	private static boolean ready(Runnable check) {
		try {
			check.run();
			return true;
		}
		catch (RuntimeException ex) {
			return false;
		}
	}
	
	// ---------------------------------------------------------------- audit events
	
	private void event(String type, Patient patient, Encounter encounter, String entityUuid, String reason, String detail) {
		Integer patientId = patient.getPatientId();
		Integer encounterId = encounter == null ? null : encounter.getEncounterId();
		Integer creator = Context.getAuthenticatedUser().getUserId();
		sessionFactory.getCurrentSession().doWork(connection -> {
			try (PreparedStatement statement = connection.prepareStatement(
			    "INSERT INTO vinshc_clinical_event(event_uuid,event_type,patient_id,encounter_id,entity_uuid,reason,detail,creator,date_created) VALUES (?,?,?,?,?,?,?,?,?)")) {
				statement.setString(1, java.util.UUID.randomUUID().toString());
				statement.setString(2, type);
				statement.setInt(3, patientId);
				statement.setObject(4, encounterId);
				statement.setString(5, entityUuid);
				statement.setString(6, reason);
				statement.setString(7, detail == null ? null : detail.length() > 2000 ? detail.substring(0, 2000) : detail);
				statement.setInt(8, creator);
				statement.setTimestamp(9, Timestamp.from(Instant.now()));
				statement.executeUpdate();
			}
		});
	}
	
	private Map<String, Object> finalization(Encounter encounter) {
		List<Map<String, Object>> rows = eventRows(encounter, "consultation_finalized");
		return rows.isEmpty() ? null : rows.get(0);
	}
	
	private List<Map<String, Object>> events(Encounter encounter) {
		return eventRows(encounter, null);
	}
	
	private List<Map<String, Object>> eventRows(Encounter encounter, String type) {
		if (encounter.getEncounterId() == null)
			return Collections.emptyList();
		return sessionFactory.getCurrentSession().doReturningWork(connection -> {
			String sql = "SELECT e.event_uuid,e.event_type,e.entity_uuid,e.reason,e.detail,e.date_created,u.uuid AS creator_uuid"
			        + " FROM vinshc_clinical_event e JOIN users u ON u.user_id=e.creator WHERE e.encounter_id=?"
			        + (type == null ? "" : " AND e.event_type=?") + " ORDER BY e.event_id";
			try (PreparedStatement statement = connection.prepareStatement(sql)) {
				statement.setInt(1, encounter.getEncounterId());
				if (type != null)
					statement.setString(2, type);
				List<Map<String, Object>> rows = new ArrayList<>();
				try (ResultSet result = statement.executeQuery()) {
					while (result.next()) {
						Map<String, Object> row = new LinkedHashMap<>();
						row.put("uuid", result.getString("event_uuid"));
						row.put("type", result.getString("event_type"));
						row.put("entityUuid", result.getString("entity_uuid"));
						row.put("reason", result.getString("reason"));
						row.put("detail", result.getString("detail"));
						row.put("at", iso(result.getTimestamp("date_created")));
						row.put("byUserUuid", result.getString("creator_uuid"));
						rows.add(row);
					}
				}
				return rows;
			}
		});
	}
	
	// ---------------------------------------------------------------- helpers
	
	private static Patient patient(String uuid) {
		Patient patient = Context.getPatientService().getPatientByUuid(uuid);
		if (patient == null || patient.getVoided())
			throw bad("patient does not exist");
		return patient;
	}
	
	private static Encounter encounter(String uuid) {
		Encounter encounter = Context.getEncounterService().getEncounterByUuid(uuid);
		if (encounter == null || encounter.getVoided())
			throw bad("encounter does not exist");
		return encounter;
	}
	
	private static Obs obs(Patient patient, Encounter encounter, Concept concept) {
		Obs obs = new Obs();
		obs.setPerson(patient);
		obs.setEncounter(encounter);
		obs.setObsDatetime(encounter.getEncounterDatetime());
		obs.setLocation(encounter.getLocation());
		obs.setConcept(concept);
		return obs;
	}
	
	private static Concept concept(String uuid) {
		Concept concept = Context.getConceptService().getConceptByUuid(uuid);
		if (concept == null)
			throw new IllegalStateException("required metadata concept missing: " + uuid);
		return concept;
	}
	
	private static Concept conceptSet(String globalPropertyName) {
		String uuid = globalProperty(globalPropertyName);
		if (uuid == null)
			throw new IllegalStateException("catalogue not configured: " + globalPropertyName);
		Concept set = Context.getConceptService().getConceptByUuid(uuid);
		if (set == null || !Boolean.TRUE.equals(set.getSet()))
			throw new IllegalStateException("catalogue concept set missing for " + globalPropertyName + ": " + uuid);
		return set;
	}
	
	private static Concept setMember(Concept set, String uuid, String field) {
		canonicalUuid(uuid);
		for (Concept member : set.getSetMembers())
			if (member.getUuid().equals(uuid) && !member.getRetired())
				return member;
		throw bad(field + " is not in the configured catalogue");
	}
	
	private static String globalProperty(String name) {
		String value = Context.getAdministrationService().getGlobalProperty(name);
		return value == null || value.trim().isEmpty() ? null : value.trim();
	}
	
	private static String reason(Map<String, Object> body, boolean required, String message) {
		String reason = optionalString(body, "reason");
		if (reason != null && reason.trim().isEmpty())
			reason = null;
		if (required && reason == null)
			throw bad(message);
		if (reason != null)
			limit(reason.trim(), 1000, "reason");
		return reason == null ? null : reason.trim();
	}
	
	private static String requiredReason(String reason) {
		if (reason == null || reason.trim().isEmpty())
			throw bad("reason is required");
		limit(reason.trim(), 1000, "reason");
		return reason.trim();
	}
	
	private static String boundedText(String value, int maximum, String field) {
		String trimmed = value.trim();
		if (trimmed.isEmpty())
			throw bad(field + " must not be blank");
		limit(trimmed, maximum, field);
		return trimmed;
	}
	
	private static double positive(Map<String, Object> body, String field) {
		Object raw = body.get(field);
		if (!(raw instanceof Number) || raw instanceof Boolean)
			throw bad(field + " must be a JSON number");
		double value = ((Number) raw).doubleValue();
		if (!Double.isFinite(value) || value <= 0)
			throw bad(field + " must be a finite number > 0");
		return value;
	}
	
	private static int integer(Object raw, String field) {
		if (!(raw instanceof Number) || raw instanceof Boolean || ((Number) raw).doubleValue() % 1 != 0)
			throw bad(field + " must be a JSON integer");
		return ((Number) raw).intValue();
	}
	
	private static Map<String, Object> ref(Concept concept) {
		if (concept == null)
			return null;
		Map<String, Object> ref = new LinkedHashMap<>();
		ref.put("uuid", concept.getUuid());
		ref.put("display", concept.getDisplayString());
		return ref;
	}
	
	private static String iso(java.util.Date date) {
		return date == null ? null : Instant.ofEpochMilli(date.getTime()).atZone(CLINIC_ZONE).toOffsetDateTime().toString();
	}
	
	private static LocalDate localDate(java.util.Date date) {
		return Instant.ofEpochMilli(date.getTime()).atZone(ZoneId.systemDefault()).toLocalDate();
	}
}
