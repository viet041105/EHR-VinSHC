"""B3 visit, encounter and vital-sign contract tests for local Docker only."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings


VITALS = {
    "vitals.mach": (80, "/min", "vitals.mach_trang_thai"),
    "vitals.ha_tam_thu": (120, "mm[Hg]", "vitals.ha_tam_thu_trang_thai"),
    "vitals.ha_tam_truong": (75, "mm[Hg]", "vitals.ha_tam_truong_trang_thai"),
    "vitals.nhiet_do": (36.8, "Cel", "vitals.nhiet_do_trang_thai"),
    "vitals.nhip_tho": (18, "/min", "vitals.nhip_tho_trang_thai"),
    "vitals.spo2": (98, "%", "vitals.spo2_trang_thai"),
    "vitals.can_nang": (55.5, "kg", "vitals.can_nang_trang_thai"),
    "vitals.chieu_cao": (162, "cm", "vitals.chieu_cao_trang_thai"),
}


class B3VitalsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.client = Client(
            f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"],
        )
        cls.entities = json.loads(
            (ROOT / "metadata/vinshc/frontend-map.json").read_text(encoding="utf-8")
        )["entities"]
        cls.fixture_path = ROOT / ".runtime/fixtures/b3-vitals.json"
        cls.fixture = cls._load_or_create_fixture()
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "visitUuid": cls.fixture["visitUuid"],
            "encounterUuid": cls.fixture["encounterUuid"],
            "groupUuids": cls.fixture["groupUuids"],
            "checks": [],
            "knownGaps": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 6
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        destination = ROOT / ".runtime/reports/b3-integration.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    @classmethod
    def _load_or_create_fixture(cls):
        if cls.fixture_path.is_file():
            fixture = json.loads(cls.fixture_path.read_text(encoding="utf-8"))
            visit = cls.client.json(f"/openmrs/ws/rest/v1/visit/{fixture['visitUuid']}?v=full")
            encounter = cls.client.json(
                f"/openmrs/ws/rest/v1/encounter/{fixture['encounterUuid']}?v=full"
            )
            if visit["patient"]["uuid"] != fixture["patientUuid"]:
                raise AssertionError("Saved B3 visit resolves to another patient.")
            if encounter["visit"]["uuid"] != fixture["visitUuid"]:
                raise AssertionError("Saved B3 encounter is no longer linked to its visit.")
            for group_uuid in fixture["groupUuids"]:
                cls.client.json(f"/openmrs/ws/rest/v1/obs/{group_uuid}?v=full")
            return fixture

        b2_path = ROOT / ".runtime/fixtures/b2-patients.json"
        if not b2_path.is_file():
            raise AssertionError(
                "B3 depends on B2. Run tests/integration/test_b2_patient.py once first."
            )
        patients = json.loads(b2_path.read_text(encoding="utf-8"))["patients"]
        if len(patients) < 2:
            raise AssertionError("The B2 fixture must contain two isolated patients.")
        patient_uuid = patients[0]["patientUuid"]
        other_patient_uuid = patients[1]["patientUuid"]
        for patient in (patient_uuid, other_patient_uuid):
            cls.client.json(f"/openmrs/ws/rest/v1/patient/{patient}")

        person = cls.client.json(
            "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
            payload={
                "names": [{"givenName": "Synthetic B3", "familyName": "Nurse"}],
                "gender": "U",
            },
        )
        provider = cls.client.json(
            "/openmrs/ws/rest/v1/provider", method="POST", statuses=(200, 201),
            payload={
                "person": person["uuid"],
                "identifier": "B3-NURSE-" + uuid.uuid4().hex[:12].upper(),
            },
        )

        measured_at = datetime.now(timezone.utc).replace(microsecond=0)
        visit = cls.client.json(
            "/openmrs/ws/rest/v1/visit", method="POST", statuses=(200, 201),
            payload={
                "patient": patient_uuid,
                "visitType": cls.entities["visit.outpatient"],
                "location": cls.entities["location.development.clinic"],
                "startDatetime": measured_at.isoformat(),
            },
        )
        encounter = cls.client.json(
            "/openmrs/ws/rest/v1/encounter", method="POST", statuses=(200, 201),
            payload={
                "patient": patient_uuid,
                "visit": visit["uuid"],
                "encounterType": cls.entities["encounter.vitals"],
                "location": cls.entities["location.development.clinic"],
                "encounterDatetime": measured_at.isoformat(),
                "encounterProviders": [{
                    "provider": provider["uuid"],
                    "encounterRole": cls.entities["encounter_role.nurse"],
                }],
            },
        )

        complete_members = []
        for key, (value, _unit, status_key) in VITALS.items():
            complete_members.extend([
                cls._member(patient_uuid, measured_at, cls.entities[key], value),
                cls._member(
                    patient_uuid, measured_at, cls.entities[status_key],
                    cls.entities["answer.data_status.recorded"],
                ),
            ])
        complete_group = cls._create_group(
            patient_uuid, encounter["uuid"], measured_at, complete_members
        )

        later = measured_at + timedelta(minutes=5)
        missing_group = cls._create_group(
            patient_uuid,
            encounter["uuid"],
            later,
            [cls._member(
                patient_uuid, later, cls.entities["vitals.spo2_trang_thai"],
                cls.entities["answer.data_status.unknown"],
            )],
        )

        # Capture Core's immutable correction semantics once: updating an Obs
        # voids the old version and returns a replacement UUID. Then void the
        # replacement so this evidence is never treated as an active vital.
        correction = cls.client.json(
            "/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201),
            payload={
                "person": patient_uuid,
                "encounter": encounter["uuid"],
                "concept": cls.entities["vitals.mach"],
                "location": cls.entities["location.development.clinic"],
                "obsDatetime": later.isoformat(),
                "value": 79,
            },
        )
        replacement = cls.client.json(
            f"/openmrs/ws/rest/v1/obs/{correction['uuid']}", method="POST",
            payload={"value": 81},
        )
        cls.client.request(
            f"/openmrs/ws/rest/v1/obs/{replacement['uuid']}?reason=B3%20correction%20test",
            method="DELETE",
        )

        stopped_at = later + timedelta(minutes=10)
        cls.client.json(
            f"/openmrs/ws/rest/v1/visit/{visit['uuid']}", method="POST",
            payload={"stopDatetime": stopped_at.isoformat()},
        )
        fixture = {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "patientUuid": patient_uuid,
            "otherPatientUuid": other_patient_uuid,
            "personUuid": person["uuid"],
            "providerUuid": provider["uuid"],
            "visitUuid": visit["uuid"],
            "encounterUuid": encounter["uuid"],
            "groupUuids": [complete_group["uuid"], missing_group["uuid"]],
            "measuredAt": measured_at.isoformat(),
            "missingMeasuredAt": later.isoformat(),
            "stoppedAt": stopped_at.isoformat(),
            "correction": {
                "originalUuid": correction["uuid"],
                "replacementUuid": replacement["uuid"],
            },
        }
        cls.fixture_path.parent.mkdir(parents=True, exist_ok=True)
        cls.fixture_path.write_text(
            json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return fixture

    @classmethod
    def _member(cls, patient_uuid, measured_at, concept_uuid, value):
        return {
            "person": patient_uuid,
            "obsDatetime": measured_at.isoformat(),
            "concept": concept_uuid,
            "value": value,
        }

    @classmethod
    def _create_group(cls, patient_uuid, encounter_uuid, measured_at, members):
        return cls.client.json(
            "/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201),
            payload={
                "person": patient_uuid,
                "encounter": encounter_uuid,
                "concept": cls.entities["group.vitals"],
                "location": cls.entities["location.development.clinic"],
                "obsDatetime": measured_at.isoformat(),
                "groupMembers": members,
            },
        )

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def test_01_loaded_metadata_contract(self):
        visit_type = self.client.json(
            f"/openmrs/ws/rest/v1/visittype/{self.entities['visit.outpatient']}?v=full"
        )
        encounter_type = self.client.json(
            f"/openmrs/ws/rest/v1/encountertype/{self.entities['encounter.vitals']}?v=full"
        )
        role = self.client.json(
            f"/openmrs/ws/rest/v1/encounterrole/{self.entities['encounter_role.nurse']}?v=full"
        )
        self.assertFalse(visit_type["retired"])
        self.assertFalse(encounter_type["retired"])
        self.assertFalse(role["retired"])
        group = self.client.json(
            f"/openmrs/ws/rest/v1/concept/{self.entities['group.vitals']}?v=full"
        )
        member_ids = {item["uuid"] for item in group["setMembers"]}
        for key, (_value, unit, status_key) in VITALS.items():
            concept = self.client.json(
                f"/openmrs/ws/rest/v1/concept/{self.entities[key]}?v=full"
            )
            self.assertEqual(concept["datatype"]["display"], "Numeric")
            self.assertEqual(concept["units"], unit)
            self.assertIn(self.entities[key], member_ids)
            self.assertIn(self.entities[status_key], member_ids)
        self.record("official B3 metadata identities, datatypes, units and set members")

    def test_02_visit_encounter_patient_provider_and_mismatch(self):
        visit = self.client.json(
            f"/openmrs/ws/rest/v1/visit/{self.fixture['visitUuid']}?v=full"
        )
        encounter = self.client.json(
            f"/openmrs/ws/rest/v1/encounter/{self.fixture['encounterUuid']}?v=full"
        )
        self.assertEqual(visit["patient"]["uuid"], self.fixture["patientUuid"])
        self.assertEqual(visit["location"]["uuid"], self.entities["location.development.clinic"])
        self.assertEqual(visit["visitType"]["uuid"], self.entities["visit.outpatient"])
        self.assertEqual(encounter["patient"]["uuid"], self.fixture["patientUuid"])
        self.assertEqual(encounter["visit"]["uuid"], self.fixture["visitUuid"])
        self.assertEqual(encounter["encounterType"]["uuid"], self.entities["encounter.vitals"])
        self.assertTrue(encounter["encounterDatetime"])
        assigned = encounter["encounterProviders"][0]
        self.assertEqual(assigned["provider"]["uuid"], self.fixture["providerUuid"])
        self.assertEqual(
            assigned["encounterRole"]["uuid"], self.entities["encounter_role.nurse"]
        )

        mismatch_status, _, mismatch_body = self.client.request(
            "/openmrs/ws/rest/v1/encounter", method="POST",
            payload={
                "patient": self.fixture["otherPatientUuid"],
                "visit": self.fixture["visitUuid"],
                "encounterType": self.entities["encounter.vitals"],
                "location": self.entities["location.development.clinic"],
                "encounterDatetime": self.fixture["measuredAt"],
            },
        )
        self.assertEqual(mismatch_status, 400)
        self.assertIn("patients.dontMatch", mismatch_body.decode("utf-8"))
        self.record("visit/encounter ownership, provider role and cross-patient rejection")

    def test_03_complete_and_missing_vital_groups(self):
        complete = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['groupUuids'][0]}?v=full"
        )
        missing = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['groupUuids'][1]}?v=full"
        )
        self.assertEqual(complete["concept"]["uuid"], self.entities["group.vitals"])
        self.assertEqual(complete["person"]["uuid"], self.fixture["patientUuid"])
        self.assertEqual(complete["encounter"]["uuid"], self.fixture["encounterUuid"])
        by_concept = {item["concept"]["uuid"]: item for item in complete["groupMembers"]}
        for key, (expected, _unit, status_key) in VITALS.items():
            self.assertEqual(float(by_concept[self.entities[key]]["value"]), float(expected))
            self.assertEqual(
                by_concept[self.entities[status_key]]["value"]["uuid"],
                self.entities["answer.data_status.recorded"],
            )
            self.assertEqual(by_concept[self.entities[key]]["obsDatetime"], complete["obsDatetime"])
            # OpenMRS links children through obsGroup; the parent owns encounter.
            self.assertEqual(by_concept[self.entities[key]]["obsGroup"]["uuid"], complete["uuid"])
            self.assertIsNone(by_concept[self.entities[key]].get("encounter"))

        missing_ids = {item["concept"]["uuid"] for item in missing["groupMembers"]}
        self.assertNotIn(self.entities["vitals.spo2"], missing_ids)
        status = next(item for item in missing["groupMembers"]
                      if item["concept"]["uuid"] == self.entities["vitals.spo2_trang_thai"])
        self.assertEqual(status["value"]["uuid"], self.entities["answer.data_status.unknown"])
        self.assertNotEqual(complete["uuid"], missing["uuid"])
        self.record("two immutable measurement groups and explicit missing-value status")

    def test_04_invalid_type_range_gap_and_correction_void(self):
        invalid_type, _, _ = self.client.request(
            "/openmrs/ws/rest/v1/obs", method="POST",
            payload={
                "person": self.fixture["patientUuid"],
                "encounter": self.fixture["encounterUuid"],
                "concept": self.entities["vitals.spo2"],
                "obsDatetime": self.fixture["measuredAt"],
                "value": "not-a-number",
            },
        )
        self.assertEqual(invalid_type, 400)

        missing_child_fields, _, _ = self.client.request(
            "/openmrs/ws/rest/v1/obs", method="POST",
            payload={
                "person": self.fixture["patientUuid"],
                "encounter": self.fixture["encounterUuid"],
                "concept": self.entities["group.vitals"],
                "obsDatetime": self.fixture["measuredAt"],
                "groupMembers": [{
                    "concept": self.entities["vitals.mach"], "value": 80,
                }],
            },
        )
        self.assertEqual(missing_child_fields, 400)
        wrong_metadata, _, _ = self.client.request(
            "/openmrs/ws/rest/v1/obs", method="POST",
            payload={
                "person": self.fixture["patientUuid"],
                "encounter": self.fixture["encounterUuid"],
                "concept": str(uuid.uuid4()),
                "obsDatetime": self.fixture["measuredAt"],
                "value": 80,
            },
        )
        self.assertIn(wrong_metadata, (400, 404))

        # Core checks datatype, but does not enforce the metadata pack's
        # R_PERCENT/R_POS adapter rules. Prove and immediately void the record.
        outside = self.client.json(
            "/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201),
            payload={
                "person": self.fixture["patientUuid"],
                "encounter": self.fixture["encounterUuid"],
                "concept": self.entities["vitals.spo2"],
                "obsDatetime": self.fixture["measuredAt"],
                "value": 101,
            },
        )
        void_status, _, _ = self.client.request(
            f"/openmrs/ws/rest/v1/obs/{outside['uuid']}?reason=B3%20range%20probe",
            method="DELETE",
        )
        self.assertEqual(void_status, 204)
        original = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['correction']['originalUuid']}?v=full"
        )
        replacement = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['correction']['replacementUuid']}?v=full"
        )
        self.assertTrue(original["voided"])
        self.assertTrue(replacement["voided"])
        self.assertNotEqual(original["uuid"], replacement["uuid"])
        self.evidence["knownGaps"].append(
            "Core accepts SpO2=101; enforce R_PERCENT and R_POS in the VinSHC write adapter."
        )
        self.record("datatype rejection, immutable Obs correction and void semantics",
                    rangeValidation="not enforced by OpenMRS Core")

    def test_05_closed_visit_and_rest_history(self):
        visit = self.client.json(
            f"/openmrs/ws/rest/v1/visit/{self.fixture['visitUuid']}?v=full"
        )
        self.assertTrue(visit["stopDatetime"])
        history = self.client.json(
            f"/openmrs/ws/rest/v1/visit?patient={self.fixture['patientUuid']}&v=full"
        )
        self.assertIn(
            self.fixture["visitUuid"], [item["uuid"] for item in history["results"]]
        )
        self.assertNotIn(
            self.fixture["visitUuid"],
            [item["uuid"] for item in self.client.json(
                f"/openmrs/ws/rest/v1/visit?patient={self.fixture['otherPatientUuid']}&v=full"
            )["results"]],
        )
        self.record("closed visit and patient-scoped REST history")

    def test_06_fhir_encounter_and_observation_mapping(self):
        encounter = self.client.json(
            f"/openmrs/ws/fhir2/R4/Encounter/{self.fixture['encounterUuid']}"
        )
        group = self.client.json(
            f"/openmrs/ws/fhir2/R4/Observation/{self.fixture['groupUuids'][0]}"
        )
        rest_group = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['groupUuids'][0]}?v=full"
        )
        numeric = next(item for item in rest_group["groupMembers"]
                       if item["concept"]["uuid"] == self.entities["vitals.mach"])
        pulse = self.client.json(f"/openmrs/ws/fhir2/R4/Observation/{numeric['uuid']}")
        self.assertEqual(encounter["subject"]["reference"],
                         "Patient/" + self.fixture["patientUuid"])
        self.assertEqual(group["subject"]["reference"],
                         "Patient/" + self.fixture["patientUuid"])
        self.assertEqual(group["encounter"]["reference"],
                         "Encounter/" + self.fixture["encounterUuid"])
        self.assertEqual(len(group["hasMember"]), 16)
        self.assertIn(
            self.entities["group.vitals"],
            [coding["code"] for coding in group["code"]["coding"]],
        )
        self.assertEqual(pulse["valueQuantity"]["value"], 80.0)
        self.assertEqual(pulse["valueQuantity"]["unit"], "/min")
        self.assertEqual(pulse["valueQuantity"]["system"], "http://unitsofmeasure.org")
        self.assertEqual(pulse["valueQuantity"]["code"], "/min")
        self.assertIn(
            self.entities["vitals.mach"],
            [coding["code"] for coding in pulse["code"]["coding"]],
        )
        self.assertNotIn("encounter", pulse)
        self.record("FHIR Encounter and grouped Observation mapping",
                    visitMapping="OpenMRS Visit is not a FHIR Encounter",
                    childEncounter="resolved through parent group")


if __name__ == "__main__":
    unittest.main()
