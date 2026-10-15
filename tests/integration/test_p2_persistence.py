"""P2 proof that dispense correction history survives restart without changing source rows.

This test only reads synthetic data created by B11; no stock balances are implied.
"""
import json
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from api_client import Client
from common import read_settings, report_path


class P2PersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cfg = read_settings()
        cls.client = Client(f"http://127.0.0.1:{cfg.get('EHR_HTTP_PORT', '8080')}",
                            cfg["EHR_ADMIN_USERNAME"], cfg["EHR_ADMIN_PASSWORD"])
        report = json.loads(report_path("b11-care-workflow.json").read_text(encoding="utf-8"))
        if not report["passed"]:
            raise AssertionError("B11 synthetic fixture was not accepted")
        cls.order = next(c["order"] for c in report["checks"] if c["name"].startswith("dispense partial/complete"))

    def test_01_original_rows_and_revisions_unchanged(self):
        order = self.client.json(f"/openmrs/ws/rest/v1/vinshc/pharmacy/prescriptions/{self.order}")
        self.assertEqual(order["dispensedQuantity"], 2)
        self.assertEqual(order["remainingQuantity"], 8)
        first, second = order["dispenses"]
        self.assertEqual([first["quantity"], second["quantity"]], [4, 6])
        self.assertEqual([first["effectiveQuantity"], second["effectiveQuantity"]], [2, 0])
        self.assertEqual([first["revisionVersion"], second["revisionVersion"]], [3, 1])
        self.assertEqual([len(first["revisions"]), len(second["revisions"])], [3, 1])
        self.assertEqual(second["effectiveStatus"], "voided")
        self.assertTrue(all(x["actor_uuid"] and x["date_created"] for x in first["revisions"] + second["revisions"]))

    def test_02_original_dispense_record_still_queryable(self):
        order = self.client.json(f"/openmrs/ws/rest/v1/vinshc/pharmacy/prescriptions/{self.order}")
        for row in order["dispenses"]:
            detail = self.client.json(f"/openmrs/ws/rest/v1/vinshc/pharmacy/dispenses/{row['uuid']}")
            self.assertEqual(detail["quantity"], row["quantity"])
            self.assertEqual(detail["effectiveQuantity"], row["effectiveQuantity"])


if __name__ == "__main__":
    unittest.main()
