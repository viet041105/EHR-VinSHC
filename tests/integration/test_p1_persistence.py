"""Verify UUID-only synthetic P1 fixtures survive a backend restart without rebuilding DB."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from api_client import Client
from common import read_settings

class P1PersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = "http://127.0.0.1:" + settings.get("EHR_HTTP_PORT", "8080")
        cls.admin = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        cls.evidence = json.loads((ROOT / ".runtime/p1-local/reports/p1-acceptance.json").read_text(encoding="utf-8"))
        if not cls.evidence.get("passed"): raise ValueError("P1 acceptance fixture not passed")

    def get(self, path):
        return self.admin.json("/openmrs/ws/rest/v1/vinshc/" + path)

    def test_user_roles_persist(self):
        accounts = {u["uuid"]: u for u in self.get("staff/users?limit=100")["results"]}
        for role, uuid in self.evidence["accountUuids"].items():
            with self.subTest(role=role):
                self.assertIn(uuid, accounts)
                self.assertIn(role, accounts[uuid]["roles"])

    def test_provider_link_persists(self):
        doctor = self.evidence["accountUuids"]["doctor"]
        links = self.get("directory/users/" + doctor + "/providers")["links"]
        self.assertTrue(any(l["providerUuid"] == self.evidence["providerUuid"] for l in links))

    def test_retired_facility_persists(self):
        facility = self.get("directory/facilities/" + self.evidence["facilityUuid"])
        self.assertFalse(facility["active"])
        self.assertNotEqual(facility["facilityUuid"], facility["locationUuid"])

    def test_form_version_persists(self):
        form = self.get("admin-configuration/forms/" + self.evidence["formUuid"])
        self.assertEqual(form["version"], 2)
        self.assertEqual(form["state"], "active")

if __name__ == "__main__":
    unittest.main()
