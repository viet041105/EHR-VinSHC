"""Synthetic B4 catalogues for local/CI contract tests only.

Every object is named "VinSHC synthetic ..." and uses a stable UUID derived from its name, so reruns
reuse it. Codes are deliberately not real ICD-10 codes (prefix SYN-). The helper only fills a global
property when it is empty or points at a missing concept; a real catalogue delivered by metadata is
never overwritten, and the caller must skip the synthetic suite in that case.
"""

import urllib.parse
import uuid

NAMESPACE = uuid.UUID("5b8f0f5e-3f1e-4c55-9d43-6f2a2b1c0b4d")

DATATYPE_NA = "8d4a4c94-c2cc-11de-8d13-0010c6dffd0f"
CLASS_DIAGNOSIS = "8d4918b0-c2cc-11de-8d13-0010c6dffd0f"
CLASS_DRUG = "8d490dfc-c2cc-11de-8d13-0010c6dffd0f"
CLASS_CONVSET = "8d492594-c2cc-11de-8d13-0010c6dffd0f"
CLASS_MISC = "8d492774-c2cc-11de-8d13-0010c6dffd0f"
CLASS_FREQUENCY = "8e071bfe-520c-44c0-a89b-538e9129b42a"
MAP_SAME_AS = "35543629-7d8c-11e1-909d-c80aa9edcf4e"
SNOMED_DAY = "258703001"

REST = "/openmrs/ws/rest/v1"

SYNTHETIC_GLOBAL_PROPERTIES = (
    "vinshc.diagnosis.icd10ConceptSourceUuid",
    "vinshc.diagnosis.icd10CatalogueVersion",
    "vinshc.diagnosis.icd10SelectableConceptSetUuid",
    "vinshc.allergy.allergenConceptSetUuid.drug",
    "vinshc.allergy.allergenConceptSetUuid.food",
    "vinshc.allergy.allergenConceptSetUuid.environment",
    "vinshc.allergy.reactionConceptSetUuid",
    "vinshc.allergy.severityConceptSetUuid",
)

ORDER_GLOBAL_PROPERTIES = {
    "order.drugDosingUnitsConceptUuid": "dosing units",
    "order.drugRoutesConceptUuid": "routes",
    "order.durationUnitsConceptUuid": "duration units",
    "order.drugDispensingUnitsConceptUuid": "dispensing units",
}

SYNTHETIC_VERSION = "SYNTHETIC-TEST-ONLY"


class RealCatalogueConfigured(Exception):
    """A non-synthetic catalogue is configured; synthetic writes would contaminate it."""


def stable_uuid(name):
    return str(uuid.uuid5(NAMESPACE, name))


def _get(client, path):
    status, _, _ = client.request(path)
    return status == 200


def _ensure(client, resource, uid, payload):
    if not _get(client, f"{REST}/{resource}/{uid}"):
        client.json(f"{REST}/{resource}", method="POST", statuses=(200, 201),
                    payload={"uuid": uid, **payload})
    return uid


def _concept(client, name, concept_class, *, members=None, mappings=None):
    payload = {
        "names": [{"name": name, "locale": "en", "conceptNameType": "FULLY_SPECIFIED",
                   "localePreferred": True}],
        "datatype": DATATYPE_NA,
        "conceptClass": concept_class,
        "set": members is not None,
        "descriptions": [{"description": "Synthetic local/CI test metadata only", "locale": "en"}],
    }
    if members is not None:
        payload["setMembers"] = members
    if mappings:
        payload["mappings"] = mappings
    return _ensure(client, "concept", stable_uuid(name), payload)


def _term(client, source, code, name):
    return _ensure(client, "conceptreferenceterm", stable_uuid(f"term:{source}:{code}"),
                   {"code": code, "name": name, "conceptSource": source})


def _setting(client, name):
    query = urllib.parse.quote(name)
    results = client.json(f"{REST}/systemsetting?q={query}&v=full").get("results", [])
    return next((item for item in results if item.get("property") == name), None)


def _set_property(client, name, value, synthetic_values, applied):
    current = _setting(client, name)
    existing = (current or {}).get("value") or ""
    if existing and existing not in synthetic_values and _get(client, f"{REST}/concept/{existing}"):
        raise RealCatalogueConfigured(f"{name} already points at {existing}")
    if existing and existing not in synthetic_values and name.endswith("Version"):
        raise RealCatalogueConfigured(f"{name} already set to {existing}")
    if existing == value:
        return
    if current:
        client.json(f"{REST}/systemsetting/{current['uuid']}", method="POST",
                    payload={"value": value})
    else:
        client.json(f"{REST}/systemsetting", method="POST", statuses=(200, 201),
                    payload={"property": name, "value": value})
    applied.append(name)


def _snomed_source(client):
    sources = client.json(f"{REST}/conceptsource?v=full&limit=100").get("results", [])
    found = next((item for item in sources if item.get("hl7Code") == "SCT"), None)
    if found:
        return found["uuid"]
    return _ensure(client, "conceptsource", stable_uuid("source:SCT"),
                   {"name": "SNOMED CT", "description": "SNOMED CT reference source",
                    "hl7Code": "SCT"})


