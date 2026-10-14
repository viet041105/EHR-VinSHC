"""Read-only B9 verification after restart or restore of the synthetic acceptance stack."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings, fixture_path, report_path


REST = "/openmrs/ws/rest/v1"
OPS = REST + "/vinshc/operations"
FHIR = "/openmrs/ws/fhir2/R4"
EXPECTED_ATTACHMENT = b"%PDF-1.4\n% VinSHC synthetic B8 attachment\n%%EOF\n"


class B9PersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.phase = os.environ.get("VINSHC_ACCEPTANCE_PHASE", "persistence")
        if cls.phase not in {"restart", "restore", "persistence"}:
            raise ValueError("VINSHC_ACCEPTANCE_PHASE must be restart, restore or persistence")
        cls.client = Client(
            f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"],
        )
        cls.clinical = json.loads(
            (fixture_path("b4b-clinical.json")).read_text(encoding="utf-8")
        )
        cls.b8 = json.loads(
            (report_path("b8-operations.json")).read_text(encoding="utf-8")
        )
        if not cls.b8.get("passed"):
            raise AssertionError("B8 source evidence did not pass")
        cls.by_name = {item["name"]: item for item in cls.b8["checks"]}
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "phase": cls.phase,
            "passed": False,
            "readOnly": True,
            "checks": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 4
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        destination = report_path(f"b9-{cls.phase}.json")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def check(self, prefix):
        matches = [value for name, value in self.by_name.items() if name.startswith(prefix)]
        self.assertEqual(len(matches), 1, prefix)
        return matches[0]

    def test_01_core_clinical_history_and_fhir_survived(self):
        patient = self.client.json(f"{REST}/patient/{self.clinical['patientUuid']}")
        summary = self.client.json(
            f"{REST}/vinshc/encounter/{self.clinical['encounterUuid']}/clinical-summary"
        )
        fhir = self.client.json(f"{FHIR}/Patient/{self.clinical['patientUuid']}")
        self.assertEqual(patient["uuid"], self.clinical["patientUuid"])
        self.assertEqual(summary["patientUuid"], self.clinical["patientUuid"])
        self.assertEqual(summary["encounterUuid"], self.clinical["encounterUuid"])
        self.assertTrue(summary["diagnoses"])
        self.assertTrue(summary["drugOrders"])
        self.assertEqual(fhir["id"], self.clinical["patientUuid"])
        self.record("patient, encounter, diagnosis, prescription and FHIR identity survived")

    def test_02_financial_and_operational_state_survived(self):
        appointment_id = self.check("follow-up appointment")["appointmentUuid"]
        billing = self.check("integer VND snapshots")
        appointment = self.client.json(f"{OPS}/appointments/{appointment_id}")
        postpay = self.client.json(f"{OPS}/bills/{billing['postpayBill']}")
        prepay = self.client.json(f"{OPS}/bills/{billing['prepayBill']}")
        receipt = self.client.json(f"{OPS}/payments/{billing['receiptUuid']}")
        refund = self.client.json(f"{OPS}/payments/{billing['refundUuid']}")
        self.assertEqual(appointment["status"], "fulfilled")
        self.assertEqual(postpay["status"], "paid")
        self.assertEqual(postpay["netCollectedVnd"], 43400)
        self.assertEqual(prepay["status"], "paid")
        self.assertEqual(receipt["status"], "settled")
        self.assertEqual(refund["kind"], "refund")
        self.record("appointment, VND snapshots, receipt and refund survived",
                    appointmentUuid=appointment_id, billUuid=billing["postpayBill"])

    def test_03_native_order_result_and_attachment_survived(self):
        diagnostic = self.check("native TestOrder/FHIR ServiceRequest")
        order = self.client.json(f"{OPS}/service-orders/{diagnostic['orderUuid']}")
        result = self.client.json(f"{OPS}/results/{diagnostic['resultUuid']}")
        fhir = self.client.json(f"{FHIR}/ServiceRequest/{diagnostic['orderUuid']}")
        status, headers, content = self.client.request(
            f"{OPS}/attachments/{diagnostic['attachmentUuid']}/content", timeout=30
        )
        self.assertEqual(status, 200)
        self.assertEqual(order["state"], "completed")
        self.assertEqual(result["state"], "corrected")
        self.assertEqual(fhir["id"], diagnostic["orderUuid"])
        self.assertEqual(content, EXPECTED_ATTACHMENT)
        digest = hashlib.sha256(content).hexdigest()
        self.assertEqual(digest, diagnostic["attachmentSha256"])
        self.assertEqual(headers["X-Content-SHA256"], digest)
        self.record("native TestOrder, corrected result, FHIR and attachment bytes survived",
                    attachmentSha256=digest)

    def test_04_document_snapshots_and_daily_aggregate_survived(self):
        documents = self.check("prescription/receipt/order/result/appointment DTOs")
        for template, source in documents["sources"].items():
            value = self.client.json(f"{OPS}/documents/{template}/{source}")
            self.assertEqual(value["documentNumber"], documents["documentNumbers"][template])
        previous = self.check("Asia/Ho_Chi_Minh daily visit/revenue aggregate")["report"]
        report = self.client.json(
            f"{OPS}/reports/daily?date={previous['date']}&facility={previous['facilityUuid']}"
        )
        for key in ("openedVisits", "completedVisits", "grossVnd", "refundVnd", "netVnd"):
            self.assertEqual(report[key], previous[key], key)
        self.assertTrue(report["aggregateOnly"])
        self.record("five immutable document numbers and aggregate report survived",
                    documentNumbers=documents["documentNumbers"], report=report)


if __name__ == "__main__":
    unittest.main()
