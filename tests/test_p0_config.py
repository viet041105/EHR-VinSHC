"""Regression checks for P0 release and authorization drift (no Docker required)."""
import csv
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import check_p0
from common import fixture_path, report_path


class P0ChecksTests(unittest.TestCase):
    def test_releases_match_all_artifacts(self):
        baseline, sources = check_p0.verify_versions()
        self.assertEqual(set(sources.values()), {baseline["vinshcRelease"]["version"]})

    def test_permission_matrix_has_exact_production_roles(self):
        expected, privileges = check_p0.verify_permissions()
        self.assertEqual(len(expected), 8)
        self.assertEqual(len(privileges), 69)
        self.assertEqual(len(expected["doctor"]), 38)
        self.assertEqual(len(expected["admin"]), 5)

    def test_version_drift_is_rejected(self):
        original = check_p0.load_json

        def changed(path):
            value = original(path)
            if path == "infra/frontend/package.json":
                value = dict(value, version="9.9.9")
            return value

        with patch.object(check_p0, "load_json", side_effect=changed):
            with self.assertRaisesRegex(ValueError, "frontend package"):
                check_p0.verify_versions()

    def test_extra_inherited_role_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            copy = pathlib.Path(temp) / "roles.csv"
            copy.write_bytes(check_p0.ROLES_CSV.read_bytes())
            rows = check_p0.load_csv(copy)
            rows[0]["Inherited roles"] = "System Developer"
            with copy.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            with patch.object(check_p0, "ROLES_CSV", copy):
                with self.assertRaisesRegex(ValueError, "inheritance"):
                    check_p0.verify_permissions()

    def test_missing_privilege_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            copy = pathlib.Path(temp) / "privileges.csv"
            rows = check_p0.load_csv(check_p0.PRIVILEGES_CSV)[1:]
            with copy.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            with patch.object(check_p0, "PRIVILEGES_CSV", copy):
                with self.assertRaisesRegex(ValueError, "Production privilege drift"):
                    check_p0.verify_permissions()

    def test_project_specific_fixture_and_report_paths(self):
        with patch.dict("os.environ", {
            "VINSHC_TEST_FIXTURE_DIR": ".runtime/p0-isolated/fixtures",
            "VINSHC_TEST_REPORT_DIR": ".runtime/p0-isolated/reports",
        }):
            self.assertEqual(fixture_path("patient.json"),
                             ROOT / ".runtime/p0-isolated/fixtures/patient.json")
            self.assertEqual(report_path("result.json"),
                             ROOT / ".runtime/p0-isolated/reports/result.json")
            with self.assertRaisesRegex(ValueError, "must not contain directories"):
                fixture_path("../escape.json")
        with patch.dict("os.environ", {"VINSHC_TEST_FIXTURE_DIR": "../outside"}):
            with self.assertRaisesRegex(ValueError, "must be inside"):
                fixture_path("patient.json")


if __name__ == "__main__":
    unittest.main()
