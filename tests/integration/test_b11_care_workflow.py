"""B11 staff workflow through the VinSHC adapter only, using real workspace accounts.

Reception registers/searches a patient and opens a visit, the nurse records/corrects vital signs, the
doctor examines and prescribes, the lab picks up an order, the cashier bills, the pharmacy dispenses
and reception closes the visit. Every staff call carries the role/facility workspace headers; only
the setup (users, providers, catalogue linkage) uses the admin account.

Needs the B4b catalogue (run after test_b4b_clinical). Writes synthetic data only, so CI runs it after
the B9 restart/restore verifier, next to B10.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import random
import string
import sys
import unittest
import urllib.parse
import uuid
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_client import Client
from common import read_settings, report_path
import b4_catalogue
import b4_metadata_catalogue


REST = "/openmrs/ws/rest/v1"
VINSHC = REST + "/vinshc"
OPS = VINSHC + "/operations"
CLINIC = ZoneInfo("Asia/Ho_Chi_Minh")
ROLES = ("reception", "nurse", "doctor", "cashier", "lab", "pharmacy", "manager")


def key(label):
    return f"b11-{label}-{uuid.uuid4().hex}"


def letters(size=6):
    return "".join(random.choice(string.ascii_lowercase) for _ in range(size))


class CareWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.base = f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}"
        cls.admin = Client(cls.base, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        cls.permissions = json.loads((ROOT / "metadata/vinshc/permissions.json").read_text(encoding="utf-8"))
        cls.facility = json.loads(
            (ROOT / "metadata/vinshc/catalogues/facilities.json").read_text(encoding="utf-8"))["records"][0]
        cls.services = {item["code"]: item for item in json.loads(
            (ROOT / "metadata/vinshc/catalogues/services.json").read_text(encoding="utf-8"))["records"]}
        if os.environ.get("VINSHC_B4_CATALOGUE", "synthetic").lower() == "metadata":
            cls.catalogue = b4_metadata_catalogue.ensure(cls.admin)
        else:
            cls.catalogue = b4_catalogue.ensure(cls.admin)
        cls.created_users, cls.created_providers, cls.created_locations = [], [], []
        cls.report = {"startedAt": datetime.now(timezone.utc).isoformat(), "checks": []}
        cls.staff, cls.providers = {}, {}
        location = cls.facility["locationUuid"]
        for role in ROLES:
            username, password, person, user_uuid = cls.user_with_role(role, [location])
            cls.staff[role] = cls.workspace(username, password, role, location)
            if role in ("nurse", "doctor", "lab"):
                provider = cls.admin.json(f"{REST}/provider", method="POST", statuses=(200, 201), payload={
                    "person": person, "identifier": "B11-" + uuid.uuid4().hex[:10].upper()})
                cls.created_providers.append(provider["uuid"])
                cls.providers[role] = provider["uuid"]
                cls.admin.json(f"{VINSHC}/directory/providers/link", method="POST", payload={
                    "userUuid": user_uuid, "providerUuid": provider["uuid"],
                    "facilityLocationUuid": location,
                })
        cls.state = {"middle": letters(), "cccd": f"{random.randrange(10**11, 10**12)}"}

    @classmethod
    def tearDownClass(cls):
        cls.report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        cls.report["passed"] = len(cls.report["checks"]) == 12
        target = report_path("b11-care-workflow.json")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for provider in cls.created_providers:
            cls.admin.request(f"{REST}/provider/{provider}?reason=B11%20test%20complete", method="DELETE")
        for user, person in cls.created_users:
            cls.admin.request(f"{REST}/user/{user}?reason=B11%20test%20complete", method="DELETE")
        for location in cls.created_locations:
            cls.admin.request(f"{REST}/location/{location}?reason=B11%20test%20complete", method="DELETE")

    # ------------------------------------------------------------ helpers

    @classmethod
    def user_with_role(cls, role, locations):
        person = cls.admin.json(f"{REST}/person", method="POST", statuses=(200, 201), payload={
            "names": [{"givenName": "B11", "familyName": role.capitalize()}], "gender": "U"})
        username, password = f"b11-{role}-{uuid.uuid4().hex[:8]}", "B11-local-" + uuid.uuid4().hex
        user = cls.admin.json(f"{REST}/user", method="POST", statuses=(200, 201), payload={
            "username": username, "password": password, "person": person["uuid"],
            "roles": [cls.permissions["roles"][role]["openmrs"]["uuid"]]})
        cls.created_users.append((user["uuid"], person["uuid"]))
        for location in locations:
            cls.admin.json(f"{VINSHC}/authorization/assignment", method="POST", statuses=(201,),
                           payload={"user": user["uuid"], "role": role, "facility": location})
        return username, password, person["uuid"], user["uuid"]

    @classmethod
    def workspace(cls, username, password, role, location):
        return Client(cls.base, username, password, default_headers={
            "X-VinSHC-Workspace-Role": role, "X-VinSHC-Workspace-Facility": location})

    def record(self, name, **details):
        self.report["checks"].append({"name": name, "passed": True, **details})

    def call(self, role, path, *, method="GET", payload=None):
        client = self.admin if role == "admin" else self.staff[role]
        status, headers, body = client.request(path, method=method, payload=payload, timeout=60)
        data = json.loads(body) if body and "json" in headers.get("Content-Type", "").lower() else None
        return status, data

    def ok(self, role, path, payload=None, *, method="POST", statuses=(200, 201)):
        status, data = self.call(role, path, method=method, payload=payload)
        self.assertIn(status, statuses, (role, method, path, data))
        return data

    def get(self, role, path):
        return self.ok(role, path, method="GET", statuses=(200,))

    def registration(self, **overrides):
        payload = {
            "familyName": "Nguyễn", "middleName": self.state["middle"], "givenName": "Bình", "gender": "F",
            "birthPrecision": "year", "birthYear": 1990, "phone": "0912 345 678", "occupation": "Kỹ sư",
            "identifiers": [{"type": "cccd", "identifier": self.state["cccd"]}],
            "idempotencyKey": key("register"),
        }
        payload.update(overrides)
        return payload

    # ------------------------------------------------------------ workflow (ordered)

    def test_01_reception_registers_with_idgen_number_duplicates_and_idempotency(self):
        payload = self.registration()
        patient = self.ok("reception", f"{VINSHC}/patients", payload, statuses=(201,))
        self.assertTrue(patient["identifier"].startswith("VSHC-"), patient)
        self.assertEqual(patient["fullName"], f"Nguyễn {self.state['middle']} Bình")
        self.assertEqual(patient["birthPrecision"], "year")
        self.assertTrue(patient["birthdateEstimated"])
        replay = self.ok("reception", f"{VINSHC}/patients", payload, statuses=(201,))
        self.assertEqual(replay["uuid"], patient["uuid"])
        status, same_id = self.call("reception", f"{VINSHC}/patients", method="POST",
                                    payload=self.registration(givenName="Khác", birthYear=1970))
        self.assertEqual(status, 409, same_id)
        self.assertIn(patient["uuid"], [m["uuid"] for m in same_id["matches"]])
        other_cccd = f"{random.randrange(10**11, 10**12)}"
        similar = self.registration(identifiers=[{"type": "cccd", "identifier": other_cccd}])
        status, duplicate = self.call("reception", f"{VINSHC}/patients", method="POST", payload=similar)
        self.assertEqual(status, 409, duplicate)
        self.assertIn(patient["uuid"], [m["uuid"] for m in duplicate["matches"]])
        status, invalid = self.call("reception", f"{VINSHC}/patients", method="POST",
                                    payload=self.registration(identifiers=[{"type": "cccd", "identifier": "12"}]))
        self.assertEqual(status, 400, invalid)
        status, _ = self.call("cashier", f"{VINSHC}/patients", method="POST", payload=self.registration())
        self.assertEqual(status, 403)
        type(self).state["patient"] = patient["uuid"]
        type(self).state["identifier"] = patient["identifier"]
        self.record("register: idgen number, idempotent replay, identifier/name duplicates, 400/403",
                    patient=patient["uuid"])

    def test_02_search_projection_and_update(self):
        patient = self.state["patient"]
        by_name = self.get("reception", f"{VINSHC}/patients?q=nguyen%20{self.state['middle']}%20binh")
        self.assertEqual([r["uuid"] for r in by_name["results"]], [patient])
        by_id = self.get("reception", f"{VINSHC}/patients?q={self.state['identifier'].lower()}")
        self.assertEqual(by_id["results"][0]["uuid"], patient)
        by_phone = self.get("reception", f"{VINSHC}/patients?q=0912345678")
        self.assertIn(patient, [r["uuid"] for r in by_phone["results"]])
        full = by_name["results"][0]
        self.assertEqual(full["projection"], "administrative")
        self.assertEqual(full["phone"], "0912 345 678")
        minimal = self.get("cashier", f"{VINSHC}/patients?q={self.state['identifier']}")["results"][0]
        self.assertEqual(minimal["projection"], "minimal")
        self.assertNotIn("phone", minimal)
        self.assertEqual(self.call("manager", f"{VINSHC}/patients?q=nguyen")[0], 403)
        updated = self.ok("reception", f"{VINSHC}/patients/{patient}", {
            "phone": "+84 912 000 111", "identifiers": [{"type": "bhyt", "identifier": "BHYT-" + letters(8).upper()}],
            "reason": "B11 cập nhật hành chính"})
        self.assertEqual(updated["phone"], "+84 912 000 111")
        self.assertIn("bhyt", [i["type"] for i in updated["identifiers"]])
        status, body = self.call("reception", f"{VINSHC}/patients/{patient}", method="POST", payload={})
        self.assertEqual(status, 400, body)
        self.record("search by folded name/identifier/phone, role projection, partial update",
                    results=len(by_name["results"]))

    def test_03_visit_opens_once_and_other_facility_is_out_of_scope(self):
        patient = self.state["patient"]
        visit = self.ok("reception", f"{VINSHC}/visits", {"patient": patient, "visitType": "outpatient"},
                        statuses=(201,))
        self.assertEqual(visit["status"], "open")
        status, again = self.call("reception", f"{VINSHC}/visits", method="POST",
                                  payload={"patient": patient, "visitType": "outpatient"})
        self.assertEqual(status, 409, again)
        self.assertEqual(again["matches"][0]["uuid"], visit["uuid"])
        listed = self.get("reception", f"{VINSHC}/visits?status=open&patient={patient}")
        self.assertEqual([v["uuid"] for v in listed["results"]], [visit["uuid"]])
        profile = self.get("reception", f"{VINSHC}/patients/{patient}")
        self.assertEqual(profile["openVisit"]["uuid"], visit["uuid"])
        other = self.admin.json(f"{REST}/location", method="POST", statuses=(200, 201), payload={
            "name": "B11 Other Clinic " + uuid.uuid4().hex[:6], "description": "Synthetic second facility"})
        type(self).created_locations.append(other["uuid"])
        username, password, _, _ = self.user_with_role("reception", [other["uuid"]])
        away = self.workspace(username, password, "reception", other["uuid"])
        away_status, _, _ = away.request(f"{VINSHC}/patients/{patient}")
        away_search = json.loads(away.request(f"{VINSHC}/patients?q={self.state['identifier']}")[2])
        self.assertEqual(away_status, 403)
        self.assertEqual(away_search["results"], [])
        type(self).state["visit"] = visit["uuid"]
        self.record("one open visit per patient; other facility gets 403 and an empty search",
                    visit=visit["uuid"], awayStatus=away_status)

    def test_04_nurse_encounter_vitals_list_correct_and_void(self):
        visit = self.state["visit"]
        first = self.ok("nurse", f"{VINSHC}/visits/{visit}/encounters", {"encounterType": "vitals"}, statuses=(201,))
        again = self.ok("nurse", f"{VINSHC}/visits/{visit}/encounters", {"encounterType": "vitals"}, statuses=(200,))
        self.assertEqual(again["uuid"], first["uuid"])
        self.assertEqual(first["providers"][0]["uuid"], self.providers["nurse"])
        self.assertEqual(self.call("nurse", f"{VINSHC}/visits/{visit}/encounters", method="POST",
                                   payload={"encounterType": "consultation"})[0], 403)
        status, _ = self.call("nurse", f"{VINSHC}/visits/{visit}/encounters", method="POST",
                              payload={"encounterType": "vitals", "provider": self.providers["doctor"]})
        self.assertEqual(status, 403)
        saved = self.ok("nurse", f"{VINSHC}/vitals", {
            "patient": self.state["patient"], "encounter": first["uuid"],
            "values": {"vitals.mach": 82, "vitals.ha_tam_thu": 120, "vitals.ha_tam_truong": 80, "vitals.spo2": 97}},
            statuses=(201,))
        listed = self.get("nurse", f"{VINSHC}/vitals?patient={self.state['patient']}&visit={visit}")
        self.assertEqual(listed["results"][0]["uuid"], saved["uuid"])
        self.assertEqual(listed["results"][0]["values"]["vitals.mach"], 82)
        corrected = self.ok("nurse", f"{VINSHC}/vitals/{saved['uuid']}/correction", {
            "values": {"vitals.mach": 84, "vitals.ha_tam_thu": 118, "vitals.ha_tam_truong": 78, "vitals.spo2": 97},
            "reason": "B11 nhập nhầm mạch"}, statuses=(201,))
        history = self.get("nurse", f"{VINSHC}/vitals?patient={self.state['patient']}&includeVoided=true")
        by_uuid = {g["uuid"]: g for g in history["results"]}
        self.assertTrue(by_uuid[saved["uuid"]]["voided"])
        self.assertEqual(by_uuid[saved["uuid"]]["voidReason"], "B11 nhập nhầm mạch")
        self.assertEqual(by_uuid[corrected["uuid"]]["values"]["vitals.mach"], 84)
        extra = self.ok("nurse", f"{VINSHC}/vitals", {
            "patient": self.state["patient"], "encounter": first["uuid"],
            "values": {"vitals.nhiet_do": 37.1}}, statuses=(201,))
        reason = urllib.parse.quote("B11 sai bệnh nhân")
        voided = self.ok("nurse", f"{VINSHC}/vitals/{extra['uuid']}?reason={reason}", method="DELETE",
                         statuses=(200,))
        self.assertTrue(voided["voided"])
        self.assertEqual(self.call("reception", f"{VINSHC}/vitals?patient={self.state['patient']}")[0], 403)
        doctor_view = self.get("doctor", f"{VINSHC}/vitals?patient={self.state['patient']}")
        self.assertEqual([g["uuid"] for g in doctor_view["results"]], [corrected["uuid"]])
        type(self).state.update(vitalsEncounter=first["uuid"], vitalsGroup=corrected["uuid"])
        self.record("vitals encounter reuse, own provider, list/correct/void with reason and role checks",
                    group=corrected["uuid"])

    def test_05_doctor_consults_prescribes_and_orders(self):
        visit, patient = self.state["visit"], self.state["patient"]
        encounter = self.ok("doctor", f"{VINSHC}/visits/{visit}/encounters", {"encounterType": "consultation"},
                            statuses=(201,))["uuid"]
        self.ok("doctor", f"{VINSHC}/consultation", {"patient": patient, "encounter": encounter, "values": {
            "visit.ly_do_kham": "Đau đầu", "allergy.trang_thai": "no_known_allergy"}}, statuses=(201,))
        self.ok("doctor", f"{VINSHC}/diagnosis", {"patient": patient, "encounter": encounter,
                                                   "concept": self.catalogue["diagnoses"]["a"],
                                                   "rank": "primary", "certainty": "confirmed"}, statuses=(201,))
        order = self.ok("doctor", f"{VINSHC}/drug-order", {
            "patient": patient, "encounter": encounter, "orderer": self.providers["doctor"],
            "drug": self.catalogue["drugs"]["a"], "dose": 1, "doseUnits": self.catalogue["doseUnit"],
            "route": self.catalogue["route"], "frequency": self.catalogue["frequency"], "duration": 5,
            "durationUnits": self.catalogue["days"], "quantity": 10,
            "quantityUnits": self.catalogue["quantityUnit"], "numRefills": 0}, statuses=(201,))
        summary = self.get("doctor", f"{VINSHC}/encounter/{encounter}/clinical-summary")
        self.assertEqual([g["uuid"] for g in summary["vitals"]], [self.state["vitalsGroup"]])
        service_order = self.ok("doctor", f"{OPS}/service-orders", {
            "patient": patient, "encounter": encounter, "orderer": self.providers["doctor"],
            "facility": self.facility["uuid"], "service": self.services["LAB-GLU"]["uuid"],
            "config": "STANDARD_POSTPAY", "idempotencyKey": key("order")}, statuses=(201,))
        self.ok("doctor", f"{VINSHC}/encounter/{encounter}/finalize", {})
        type(self).state.update(encounter=encounter, drugOrder=order["uuid"], serviceOrder=service_order["uuid"])
        self.record("doctor encounter, consultation, diagnosis, prescription, order; summary carries vitals",
                    drugOrder=order["uuid"])

    def test_06_lab_worklist_pool_and_assignment(self):
        order = self.state["serviceOrder"]
        pool = self.get("lab", f"{OPS}/service-orders?state=requested")
        self.assertIn(order, [o["uuid"] for o in pool["results"]])
        row = next(o for o in pool["results"] if o["uuid"] == order)
        self.assertTrue(row["patientName"])
        self.ok("lab", f"{OPS}/service-orders/{order}/transition",
                {"state": "assigned", "assignedProvider": self.providers["lab"]})
        mine = self.get("lab", f"{OPS}/service-orders")
        assigned = next(o for o in mine["results"] if o["uuid"] == order)
        self.assertEqual(assigned["state"], "assigned")
        self.assertEqual(assigned["assignedProviderUuid"], self.providers["lab"])
        self.assertEqual(self.call("cashier", f"{OPS}/service-orders")[0], 403)
        self.record("lab sees requested pool and own assignments with patient label", order=order)

    def test_07_cashier_lists_bills_and_payments(self):
        bill = self.ok("cashier", f"{OPS}/bills", {
            "patient": self.state["patient"], "visit": self.state["visit"], "facility": self.facility["uuid"],
            "paymentTiming": "postpay", "idempotencyKey": key("bill"),
            "lines": [{"service": self.services["CONSULT-TEST"]["uuid"], "quantity": 1}]}, statuses=(201,))
        open_bills = self.get("cashier", f"{OPS}/bills?status=open")
        self.assertIn(bill["uuid"], [b["uuid"] for b in open_bills["results"]])
        pending = self.ok("cashier", f"{OPS}/bills/{bill['uuid']}/receipts", {
            "amountVnd": bill["totalVnd"], "method": "bank_transfer", "status": "pending",
            "idempotencyKey": key("pending")}, statuses=(201,))
        transfers = self.get("cashier", f"{OPS}/payments?status=pending")
        self.assertIn(pending["uuid"], [p["uuid"] for p in transfers["results"]])
        self.ok("cashier", f"{OPS}/payments/{pending['uuid']}/settle", {})
        paid = self.get("cashier", f"{OPS}/bills?visit={self.state['visit']}")["results"][0]
        self.assertEqual(paid["status"], "paid")
        self.assertEqual(paid["patientIdentifier"], self.state["identifier"])
        self.record("cashier worklists: open bills, pending transfers, bills of a visit", bill=bill["uuid"])

    def test_08_reception_queue_and_appointment_lists(self):
        ticket = self.ok("reception", f"{OPS}/queue", {
            "patient": self.state["patient"], "visit": self.state["visit"], "config": "STANDARD_POSTPAY",
            "point": "PHARMACY", "idempotencyKey": key("queue")}, statuses=(201,))
        board = self.get("reception", f"{OPS}/queue?point=PHARMACY")
        row = next(t for t in board["results"] if t["uuid"] == ticket["uuid"])
        self.assertEqual(row["queueNumber"], ticket["queueNumber"])
        self.assertTrue(row["pointName"])
        today = datetime.now(CLINIC).date().isoformat()
        appointments = self.get("reception", f"{OPS}/appointments?date={today}")
        self.assertIsInstance(appointments["results"], list)
        self.assertEqual(self.call("pharmacy", f"{OPS}/queue")[0], 403)
        type(self).state["ticket"] = ticket["uuid"]
        self.record("queue board per point and appointment day list", ticket=ticket["uuid"])

    def test_09_pharmacy_dispenses_within_prescribed_quantity(self):
        order = self.state["drugOrder"]
        pending = self.get("pharmacy", f"{VINSHC}/pharmacy/prescriptions?patient={self.state['patient']}")
        self.assertEqual([p["uuid"] for p in pending["results"]], [order])
        self.assertTrue(pending["results"][0]["consultationFinalized"])
        first = {"order": order, "quantity": 4, "batchNumber": "LOT-B11", "expiryDate": "2099-12-31",
                 "idempotencyKey": key("dispense")}
        partial = self.ok("pharmacy", f"{VINSHC}/pharmacy/dispenses", first, statuses=(201,))
        self.assertEqual(partial["prescription"]["dispenseStatus"], "partial")
        replay = self.ok("pharmacy", f"{VINSHC}/pharmacy/dispenses", first, statuses=(201,))
        self.assertEqual(replay["uuid"], partial["uuid"])
        status, over = self.call("pharmacy", f"{VINSHC}/pharmacy/dispenses", method="POST", payload={
            "order": order, "quantity": 7, "idempotencyKey": key("over")})
        self.assertEqual(status, 409, over)
        status, expired = self.call("pharmacy", f"{VINSHC}/pharmacy/dispenses", method="POST", payload={
            "order": order, "quantity": 1, "expiryDate": "2000-01-01", "idempotencyKey": key("expired")})
        self.assertEqual(status, 400, expired)
        rest = self.ok("pharmacy", f"{VINSHC}/pharmacy/dispenses", {
            "order": order, "quantity": 6, "idempotencyKey": key("rest")}, statuses=(201,))
        self.assertEqual(rest["prescription"]["dispenseStatus"], "complete")
        detail = self.get("pharmacy", f"{VINSHC}/pharmacy/prescriptions/{order}")
        self.assertEqual(len(detail["dispenses"]), 2)
        after = self.get("pharmacy", f"{VINSHC}/pharmacy/prescriptions?patient={self.state['patient']}")
        self.assertEqual(after["results"], [])
        printed = self.get("pharmacy", f"{OPS}/documents/prescription/{order}")
        self.assertEqual(printed["templateCode"], "prescription")
        self.assertEqual(self.call("doctor", f"{VINSHC}/pharmacy/dispenses", method="POST", payload={
            "order": order, "quantity": 1, "idempotencyKey": key("doctor")})[0], 403)
        self.record("dispense partial/complete, idempotent replay, over-dispense 409, expired batch 400, "
                    "pharmacy prescription print", order=order)

    def test_10_visit_closure_rules(self):
        visit = self.state["visit"]
        status, blocked = self.call("reception", f"{VINSHC}/visits/{visit}/close", method="POST",
                                    payload={"closeReason": "completed"})
        self.assertEqual(status, 409, blocked)
        self.assertIn("service order", blocked["error"])
        status, missing_note = self.call("reception", f"{VINSHC}/visits/{visit}/close", method="POST",
                                         payload={"closeReason": "left_early"})
        self.assertEqual(status, 400, missing_note)
        closed = self.ok("reception", f"{VINSHC}/visits/{visit}/close",
                         {"closeReason": "left_early", "note": "B11 người bệnh xin về"})
        self.assertEqual(closed["status"], "closed")
        self.assertEqual(closed["closeReason"], "left_early")
        self.assertEqual(len(closed["warnings"]), 1)
        ticket = self.get("reception", f"{OPS}/queue/{self.state['ticket']}")
        self.assertEqual((ticket["state"], ticket["exitReason"]), ("left", "patient_requested"))
        status, _ = self.call("nurse", f"{VINSHC}/vitals", method="POST", payload={
            "patient": self.state["patient"], "encounter": self.state["vitalsEncounter"],
            "values": {"vitals.mach": 80}})
        self.assertEqual(status, 409)
        status, _ = self.call("nurse", f"{VINSHC}/visits/{visit}/encounters", method="POST",
                              payload={"encounterType": "vitals"})
        self.assertEqual(status, 409)
        status, _ = self.call("reception", f"{VINSHC}/visits/{visit}/close", method="POST",
                              payload={"closeReason": "left_early", "note": "again"})
        self.assertEqual(status, 409)
        history = self.get("reception", f"{VINSHC}/visits?status=closed&patient={self.state['patient']}")
        self.assertEqual(history["results"][0]["closeNote"], "B11 người bệnh xin về")
        self.record("completed needs finished orders/bills; reason+note closure; queue closed; closed visit "
                    "rejects writes", visit=visit)

    def test_11_cancelled_visit_blocks_dispensing(self):
        patient = self.ok("reception", f"{VINSHC}/patients", self.registration(
            middleName=letters(), identifiers=[], birthPrecision="unknown", birthYear=None),
            statuses=(201,))
        visit = self.ok("reception", f"{VINSHC}/visits", {"patient": patient["uuid"], "visitType": "followup"},
                        statuses=(201,))
        encounter = self.ok("doctor", f"{VINSHC}/visits/{visit['uuid']}/encounters",
                            {"encounterType": "consultation"}, statuses=(201,))["uuid"]
        order = self.ok("doctor", f"{VINSHC}/drug-order", {
            "patient": patient["uuid"], "encounter": encounter, "orderer": self.providers["doctor"],
            "drug": self.catalogue["drugs"]["b"], "dose": 1, "doseUnits": self.catalogue["doseUnit"],
            "route": self.catalogue["route"], "frequency": self.catalogue["frequency"], "duration": 3,
            "durationUnits": self.catalogue["days"], "quantity": 3,
            "quantityUnits": self.catalogue["quantityUnit"], "numRefills": 0}, statuses=(201,))
        self.assertEqual(self.call("doctor", f"{VINSHC}/visits/{visit['uuid']}/close", method="POST",
                                   payload={"closeReason": "cancelled", "note": "B11"})[0], 403)
        self.ok("reception", f"{VINSHC}/visits/{visit['uuid']}/close",
                {"closeReason": "cancelled", "note": "B11 tiếp nhận nhầm"})
        status, body = self.call("pharmacy", f"{VINSHC}/pharmacy/dispenses", method="POST", payload={
            "order": order["uuid"], "quantity": 1, "idempotencyKey": key("cancelled")})
        self.assertEqual(status, 409, body)
        self.assertIn("cancelled", body["error"])
        self.record("cancelled visit (reception only) blocks dispensing", visit=visit["uuid"])

    def test_12_manager_range_report_is_aggregate_only(self):
        today = datetime.now(CLINIC).date().isoformat()
        report = self.get("manager", f"{OPS}/reports/range?from={today}&to={today}&facility={self.facility['uuid']}")
        self.assertEqual(len(report["days"]), 1)
        self.assertGreaterEqual(report["totals"]["openedVisits"], 2)
        self.assertTrue(report["aggregateOnly"])
        status, _ = self.call("manager", f"{OPS}/reports/range?from=2026-01-01&to=2026-03-01"
                                         f"&facility={self.facility['uuid']}")
        self.assertEqual(status, 400)
        self.assertEqual(self.call("manager", f"{VINSHC}/visits")[0], 403)
        self.record("range report totals and 31-day cap; manager cannot list visits",
                    opened=report["totals"]["openedVisits"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
