"""B8 end-to-end clinic operations against an isolated metadata-enabled Docker stack."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
import unittest
import urllib.parse
import uuid
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings, fixture_path, report_path


REST = "/openmrs/ws/rest/v1"
OPS = REST + "/vinshc/operations"
EXPECTED_CHECKS = 7


class B8OperationsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}"
        cls.client = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        cls.ctx = json.loads(
            (fixture_path("b4b-clinical.json")).read_text(encoding="utf-8")
        )
        cls.facilities = json.loads(
            (ROOT / "metadata/vinshc/catalogues/facilities.json").read_text(encoding="utf-8")
        )
        cls.facility = cls.facilities["records"][0]
        cls.services = {
            item["code"]: item for item in json.loads(
                (ROOT / "metadata/vinshc/catalogues/services.json").read_text(encoding="utf-8")
            )["records"]
        }
        cls.state = {}
        cls.created_users = []
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "checks": [],
            "knownLimits": [
                "Synthetic catalogues are productionEnabled=false.",
                "Files are private local-volume objects; production scanning/object storage is disabled.",
                "External BHYT/e-invoice/e-prescription/LIS/PACS adapters are contracts only.",
            ],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == EXPECTED_CHECKS
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = report_path("b8-operations.json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
        for user, person in cls.created_users:
            cls.client.request(f"{REST}/user/{user}?reason=B8%20test%20complete", method="DELETE")
            cls.client.request(f"{REST}/person/{person}?reason=B8%20test%20complete", method="DELETE")

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def call(self, path, *, method="GET", payload=None, statuses=(200,)):
        status, headers, body = self.client.request(path, method=method, payload=payload, timeout=30)
        self.assertIn(status, statuses, (path, body[:500]))
        self.assertIn("json", headers.get("Content-Type", "").lower())
        return status, json.loads(body)

    def post(self, path, payload, statuses=(200, 201)):
        return self.call(path, method="POST", payload=payload, statuses=statuses)[1]

    def rejected(self, path, payload, fragment, status):
        actual, body = self.call(path, method="POST", payload=payload, statuses=(status,))
        self.assertEqual(actual, status)
        self.assertIn(fragment, body["error"])

    def queue_state(self, item, state):
        return self.post(f"{OPS}/queue/{item['uuid']}/transition", {"state": state})

    def test_01_configuration_variants_and_module_boundary(self):
        config = self.client.json(f"{OPS}/configuration")
        variants = {item["code"]: item for item in config["workflowConfigs"]}
        self.assertEqual(set(variants), {"STANDARD_POSTPAY", "COMPACT_PREPAY"})
        self.assertTrue(variants["STANDARD_POSTPAY"]["hasNurse"])
        self.assertTrue(variants["STANDARD_POSTPAY"]["hasPharmacy"])
        self.assertEqual(variants["STANDARD_POSTPAY"]["paymentTiming"], "postpay")
        self.assertFalse(variants["COMPACT_PREPAY"]["hasNurse"])
        self.assertFalse(variants["COMPACT_PREPAY"]["hasPharmacy"])
        self.assertEqual(variants["COMPACT_PREPAY"]["paymentTiming"], "prepay")
        self.assertFalse(config["productionUploadEnabled"])
        self.record("two metadata-driven workflow variants and explicit upstream-module boundary")

    def test_02_appointment_slot_and_followup_lifecycle(self):
        start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
        payload = {
            "patient": self.ctx["patientUuid"], "facility": self.facility["uuid"],
            "provider": self.ctx["providerUuid"], "service": self.services["CONSULT-TEST"]["uuid"],
            "appointmentType": "FOLLOWUP", "startAt": start.isoformat(),
            "endAt": (start + timedelta(minutes=20)).isoformat(),
            "note": "Tái khám synthetic B8", "idempotencyKey": "b8-appointment-" + uuid.uuid4().hex,
        }
        appointment = self.post(f"{OPS}/appointments", payload)
        replay = self.post(f"{OPS}/appointments", payload)
        self.assertEqual(appointment["uuid"], replay["uuid"])
        overlap = dict(payload, idempotencyKey="b8-overlap-" + uuid.uuid4().hex)
        self.rejected(f"{OPS}/appointments", overlap, "overlapping", 409)
        for state in ("confirmed", "arrived", "fulfilled"):
            appointment = self.post(f"{OPS}/appointments/{appointment['uuid']}/transition",
                                    {"status": state})
        self.assertEqual(appointment["status"], "fulfilled")
        type(self).state["appointment"] = appointment
        self.record("follow-up appointment, idempotent replay, overlap lock and lifecycle",
                    appointmentUuid=appointment["uuid"])

    def test_03_queue_standard_flow_and_patient_left(self):
        first = self.post(f"{OPS}/queue", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "config": "STANDARD_POSTPAY", "point": "RECEPTION",
            "idempotencyKey": "b8-queue-reception-" + uuid.uuid4().hex,
        })
        points = ["NURSE", "DOCTOR", "LAB", "CASHIER", "PHARMACY"]
        item = first
        numbers = [item["queueNumber"]]
        for point in points:
            item = self.queue_state(item, "called")
            item = self.queue_state(item, "in_service")
            item = self.post(f"{OPS}/queue/{item['uuid']}/advance", {
                "nextPoint": point, "provider": self.ctx["providerUuid"],
                "idempotencyKey": "b8-queue-" + point.lower() + "-" + uuid.uuid4().hex,
            })
            self.assertEqual(item["point"], point)
            self.assertEqual(item["state"], "waiting")
            numbers.append(item["queueNumber"])
        left = self.post(f"{OPS}/queue", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "config": "COMPACT_PREPAY", "point": "RECEPTION",
            "idempotencyKey": "b8-left-" + uuid.uuid4().hex,
        })
        left = self.post(f"{OPS}/queue/{left['uuid']}/transition", {
            "state": "left", "exitReason": "patient_requested",
        })
        self.assertEqual(left["state"], "left")
        self.assertEqual(left["exitReason"], "patient_requested")
        self.record("ordered reception-to-pharmacy queue and explicit left state/reason",
                    standardPoints=["RECEPTION", *points], queueNumbers=numbers)

    def test_04_vnd_billing_receipt_refund_cancel_and_trace(self):
        service = self.services["LAB-GLU"]
        postpay = self.post(f"{OPS}/bills", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "facility": self.facility["uuid"], "paymentTiming": "postpay",
            "lines": [{"service": service["uuid"], "quantity": 2, "discountVnd": 400}],
            "idempotencyKey": "b8-bill-postpay-" + uuid.uuid4().hex,
        })
        self.assertEqual(postpay["totalVnd"], 44400)
        first = self.post(f"{OPS}/bills/{postpay['uuid']}/receipts", {
            "amountVnd": 20000, "method": "cash", "idempotencyKey": "b8-receipt-a-" + uuid.uuid4().hex,
        })
        second = self.post(f"{OPS}/bills/{postpay['uuid']}/receipts", {
            "amountVnd": 24400, "method": "bank_transfer", "status": "pending",
            "idempotencyKey": "b8-receipt-b-" + uuid.uuid4().hex,
        })
        second = self.post(f"{OPS}/payments/{second['uuid']}/settle", {})
        self.assertEqual(second["status"], "settled")
        refund = self.post(f"{OPS}/payments/{first['uuid']}/refunds", {
            "amountVnd": 1000, "method": "cash", "reason": "Hoàn tiền synthetic B8",
            "idempotencyKey": "b8-refund-" + uuid.uuid4().hex,
        })
        paid = self.client.json(f"{OPS}/bills/{postpay['uuid']}")
        self.assertEqual(paid["status"], "paid")
        self.assertEqual(paid["netCollectedVnd"], 43400)
        self.assertTrue(first["recordedByUserUuid"])
        unpaid = self.post(f"{OPS}/bills", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "facility": self.facility["uuid"], "paymentTiming": "postpay",
            "lines": [{"service": service["uuid"], "quantity": 1, "discountVnd": 0}],
            "idempotencyKey": "b8-bill-cancel-" + uuid.uuid4().hex,
        })
        cancelled = self.post(f"{OPS}/bills/{unpaid['uuid']}/cancel", {"reason": "Tạo nhầm synthetic"})
        self.assertEqual(cancelled["status"], "cancelled")
        prepay = self.post(f"{OPS}/bills", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "facility": self.facility["uuid"], "paymentTiming": "prepay",
            "lines": [{"service": service["uuid"], "quantity": 1, "discountVnd": 0}],
            "idempotencyKey": "b8-bill-prepay-" + uuid.uuid4().hex,
        })
        receipt = self.post(f"{OPS}/bills/{prepay['uuid']}/receipts", {
            "amountVnd": prepay["totalVnd"], "method": "cash",
            "idempotencyKey": "b8-prepay-receipt-" + uuid.uuid4().hex,
        })
        type(self).state.update(postpay=paid, receipt=first, refund=refund,
                                prepay=prepay, prepay_receipt=receipt)
        self.record("integer VND snapshots, partial/pending settlement, refund, cancel and actor trace",
                    postpayBill=postpay["uuid"], prepayBill=prepay["uuid"],
                    receiptUuid=first["uuid"], refundUuid=refund["uuid"])

    def test_05_diagnostic_order_result_attachment_and_fhir(self):
        service = self.services["LAB-GLU"]
        bad = {
            "patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"],
            "orderer": self.ctx["providerUuid"], "facility": self.facility["uuid"],
            "service": service["uuid"], "config": "COMPACT_PREPAY",
            "clinicalHistory": "Synthetic glucose check",
            "idempotencyKey": "b8-unpaid-order-" + uuid.uuid4().hex,
        }
        self.rejected(f"{OPS}/service-orders", bad, "settled matching", 409)
        payload = dict(bad, bill=self.state["prepay"]["uuid"],
                       idempotencyKey="b8-paid-order-" + uuid.uuid4().hex)
        order = self.post(f"{OPS}/service-orders", payload)
        order = self.post(f"{OPS}/service-orders/{order['uuid']}/transition", {
            "state": "assigned", "assignedProvider": self.ctx["providerUuid"],
        })
        order = self.post(f"{OPS}/service-orders/{order['uuid']}/transition", {"state": "in_progress"})
        recorded = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        result = self.post(f"{OPS}/service-orders/{order['uuid']}/results", {
            "state": "final", "numericValue": 5.6, "unit": "mmol/L",
            "authorProvider": self.ctx["providerUuid"], "reviewerProvider": self.ctx["providerUuid"],
            "recordedAt": recorded, "reviewedAt": recorded,
        })
        pdf = b"%PDF-1.4\n% VinSHC synthetic B8 attachment\n%%EOF\n"
        attachment = self.client.multipart(
            f"{OPS}/service-orders/{order['uuid']}/attachments?result={result['uuid']}",
            filename="synthetic-result.pdf", content_type="application/pdf", content=pdf,
        )
        self.assertEqual(attachment["sha256"], hashlib.sha256(pdf).hexdigest())
        status, headers, downloaded = self.client.request(
            f"{OPS}/attachments/{attachment['uuid']}/content", timeout=30
        )
        self.assertEqual(status, 200)
        self.assertEqual(downloaded, pdf)
        self.assertEqual(headers["X-Content-SHA256"], hashlib.sha256(pdf).hexdigest())
        corrected = self.post(f"{OPS}/results/{result['uuid']}/corrections", {
            "numericValue": 5.7, "unit": "mmol/L", "reason": "Hiệu chỉnh synthetic",
            "authorProvider": self.ctx["providerUuid"], "reviewerProvider": self.ctx["providerUuid"],
            "recordedAt": recorded, "reviewedAt": recorded,
        })
        self.assertEqual(corrected["previousResultUuid"], result["uuid"])
        order = self.post(f"{OPS}/service-orders/{order['uuid']}/transition", {"state": "completed"})
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/ServiceRequest/{order['uuid']}")
        self.assertEqual(fhir["subject"]["reference"], "Patient/" + self.ctx["patientUuid"])
        self.assertEqual(fhir["encounter"]["reference"], "Encounter/" + self.ctx["encounterUuid"])
        type(self).state.update(service_order=order, result=corrected, attachment=attachment)
        self.record("native TestOrder/FHIR ServiceRequest, assignment, numeric result revision and PDF round-trip",
                    orderUuid=order["uuid"], resultUuid=corrected["uuid"],
                    attachmentUuid=attachment["uuid"], attachmentSha256=attachment["sha256"])

    def test_06_print_dtos_use_configured_identity_and_stable_numbers(self):
        summary = self.client.json(
            f"{REST}/vinshc/encounter/{self.ctx['encounterUuid']}/clinical-summary"
        )
        prescription = next(item for item in summary["drugOrders"] if item["status"] == "active")
        sources = {
            "appointment": self.state["appointment"]["uuid"],
            "receipt": self.state["receipt"]["uuid"],
            "order": self.state["service_order"]["uuid"],
            "result": self.state["result"]["uuid"],
            "prescription": prescription["uuid"],
        }
        numbers = {}
        for template, source in sources.items():
            document = self.client.json(f"{OPS}/documents/{template}/{source}")
            replay = self.client.json(f"{OPS}/documents/{template}/{source}")
            self.assertEqual(document["documentNumber"], replay["documentNumber"])
            self.assertEqual(document["facility"]["uuid"], self.facility["uuid"])
            self.assertEqual(document["facility"]["legalName"], self.facility["legalName"])
            self.assertEqual(document["patient"]["uuid"], self.ctx["patientUuid"])
            numbers[template] = document["documentNumber"]
        self.record("prescription/receipt/order/result/appointment DTOs use configured identities and immutable numbers",
                    documentNumbers=numbers, sources=sources)

    def test_07_daily_report_is_aggregate_and_manager_only_needs_report_privilege(self):
        role = json.loads((ROOT / "metadata/vinshc/permissions.json").read_text(encoding="utf-8"))["roles"]["manager"]
        person = self.client.json(f"{REST}/person", method="POST", statuses=(200, 201), payload={
            "names": [{"givenName": "B8", "familyName": "Manager"}], "gender": "U",
        })
        username, password = "b8-manager-" + uuid.uuid4().hex[:10], "B8-local-" + uuid.uuid4().hex
        user = self.client.json(f"{REST}/user", method="POST", statuses=(200, 201), payload={
            "username": username, "password": password, "person": person["uuid"],
            "roles": [role["openmrs"]["uuid"]],
        })
        type(self).created_users.append((user["uuid"], person["uuid"]))
        self.client.json(f"{REST}/vinshc/authorization/assignment", method="POST", statuses=(200, 201), payload={
            "user": user["uuid"], "role": "manager", "facility": self.facility["locationUuid"],
        })
        manager = Client(self.base, username, password, default_headers={
            "X-VinSHC-Workspace-Role": "manager",
            "X-VinSHC-Workspace-Facility": self.facility["locationUuid"],
        })
        today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
        report = manager.json(
            f"{OPS}/reports/daily?date={today}&facility={self.facility['uuid']}"
        )
        self.assertTrue(report["aggregateOnly"])
        self.assertGreaterEqual(report["openedVisits"], 1)
        self.assertEqual(report["grossVnd"], 66800)
        self.assertEqual(report["refundVnd"], 1000)
        self.assertEqual(report["netVnd"], 65800)
        status, _, _ = manager.request(
            f"{REST}/vinshc/encounter/{self.ctx['encounterUuid']}/clinical-summary"
        )
        self.assertEqual(status, 403)
        self.record("Asia/Ho_Chi_Minh daily visit/revenue aggregate available without chart privilege",
                    report=report)


if __name__ == "__main__":
    unittest.main()
