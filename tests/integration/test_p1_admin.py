"""P1 synthetic acceptance: secure staffing, provider links, facility identity and form versions."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from api_client import Client
from common import read_settings, report_path


# Keys that would carry a credential; mustChangePassword and the user.password_* audit actions are not secrets.
SECRET_KEYS = {"password", "currentpassword", "newpassword", "hashedpassword", "salt", "secret"}


class P1AdminTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}"
        cls.admin = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        cls.location = json.loads((ROOT / "config/baseline.json").read_text())["developmentLocation"]["uuid"]
        cls.users = {}
        cls.passwords = {}
        cls.evidence = {"startedAt": datetime.now(timezone.utc).isoformat(), "checks": []}

    @classmethod
    def tearDownClass(cls):
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 6
        # UUID-only persistence fixture: never write passwords or secrets.
        cls.evidence["accountUuids"] = {role: user["uuid"] for role, user in cls.users.items()}
        cls.evidence["providerUuid"] = getattr(cls, "provider", {}).get("uuid")
        cls.evidence["facilityUuid"] = getattr(cls, "facility_id", None)
        cls.evidence["formUuid"] = getattr(cls, "form_id", None)
        path = report_path("p1-acceptance.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cls.evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def record(self, name):
        self.evidence["checks"].append({"name": name, "passed": True})

    def call(self, path, payload=None, method="POST"):
        status, _, content = self.admin.request(
            "/openmrs/ws/rest/v1/vinshc/" + path, method=method, payload=payload
        )
        return status, json.loads(content)

    def test_01_create_all_roles_and_no_password_exposure(self):
        roles = ("reception", "cashier", "nurse", "doctor", "lab", "pharmacy", "manager", "admin")
        for role in roles:
            username = "p1-" + role + "-" + uuid.uuid4().hex[:8]
            password = "P1-local-" + uuid.uuid4().hex
            status, user = self.call("staff/users", {
                "username": username, "password": password, "role": role,
                "givenName": "Synthetic", "familyName": role, "gender": "U",
            })
            self.assertEqual(status, 201, user)
            self.assertEqual(user["roles"], [role])
            self.assertEqual(user["username"], username)
            self.assertFalse(user["retired"])
            self.assertFalse(user["mustChangePassword"])
            self.assertFalse(any(k in user for k in ("password", "hashedPassword", "salt")))
            self.assertNotIn(password, json.dumps(user))
            self.users[role] = user
            self.passwords[role] = password
        doctor = self.users["doctor"]
        staff = Client(self.base, doctor["username"], self.passwords["doctor"])
        # No forced first-login change: the admin-set password works immediately.
        self.assertEqual(staff.request("/openmrs/ws/rest/v1/vinshc/providers/me")[0], 200)
        replacement = "p1" + uuid.uuid4().hex[:4]  # 6 characters, no case/digit rules
        code, _, content = staff.request("/openmrs/ws/rest/v1/vinshc/staff/me/password", method="POST", payload={
            "currentPassword": self.passwords["doctor"], "newPassword": replacement,
        })
        changed = json.loads(content)
        self.assertEqual(code, 200, changed)
        self.assertFalse(changed["mustChangePassword"])
        self.assertNotIn(replacement, content.decode("utf-8"))
        self.passwords["doctor"] = replacement
        staff = Client(self.base, doctor["username"], replacement)
        self.assertEqual(staff.request("/openmrs/ws/rest/v1/vinshc/providers/me")[0], 200)
        status, listing = self.call("staff/users?limit=30&offset=0", method="GET")
        self.assertEqual(status, 200, listing)
        self.assertTrue(listing["results"])
        self.assertFalse(any(k.lower() in SECRET_KEYS for item in listing["results"] for k in item))
        self.assertFalse(any(p in json.dumps(listing) for p in self.passwords.values()))
        self.record("8 user roles created using VinSHC API without plaintext/password hash in response")

    def test_02_validation_and_escalation_denials(self):
        original = self.users["doctor"]
        bad_cases = [
            {"username": original["username"], "password": "StrongPass123456", "role": "doctor",
             "givenName": "Bad", "familyName": "Reuse", "gender": "U"},
            {"username": "p1-evil-" + uuid.uuid4().hex[:7], "password": "StrongPass123456", "role": "System Developer",
             "givenName": "Bad", "familyName": "Privilege", "gender": "U"},
            {"username": "p1-inject-" + uuid.uuid4().hex[:7], "password": "StrongPass123456", "role": "doctor",
             "givenName": "Bad", "familyName": "Privilege", "gender": "U",
             "privileges": ["System Developer"]},
            {"username": "p1-short-" + uuid.uuid4().hex[:7], "password": "1234", "role": "doctor",
             "givenName": "Bad", "familyName": "Password", "gender": "U"},
        ]
        for payload in bad_cases:
            code, response = self.call("staff/users", payload)
            self.assertIn(code, (400,409))
            self.assertNotIn(payload["password"], json.dumps(response))
        staff = Client(self.base, self.users["doctor"]["username"], self.passwords["doctor"])
        code, _, _ = staff.request("/openmrs/ws/rest/v1/vinshc/staff/users", method="POST",
            payload={"username": "evil", "password": "StrongPass123456", "role": "admin"})
        self.assertEqual(code, 403)
        self.record("Duplicate, privilege injection, invalid role, weak password and escalation rejected")

    def test_03_reset_retire_and_reactivate(self):
        target = self.users["pharmacy"]
        password = "reset" + uuid.uuid4().hex[:1]  # 6 characters, no case/digit rules
        status, result = self.call(f"staff/users/{target['uuid']}/password", {"password": password})
        self.assertEqual(status, 200, result)
        self.assertNotIn(password, json.dumps(result))
        self.assertFalse(result["mustChangePassword"])
        staff = Client(self.base, target["username"], password)
        self.assertTrue(staff.json("/openmrs/ws/rest/v1/session?v=full")["authenticated"])
        status, result = self.call(f"staff/users/{target['uuid']}/state", {
            "active": False, "reason": "P1 synthetic acceptance",
        })
        self.assertEqual(status, 200)
        self.assertTrue(result["retired"])
        self.assertEqual(self.call(f"staff/users/{target['uuid']}/password", {"password": password})[0], 400)
        status, result = self.call(f"staff/users/{target['uuid']}/state", {"active": True})
        self.assertEqual(status, 200)
        self.assertFalse(result["retired"])
        renamed = "p1-renamed-" + uuid.uuid4().hex[:8]
        status, result = self.call(f"staff/users/{target['uuid']}/username", {"username": renamed})
        self.assertEqual(status, 200, result)
        self.assertEqual(result["username"], renamed)
        self.assertTrue(Client(self.base, renamed, password).json("/openmrs/ws/rest/v1/session?v=full")["authenticated"])
        target["username"] = renamed
        self.assertEqual(self.call(f"staff/users/{target['uuid']}/username",
            {"username": self.users["doctor"]["username"]})[0], 409)
        self.assertEqual(self.call(f"staff/users/{target['uuid']}/username", {"username": "bad name"})[0], 400)
        self.record("Password reset returns no credentials; retired account cannot reset; reactivated; renamed")

    def test_04_provider_ownership_and_facility_binding(self):
        doctor = self.users["doctor"]
        status, provider = self.call("directory/providers", {
            "userUuid": doctor["uuid"], "facilityLocationUuid": self.location,
            "identifier": "P1-" + uuid.uuid4().hex[:11],
        })
        self.assertEqual(status, 201, provider)
        self.assertEqual(provider["userUuid"], doctor["uuid"])
        self.assertEqual(provider["facilityLocationUuid"], self.location)
        corrected = "P1-UPD-" + uuid.uuid4().hex[:10]
        status, updated = self.call(f"directory/providers/{provider['uuid']}", {"identifier": corrected})
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["identifier"], corrected)
        self.assertEqual(self.call("directory/providers", {
            "userUuid": doctor["uuid"], "facilityLocationUuid": self.location,
            "identifier": "P1-DUP-" + uuid.uuid4().hex[:10],
        })[0], 400)
        self.assertEqual(self.call("directory/providers/link", {
            "userUuid": self.users["cashier"]["uuid"],
            "providerUuid": provider["uuid"], "facilityLocationUuid": self.location
        })[0], 400)
        status, links = self.call(f"directory/users/{doctor['uuid']}/providers", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(links["links"][0]["providerUuid"], provider["uuid"])
        nurse = self.users["nurse"]
        status, temporary = self.call("directory/providers", {
            "userUuid": nurse["uuid"], "facilityLocationUuid": self.location,
            "identifier": "P1-NURSE-" + uuid.uuid4().hex[:8],
        })
        self.assertEqual(status, 201, temporary)
        self.assertEqual(self.call("directory/providers/link", {
            "userUuid": doctor["uuid"], "providerUuid": temporary["uuid"],
            "facilityLocationUuid": self.location,
        })[0], 400)
        status, retired = self.call(f"directory/providers/{temporary['uuid']}/retire", {
            "reason": "P1 synthetic retirement test",
        })
        self.assertEqual(status, 200, retired)
        self.assertTrue(retired["retired"])
        type(self).provider = provider
        self.record("Clinical provider must belong to same user Person; cashier spoof denied")

    def test_05_facility_business_uuid_is_distinct_and_retirement_retains_history(self):
        code = ("P1-" + uuid.uuid4().hex[:9]).upper()
        status, created = self.call("directory/facilities", {
            "code": code, "name": "Phòng khám synthetic " + code, "legalName": "Synthetic P1 Clinic",
            "address": "123 Test street", "timezone": "Asia/Ho_Chi_Minh",
            "effectiveFrom": "2026-10-15", "parentLocationUuid": self.location,
        })
        self.assertEqual(status, 201, created)
        self.assertNotEqual(created["facilityUuid"], created["locationUuid"])
        fid = created["facilityUuid"]
        self.assertEqual(self.call(f"directory/facilities/{fid}", method="GET")[0], 200)
        status, linked = self.call("directory/providers/link", {
            "userUuid": self.users["doctor"]["uuid"], "providerUuid": self.provider["uuid"],
            "facilityLocationUuid": created["locationUuid"],
        })
        self.assertEqual(status, 200, linked)
        status, updated = self.call(f"directory/facilities/{fid}", {
            "legalName": "Updated synthetic clinic", "address": "124 Test street",
        })
        self.assertEqual(status, 200, updated)
        self.assertEqual(updated["code"], code)
        status, retired = self.call(f"directory/facilities/{fid}/retire", {
            "reason": "End of synthetic test", "effectiveTo": "2026-10-15",
        })
        self.assertEqual(status, 200, retired)
        self.assertFalse(retired["active"])
        status, links = self.call(f"directory/users/{self.users['doctor']['uuid']}/providers", method="GET")
        self.assertEqual(status, 200, links)
        self.assertFalse(any(link["facilityLocationUuid"] == created["locationUuid"] for link in links["links"]))
        self.assertEqual(self.call(f"directory/facilities/{fid}", method="GET")[0], 200)
        type(self).facility_id = fid
        self.record("Business facility separate from Location, update, retire and historical read")

    def test_06_form_immutable_versions_workflow_and_audit(self):
        code = "p1-form-" + uuid.uuid4().hex[:7]
        payload = {"code": code, "facilityLocationUuid": self.location, "schemaJson": '{"fields":[{"name":"note"}]}'}
        status, v1 = self.call("admin-configuration/forms", payload)
        self.assertEqual(status, 201, v1)
        self.assertEqual(v1["version"], 1)
        status, active = self.call(f"admin-configuration/forms/{v1['uuid']}/activate", {})
        self.assertEqual(status, 200, active)
        self.assertEqual(active["state"], "active")
        self.assertEqual(self.call(f"admin-configuration/forms/{v1['uuid']}/activate", {})[0], 400)
        payload["schemaJson"] = '{"fields":[{"name":"note"},{"name":"value"}]}'
        status, v2 = self.call("admin-configuration/forms", payload)
        self.assertEqual(status, 201, v2)
        self.assertEqual(v2["version"], 2)
        self.assertEqual(self.call(f"admin-configuration/forms/{v2['uuid']}/activate", {})[0], 200)
        status, old = self.call(f"admin-configuration/forms/{v1['uuid']}", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(old["schemaJson"], '{"fields":[{"name":"note"}]}')
        self.assertEqual(old["state"], "retired")
        status, versions = self.call(
            f"admin-configuration/forms?facilityLocationUuid={self.location}&code={code}", method="GET")
        self.assertEqual(status, 200, versions)
        self.assertEqual([item["version"] for item in versions["results"]], [2, 1])
        type(self).form_id = v2["uuid"]
        status, current = self.call(f"admin-configuration/workflow/{self.location}", method="GET")
        self.assertEqual(status, 200, current)
        version = current.get("version", 0)
        status, workflow = self.call("admin-configuration/workflow", {
            "facilityLocationUuid": self.location, "workflowCode": "STANDARD_POSTPAY",
            "expectedVersion": version,
        })
        self.assertEqual(status, 200, workflow)
        self.assertEqual(workflow["version"], version + 1)
        self.assertEqual(self.call("admin-configuration/workflow", {
            "facilityLocationUuid": self.location, "workflowCode": "COMPACT_PREPAY",
            "expectedVersion": 0
        })[0], 409)
        status, history = self.call("staff/audit?limit=100", method="GET")
        self.assertEqual(status, 200)
        self.assertTrue(history["results"])
        self.assertTrue(all(row.get("actorUuid") and row.get("at") for row in history["results"]))
        self.assertFalse(any(k.lower() in SECRET_KEYS for row in history["results"] for k in row))
        self.assertFalse(any(p in json.dumps(history) for p in self.passwords.values()))
        self.record("Form versions immutable; workflow optimistic version; audit actor and time")


if __name__ == "__main__":
    unittest.main()
