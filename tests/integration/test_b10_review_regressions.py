"""Runtime regressions for the backend review findings (REVIEW_BE.md) on an isolated Docker stack.

Needs the B2, B3 and B4b fixtures. It writes extra synthetic transactions, so CI runs it last,
after the B9 restart/restore checks that assert nothing changed since B8.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta, timezone
import json
from pathlib import Path
import random
import sys
import threading
import unittest
import uuid
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings


REST = "/openmrs/ws/rest/v1"
VINSHC = REST + "/vinshc"
OPS = VINSHC + "/operations"
CLINIC = ZoneInfo("Asia/Ho_Chi_Minh")


def key(label):
    return f"b10-{label}-{uuid.uuid4().hex}"


class ReviewRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}"
        cls.admin = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        fixtures = ROOT / ".runtime/fixtures"
        cls.ctx = json.loads((fixtures / "b4b-clinical.json").read_text(encoding="utf-8"))
        cls.b2 = json.loads((fixtures / "b2-patients.json").read_text(encoding="utf-8"))
        cls.b3 = json.loads((fixtures / "b3-vitals.json").read_text(encoding="utf-8"))
        cls.entities = json.loads(
            (ROOT / "metadata/vinshc/frontend-map.json").read_text(encoding="utf-8"))["entities"]
        cls.permissions = json.loads((ROOT / "metadata/vinshc/permissions.json").read_text(encoding="utf-8"))
        cls.facility = json.loads(
            (ROOT / "metadata/vinshc/catalogues/facilities.json").read_text(encoding="utf-8"))["records"][0]
        cls.services = {item["code"]: item for item in json.loads(
            (ROOT / "metadata/vinshc/catalogues/services.json").read_text(encoding="utf-8"))["records"]}
        cls.created_users = []
        cls.created_locations = []
        cls.report = {"startedAt": datetime.now(timezone.utc).isoformat(), "checks": []}

    @classmethod
    def tearDownClass(cls):
        cls.report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = ROOT / ".runtime/reports/b10-review-regressions.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for user, person in cls.created_users:
            cls.admin.request(f"{REST}/user/{user}?reason=B10%20test%20complete", method="DELETE")
            cls.admin.request(f"{REST}/person/{person}?reason=B10%20test%20complete", method="DELETE")
        for location in cls.created_locations:
            cls.admin.request(f"{REST}/location/{location}?reason=B10%20test%20complete", method="DELETE")

    # ------------------------------------------------------------ helpers

    def record(self, finding, **details):
        self.report["checks"].append({"finding": finding, "passed": True, **details})

    def call(self, path, *, method="GET", payload=None, client=None, **kwargs):
        status, headers, body = (client or self.admin).request(
            path, method=method, payload=payload, timeout=60, **kwargs)
        data = None
        if body and "json" in headers.get("Content-Type", "").lower():
            data = json.loads(body)
        return status, data

    def ok(self, path, payload=None, *, method="POST", statuses=(200, 201), client=None):
        status, data = self.call(path, method=method, payload=payload, client=client)
        self.assertIn(status, statuses, (method, path, data))
        return data

    def get(self, path, client=None):
        return self.ok(path, method="GET", statuses=(200,), client=client)

    def bill(self, service="LAB-CREA"):
        return self.ok(f"{OPS}/bills", {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "facility": self.facility["uuid"], "paymentTiming": "postpay",
            "lines": [{"service": self.services[service]["uuid"], "quantity": 1}],
            "idempotencyKey": key("bill"),
        })

    def user_with_role(self, role, location):
        person = self.ok(f"{REST}/person", {"names": [{"givenName": "B10", "familyName": role}], "gender": "U"})
        username, password = f"b10-{role}-{uuid.uuid4().hex[:8]}", "B10-local-" + uuid.uuid4().hex
        user = self.ok(f"{REST}/user", {
            "username": username, "password": password, "person": person["uuid"],
            "roles": [self.permissions["roles"][role]["openmrs"]["uuid"]],
        })
        type(self).created_users.append((user["uuid"], person["uuid"]))
        self.ok(f"{VINSHC}/authorization/assignment",
                {"user": user["uuid"], "role": role, "facility": location})
        return username, password

    def workspace(self, username, password, role, location):
        return Client(self.base, username, password, default_headers={
            "X-VinSHC-Workspace-Role": role, "X-VinSHC-Workspace-Facility": location})

    def provider(self):
        person = self.ok(f"{REST}/person", {"names": [{"givenName": "B10", "familyName": "Provider"}],
                                            "gender": "U"})
        return self.ok(f"{REST}/provider", {"person": person["uuid"],
                                            "identifier": "B10-" + uuid.uuid4().hex[:10].upper()})

    def service_order(self, code):
        return self.ok(f"{OPS}/service-orders", {
            "patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"],
            "orderer": self.ctx["providerUuid"], "facility": self.facility["uuid"],
            "service": self.services[code]["uuid"], "config": "STANDARD_POSTPAY",
            "idempotencyKey": key("order"),
        })

    # ------------------------------------------------------------ findings

    def test_01_unauthenticated_requests_get_401(self):
        statuses = {}
        for path in (f"{OPS}/configuration", f"{VINSHC}/identity/{self.ctx['patientUuid']}"):
            status, body = self.call(path, auth=False)
            statuses[path] = status
            self.assertEqual(status, 401, (path, body))
            self.assertEqual(body["error"], "unauthenticated")
        self.record("M-5/L-1", statuses=statuses)

    def test_02_settling_a_pending_transfer_cannot_reopen_a_cancelled_bill(self):
        bill = self.bill()
        pending = self.ok(f"{OPS}/bills/{bill['uuid']}/receipts", {
            "amountVnd": bill["totalVnd"], "method": "bank_transfer", "status": "pending",
            "idempotencyKey": key("pending")})
        cancelled = self.ok(f"{OPS}/bills/{bill['uuid']}/cancel", {"reason": "B10 synthetic cancel"})
        self.assertEqual(cancelled["status"], "cancelled")
        status, body = self.call(f"{OPS}/payments/{pending['uuid']}/settle", method="POST", payload={})
        final = self.get(f"{OPS}/bills/{bill['uuid']}")
        self.assertEqual(status, 409, body)
        self.assertEqual(final["status"], "cancelled")
        self.assertEqual(final["settledVnd"], 0)
        self.record("H-3", settleStatus=status, billStatus=final["status"])

    def test_03_payment_and_refund_retries_return_the_original_after_full_amount(self):
        bill = self.bill()
        payment = {"amountVnd": bill["totalVnd"], "method": "cash", "idempotencyKey": key("full")}
        first = self.ok(f"{OPS}/bills/{bill['uuid']}/receipts", payment)
        status, retry = self.call(f"{OPS}/bills/{bill['uuid']}/receipts", method="POST", payload=payment)
        self.assertEqual(status, 201, retry)
        self.assertEqual(retry["uuid"], first["uuid"])
        refund = {"amountVnd": bill["totalVnd"], "method": "cash", "reason": "B10 full refund",
                  "idempotencyKey": key("refund")}
        original = self.ok(f"{OPS}/payments/{first['uuid']}/refunds", refund)
        status, again = self.call(f"{OPS}/payments/{first['uuid']}/refunds", method="POST", payload=refund)
        self.assertEqual(status, 201, again)
        self.assertEqual(again["uuid"], original["uuid"])
        self.record("M-1", receiptRetry=status, refundRetry=status)

    def test_04_appointment_slots_are_exclusive_per_provider_and_patient_only(self):
        other_provider = self.provider()["uuid"]
        day = (datetime.now(CLINIC) + timedelta(days=random.randint(60, 900))).date()
        start = datetime.combine(day, time(9, random.randint(0, 39)), CLINIC)

        def book(patient, provider):
            return self.call(f"{OPS}/appointments", method="POST", payload={
                "patient": patient, "facility": self.facility["uuid"], "provider": provider,
                "service": self.services["CONSULT-TEST"]["uuid"], "appointmentType": "FOLLOWUP",
                "startAt": start.isoformat(), "endAt": (start + timedelta(minutes=20)).isoformat(),
                "idempotencyKey": key("slot")})

        first, second = self.ctx["patientUuid"], self.b2["patients"][1]["patientUuid"]
        outcomes = {
            "patientA+providerA": book(first, self.ctx["providerUuid"])[0],
            "patientB+providerA": book(second, self.ctx["providerUuid"])[0],
            "patientA+providerB": book(first, other_provider)[0],
            "patientB+providerB": book(second, other_provider)[0],
        }
        self.assertEqual(outcomes, {"patientA+providerA": 201, "patientB+providerA": 409,
                                    "patientA+providerB": 409, "patientB+providerB": 201})
        self.record("M-2", outcomes=outcomes)

    def test_05_correcting_a_superseded_result_is_a_conflict(self):
        order = self.service_order("US-ABD")
        self.ok(f"{OPS}/service-orders/{order['uuid']}/transition",
                {"state": "assigned", "assignedProvider": self.ctx["providerUuid"]})
        self.ok(f"{OPS}/service-orders/{order['uuid']}/transition", {"state": "in_progress"})
        at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        signed = {"authorProvider": self.ctx["providerUuid"], "reviewerProvider": self.ctx["providerUuid"],
                  "recordedAt": at, "reviewedAt": at}
        v1 = self.ok(f"{OPS}/service-orders/{order['uuid']}/results",
                     {"state": "final", "textValue": "B10 synthetic", **signed})
        self.ok(f"{OPS}/results/{v1['uuid']}/corrections",
                {"textValue": "B10 corrected", "reason": "B10 correction", **signed})
        status, body = self.call(f"{OPS}/results/{v1['uuid']}/corrections", method="POST",
                                 payload={"textValue": "B10 again", "reason": "stale tab", **signed})
        self.assertEqual(status, 409, body)
        self.assertIn("newer revision", body["error"])
        self.record("M-3", staleCorrectionStatus=status)

    def test_06_cancelled_service_order_keeps_reason_and_stops_native_order(self):
        order = self.service_order("ECG-BED")
        cancelled = self.ok(f"{OPS}/service-orders/{order['uuid']}/transition",
                            {"state": "cancelled", "reason": "B10 patient declined"})
        native = self.get(f"{REST}/order/{order['uuid']}?v=full")
        self.assertEqual(cancelled.get("stateReason"), "B10 patient declined")
        self.assertIsNotNone(native.get("dateStopped"), native)
        self.record("M-8", stateReason=cancelled.get("stateReason"), nativeDateStopped=native.get("dateStopped"))

    def test_07_other_facility_workspace_cannot_reach_clinic_records(self):
        other = self.ok(f"{REST}/location", {"name": "B10 Other Clinic " + uuid.uuid4().hex[:6],
                                             "description": "Synthetic second facility"})
        type(self).created_locations.append(other["uuid"])
        # A VinSHC account has one active role/facility workspace. Use separate
        # accounts for the two facilities so this test exercises facility scope
        # instead of intentionally replacing the first assignment with the second.
        home_username, home_password = self.user_with_role("cashier", self.facility["locationUuid"])
        away_username, away_password = self.user_with_role("cashier", other["uuid"])
        home = self.workspace(home_username, home_password, "cashier", self.facility["locationUuid"])
        away = self.workspace(away_username, away_password, "cashier", other["uuid"])
        for client, location, name in (
            (home, self.facility["locationUuid"], self.facility["name"]),
            (away, other["uuid"], other["name"]),
        ):
            workspace = self.get(f"{VINSHC}/authorization/workspace", client=client)
            self.assertEqual(workspace["role"], "cashier")
            self.assertEqual(workspace["facilityUuid"], location)
            self.assertEqual(self.get(f"{VINSHC}/authorization/workspaces", client=client),
                             [{"role": "cashier", "facilityUuid": location, "facilityName": name}])
        bill = self.bill()
        self.get(f"{OPS}/bills/{bill['uuid']}", client=home)
        receipt = self.ok(f"{OPS}/bills/{bill['uuid']}/receipts", {
            "amountVnd": bill["totalVnd"], "method": "cash", "idempotencyKey": key("home")}, client=home)
        # A cashier prints receipts of their own facility (this used to need Core "Get Users").
        printed = self.get(f"{OPS}/documents/receipt/{receipt['uuid']}", client=home)
        self.assertTrue(printed["issuer"]["fullName"])
        away_statuses = {
            "readBill": self.call(f"{OPS}/bills/{bill['uuid']}", client=away)[0],
            "readPayment": self.call(f"{OPS}/payments/{receipt['uuid']}", client=away)[0],
            "printReceipt": self.call(f"{OPS}/documents/receipt/{receipt['uuid']}", client=away)[0],
            "refund": self.call(f"{OPS}/payments/{receipt['uuid']}/refunds", method="POST", client=away,
                                payload={"amountVnd": 1, "method": "cash", "reason": "B10 cross facility",
                                         "idempotencyKey": key("away")})[0],
        }
        self.assertEqual(away_statuses, {name: 403 for name in away_statuses})
        # Reassignment replaces the old workspace immediately and does not let
        # cached headers keep access to the previous facility's records.
        user = self.get(f"{REST}/session", client=home)["user"]["uuid"]
        for _ in range(2):
            self.ok(f"{VINSHC}/authorization/assignment",
                    {"user": user, "role": "cashier", "facility": other["uuid"]})
        self.assertEqual(self.call(f"{OPS}/bills/{bill['uuid']}", client=home)[0], 403)
        reassigned = self.workspace(home_username, home_password, "cashier", other["uuid"])
        self.assertEqual(self.get(f"{VINSHC}/authorization/workspaces", client=reassigned),
                         [{"role": "cashier", "facilityUuid": other["uuid"], "facilityName": other["name"]}])
        self.get(f"{VINSHC}/authorization/workspace", client=reassigned)
        self.assertEqual(self.call(f"{OPS}/bills/{bill['uuid']}", client=reassigned)[0], 403)
        self.ok(f"{VINSHC}/authorization/assignment",
                {"user": user, "role": "cashier", "facility": self.facility["locationUuid"]})
        self.assertEqual(self.call(f"{VINSHC}/authorization/workspace", client=reassigned)[0], 403)
        self.get(f"{OPS}/bills/{bill['uuid']}", client=home)
        self.assertEqual(len(self.get(f"{VINSHC}/authorization/workspaces", client=home)), 1)
        self.record("H-1/T-2/T-3", awayStatuses=away_statuses, singleWorkspaceReassignment=True)

    def test_08_parallel_settle_and_cash_payment_cannot_overpay(self):
        rounds = []
        for _ in range(8):
            bill = self.bill()
            pending = self.ok(f"{OPS}/bills/{bill['uuid']}/receipts", {
                "amountVnd": bill["totalVnd"], "method": "bank_transfer", "status": "pending",
                "idempotencyKey": key("race-pending")})
            barrier = threading.Barrier(2)

            def settle():
                barrier.wait()
                return self.call(f"{OPS}/payments/{pending['uuid']}/settle", method="POST", payload={})[0]

            def cash():
                barrier.wait()
                return self.call(f"{OPS}/bills/{bill['uuid']}/receipts", method="POST", payload={
                    "amountVnd": bill["totalVnd"], "method": "cash", "idempotencyKey": key("race-cash")})[0]

            with ThreadPoolExecutor(2) as pool:
                statuses = [future.result() for future in (pool.submit(settle), pool.submit(cash))]
            final = self.get(f"{OPS}/bills/{bill['uuid']}")
            rounds.append({"statuses": statuses, "settledVnd": final["settledVnd"], "totalVnd": final["totalVnd"]})
        for item in rounds:
            self.assertLessEqual(item["settledVnd"], item["totalVnd"], rounds)
            self.assertEqual(sum(1 for status in item["statuses"] if status < 300), 1, rounds)
            self.assertNotIn(500, item["statuses"], rounds)
        self.record("H-2", rounds=rounds)

    def test_09_concurrent_identical_writes_never_answer_500(self):
        payload = {
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "facility": self.facility["uuid"], "paymentTiming": "postpay",
            "lines": [{"service": self.services["LAB-CREA"]["uuid"], "quantity": 1}],
            "idempotencyKey": key("same"),
        }
        barrier = threading.Barrier(6)

        def create():
            barrier.wait()
            return self.call(f"{OPS}/bills", method="POST", payload=payload)

        with ThreadPoolExecutor(6) as pool:
            results = [future.result() for future in [pool.submit(create) for _ in range(6)]]
        statuses = sorted(status for status, _ in results)
        uuids = {body["uuid"] for status, body in results if status == 201}
        self.assertTrue(set(statuses) <= {201, 409}, statuses)
        self.assertEqual(len(uuids), 1, results)
        self.record("M-4", statuses=statuses)

    def test_10_proxy_privileges_do_not_leak_into_parallel_core_requests(self):
        username, password = self.user_with_role("nurse", self.facility["locationUuid"])
        login_status, headers, _ = Client(self.base, username, password).request(f"{REST}/session")
        self.assertEqual(login_status, 200)
        session = next(item.split(";", 1)[0] for item in headers.get_all("Set-Cookie") or []
                       if item.startswith("JSESSIONID="))
        core = Client(self.base, username, password, default_headers={"Cookie": session})
        adapter = Client(self.base, username, password, default_headers={
            "Cookie": session, "X-VinSHC-Workspace-Role": "nurse",
            "X-VinSHC-Workspace-Facility": self.facility["locationUuid"]})
        patient_path = f"{REST}/patient/{self.ctx['patientUuid']}"
        identity_path = f"{VINSHC}/identity/{self.ctx['patientUuid']}?includeHistory=true"
        self.assertEqual(core.request(patient_path, auth=False)[0], 403, "precondition: nurse lacks Get Patients")
        self.assertEqual(adapter.request(identity_path, auth=False)[0], 200, "precondition: cookie session works")
        stop = threading.Event()

        def adapter_load():
            count = 0
            while not stop.is_set():
                adapter.request(identity_path, auth=False, timeout=60)
                count += 1
            return count

        def core_probe():
            return [core.request(patient_path, auth=False, timeout=60)[0] for _ in range(40)]

        with ThreadPoolExecutor(14) as pool:
            loads = [pool.submit(adapter_load) for _ in range(8)]
            probes = [pool.submit(core_probe) for _ in range(6)]
            core_statuses = [status for future in probes for status in future.result()]
            stop.set()
            adapter_calls = sum(future.result() for future in loads)
        leaked = sum(1 for status in core_statuses if status == 200)
        self.assertEqual(leaked, 0, f"{leaked}/{len(core_statuses)} Core reads succeeded via leaked proxies")
        self.assertEqual(set(core_statuses), {403})
        self.record("H-4", coreRequests=len(core_statuses), leaked=leaked, adapterRequests=adapter_calls)

    def test_11_jdbc_writes_roll_back_with_the_transaction(self):
        visit = {"patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"], "config": "STANDARD_POSTPAY"}
        item = self.ok(f"{OPS}/queue", {**visit, "point": "RECEPTION", "idempotencyKey": key("rollback")})
        for state in ("called", "in_service"):
            item = self.ok(f"{OPS}/queue/{item['uuid']}/transition", {"state": state})
        used = key("used")
        self.ok(f"{OPS}/queue", {**visit, "point": "RECEPTION", "idempotencyKey": used})
        # advance first marks the item completed, then fails on the reused key: everything must roll back.
        status, body = self.call(f"{OPS}/queue/{item['uuid']}/advance", method="POST",
                                 payload={"nextPoint": "NURSE", "idempotencyKey": used})
        after = self.get(f"{OPS}/queue/{item['uuid']}")
        self.assertEqual(status, 409, body)
        self.assertEqual(after["state"], "in_service")
        self.record("T-6", advanceStatus=status, stateAfterRollback=after["state"])

    def test_12_audit_rejects_unknown_patient_and_pages(self):
        unknown, body = self.call(f"{VINSHC}/authorization/audit?patient={uuid.uuid4()}")
        self.assertEqual(unknown, 400, body)
        page = self.get(f"{VINSHC}/authorization/audit?patient={self.ctx['patientUuid']}&limit=2")
        self.assertLessEqual(len(page), 2)
        self.assertEqual(self.call(f"{VINSHC}/authorization/audit?limit=0")[0], 400)
        self.record("M-7", unknownPatientStatus=unknown, pageSize=len(page))

    def test_13_vitals_reject_impossible_temperature(self):
        status, body = self.call(f"{VINSHC}/vitals", method="POST", payload={
            "patient": self.b3["patientUuid"], "encounter": self.b3["encounterUuid"],
            "values": {"vitals.nhiet_do": -5}})
        self.assertEqual(status, 400, body)
        self.record("L-4", status=status)

    def test_14_money_cannot_wrap_and_reprints_ignore_uuid_case(self):
        bill = self.bill()
        status, body = self.call(f"{OPS}/bills/{bill['uuid']}/receipts", method="POST", payload={
            "amountVnd": 2 ** 64 + 100, "method": "cash", "idempotencyKey": key("wrap")})
        self.assertEqual(status, 400, body)
        receipt = self.ok(f"{OPS}/bills/{bill['uuid']}/receipts", {
            "amountVnd": bill["totalVnd"], "method": "cash", "idempotencyKey": key("print")})
        lower = self.get(f"{OPS}/documents/receipt/{receipt['uuid']}")
        upper = self.get(f"{OPS}/documents/receipt/{receipt['uuid'].upper()}")
        self.assertEqual(lower["documentNumber"], upper["documentNumber"])
        self.record("L-3/L-5", wrapStatus=status, documentNumber=lower["documentNumber"])

    def test_15_prescribing_after_finalization_requires_reason(self):
        status, body = self.call(f"{VINSHC}/drug-order", method="POST", payload={
            "patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"]})
        self.assertEqual(status, 400, body)
        self.assertIn("prescribing after finalization requires reason", body["error"])
        self.record("L-7", status=status)

    def test_16_followup_date_is_checked_against_the_clinic_calendar_day(self):
        day = (datetime.now(CLINIC) - timedelta(days=random.randint(40, 900))).date()
        encounter_at = datetime.combine(day, time(6, 30), CLINIC)  # 23:30 UTC on the previous day
        location = self.entities["location.development.clinic"]
        visit = self.ok(f"{REST}/visit", {
            "patient": self.ctx["patientUuid"], "visitType": self.entities["visit.outpatient"],
            "location": location, "startDatetime": (encounter_at - timedelta(minutes=10)).isoformat(),
            "stopDatetime": (encounter_at + timedelta(hours=2)).isoformat()})
        encounter = self.ok(f"{REST}/encounter", {
            "patient": self.ctx["patientUuid"], "visit": visit["uuid"],
            "encounterType": self.entities["encounter.consultation"], "location": location,
            "encounterDatetime": encounter_at.isoformat(),
            "encounterProviders": [{"provider": self.ctx["providerUuid"],
                                    "encounterRole": self.entities["encounter_role.clinician"]}]})

        def consult(followup):
            return self.call(f"{VINSHC}/consultation", method="POST", payload={
                "patient": self.ctx["patientUuid"], "encounter": encounter["uuid"],
                "values": {"visit.ly_do_kham": "B10 timezone", "followup.ngay_tai_kham": followup}})

        status, body = consult((day - timedelta(days=1)).isoformat())
        self.assertEqual(status, 400, body)
        self.assertIn("cannot be before the encounter date", body["error"])
        status, created = consult(day.isoformat())
        self.assertEqual(status, 201, created)
        self.assertEqual(created["values"]["followup.ngay_tai_kham"], day.isoformat())
        self.record("M-6", clinicDay=day.isoformat(), encounterAt=encounter_at.isoformat())


if __name__ == "__main__":
    unittest.main()