def ensure(client):
    """Create or reuse synthetic catalogues and return their UUIDs plus the properties written."""
    applied = []
    icd_source = _ensure(client, "conceptsource", stable_uuid("source:synthetic-icd"), {
        "name": "VinSHC synthetic ICD-10 test source",
        "description": "NOT ICD-10. Synthetic codes for local/CI contract tests only.",
        "uniqueId": "urn:vinshc:synthetic-test-icd",
    })
    same_as = [{"conceptMapType": MAP_SAME_AS}]
    dx = {}
    for key, code in (("a", "SYN-001"), ("b", "SYN-002"), ("c", "SYN-003")):
        term = _term(client, icd_source, code, f"Synthetic diagnosis {key.upper()}")
        dx[key] = _concept(client, f"VinSHC synthetic diagnosis {key.upper()}", CLASS_DIAGNOSIS,
                           mappings=[{**same_as[0], "conceptReferenceTerm": term}])
    dx["unmapped"] = _concept(client, "VinSHC synthetic diagnosis unmapped", CLASS_DIAGNOSIS)

    drug_concepts = {key: _concept(client, f"VinSHC synthetic drug concept {key.upper()}", CLASS_DRUG)
                     for key in ("a", "b")}
    food = _concept(client, "VinSHC synthetic food allergen", CLASS_MISC)
    environment = _concept(client, "VinSHC synthetic environment allergen", CLASS_MISC)
    reaction = _concept(client, "VinSHC synthetic reaction rash", CLASS_MISC)
    severity = _concept(client, "VinSHC synthetic severity moderate", CLASS_MISC)
    route = _concept(client, "VinSHC synthetic route oral", CLASS_MISC)
    other_route = _concept(client, "VinSHC synthetic route not in set", CLASS_MISC)
    tablet = _concept(client, "VinSHC synthetic unit tablet", CLASS_MISC)
    sct = _snomed_source(client)
    day_term = _term(client, sct, SNOMED_DAY, "Day")
    days = _concept(client, "VinSHC synthetic duration day", CLASS_MISC,
                    mappings=[{**same_as[0], "conceptReferenceTerm": day_term}])
    sets = {
        "selectableDiagnoses": _concept(client, "VinSHC synthetic selectable diagnoses",
                                         CLASS_CONVSET, members=[dx["a"], dx["b"], dx["c"]]),
        "drugAllergens": _concept(client, "VinSHC synthetic drug allergens", CLASS_CONVSET,
                                  members=[drug_concepts["a"]]),
        "foodAllergens": _concept(client, "VinSHC synthetic food allergens", CLASS_CONVSET,
                                  members=[food]),
        "environmentAllergens": _concept(client, "VinSHC synthetic environment allergens",
                                         CLASS_CONVSET, members=[environment]),
        "reactions": _concept(client, "VinSHC synthetic allergy reactions", CLASS_CONVSET,
                              members=[reaction]),
        "severities": _concept(client, "VinSHC synthetic allergy severities", CLASS_CONVSET,
                               members=[severity]),
        "dosingUnits": _concept(client, "VinSHC synthetic dosing units", CLASS_CONVSET,
                                members=[tablet]),
        "routes": _concept(client, "VinSHC synthetic routes", CLASS_CONVSET, members=[route]),
        "durationUnits": _concept(client, "VinSHC synthetic duration units", CLASS_CONVSET,
                                  members=[days]),
        "dispensingUnits": _concept(client, "VinSHC synthetic dispensing units", CLASS_CONVSET,
                                    members=[tablet]),
    }
    frequency_concept = _concept(client, "VinSHC synthetic twice daily", CLASS_FREQUENCY)
    frequency = _ensure(client, "orderfrequency", stable_uuid("frequency:bid"),
                        {"concept": frequency_concept, "frequencyPerDay": 2})
    drugs = {key: _ensure(client, "drug", stable_uuid(f"drug:{key}"), {
        "name": f"VinSHC synthetic drug {key.upper()} 500 mg", "concept": drug_concepts[key],
        "strength": "500 mg", "combination": False})
        for key in ("a", "b")}

    synthetic_values = set(sets.values()) | {icd_source, SYNTHETIC_VERSION}
    for name, value in (
        ("vinshc.diagnosis.icd10ConceptSourceUuid", icd_source),
        ("vinshc.diagnosis.icd10CatalogueVersion", SYNTHETIC_VERSION),
        ("vinshc.diagnosis.icd10SelectableConceptSetUuid", sets["selectableDiagnoses"]),
        ("vinshc.allergy.allergenConceptSetUuid.drug", sets["drugAllergens"]),
        ("vinshc.allergy.allergenConceptSetUuid.food", sets["foodAllergens"]),
        ("vinshc.allergy.allergenConceptSetUuid.environment", sets["environmentAllergens"]),
        ("vinshc.allergy.reactionConceptSetUuid", sets["reactions"]),
        ("vinshc.allergy.severityConceptSetUuid", sets["severities"]),
        ("order.drugDosingUnitsConceptUuid", sets["dosingUnits"]),
        ("order.drugRoutesConceptUuid", sets["routes"]),
        ("order.durationUnitsConceptUuid", sets["durationUnits"]),
        ("order.drugDispensingUnitsConceptUuid", sets["dispensingUnits"]),
    ):
        _set_property(client, name, value, synthetic_values, applied)
    return {
        "icdSource": icd_source, "diagnoses": dx, "drugConcepts": drug_concepts, "drugs": drugs,
        "food": food, "environment": environment, "reaction": reaction, "severity": severity,
        "route": route, "routeNotInSet": other_route, "tablet": tablet,
        "doseUnit": tablet, "quantityUnit": tablet, "days": days,
        "frequency": frequency, "sets": sets, "globalPropertiesWritten": applied,
        "codes": {"a": "SYN-001", "b": "SYN-002", "c": "SYN-003"},
        "version": SYNTHETIC_VERSION,
        "description": "synthetic (b4_catalogue.py); not ICD-10, not a facility formulary",
    }
