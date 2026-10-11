"""Provision B4 adapter links for the versioned metadata 0.3.0 test catalogue.

Initializer owns the individual concepts, drugs, and order frequencies. This helper only creates
the Core objects Initializer cannot express in the delivered CSVs: ICD reference mappings,
catalogue concept sets, and the global-property links consumed by the VinSHC module. It must only
be used on the isolated test stack defined by compose.b4-metadata.yaml.
"""

import json
from pathlib import Path
import urllib.parse
import uuid

import b4_catalogue


ROOT = Path(__file__).resolve().parents[2]
REST = "/openmrs/ws/rest/v1"
NAMESPACE = uuid.UUID("cbe1ed54-45a9-4da4-91dd-2a02e00f3ea6")


def _load(name):
    return json.loads(
        (ROOT / "metadata" / "vinshc" / "catalogues" / name).read_text(encoding="utf-8")
    )


def _stable(name):
    return str(uuid.uuid5(NAMESPACE, name))


def _require(client, resource, uid):
    status, _, body = client.request(f"{REST}/{resource}/{uid}?v=full")
    if status != 200:
        raise RuntimeError(
            f"B4 metadata 0.3.0 is not imported: missing {resource} {uid} ({status}: {body})"
        )
    return json.loads(body)


def _setting(client, name):
    query = urllib.parse.quote(name)
    results = client.json(f"{REST}/systemsetting?q={query}&v=full").get("results", [])
    return next((item for item in results if item.get("property") == name), None)


def _set_property(client, name, value, applied):
    current = _setting(client, name)
    if (current or {}).get("value") == value:
        return
    if current:
        client.json(f"{REST}/systemsetting/{current['uuid']}", method="POST", payload={"value": value})
    else:
        client.json(
            f"{REST}/systemsetting", method="POST", statuses=(200, 201),
            payload={"property": name, "value": value},
        )
    applied.append(name)


def _source(client, name, unique_id, hl7_code):
    uid = _stable("source:" + unique_id)
    return b4_catalogue._ensure(client, "conceptsource", uid, {
        "name": name,
        "description": "VinSHC metadata 0.3.0 isolated test catalogue",
        "hl7Code": hl7_code,
        "uniqueId": unique_id,
    })


def _mapping(client, concept_uuid, source_uuid, code, display):
    concept = _require(client, "concept", concept_uuid)
    for mapping in concept.get("mappings", []):
        term = mapping.get("conceptReferenceTerm") or {}
        source = term.get("conceptSource") or {}
        map_type = mapping.get("conceptMapType") or {}
        if source.get("uuid") == source_uuid and term.get("code") == code \
                and map_type.get("name", "").upper() == "SAME-AS":
            return
    term = b4_catalogue._term(client, source_uuid, code, display)
    client.json(f"{REST}/concept/{concept_uuid}", method="POST", payload={
        "mappings": [{
            "conceptMapType": b4_catalogue.MAP_SAME_AS,
            "conceptReferenceTerm": term,
        }]
    })


def _set(client, key, members):
    uid = _stable("set:" + key)
    payload = {
        "names": [{
            "name": "VinSHC metadata test " + key,
            "locale": "en",
            "conceptNameType": "FULLY_SPECIFIED",
            "localePreferred": True,
        }],
        "datatype": b4_catalogue.DATATYPE_NA,
        "conceptClass": b4_catalogue.CLASS_CONVSET,
        "set": True,
        "setMembers": members,
        "descriptions": [{
            "description": "Generated adapter set for metadata 0.3.0 isolated tests",
            "locale": "en",
        }],
    }
    if b4_catalogue._get(client, f"{REST}/concept/{uid}"):
        client.json(f"{REST}/concept/{uid}", method="POST", payload={
            "set": True, "setMembers": members,
        })
    else:
        client.json(f"{REST}/concept", method="POST", statuses=(200, 201),
                    payload={"uuid": uid, **payload})
    return uid


def _by_code(rows):
    return {row["code"]: row for row in rows}


