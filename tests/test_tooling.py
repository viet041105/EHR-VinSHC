"""Regression checks for credentials, false smoke success and persistence loss."""

import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from bootstrap import bootstrap
from check_config import validate_config
from check_database import REQUIRED_TABLES, verify_snapshot
from collect_diagnostics import redact
from common import ROOT, read_settings
from smoke import (Client, SmokeError, assert_capabilities, assert_core_version, assert_modules,
                   assert_session, check_local_javascript, create_fixture, verify_fixture, verify_clinical_fixture)


class EnvironmentTests(unittest.TestCase):
    def test_bootstrap_generates_credentials_and_preserves_existing_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text((ROOT / ".env.example").read_text(), encoding="utf-8")
            with patch("bootstrap.secrets.token_urlsafe", return_value="a" * 32):
                bootstrap(root)
            original = (root / ".env").read_text()
            with patch.dict(os.environ, {}, clear=True):
                settings = read_settings(root)
            secrets = [settings[key] for key in ("OMRS_DB_PASSWORD", "EHR_ADMIN_PASSWORD")]
            self.assertEqual(len(set(secrets)), 2)
            self.assertTrue(any(character.isdigit() for character in settings["EHR_ADMIN_PASSWORD"]))
            self.assertFalse(any(value.startswith("GENERATE_") for value in secrets),
                             "A generated credential still contains a placeholder.")
            bootstrap(root)
            self.assertEqual((root / ".env").read_text(), original)

    def test_environment_overrides_match_compose_and_reject_uninitialized_password(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env.example").write_text((ROOT / ".env.example").read_text(), encoding="utf-8")
            bootstrap(root)
            with patch.dict(os.environ, {"EHR_HTTP_PORT": "8089"}, clear=True):
                self.assertEqual(read_settings(root)["EHR_HTTP_PORT"], "8089")
            with patch.dict(os.environ, {"EHR_ADMIN_PASSWORD": "GENERATE_ADMIN_PASSWORD"}, clear=True):
                with self.assertRaises(ValueError):
                    read_settings(root)

    def test_diagnostics_remove_plain_and_basic_auth_credentials(self):
        settings = {"OMRS_DB_PASSWORD": "db-secret",
                    "EHR_ADMIN_USERNAME": "admin", "EHR_ADMIN_PASSWORD": "admin-secret"}
        import base64
        encoded = base64.b64encode(b"admin:admin-secret").decode()
        cleaned = redact("db-secret admin-secret admin:admin-secret " + encoded, settings)
        for value in ("db-secret", "admin-secret", encoded):
            self.assertNotIn(value, cleaned)


class SmokeRegressionTests(unittest.TestCase):
    def test_session_http_success_is_not_enough(self):
        for session in ({}, {"authenticated": False}, {"authenticated": True},
                        {"authenticated": True, "user": {}}):
            with self.subTest(session=session), self.assertRaises(SmokeError):
                assert_session(session)
        assert_session({"authenticated": True, "user": {"uuid": "synthetic-user"}})

    def test_remote_write_targets_are_rejected(self):
        for target in ("https://example.org", "http://example.org", "http://127.0.0.1/other",
                       "http://user:secret@localhost", "http://localhost?redirect=remote"):
            with self.subTest(target=target), self.assertRaises(SmokeError):
                Client(target, "admin", "local-only")

    def test_html_login_response_cannot_pass_json_check(self):
        client = Client("http://localhost:8080", "admin", "local-only")
        with patch.object(client, "request", return_value=(200, {"Content-Type": "text/html"}, b"<html>Login</html>")):
            with self.assertRaises(SmokeError):
                client.json("/openmrs/ws/rest/v1/session")

    def test_frontend_javascript_rejects_html_fallback_and_external_assets(self):
        client = Client("http://localhost:8080", "admin", "local-only")
        with patch.object(client, "request", return_value=(200, {"Content-Type": "text/html"}, b"<html>Fallback</html>")):
            with self.assertRaises(SmokeError):
                check_local_javascript(client, "./missing.js")
        with patch.object(client, "request") as request:
            for source in ("https://example.org/app.js", "//example.org/app.js", "/outside/app.js"):
                with self.subTest(source=source), self.assertRaises(SmokeError):
                    check_local_javascript(client, source)
            request.assert_not_called()

    def test_missing_resource_read_capability_fails(self):
        statement = {"resourceType": "CapabilityStatement", "fhirVersion": "4.0.1", "rest": [{
            "mode": "server", "resource": [{"type": name, "interaction": [{"code": "read"}]}
                                           for name in ("Patient", "Encounter", "Observation")]}]}
        assert_capabilities(statement)
        statement["rest"][0]["resource"][-1]["interaction"] = [{"code": "search-type"}]
        with self.assertRaises(SmokeError):
            assert_capabilities(statement)

    def test_present_but_stopped_module_is_rejected(self):
        expected = {"webservicesRest": "3.5.0", "fhir2": "4.2.0", "initializer": "2.12.0"}
        modules = [{"uuid": "webservices.rest", "started": True, "version": "3.5.0"},
                   {"uuid": "fhir2", "started": False, "version": "4.2.0"},
                   {"uuid": "initializer", "started": True, "version": "2.12.0"}]
        with self.assertRaises(SmokeError):
            assert_modules(modules, expected)

    def test_database_switch_cannot_hide_a_stopped_optional_module(self):
        expected = {"webservicesRest": "3.5.0", "fhir2": "4.2.0", "initializer": "2.12.0"}
        modules = [{"uuid": "webservices.rest", "started": True, "version": "3.5.0"},
                   {"uuid": "fhir2", "started": True, "version": "4.2.0"},
                   {"uuid": "initializer", "started": True, "version": "2.12.0"},
                   {"uuid": "stockmanagement", "started": False, "version": "3.0.0"}]
        with self.assertRaises(SmokeError):
            assert_modules(modules, expected, {"stockmanagement": "3.0.0"})

    def test_core_version_uses_nested_installation_field(self):
        info = {"SystemInfo.title.openmrsInformation": {
            "SystemInfo.OpenMRSInstallation.openmrsVersion": "2.8.8  Build 0"}}
        self.assertEqual(assert_core_version(info, "2.8.8"), "2.8.8")
        with self.assertRaises(SmokeError):
            assert_core_version(info, "2.8.9")
        with self.assertRaises(KeyError):
            assert_core_version({"javaVersion": "2.8.8"}, "2.8.8")

    def test_existing_fixture_is_not_recreated_after_data_loss(self):
        fixture = {"patientUuid": "37fce66f-bd5e-43c2-8499-0696f1dcf069", "identifier": "SYNTHETIC"}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.json"
            path.write_text(json.dumps(fixture), encoding="utf-8")
            from unittest.mock import Mock
            client = Mock()
            self.assertEqual(create_fixture(client, path), fixture)
            client.json.assert_not_called()
            client.json.side_effect = SmokeError("HTTP 404: patient lost")
            with self.assertRaises(SmokeError):
                verify_fixture(client, fixture)
            client.json.assert_called_once()

    def test_fhir_patient_with_wrong_identifier_fails(self):
        fixture = {"patientUuid": "37fce66f-bd5e-43c2-8499-0696f1dcf069", "identifier": "SYNTHETIC"}
        from unittest.mock import Mock
        client = Mock()
        client.json.side_effect = [
            {"uuid": fixture["patientUuid"], "identifiers": [{"identifier": "SYNTHETIC"}]},
            {"resourceType": "Patient", "id": fixture["patientUuid"], "identifier": [{"value": "WRONG"}]},
        ]
        with self.assertRaises(SmokeError):
            verify_fixture(client, fixture)

    def test_fhir_observation_with_wrong_unit_or_patient_is_rejected(self):
        from unittest.mock import Mock
        fixture = {"patientUuid": "patient-a", "visitUuid": "visit-a", "encounterUuid": "encounter-a",
                   "obsUuid": "obs-a", "conceptUuid": "concept-a", "numericValue": 36.7,
                   "clinicalDatetime": "2026-10-08T00:00:00+00:00"}
        responses = [{"patient": {"uuid": "patient-a"}},
                     {"patient": {"uuid": "patient-a"}, "visit": {"uuid": "visit-a"}},
                     {"person": {"uuid": "patient-a"}, "encounter": {"uuid": "encounter-a"},
                      "concept": {"uuid": "concept-a"}, "value": 36.7, "obsDatetime": "2026-10-08T00:00:00Z"},
                     {"resourceType": "Encounter", "id": "encounter-a", "subject": {"reference": "Patient/patient-a"}},
                     {"resourceType": "Observation", "id": "obs-a", "subject": {"reference": "Patient/patient-a"},
                      "encounter": {"reference": "Encounter/encounter-a"},
                      "valueQuantity": {"value": 36.7, "unit": "degC"}}]
        client = Mock()
        client.json.side_effect = copy.deepcopy(responses)
        verify_clinical_fixture(client, fixture)
        for key, value in (("subject", {"reference": "Patient/patient-b"}),
                           ("valueQuantity", {"value": 36.7, "unit": "mg"})):
            broken = copy.deepcopy(responses)
            broken[-1][key] = value
            client.json.side_effect = broken
            with self.subTest(key=key), self.assertRaises(SmokeError):
                verify_clinical_fixture(client, fixture)


class ConfigurationRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import subprocess
        result = subprocess.run(["docker", "compose", "config", "--format", "json"],
                                cwd=ROOT, capture_output=True, text=True, check=True)
        cls.config = json.loads(result.stdout)
        cls.baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
        cls.settings = read_settings()

    def test_floating_or_unreviewed_image_is_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["backend"]["image"] = "openmrs/openmrs-reference-application-3-backend:qa"
        with self.assertRaises(ValueError):
            validate_config(config, self.baseline, self.settings)

    def test_public_port_binding_is_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["gateway"]["ports"][0]["host_ip"] = "0.0.0.0"
        with self.assertRaises(ValueError):
            validate_config(config, self.baseline, self.settings)

    def test_loss_of_database_volume_is_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["db"]["volumes"] = []
        with self.assertRaises(ValueError):
            validate_config(config, self.baseline, self.settings)

    def test_postgresql_with_mysql_driver_or_port_is_rejected(self):
        for key, value in (("OMRS_DB", "mysql"), ("OMRS_CONFIG_CONNECTION_PORT", "3306"),
                           ("OMRS_EXTRA_HIBERNATE_DIALECT", "org.hibernate.dialect.PostgreSQL82Dialect")):
            config = copy.deepcopy(self.config)
            config["services"]["backend"]["environment"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_config(config, self.baseline, self.settings)

    def test_old_mariadb_application_volume_is_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["backend"]["volumes"][0]["source"] = "openmrs-data"
        with self.assertRaises(ValueError):
            validate_config(config, self.baseline, self.settings)

    def test_missing_postgresql_extension_mount_is_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["db"]["volumes"] = [
            mount for mount in config["services"]["db"]["volumes"] if mount["type"] == "volume"]
        with self.assertRaises(ValueError):
            validate_config(config, self.baseline, self.settings)


class DatabaseRegressionTests(unittest.TestCase):
    def test_wrong_database_version_or_missing_extension_is_rejected(self):
        baseline = {"database": {"engine": "postgresql", "version": "16.15",
                                  "extensions": ["fuzzystrmatch", "uuid-ossp"],
                                  "stockForeignKeyCount": 118}}
        snapshot = {"version": "16.15 (Debian)", "database": "openmrs", "encoding": "UTF8",
                    "extensions": ["fuzzystrmatch", "uuid-ossp"], "tables": sorted(REQUIRED_TABLES),
                    "stockForeignKeyCount": 118, "moduleBinaryColumnCount": 2}
        verify_snapshot(snapshot, baseline)
        for key, value in (("version", "15.0"), ("extensions", []), ("tables", ["patient"]),
                           ("stockForeignKeyCount", 97), ("moduleBinaryColumnCount", 0)):
            broken = copy.deepcopy(snapshot)
            broken[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_snapshot(broken, baseline)


if __name__ == "__main__":
    unittest.main()
