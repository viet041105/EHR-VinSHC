import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import b9_handoff


class B9HandoffTests(unittest.TestCase):
    def write_reports(self, root):
        for filename, count in b9_handoff.REQUIRED_REPORTS.items():
            (root / filename).write_text(json.dumps({
                "passed": True,
                "checks": [{"passed": True} for _ in range(count)],
            }), encoding="utf-8")
        for phase in b9_handoff.ALLOWED_PHASES:
            (root / f"b9-{phase}.json").write_text(json.dumps({
                "passed": True,
                "phase": phase,
                "checks": [{"passed": True} for _ in range(4)],
            }), encoding="utf-8")
        for phase in ("clean", "restart", "restore"):
            (root / f"metadata-{phase}.json").write_text(json.dumps({
                "version": "0.3.0", "status": "PASS (structural)",
                "runtime": {"checked": 78, "identities": [f"identity-{i}" for i in range(78)]},
            }), encoding="utf-8")
        (root / "recovery.json").write_text(json.dumps({
            "passed": True, "operation": "restore", "sourceProject": "source",
            "targetProject": "restore", "elapsedSeconds": 10,
        }), encoding="utf-8")

    def test_handoff_requires_every_passed_report_and_keeps_adapters_disabled(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_reports(root)
            with patch.object(b9_handoff, "git_value", side_effect=["", "abc123", "clinic-backend"]):
                report = b9_handoff.build_report(
                    root, ["restart", "restore"],
                    [root / f"metadata-{phase}.json" for phase in ("clean", "restart", "restore")],
                    root / "recovery.json",
                )
            self.assertTrue(report["passed"])
            self.assertEqual(report["persistencePhases"], ["restart", "restore"])
            self.assertFalse(report["externalAdapters"]["defaultEnabled"])
            self.assertTrue(report["initializerIdentityStable"])
            self.assertEqual(report["recoveryEvidence"]["targetProject"], "restore")
            self.assertEqual(report["pilotReadiness"], "NOT_APPROVED_FOR_REAL_DATA")
            self.assertFalse(report["containsCredentialsOrDatabaseDump"])

    def test_handoff_rejects_missing_or_failed_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_reports(root)
            failed = root / "b8-operations.json"
            failed.write_text(json.dumps({"passed": False, "checks": []}), encoding="utf-8")
            with self.assertRaises(b9_handoff.HandoffError):
                b9_handoff.build_report(root, [])

    def test_handoff_rejects_metadata_identity_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_reports(root)
            changed = root / "metadata-restore.json"
            value = json.loads(changed.read_text(encoding="utf-8"))
            value["runtime"]["identities"][0] = "changed"
            changed.write_text(json.dumps(value), encoding="utf-8")
            with self.assertRaises(b9_handoff.HandoffError):
                b9_handoff.build_report(
                    root, ["restart", "restore"],
                    [root / f"metadata-{phase}.json" for phase in ("clean", "restart", "restore")],
                    root / "recovery.json",
                )


if __name__ == "__main__":
    unittest.main()
