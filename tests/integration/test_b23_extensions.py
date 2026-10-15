"""B2/B3 VinSHC extension, DATA-08 and validated-write integration tests."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings, fixture_path, report_path


class B23ExtensionTests(unittest.TestCase):
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
        cls.b2 = json.loads(
            (fixture_path("b2-patients.json")).read_text(encoding="utf-8")
        )
        cls.b3 = json.loads(
            (fixture_path("b3-vitals.json")).read_text(encoding="utf-8")
        )
        cls.patient = cls.b2["patients"][0]["patientUuid"]
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "checks": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 5
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = report_path("b23-extension-integration.json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def request_json(self, path, **kwargs):
        status, headers, body = self.client.request(path, **kwargs)
        content_type = headers.get("Content-Type", "").lower()
        self.assertIn("json", content_type)
        return status, json.loads(body)

    def test_01_initializer_address_hierarchy_and_identifier_systems(self):
        status = self.client.json("/openmrs/ws/rest/v1/vinshc/configuration-status")
        self.assertEqual(status["addressHierarchyEntries"], 3356)
        self.assertEqual(status["addressHierarchyCodedEntries"], 3356)
        self.assertEqual(status["addressHierarchyDistinctCodes"], 3356)
        expected_systems = {
            "urn:uuid:" + self.entities[key]
            for key in ("identifier.internal", "identifier.cccd", "identifier.bhxh", "identifier.bhyt")
        }
        self.assertEqual(set(status["fhirPatientIdentifierSystems"]), expected_systems)
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Patient/{self.patient}")
        actual = {item.get("system") for item in fhir.get("identifier", [])}
        self.assertTrue(expected_systems.issubset(actual))
        self.record("Initializer DATA-08 hierarchy and four FHIR identifier systems")

    def test_02_contact_snapshot_field_state_patch_and_void(self):
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        created = self.client.json(
            "/openmrs/ws/rest/v1/vinshc/contact", method="POST", statuses=(201,),
            payload={
                "patient": self.patient, "fullName": "Nguyễn Văn Liên Hệ",
                "relationshipCode": "FATHER", "phone": None, "priority": 9001,
                "isPrimary": False, "emergencyContact": True,
                "source": {"kind": "api", "sourceReference": "integration:b23"},
                "recordedAt": now,
            },
        )
        row_key = created["row_key"]
        self.assertEqual(created["relationship_code"], "FATHER")
        self.assertEqual(created["relationship_name"], "Cha")
        self.assertEqual(created["relationship_version"], "1.0.0")
        state = self.client.json(
            "/openmrs/ws/rest/v1/vinshc/field-state", method="POST",
            payload={
                "patient": self.patient, "fieldCode": "contact.dien_thoai",
                "rowKey": row_key, "context": "contact", "dataStatus": "unknown",
                "source": {"kind": "api", "sourceReference": "integration:b23"},
                "recordedAt": now,
            },
        )
        self.assertEqual(state["data_status"], "unknown")
        invalid_status, _ = self.request_json(
            "/openmrs/ws/rest/v1/vinshc/field-state", method="POST",
            payload={
                "patient": self.patient, "fieldCode": "contact.quan_he",
                "rowKey": row_key, "context": "contact", "dataStatus": "unknown",
                "source": {"kind": "api"}, "recordedAt": now,
            },
        )
        self.assertEqual(invalid_status, 400)
        updated = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/contact/{row_key}", method="POST",
            payload={"phone": "0901 234 567"},
        )
        self.assertEqual(updated["phone_normalized"], "+84901234567")
        self.assertEqual(updated["version_number"], 2)
        duplicate_status, _ = self.request_json(
            "/openmrs/ws/rest/v1/vinshc/contact", method="POST",
            payload={
                "patient": self.patient, "fullName": "Duplicate Priority", "priority": 9001,
                "source": {"kind": "api"}, "recordedAt": now,
            },
        )
        self.assertEqual(duplicate_status, 400)
        second = self.client.json(
            "/openmrs/ws/rest/v1/vinshc/contact", method="POST", statuses=(201,),
            payload={
                "patient": self.patient, "fullName": "Trần Thị Liên Hệ",
                "relationshipCode": "MOTHER", "phone": "0912 345 678",
                "priority": 9002, "isPrimary": False, "emergencyContact": False,
                "source": {"kind": "api", "sourceReference": "integration:b23"},
                "recordedAt": now,
            },
        )
        second_row_key = second["row_key"]
        identity = self.client.json(f"/openmrs/ws/rest/v1/vinshc/identity/{self.patient}")
        active_row_keys = {item["row_key"] for item in identity["contacts"]}
        self.assertTrue({row_key, second_row_key}.issubset(active_row_keys))
        self.assertFalse(any(item["field_code"] == "contact.dien_thoai"
                             and item.get("row_key") == row_key for item in identity["fieldStates"]))
        voided = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/contact/{row_key}?reason=integration%20complete",
            method="DELETE",
        )
        self.assertEqual(voided["status"], "void")
        second_voided = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/contact/{second_row_key}?reason=integration%20complete",
            method="DELETE",
        )
        self.assertEqual(second_voided["status"], "void")
        history = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/identity/{self.patient}?includeHistory=true"
        )
        versions = [item for item in history["contacts"] if item["row_key"] == row_key]
        self.assertEqual([item["version_number"] for item in versions], [1, 2, 3])
        self.record("multiple contacts, snapshot, phone normalization, field-state invariant, PATCH and void history",
                    rowKey=row_key, secondRowKey=second_row_key)

    def test_03_address_catalogue_snapshot_parent_validation_and_history(self):
        province_status, provinces = self.request_json(
            "/openmrs/ws/rest/v1/vinshc/address-catalogue"
        )
        self.assertEqual(province_status, 200)
        self.assertEqual(len(provinces), 34)
        province = provinces[0]
        commune_status, communes = self.request_json(
            "/openmrs/ws/rest/v1/vinshc/address-catalogue?parentCode="
            + urllib.parse.quote(province["code"])
        )
        self.assertEqual(commune_status, 200)
        self.assertGreater(len(communes), 0)
        commune = communes[0]
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        created = self.client.json(
            "/openmrs/ws/rest/v1/vinshc/address", method="POST", statuses=(201,),
            payload={
                "patient": self.patient, "addressText": "Số 12, đường Hoa",
                "legacyAddressText": "12 Hoa, địa chỉ giấy cũ",
                "provinceCode": province["code"], "communeCode": commune["code"],
                "catalogueVersion": "VN-19-2025-2025-07-01",
                "addressAsOfDate": "2026-10-11", "source": {"kind": "paper",
                    "documentUuid": str(uuid.uuid4()), "page": "1"}, "recordedAt": now,
            },
        )
        self.assertEqual(created["province_name"], province["name"])
        self.assertEqual(created["commune_name"], commune["name"])
        wrong_parent = next(item for item in provinces if item["code"] != province["code"])
        invalid_status, _ = self.request_json(
            "/openmrs/ws/rest/v1/vinshc/address", method="POST",
            payload={
                "patient": self.patient, "addressText": "invalid",
                "provinceCode": wrong_parent["code"], "communeCode": commune["code"],
                "catalogueVersion": "VN-19-2025-2025-07-01",
                "addressAsOfDate": "2026-10-11", "source": {"kind": "api"},
                "recordedAt": now,
            },
        )
        self.assertEqual(invalid_status, 400)
        updated = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/address/{created['row_key']}", method="POST",
            payload={"addressText": "Số 12A, đường Hoa"},
        )
        self.assertEqual(updated["legacy_address_text"], "12 Hoa, địa chỉ giấy cũ")
        self.assertEqual(updated["version_number"], 2)
        # The current snapshot is projected into a native PersonAddress with UUID = row key.
        native = self.client.json(
            f"/openmrs/ws/rest/v1/person/{self.patient}/address/{created['row_key']}?v=full")
        self.assertEqual(native["address1"], "Số 12A, đường Hoa")
        self.assertEqual(native["cityVillage"], commune["name"])
        self.assertEqual(native["stateProvince"], province["name"])
        self.assertTrue(native["preferred"])
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Patient/{self.patient}")
        projected = next(item for item in fhir.get("address", []) if item.get("id") == created["row_key"])
        self.assertEqual(projected.get("city"), commune["name"])
        self.assertEqual(projected.get("state"), province["name"])
        self.assertNotIn("12 Hoa, địa chỉ giấy cũ", json.dumps(projected, ensure_ascii=False))
        voided = self.client.json(
            f"/openmrs/ws/rest/v1/vinshc/address/{created['row_key']}?reason=integration%20complete",
            method="DELETE",
        )
        self.assertEqual(voided["status"], "void")
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Patient/{self.patient}")
        self.assertNotIn(created["row_key"], {item.get("id") for item in fhir.get("address", [])})
        self.record("DATA-08 parent validation, immutable current/legacy history and FHIR address projection",
                    rowKey=created["row_key"])

    def test_04_validated_vital_write_rules_and_round_trip(self):
        endpoint = "/openmrs/ws/rest/v1/vinshc/vitals"
        base = {"patient": self.patient, "encounter": self.b3["encounterUuid"]}
        invalid_payloads = [
            {**base, "values": {"vitals.spo2": "98"}},
            {**base, "values": {"vitals.mach": -1}},
            {**base, "values": {"vitals.spo2": 101}},
            {**base, "values": {"vitals.ha_tam_thu": 120}},
        ]
        for payload in invalid_payloads:
            status, _ = self.request_json(endpoint, method="POST", payload=payload)
            self.assertEqual(status, 400)
        saved = self.client.json(
            endpoint, method="POST", statuses=(201,),
            payload={
                **base,
                "values": {"vitals.ha_tam_thu": 70, "vitals.ha_tam_truong": 80,
                           "vitals.spo2": 98},
            },
        )
        self.assertTrue(saved["needsVerification"])
        group = self.client.json(f"/openmrs/ws/rest/v1/obs/{saved['uuid']}?v=full")
        self.assertEqual(group["concept"]["uuid"], self.entities["group.vitals"])
        self.assertEqual(group["encounter"]["uuid"], self.b3["encounterUuid"])
        self.assertEqual(len(group["groupMembers"]), 6)
        deleted, _, _ = self.client.request(
            f"/openmrs/ws/rest/v1/obs/{saved['uuid']}?reason=B23%20adapter%20test",
            method="DELETE",
        )
        self.assertEqual(deleted, 204)
        self.record("R_NUM, R_POS, R_PERCENT, R_BP and non-blocking BP verification",
                    groupUuid=saved["uuid"])

    def test_05_extension_privileges_return_403(self):
        person = self.client.json(
            "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
            payload={"names": [{"givenName": "Restricted", "familyName": "B23"}], "gender": "U"},
        )
        username = "b23-restricted-" + uuid.uuid4().hex[:12]
        password = "B23-local-" + uuid.uuid4().hex
        user = self.client.json(
            "/openmrs/ws/rest/v1/user", method="POST", statuses=(200, 201),
            payload={"username": username, "password": password, "person": person["uuid"], "roles": []},
        )
        restricted = Client(self.client.base_url, username, password)
        try:
            read_status, _, _ = restricted.request(
                f"/openmrs/ws/rest/v1/vinshc/identity/{self.patient}"
            )
            write_status, _, _ = restricted.request(
                "/openmrs/ws/rest/v1/vinshc/vitals", method="POST",
                payload={"patient": self.patient, "encounter": self.b3["encounterUuid"],
                         "values": {"vitals.spo2": 98}},
            )
            self.assertEqual(read_status, 403)
            self.assertEqual(write_status, 403)
        finally:
            self.client.request(
                f"/openmrs/ws/rest/v1/user/{user['uuid']}?reason=B23%20test%20complete",
                method="DELETE",
            )
            self.client.request(
                f"/openmrs/ws/rest/v1/person/{person['uuid']}?reason=B23%20test%20complete",
                method="DELETE",
            )
        self.record("extension read/write privilege rejection", status=403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
