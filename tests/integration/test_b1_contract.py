"""B1 runtime contract tests for an isolated local OpenMRS instance."""

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
from common import read_settings
from fixtures import create_and_end_visit, load_or_create_patient


class B1ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.client = Client(f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
                            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
        cls.fixture_path = ROOT / ".runtime/fixtures/b1-patient.json"
        cls.fixture = load_or_create_patient(
            cls.client, cls.fixture_path, baseline["developmentLocation"]["uuid"])
        cls.evidence = {"startedAt": datetime.now(timezone.utc).isoformat(), "passed": False,
                        "patientUuid": cls.fixture["patientUuid"], "checks": []}

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 4
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        destination = ROOT / ".runtime/reports/b1-integration.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(cls.evidence, indent=2) + "\n", encoding="utf-8")

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def test_01_authenticated_session(self):
        session = self.client.json("/openmrs/ws/rest/v1/session")
        self.assertIs(session.get("authenticated"), True)
        self.assertTrue(session.get("user", {}).get("uuid"))
        self.record("authenticated session", method="GET", path="/ws/rest/v1/session", status=200)

    def test_02_patient_create_search_and_read(self):
        patient_uuid = self.fixture["patientUuid"]
        identifier = self.fixture["identifier"]
        patient = self.client.json(f"/openmrs/ws/rest/v1/patient/{patient_uuid}?v=full")
        self.assertEqual(patient.get("uuid"), patient_uuid)
        self.assertTrue(any(item.get("identifier") == identifier for item in patient.get("identifiers", [])))
        search = self.client.json(f"/openmrs/ws/rest/v1/patient?q={identifier}&v=full")
        self.assertEqual([item.get("uuid") for item in search.get("results", [])], [patient_uuid])
        self.record("patient create/search/read", method="POST/GET", path="/ws/rest/v1/patient",
                    status=200, identifier=identifier)

    def test_03_open_end_and_read_visit_history(self):
        result = create_and_end_visit(
            self.client, self.fixture["patientUuid"], self.fixture["locationUuid"])
        visit = self.client.json(f"/openmrs/ws/rest/v1/visit/{result['visitUuid']}?v=full")
        self.assertEqual(visit.get("patient", {}).get("uuid"), self.fixture["patientUuid"])
        self.assertEqual(visit.get("visitType", {}).get("uuid"), result["visitTypeUuid"])
        self.assertTrue(visit.get("stopDatetime"))
        history = self.client.json(
            f"/openmrs/ws/rest/v1/visit?patient={self.fixture['patientUuid']}&v=full")
        self.assertIn(result["visitUuid"], [item.get("uuid") for item in history.get("results", [])])
        self.evidence["visitUuid"] = result["visitUuid"]
        self.record("open/end/read visit history", method="POST/GET", path="/ws/rest/v1/visit", status=200)

    def test_04_runtime_error_contract(self):
        anonymous, _, _ = self.client.request(
            "/openmrs/ws/rest/v1/patient?q=VinSHC", auth=False)
        invalid, _, invalid_body = self.client.request(
            "/openmrs/ws/rest/v1/patient", method="POST", payload={})
        missing_uuid = str(uuid.uuid4())
        missing, _, missing_body = self.client.request(
            f"/openmrs/ws/rest/v1/patient/{missing_uuid}")
        person = self.client.json(
            "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
            payload={"names": [{"givenName": "Synthetic", "familyName": "B1 Restricted"}],
                     "gender": "U", "birthdate": "2000-01-01"},
        )
        restricted_username = "b1-restricted-" + uuid.uuid4().hex[:12]
        restricted_password = "B1-local-" + uuid.uuid4().hex
        user = self.client.json(
            "/openmrs/ws/rest/v1/user", method="POST", statuses=(200, 201),
            payload={"username": restricted_username, "password": restricted_password,
                     "person": person["uuid"], "roles": []},
        )
        restricted_client = Client(self.client.base_url, restricted_username, restricted_password)
        restricted_session = restricted_client.json("/openmrs/ws/rest/v1/session")
        self.assertIs(restricted_session.get("authenticated"), True)
        forbidden, _, forbidden_body = restricted_client.request(
            f"/openmrs/ws/rest/v1/patient/{self.fixture['patientUuid']}")
        self.assertIn(anonymous, (401, 403))
        self.assertEqual(invalid, 400)
        self.assertEqual(forbidden, 403)
        self.assertEqual(missing, 404)
        for body in (invalid_body, forbidden_body, missing_body):
            parsed = json.loads(body)
            self.assertIsInstance(parsed, dict)
            self.assertTrue(parsed.get("error", {}).get("message"))
        self.record("runtime 400/401/403/404 errors", method="GET/POST", path="/ws/rest/v1/patient",
                    statuses=[invalid, anonymous, forbidden, missing])
        # Void only the synthetic account/person created by this test. Credentials are never persisted.
        self.client.request(f"/openmrs/ws/rest/v1/user/{user['uuid']}?reason=B1%20test%20complete",
                            method="DELETE")
        self.client.request(f"/openmrs/ws/rest/v1/person/{person['uuid']}?reason=B1%20test%20complete",
                            method="DELETE")


if __name__ == "__main__":
    unittest.main()
