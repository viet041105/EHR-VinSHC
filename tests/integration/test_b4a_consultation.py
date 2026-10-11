"""B4A consultation Obs contract tests for the local Docker instance."""

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


TEXT_CONCEPTS = (
    "visit.ly_do_kham",
    "history.benh_su",
    "history.tien_su_ban_than",
    "history.tien_su_gia_dinh",
    "exam.trieu_chung",
    "exam.toan_than",
    "exam.bo_phan",
    "exam.tom_tat",
    "exam.huong_dieu_tri",
    "exam.loi_dan",
    "followup.loi_dan",
)


class B4AConsultationTests(unittest.TestCase):
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
        cls.fixture_path = ROOT / ".runtime/fixtures/b4a-consultations.json"
        cls.fixture = cls._load_or_create_fixture()
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "patientUuid": cls.fixture["patientUuid"],
            "visitUuids": cls.fixture["visitUuids"],
            "encounterUuids": cls.fixture["encounterUuids"],
            "groupUuids": cls.fixture["groupUuids"],
            "checks": [],
            "deferred": [
                "ICD-10 Diagnosis: awaiting a versioned catalogue",
                "Native Allergy details: awaiting allergen/reaction/severity catalogues",
                "DrugOrder: awaiting facility drugs, units, routes and frequencies",
            ],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 6
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        destination = ROOT / ".runtime/reports/b4a-integration.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    @classmethod
    def _load_or_create_fixture(cls):
        if cls.fixture_path.is_file():
            fixture = json.loads(cls.fixture_path.read_text(encoding="utf-8"))
            for visit_uuid in fixture["visitUuids"]:
                cls.client.json(f"/openmrs/ws/rest/v1/visit/{visit_uuid}?v=full")
            for encounter_uuid in fixture["encounterUuids"]:
                cls.client.json(f"/openmrs/ws/rest/v1/encounter/{encounter_uuid}?v=full")
            for group_uuid in fixture["groupUuids"]:
                cls.client.json(f"/openmrs/ws/rest/v1/obs/{group_uuid}?v=full")
            return fixture

        b2_path = ROOT / ".runtime/fixtures/b2-patients.json"
        if not b2_path.is_file():
            raise AssertionError(
                "B4A depends on B2 patients. Run test_b2_patient.py once first."
            )
        patients = json.loads(b2_path.read_text(encoding="utf-8"))["patients"]
        if len(patients) < 2:
            raise AssertionError("The B2 fixture must contain two isolated patients.")
        # Use the second B2 patient so a freshly-created B3 visit for the first
        # patient cannot overlap the consultation fixture during full discovery.
        patient_uuid = patients[1]["patientUuid"]
        cls.client.json(f"/openmrs/ws/rest/v1/patient/{patient_uuid}")

        person = cls.client.json(
            "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
            payload={
                "names": [{"givenName": "Synthetic B4A", "familyName": "Clinician"}],
                "gender": "U",
            },
        )
        provider = cls.client.json(
            "/openmrs/ws/rest/v1/provider", method="POST", statuses=(200, 201),
            payload={
                "person": person["uuid"],
                "identifier": "B4A-CLINICIAN-" + uuid.uuid4().hex[:10].upper(),
            },
        )

        # The B2 patient is synthetic and was created recently; OpenMRS rejects
        # a visit dated before the patient record existed.
        now = datetime.now(timezone.utc).replace(microsecond=0)
        first_time = now - timedelta(seconds=5)
        second_time = now - timedelta(seconds=1)
        first = cls._create_consultation(
            patient_uuid,
            provider["uuid"],
            cls.entities["visit.outpatient"],
            first_time,
            {
                "visit.ly_do_kham": "Ho và đau họng ba ngày",
                "history.benh_su": "Ho khan tăng về đêm, chưa dùng thuốc",
                "history.tien_su_ban_than_trang_thai":
                    cls.entities["answer.history_status.present"],
                "history.tien_su_ban_than": "Tăng huyết áp đang theo dõi",
                "history.tien_su_gia_dinh_trang_thai":
                    cls.entities["answer.history_status.none_reported"],
                "exam.trieu_chung": "Ho khan, đau họng",
                "exam.toan_than": "Tỉnh, tiếp xúc tốt",
                "exam.bo_phan": "Họng đỏ nhẹ",
                "exam.tom_tat": "Viêm đường hô hấp trên, chưa có dấu hiệu nặng",
                "exam.huong_dieu_tri": "Điều trị triệu chứng và theo dõi",
                "exam.loi_dan": "Uống đủ nước",
                "allergy.trang_thai": cls.entities["answer.allergy_status.no_known_allergy"],
                "followup.ngay_tai_kham": (first_time + timedelta(days=4)).date().isoformat(),
                "followup.loi_dan": "Tái khám sớm nếu khó thở hoặc sốt cao",
            },
        )
        first_group = cls.client.json(
            f"/openmrs/ws/rest/v1/obs/{first['groupUuid']}?v=full"
        )
        old_advice = next(
            item for item in first_group["groupMembers"]
            if item["concept"]["uuid"] == cls.entities["exam.loi_dan"]
        )
        new_advice = cls.client.json(
            f"/openmrs/ws/rest/v1/obs/{old_advice['uuid']}", method="POST",
            payload={"value": "Uống đủ nước, theo dõi nhiệt độ"},
        )

        second = cls._create_consultation(
            patient_uuid,
            provider["uuid"],
            cls.entities["visit.followup"],
            second_time,
            {
                "visit.ly_do_kham": "Tái khám ho và đau họng",
                "history.benh_su": "Ho giảm, không sốt",
                "history.tien_su_ban_than_trang_thai":
                    cls.entities["answer.history_status.unknown"],
                "history.tien_su_gia_dinh_trang_thai":
                    cls.entities["answer.history_status.not_asked"],
                "exam.trieu_chung": "Còn ho nhẹ",
                "exam.toan_than": "Ổn định",
                "exam.bo_phan": "Họng bớt đỏ",
                "exam.tom_tat": "Triệu chứng cải thiện",
                "exam.huong_dieu_tri": "Tiếp tục theo dõi",
                "exam.loi_dan": "Quay lại khi triệu chứng tăng",
                "allergy.trang_thai": cls.entities["answer.allergy_status.unknown"],
            },
        )

        fixture = {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "patientUuid": patient_uuid,
            "personUuid": person["uuid"],
            "providerUuid": provider["uuid"],
            "visitUuids": [first["visitUuid"], second["visitUuid"]],
            "encounterUuids": [first["encounterUuid"], second["encounterUuid"]],
            "groupUuids": [first["groupUuid"], second["groupUuid"]],
            "encounterTimes": [first_time.isoformat(), second_time.isoformat()],
            "adviceCorrection": {
                "originalUuid": old_advice["uuid"],
                "replacementUuid": new_advice["uuid"],
            },
        }
        cls.fixture_path.parent.mkdir(parents=True, exist_ok=True)
        cls.fixture_path.write_text(
            json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        return fixture

    @classmethod
    def _create_consultation(cls, patient_uuid, provider_uuid, visit_type, at, values):
        visit = cls.client.json(
            "/openmrs/ws/rest/v1/visit", method="POST", statuses=(200, 201),
            payload={
                "patient": patient_uuid,
                "visitType": visit_type,
                "location": cls.entities["location.development.clinic"],
                "startDatetime": at.isoformat(),
            },
        )
        encounter = cls.client.json(
            "/openmrs/ws/rest/v1/encounter", method="POST", statuses=(200, 201),
            payload={
                "patient": patient_uuid,
                "visit": visit["uuid"],
                "encounterType": cls.entities["encounter.consultation"],
                "location": cls.entities["location.development.clinic"],
                "encounterDatetime": at.isoformat(),
                "encounterProviders": [{
                    "provider": provider_uuid,
                    "encounterRole": cls.entities["encounter_role.clinician"],
                }],
            },
        )
        members = [{
            "person": patient_uuid,
            "obsDatetime": at.isoformat(),
            "concept": cls.entities[key],
            "value": value,
        } for key, value in values.items()]
        group = cls.client.json(
            "/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201),
            payload={
                "person": patient_uuid,
                "encounter": encounter["uuid"],
                "concept": cls.entities["group.consultation"],
                "location": cls.entities["location.development.clinic"],
                "obsDatetime": at.isoformat(),
                "groupMembers": members,
            },
        )
        cls.client.json(
            f"/openmrs/ws/rest/v1/visit/{visit['uuid']}", method="POST",
            payload={"stopDatetime": (at + timedelta(seconds=2)).isoformat()},
        )
        return {
            "visitUuid": visit["uuid"],
            "encounterUuid": encounter["uuid"],
            "groupUuid": group["uuid"],
        }

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def _members(self, index):
        group = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['groupUuids'][index]}?v=full"
        )
        return group, {item["concept"]["uuid"]: item for item in group["groupMembers"]}

    def test_01_consultation_metadata_contract(self):
        encounter_type = self.client.json(
            f"/openmrs/ws/rest/v1/encountertype/{self.entities['encounter.consultation']}?v=full"
        )
        role = self.client.json(
            f"/openmrs/ws/rest/v1/encounterrole/{self.entities['encounter_role.clinician']}?v=full"
        )
        group = self.client.json(
            f"/openmrs/ws/rest/v1/concept/{self.entities['group.consultation']}?v=full"
        )
        self.assertFalse(encounter_type["retired"])
        self.assertFalse(role["retired"])
        members = {item["uuid"] for item in group["setMembers"]}
        expected = set(TEXT_CONCEPTS) | {
            "history.tien_su_ban_than_trang_thai",
            "history.tien_su_gia_dinh_trang_thai",
            "allergy.trang_thai",
            "followup.ngay_tai_kham",
        }
        self.assertTrue({self.entities[key] for key in expected}.issubset(members))
        for key in TEXT_CONCEPTS:
            concept = self.client.json(
                f"/openmrs/ws/rest/v1/concept/{self.entities[key]}?v=full"
            )
            self.assertEqual(concept["datatype"]["display"], "Text")
        self.record("consultation encounter, role, group members and datatypes")

    def test_02_first_consultation_round_trip(self):
        group, members = self._members(0)
        encounter = self.client.json(
            f"/openmrs/ws/rest/v1/encounter/{self.fixture['encounterUuids'][0]}?v=full"
        )
        self.assertEqual(group["person"]["uuid"], self.fixture["patientUuid"])
        self.assertEqual(group["encounter"]["uuid"], encounter["uuid"])
        self.assertEqual(encounter["visit"]["uuid"], self.fixture["visitUuids"][0])
        self.assertEqual(encounter["encounterType"]["uuid"],
                         self.entities["encounter.consultation"])
        assigned = encounter["encounterProviders"][0]
        self.assertEqual(assigned["provider"]["uuid"], self.fixture["providerUuid"])
        self.assertEqual(assigned["encounterRole"]["uuid"],
                         self.entities["encounter_role.clinician"])
        self.assertEqual(members[self.entities["visit.ly_do_kham"]]["value"],
                         "Ho và đau họng ba ngày")
        self.assertEqual(
            members[self.entities["history.tien_su_ban_than_trang_thai"]]["value"]["uuid"],
            self.entities["answer.history_status.present"],
        )
        self.assertEqual(members[self.entities["history.tien_su_ban_than"]]["value"],
                         "Tăng huyết áp đang theo dõi")
        self.assertNotIn(self.entities["history.tien_su_gia_dinh"], members)
        self.record("first consultation text/history/provider round trip")

    def test_03_allergy_screen_and_missing_state_semantics(self):
        _, first = self._members(0)
        _, second = self._members(1)
        self.assertEqual(
            first[self.entities["allergy.trang_thai"]]["value"]["uuid"],
            self.entities["answer.allergy_status.no_known_allergy"],
        )
        self.assertEqual(
            second[self.entities["allergy.trang_thai"]]["value"]["uuid"],
            self.entities["answer.allergy_status.unknown"],
        )
        self.assertEqual(
            second[self.entities["history.tien_su_gia_dinh_trang_thai"]]["value"]["uuid"],
            self.entities["answer.history_status.not_asked"],
        )
        self.assertNotIn(self.entities["history.tien_su_ban_than"], second)
        self.assertNotEqual(
            first[self.entities["allergy.trang_thai"]]["uuid"],
            second[self.entities["allergy.trang_thai"]]["uuid"],
        )
        self.record("not asked, unknown and no-known-allergy remain distinct")

    def test_04_followup_date_and_no_appointment_side_effect(self):
        _, first = self._members(0)
        followup = first[self.entities["followup.ngay_tai_kham"]]
        self.assertRegex(str(followup["value"]), r"^\d{4}-\d{2}-\d{2}")
        self.assertEqual(
            first[self.entities["followup.loi_dan"]]["value"],
            "Tái khám sớm nếu khó thở hoặc sốt cao",
        )
        self.record("follow-up date/advice stored as Obs without claiming an Appointment")

    def test_05_obs_correction_preserves_history(self):
        original = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['adviceCorrection']['originalUuid']}?v=full"
        )
        replacement = self.client.json(
            f"/openmrs/ws/rest/v1/obs/{self.fixture['adviceCorrection']['replacementUuid']}?v=full"
        )
        group, members = self._members(0)
        self.assertTrue(original["voided"])
        self.assertFalse(replacement["voided"])
        self.assertEqual(replacement["value"], "Uống đủ nước, theo dõi nhiệt độ")
        self.assertEqual(replacement["obsGroup"]["uuid"], group["uuid"])
        self.assertEqual(members[self.entities["exam.loi_dan"]]["uuid"], replacement["uuid"])
        self.record("immutable correction keeps old Obs and links replacement to the group")

    def test_06_second_visit_isolation_and_fhir_read(self):
        first_group, first = self._members(0)
        second_group, second = self._members(1)
        self.assertNotEqual(self.fixture["visitUuids"][0], self.fixture["visitUuids"][1])
        self.assertNotEqual(first_group["uuid"], second_group["uuid"])
        self.assertEqual(first[self.entities["exam.tom_tat"]]["value"],
                         "Viêm đường hô hấp trên, chưa có dấu hiệu nặng")
        self.assertEqual(second[self.entities["exam.tom_tat"]]["value"],
                         "Triệu chứng cải thiện")
        first_visit = self.client.json(
            f"/openmrs/ws/rest/v1/visit/{self.fixture['visitUuids'][0]}?v=full"
        )
        second_visit = self.client.json(
            f"/openmrs/ws/rest/v1/visit/{self.fixture['visitUuids'][1]}?v=full"
        )
        self.assertEqual(first_visit["visitType"]["uuid"], self.entities["visit.outpatient"])
        self.assertEqual(second_visit["visitType"]["uuid"], self.entities["visit.followup"])
        self.assertTrue(first_visit["stopDatetime"])
        self.assertTrue(second_visit["stopDatetime"])
        fhir = self.client.json(
            f"/openmrs/ws/fhir2/R4/Observation/{second_group['uuid']}"
        )
        self.assertEqual(fhir["subject"]["reference"],
                         "Patient/" + self.fixture["patientUuid"])
        self.assertEqual(fhir["encounter"]["reference"],
                         "Encounter/" + self.fixture["encounterUuids"][1])
        self.assertEqual(len(fhir["hasMember"]), len(second_group["groupMembers"]))
        self.record("second visit isolation and FHIR grouped Observation read")


if __name__ == "__main__":
    unittest.main()