def ensure(client):
    """Link imported metadata to the B4 module and return IDs used by runtime tests."""
    icd = _load("icd10-mvp.json")
    allergies = _load("allergies.json")
    medications = _load("medications.json")
    units = _load("medication-units.json")["catalogues"]

    if icd.get("productionEnabled") is not False or medications.get("productionEnabled") is not False:
        raise RuntimeError("B4 metadata test provisioner refuses production-enabled catalogues")

    for row in icd["records"]:
        _require(client, "concept", row["conceptUuid"])
    for row in allergies["records"] + allergies["reactions"] + allergies["severities"]:
        _require(client, "concept", row["conceptUuid"])
    for group in units.values():
        for row in group:
            _require(client, "concept", row["conceptUuid"])
    for row in medications["records"]:
        _require(client, "concept", row["conceptUuid"])
        _require(client, "drug", row["uuid"])
    for row in units["frequencies"]:
        if row["frequencyPerDay"] is not None:
            _require(client, "orderfrequency", row["uuid"])

    applied = []
    icd_source = _source(client, "ICD-10 VinSHC MVP", "http://hl7.org/fhir/sid/icd-10", "ICD10")
    for row in icd["records"]:
        _mapping(client, row["conceptUuid"], icd_source, row["code"], row["nameVi"])

    snomed = b4_catalogue._snomed_source(client)
    unit_by_group = {name: _by_code(rows) for name, rows in units.items()}
    day = unit_by_group["duration"]["DAY"]
    _mapping(client, day["conceptUuid"], snomed, b4_catalogue.SNOMED_DAY, "Day")

    medication_by_code = _by_code(medications["records"])
    allergy_by_category = {row["category"]: row for row in allergies["records"]}
    sets = {
        "selectableDiagnoses": _set(
            client, "selectable ICD-10 diagnoses",
            [row["conceptUuid"] for row in icd["records"] if row["selectable"]],
        ),
        "drugAllergens": _set(
            client, "drug allergens",
            [row["conceptUuid"] for row in medications["records"]]
            + [allergy_by_category["medication"]["conceptUuid"]],
        ),
        "foodAllergens": _set(client, "food allergens", [allergy_by_category["food"]["conceptUuid"]]),
        "environmentAllergens": _set(
            client, "environment allergens", [allergy_by_category["environment"]["conceptUuid"]],
        ),
        "reactions": _set(client, "allergy reactions",
                          [row["conceptUuid"] for row in allergies["reactions"]]),
        "severities": _set(client, "allergy severities",
                           [row["conceptUuid"] for row in allergies["severities"]]),
        "dosingUnits": _set(client, "drug dosing units",
                            [row["conceptUuid"] for row in units["dose"]]),
        "routes": _set(client, "drug routes", [row["conceptUuid"] for row in units["routes"]]),
        "durationUnits": _set(client, "drug duration units",
                              [row["conceptUuid"] for row in units["duration"]]),
        "dispensingUnits": _set(client, "drug dispensing units",
                                [row["conceptUuid"] for row in units["quantity"]]),
    }

    properties = (
        ("vinshc.diagnosis.icd10ConceptSourceUuid", icd_source),
        ("vinshc.diagnosis.icd10CatalogueVersion", icd["version"]),
        ("vinshc.diagnosis.icd10SelectableConceptSetUuid", sets["selectableDiagnoses"]),
        ("vinshc.allergy.allergenConceptSetUuid.drug", sets["drugAllergens"]),
        ("vinshc.allergy.allergenConceptSetUuid.food", sets["foodAllergens"]),
        ("vinshc.allergy.allergenConceptSetUuid.environment", sets["environmentAllergens"]),
        ("vinshc.allergy.reactionConceptSetUuid", sets["reactions"]),
        ("vinshc.allergy.severityConceptSetUuid", sets["severities"]),
        ("vinshc.allergy.allowNonCoded", "false"),
        ("order.drugDosingUnitsConceptUuid", sets["dosingUnits"]),
        ("order.drugRoutesConceptUuid", sets["routes"]),
        ("order.durationUnitsConceptUuid", sets["durationUnits"]),
        ("order.drugDispensingUnitsConceptUuid", sets["dispensingUnits"]),
    )
    for name, value in properties:
        _set_property(client, name, value, applied)

    diagnoses = _by_code(icd["records"])
    return {
        "icdSource": icd_source,
        "diagnoses": {
            "a": diagnoses["I10"]["conceptUuid"],
            "b": diagnoses["J06.9"]["conceptUuid"],
            "c": diagnoses["Z00.0"]["conceptUuid"],
            "restricted": diagnoses["E11"]["conceptUuid"],
            "unmapped": unit_by_group["dosageForms"]["CAPSULE"]["conceptUuid"],
        },
        "drugConcepts": {
            "a": medication_by_code["S01-PLAVIX-75"]["conceptUuid"],
            "b": medication_by_code["S01-LIPITOR-20"]["conceptUuid"],
        },
        "drugs": {
            "a": medication_by_code["S01-PLAVIX-75"]["uuid"],
            "b": medication_by_code["S01-LIPITOR-20"]["uuid"],
        },
        "food": allergy_by_category["food"]["conceptUuid"],
        "environment": allergy_by_category["environment"]["conceptUuid"],
        "reaction": allergies["reactions"][0]["conceptUuid"],
        "severity": allergies["severities"][1]["conceptUuid"],
        "route": unit_by_group["routes"]["ORAL"]["conceptUuid"],
        "routeNotInSet": unit_by_group["dosageForms"]["TABLET"]["conceptUuid"],
        "tablet": unit_by_group["dose"]["TABLET"]["conceptUuid"],
        "doseUnit": unit_by_group["dose"]["TABLET"]["conceptUuid"],
        "quantityUnit": unit_by_group["quantity"]["TABLET"]["conceptUuid"],
        "days": day["conceptUuid"],
        "frequency": unit_by_group["frequencies"]["BID"]["uuid"],
        "sets": sets,
        "globalPropertiesWritten": applied,
        "codes": {"a": "I10", "b": "J06.9", "c": "Z00.0"},
        "version": icd["version"],
        "description": "metadata/vinshc 0.3.0 isolated test catalogue; productionEnabled=false",
    }
