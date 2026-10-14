"""B7 runtime evidence for VinSHC REST-to-FHIR R4 mappings and known gaps."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings, fixture_path, report_path


FHIR = "/openmrs/ws/fhir2/R4"
REST = "/openmrs/ws/rest/v1"
RESOURCES = {
    "Patient", "Encounter", "Observation", "Condition", "AllergyIntolerance",
    "MedicationRequest", "ServiceRequest", "Location", "Practitioner",
}
EXPECTED_CHECKS = 6


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def reference(resource, path):
    value = resource
    for key in path:
        value = value[key]
    return value


class B7FhirMappingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.client = Client(
            f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"],
        )
        cls.b2 = json.loads(fixture_path("b2-patients.json").read_text(encoding="utf-8"))
        cls.b3 = json.loads(fixture_path("b3-vitals.json").read_text(encoding="utf-8"))
        cls.b4a = json.loads(fixture_path("b4a-consultations.json").read_text(encoding="utf-8"))
        cls.b4b = json.loads(fixture_path("b4b-clinical.json").read_text(encoding="utf-8"))
        cls.entities = json.loads(
            (ROOT / "metadata/vinshc/frontend-map.json").read_text(encoding="utf-8")
        )["entities"]
        cls.contract = json.loads(
            (ROOT / "metadata/vinshc/contracts/fhir.json").read_text(encoding="utf-8")
        )
        cls.summary = cls.client.json(
            f"{REST}/vinshc/encounter/{cls.b4b['encounterUuid']}/clinical-summary"
        )
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "fhirVersion": cls.contract["fhirVersion"],
            "checks": [],
            "knownGaps": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == EXPECTED_CHECKS
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = report_path("b7-fhir.json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def gap(self, code, detail):
        self.evidence["knownGaps"].append({"code": code, "detail": detail})

    def fhir(self, resource, identifier):
        result = self.client.json(f"{FHIR}/{resource}/{identifier}")
        self.assertEqual(result["resourceType"], resource)
        self.assertEqual(result["id"], identifier)
        return result

    def test_01_contract_and_capability_cover_all_b7_resources(self):
        mappings = {item["fhirResource"]: item for item in self.contract["mappings"]}
        self.assertTrue(RESOURCES.issubset(mappings))
        capability = self.client.json(f"{FHIR}/metadata")
        self.assertEqual(capability["fhirVersion"], "4.0.1")
        interactions = {
            item["type"]: {entry["code"] for entry in item.get("interaction", [])}
            for rest in capability.get("rest", []) for item in rest.get("resource", [])
        }
        for resource in RESOURCES:
            self.assertIn("read", interactions[resource], resource)
            self.assertIn("search-type", interactions[resource], resource)
        self.assertEqual(interactions["MedicationRequest"], {"read", "patch", "search-type"})
        self.assertEqual(interactions["ServiceRequest"], {"read", "search-type"})
        self.record("metadata contract and CapabilityStatement cover all nine B7 resources",
                    interactions={key: sorted(interactions[key]) for key in sorted(RESOURCES)})

    def test_02_patient_facility_practitioner_and_encounter_identity(self):
        patient = self.client.json(f"{REST}/patient/{self.b4b['patientUuid']}?v=full")
        fhir_patient = self.fhir("Patient", self.b4b["patientUuid"])
        native_identifier = patient["identifiers"][0]
        exported = next(item for item in fhir_patient["identifier"]
                        if item["value"] == native_identifier["identifier"])
        expected_system = "urn:uuid:" + native_identifier["identifierType"]["uuid"]
        self.assertEqual(exported["system"], expected_system)
        self.assertEqual(exported["extension"][0]["valueReference"]["reference"],
                         "Location/" + self.entities["location.development.clinic"])

        location_uuid = self.entities["location.development.clinic"]
        location = self.fhir("Location", location_uuid)
        self.assertEqual(location["name"], "VinSHC Development Clinic")
        self.assertNotIn("identifier", location)
        self.gap("B7-LOCATION-IDENTIFIER",
                 "FHIR Location omits the VSHC-DEV facility identifier; UUID remains stable.")

        provider = self.client.json(f"{REST}/provider/{self.b4b['providerUuid']}?v=full")
        practitioner = self.fhir("Practitioner", self.b4b["providerUuid"])
        self.assertEqual(practitioner["identifier"][0]["value"], provider["identifier"])
        self.assertNotEqual(practitioner["id"], provider["person"]["uuid"])
        encounter = self.fhir("Encounter", self.b4b["encounterUuid"])
        self.assertEqual(reference(encounter, ("subject", "reference")),
                         "Patient/" + self.b4b["patientUuid"])
        self.assertEqual(reference(encounter, ("participant", 0, "individual", "reference")),
                         "Practitioner/" + self.b4b["providerUuid"])
        self.assertEqual(reference(encounter, ("location", 0, "location", "reference")),
                         "Location/" + location_uuid)
        self.record("patient issuer, facility, provider and encounter references use stable runtime UUIDs",
                    patientIdentifierSystem=expected_system,
                    practitionerIdSource="Provider.uuid")

    def test_03_multiple_visits_and_timezone_round_trip(self):
        patient_uuid = self.b4a["patientUuid"]
        self.assertEqual(len(self.b4a["visitUuids"]), 2)
        self.assertEqual(len(set(self.b4a["visitUuids"])), 2)
        for visit_uuid, encounter_uuid, expected_time in zip(
                self.b4a["visitUuids"], self.b4a["encounterUuids"], self.b4a["encounterTimes"]):
            visit = self.fhir("Encounter", visit_uuid)
            encounter = self.fhir("Encounter", encounter_uuid)
            tags = {item["code"] for item in visit.get("meta", {}).get("tag", [])}
            encounter_tags = {item["code"] for item in encounter.get("meta", {}).get("tag", [])}
            self.assertIn("visit", tags)
            self.assertIn("encounter", encounter_tags)
            self.assertEqual(visit["subject"]["reference"], "Patient/" + patient_uuid)
            self.assertEqual(encounter["subject"]["reference"], "Patient/" + patient_uuid)
            self.assertEqual(encounter["partOf"]["reference"], "Encounter/" + visit_uuid)
            self.assertEqual(instant(encounter["period"]["start"]), instant(expected_time))
            # Every exchanged dateTime must be timezone-aware; UI renders it in Asia/Ho_Chi_Minh.
            self.assertIsNotNone(datetime.fromisoformat(
                encounter["period"]["start"].replace("Z", "+00:00")).utcoffset())
        self.record("two visits remain distinct and encounter/visit timestamps preserve the instant",
                    displayTimezone="Asia/Ho_Chi_Minh", exchange="ISO 8601 with offset")

    def test_04_observation_links_missing_values_and_void_history(self):
        complete = self.fhir("Observation", self.b3["groupUuids"][0])
        missing = self.fhir("Observation", self.b3["groupUuids"][1])
        for resource in (complete, missing):
            self.assertEqual(resource["subject"]["reference"], "Patient/" + self.b3["patientUuid"])
            self.assertEqual(resource["encounter"]["reference"],
                             "Encounter/" + self.b3["encounterUuid"])
            self.assertEqual(instant(resource["effectiveDateTime"]),
                             instant(self.b3["measuredAt"] if resource is complete
                                     else self.b3["missingMeasuredAt"]))
        self.assertGreater(len(complete.get("hasMember", [])), len(missing.get("hasMember", [])))
        self.assertNotIn("component", complete)
        self.gap("B7-BP-PROFILE",
                 "Vital group exports hasMember references, not the standard BP component panel.")
        for key in ("originalUuid", "replacementUuid"):
            status, headers, body = self.client.request(
                f"{FHIR}/Observation/{self.b3['correction'][key]}"
            )
            self.assertEqual(status, 410, (headers, body))
        self.gap("B7-VOID-HISTORY",
                 "Voided observations return 410 and no FHIR Provenance/version history projection.")
        self.record("observation patient/encounter/time links and explicit native missing-state behavior verified")

    def test_05_condition_allergy_and_medication_runtime_mapping(self):
        diagnoses = self.summary["diagnoses"]
        self.assertEqual(len(diagnoses), 2)
        for diagnosis in diagnoses:
            condition = self.fhir("Condition", diagnosis["uuid"])
            self.assertEqual(condition["subject"]["reference"],
                             "Patient/" + self.b4b["patientUuid"])
            self.assertEqual(condition["encounter"]["reference"],
                             "Encounter/" + self.b4b["encounterUuid"])
            coding = condition["code"]["coding"][0]
            self.assertEqual(coding["code"], diagnosis["concept"]["uuid"])
            self.assertNotIn("system", coding)
        self.gap("B7-CONDITION-ICD-CODING",
                 "FHIR Condition exports local concept UUID, not reviewed ICD-10 system/code/version.")

        allergy_native = self.summary["allergies"]["allergies"][0]
        allergy = self.fhir("AllergyIntolerance", allergy_native["uuid"])
        self.assertEqual(allergy["patient"]["reference"],
                         "Patient/" + self.b4b["patientUuid"])
        self.assertEqual(allergy["clinicalStatus"]["coding"][0]["code"], "active")

        orders = self.summary["drugOrders"]
        self.assertEqual({item["status"] for item in orders}, {"active", "discontinued"})
        for order in orders:
            medication = self.fhir("MedicationRequest", order["uuid"])
            self.assertEqual(medication["subject"]["reference"],
                             "Patient/" + self.b4b["patientUuid"])
            self.assertEqual(medication["encounter"]["reference"],
                             "Encounter/" + self.b4b["encounterUuid"])
            self.assertEqual(medication["requester"]["reference"],
                             "Practitioner/" + self.b4b["providerUuid"])
        self.gap("B7-TERMINOLOGY-PROVENANCE",
                 "Allergy/medication coding and units remain local UUID/text; FHIR Provenance is not emitted.")
        self.record("Condition, AllergyIntolerance and MedicationRequest retain native UUID and ownership links")

    def test_06_service_request_and_exchange_boundaries_are_explicit(self):
        bundle = self.client.json(f"{FHIR}/ServiceRequest?patient={self.b4b['patientUuid']}")
        self.assertEqual(bundle["resourceType"], "Bundle")
        # B8 may have run previously on the same retained database. Do not
        # assert the absence of valid orders merely because this is a B7 test.
        for entry in bundle.get("entry", []):
            resource = entry["resource"]
            self.assertEqual(resource["resourceType"], "ServiceRequest")
            self.assertEqual(resource["subject"]["reference"],
                             "Patient/" + self.b4b["patientUuid"])
        if not bundle.get("entry"):
            self.gap("B7-SERVICE-REQUEST-FIXTURE",
                     "No ServiceRequest fixture yet; B8 exercises its native order round-trip.")
        self.assertTrue(self.contract["deferred"]["MPI"])
        self.assertTrue(self.contract["deferred"]["crossFacilitySharing"])
        self.assertFalse(any(item["enabledForProduction"] for item in self.contract["mappings"]))
        self.record("ServiceRequest search is patient-scoped; MPI/consent and cross-facility are deferred",
                    sourceOfTruth="OpenMRS", openEhrAdapter="deferred one-way projection")


if __name__ == "__main__":
    unittest.main()
