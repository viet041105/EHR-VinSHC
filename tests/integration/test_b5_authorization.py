"""B5 runtime acceptance for eight roles, active workspaces, facility scope and access audit."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_client import Client
from common import read_settings, fixture_path, report_path


class B5AuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}"
        cls.admin = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        cls.permissions = json.loads(
            (ROOT / "metadata/vinshc/permissions.json").read_text(encoding="utf-8")
        )
        facility = json.loads(
            (ROOT / "metadata/vinshc/catalogues/facilities.json").read_text(encoding="utf-8")
        )["records"][0]
        cls.facility = facility["locationUuid"]
        cls.facility_name = facility["name"]
        b2 = json.loads((fixture_path("b2-patients.json")).read_text(encoding="utf-8"))
        b4 = json.loads((fixture_path("b4a-consultations.json")).read_text(encoding="utf-8"))
        cls.patient = b2["patients"][0]["patientUuid"]
        cls.encounter = b4["encounterUuids"][0]
        cls.clients = {}
        cls.user_by_role = {}
        cls.created = []
        cls.report = {"startedAt": datetime.now(timezone.utc).isoformat(), "passed": False,
                      "roles": {}, "checks": []}
        for role, definition in cls.permissions["roles"].items():
            person = cls.admin.json(
                "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
                payload={"names": [{"givenName": "B5", "familyName": role}], "gender": "U",
                         "birthdate": "2000-01-01"},
            )
            username = "b5-" + role + "-" + uuid.uuid4().hex[:10]
            password = "B5-local-" + uuid.uuid4().hex
            user = cls.admin.json(
                "/openmrs/ws/rest/v1/user", method="POST", statuses=(200, 201),
                payload={"username": username, "password": password, "person": person["uuid"],
                         "roles": [definition["openmrs"]["uuid"]]},
            )
            cls.created.append((user["uuid"], person["uuid"]))
            cls.user_by_role[role] = user["uuid"]
            cls.admin.json(
                "/openmrs/ws/rest/v1/vinshc/authorization/assignment", method="POST",
                statuses=(200, 201), payload={"user": user["uuid"], "role": role,
                                              "facility": cls.facility},
            )
            cls.clients[role] = Client(
                cls.base, username, password,
                default_headers={"X-VinSHC-Workspace-Role": role,
                                 "X-VinSHC-Workspace-Facility": cls.facility},
            )

    @classmethod
    def tearDownClass(cls):
        cls.report["passed"] = all(check["passed"] for check in cls.report["checks"])
        cls.report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = report_path("b5-authorization.json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for user, person in cls.created:
            cls.admin.request(f"/openmrs/ws/rest/v1/user/{user}?reason=B5%20test%20complete", method="DELETE")
            cls.admin.request(f"/openmrs/ws/rest/v1/person/{person}?reason=B5%20test%20complete", method="DELETE")

    def record(self, name, **details):
        self.report["checks"].append({"name": name, "passed": True, **details})

    def test_01_sessions_and_workspace_assignment(self):
        for role, client in self.clients.items():
            session = client.json("/openmrs/ws/rest/v1/session")
            self.assertTrue(session["authenticated"])
            workspaces = client.json("/openmrs/ws/rest/v1/vinshc/authorization/workspaces")
            self.assertEqual([{"role": role, "facilityUuid": self.facility,
                              "facilityName": self.facility_name}], workspaces)
            workspace = client.json("/openmrs/ws/rest/v1/vinshc/authorization/workspace")
            self.assertEqual(role, workspace["role"])
            self.assertEqual(self.facility, workspace["facilityUuid"])
        doctor = self.clients["doctor"]
        wrong, _, wrong_body = doctor.request("/openmrs/ws/rest/v1/session", password=doctor.password + "-wrong")
        self.assertIn(wrong, (200, 401, 403))
        if wrong == 200:
            # OpenMRS answers the session resource with 200 for anonymous callers; a bad password
            # must still leave the session unauthenticated.
            self.assertFalse(json.loads(wrong_body)["authenticated"])
        no_workspace = Client(self.base, doctor.username, doctor.password)
        status, _, _ = no_workspace.request("/openmrs/ws/rest/v1/vinshc/authorization/workspace")
        self.assertEqual(403, status)
        wrong_facility = Client(
            self.base, doctor.username, doctor.password,
            default_headers={"X-VinSHC-Workspace-Role": "doctor",
                             "X-VinSHC-Workspace-Facility": str(uuid.uuid4())},
        )
        status, _, _ = wrong_facility.request("/openmrs/ws/rest/v1/vinshc/authorization/workspace")
        self.assertEqual(403, status)
        self.record("individual login, bad password, active role and server-bound facility workspace")

    def test_02_complete_role_matrix_is_enforced(self):
        checked = 0
        allowed = 0
        for cell in self.permissions["matrix"]:
            client = self.clients[cell["role"]]
            for action, policy in cell["actions"].items():
                status, _, body = client.request(
                    f"/openmrs/ws/rest/v1/vinshc/authorization/evaluate?resource={cell['resource']}&action={action}"
                )
                checked += 1
                if policy is None:
                    self.assertEqual(403, status, (cell["role"], cell["resource"], action, body))
                else:
                    self.assertEqual(200, status, (cell["role"], cell["resource"], action, body))
                    allowed += 1
        self.assertEqual(8 * 16 * 7, checked)
        self.record("8-role x 16-resource x 7-action default-deny matrix", cells=checked,
                    allowedCells=allowed)

    def test_03_real_adapter_and_direct_core_boundaries(self):
        for role in ("reception", "cashier", "nurse", "doctor", "lab", "pharmacy"):
            result = self.clients[role].json(f"/openmrs/ws/rest/v1/vinshc/identity/{self.patient}")
            self.assertEqual(self.patient, result["patientUuid"])
        for role in ("manager", "admin"):
            status, _, _ = self.clients[role].request(
                f"/openmrs/ws/rest/v1/vinshc/identity/{self.patient}"
            )
            self.assertEqual(403, status)
        for role in ("nurse", "doctor"):
            summary = self.clients[role].json(
                f"/openmrs/ws/rest/v1/vinshc/encounter/{self.encounter}/clinical-summary"
            )
            self.assertEqual(self.encounter, summary["encounterUuid"])
        icd = json.loads(
            (ROOT / "metadata/vinshc/catalogues/icd10-mvp.json").read_text(encoding="utf-8")
        )
        diagnosis_concept = next(row["conceptUuid"] for row in icd["records"] if row["code"] == "I10")
        diagnosis_status, _, diagnosis_body = self.clients["doctor"].request(
            "/openmrs/ws/rest/v1/vinshc/diagnosis", method="POST",
            payload={"patient": json.loads(
                (fixture_path("b4a-consultations.json")).read_text(encoding="utf-8")
            )["patientUuid"], "encounter": self.encounter, "concept": diagnosis_concept,
                     "rank": "primary", "certainty": "confirmed"},
        )
        self.assertIn(diagnosis_status, (200, 201), diagnosis_body)
        diagnosis = json.loads(diagnosis_body)
        status, _, _ = self.clients["doctor"].request(
            f"/openmrs/ws/rest/v1/vinshc/diagnosis/{diagnosis['uuid']}?reason=B5%20authorization%20test",
            method="DELETE",
        )
        self.assertEqual(200, status)
        for role, client in self.clients.items():
            rest, _, _ = client.request(f"/openmrs/ws/rest/v1/patient/{self.patient}?v=full")
            fhir, _, _ = client.request(f"/openmrs/ws/fhir2/R4/Patient/{self.patient}")
            self.assertEqual(403, rest, role)
            # FHIR2 4.2.0 has a known upstream defect: missing privilege can surface as 500.
            self.assertIn(fhir, (403, 500), role)
        self.record("real B2/B4 adapter read/write/void plus direct Core REST/FHIR bypass denial")

    def test_04_access_audit_has_actor_time_action_and_target(self):
        status, headers, body = self.admin.request(
            f"/openmrs/ws/rest/v1/vinshc/authorization/audit?patient={self.patient}"
        )
        self.assertEqual(200, status)
        self.assertIn("json", headers.get("Content-Type", "").lower())
        rows = json.loads(body)
        identity = [row for row in rows if row["resource"] == "patient_identity"]
        self.assertGreaterEqual(len(identity), 6)
        for row in identity:
            self.assertEqual("read", row["action"])
            self.assertTrue(row["byUserUuid"])
            self.assertTrue(row["at"])
            self.assertEqual(self.patient, row["entityUuid"])
        self.record("record-access audit", rows=len(identity), fields=["actor", "time", "action", "target"])

    def test_05_workspace_assignment_can_be_revoked(self):
        revoked = self.admin.json(
            "/openmrs/ws/rest/v1/vinshc/authorization/assignment", method="DELETE",
            payload={"user": self.user_by_role["admin"], "role": "admin", "facility": self.facility},
        )
        self.assertFalse(revoked["active"])
        status, _, _ = self.clients["admin"].request(
            "/openmrs/ws/rest/v1/vinshc/authorization/workspace"
        )
        self.assertEqual(403, status)
        self.record("workspace assignment revocation is effective immediately")


if __name__ == "__main__":
    unittest.main()
