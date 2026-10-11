"""B4 clinical contract: validated consultation, allergy, diagnosis, drug order and finalization.

Runs against the local Docker instance with synthetic catalogues from b4_catalogue.py. Each run uses a
fresh synthetic patient so allergy/order state never leaks between runs; the previous run's encounter is
re-read first to prove persistence across restarts.
"""

from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import unittest
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from api_client import Client
from common import read_settings
import b4_catalogue

REST = "/openmrs/ws/rest/v1"
VINSHC = REST + "/vinshc"
IDGEN_SOURCE_UUID = "3bfdfcf4-987a-521d-8e5d-7d60e782b6fa"
EXPECTED_CHECKS = 9


class B4ClinicalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.client = Client(
            f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"],
        )
        cls.entities = json.loads(
            (ROOT / "metadata/vinshc/frontend-map.json").read_text(encoding="utf-8")
        )["entities"]
        try:
            cls.catalogue = b4_catalogue.ensure(cls.client)
        except b4_catalogue.RealCatalogueConfigured as error:
            raise unittest.SkipTest(f"Real catalogue configured; synthetic B4 suite skipped: {error}")
        cls.fixture_path = ROOT / ".runtime/fixtures/b4b-clinical.json"
        cls.previous = (json.loads(cls.fixture_path.read_text(encoding="utf-8"))
                        if cls.fixture_path.is_file() else None)
        cls.ctx = cls._create_context()
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "catalogue": "synthetic (b4_catalogue.py); not ICD-10, not a facility formulary",
            "globalPropertiesWritten": cls.catalogue["globalPropertiesWritten"],
            "run": cls.ctx,
            "checks": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == EXPECTED_CHECKS
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        target = ROOT / ".runtime/reports/b4b-clinical.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
        if cls.evidence["passed"]:
            cls.fixture_path.parent.mkdir(parents=True, exist_ok=True)
            cls.fixture_path.write_text(json.dumps(cls.ctx, ensure_ascii=False, indent=2) + "\n",
                                        encoding="utf-8")

    @classmethod
    def _create_context(cls):
        internal = cls.client.json(
            f"{REST}/idgen/identifiersource/{IDGEN_SOURCE_UUID}/identifier", method="POST",
            statuses=(201,), payload={"comment": "B4B clinical fixture"},
        )["identifier"]
        patient = cls.client.json(f"{REST}/patient", method="POST", statuses=(201,), payload={
            "person": {"names": [{"givenName": "Synthetic", "familyName": "B4B Lâm sàng"}],
                       "gender": "M", "birthdate": "1980-04-05"},
            "identifiers": [{"identifier": internal,
                             "identifierType": cls.entities["identifier.internal"],
                             "location": cls.entities["location.development.clinic"],
                             "preferred": True}],
        })
        providers = []
        for label in ("Clinician", "Other clinician"):
            person = cls.client.json(f"{REST}/person", method="POST", statuses=(200, 201), payload={
                "names": [{"givenName": "Synthetic B4B", "familyName": label}], "gender": "U"})
            providers.append(cls.client.json(f"{REST}/provider", method="POST", statuses=(200, 201),
                                             payload={"person": person["uuid"],
                                                      "identifier": "B4B-" + uuid.uuid4().hex[:10].upper()}))
        at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(seconds=5)
        location = cls.entities["location.development.clinic"]
        visit = cls.client.json(f"{REST}/visit", method="POST", statuses=(200, 201), payload={
            "patient": patient["uuid"], "visitType": cls.entities["visit.outpatient"],
            "location": location, "startDatetime": at.isoformat()})
        encounters = {}
        for key, encounter_type, role in (
            ("consultation", "encounter.consultation", "encounter_role.clinician"),
            ("vitals", "encounter.vitals", "encounter_role.nurse"),
        ):
            encounters[key] = cls.client.json(f"{REST}/encounter", method="POST", statuses=(200, 201),
                                              payload={
                "patient": patient["uuid"], "visit": visit["uuid"],
                "encounterType": cls.entities[encounter_type], "location": location,
                "encounterDatetime": at.isoformat(),
                "encounterProviders": [{"provider": providers[0]["uuid"],
                                        "encounterRole": cls.entities[role]}],
            })["uuid"]
        return {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "patientUuid": patient["uuid"], "visitUuid": visit["uuid"],
            "encounterUuid": encounters["consultation"], "vitalsEncounterUuid": encounters["vitals"],
            "providerUuid": providers[0]["uuid"], "otherProviderUuid": providers[1]["uuid"],
            "encounterDate": at.date().isoformat(),
        }

    # ------------------------------------------------------------ helpers

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def call(self, path, *, method="GET", payload=None, client=None):
        status, headers, body = (client or self.client).request(path, method=method, payload=payload)
        self.assertIn("json", headers.get("Content-Type", "").lower(), f"{method} {path} -> {status}")
        return status, json.loads(body)

    def rejected(self, path, payload, fragment, *, method="POST", status=400):
        actual, body = self.call(path, method=method, payload=payload)
        self.assertEqual(actual, status, body)
        self.assertIn(fragment, body.get("error", ""))
        return body

    def consultation_payload(self, values, encounter=None):
        return {"patient": self.ctx["patientUuid"],
                "encounter": encounter or self.ctx["encounterUuid"], "values": values}

    def summary(self):
        return self.client.json(f"{VINSHC}/encounter/{self.ctx['encounterUuid']}/clinical-summary")

    def order_payload(self, drug, **overrides):
        payload = {
            "patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"],
            "orderer": self.ctx["providerUuid"], "drug": self.catalogue["drugs"][drug],
            "dose": 1, "doseUnits": self.catalogue["tablet"], "route": self.catalogue["route"],
            "frequency": self.catalogue["frequency"], "duration": 5,
            "durationUnits": self.catalogue["days"], "quantity": 10,
            "quantityUnits": self.catalogue["tablet"], "numRefills": 0,
            "dosingInstructions": "Uống sau ăn",
        }
        payload.update(overrides)
        return payload

    # ------------------------------------------------------------ tests

    def test_00_previous_run_persisted(self):
        if not self.previous:
            self.record("no previous B4B run to re-read (first run on this database)")
            return
        status, previous = self.call(
            f"{VINSHC}/encounter/{self.previous['encounterUuid']}/clinical-summary")
        self.assertEqual(status, 200, previous)
        self.assertEqual(previous["status"], "final")
        self.assertEqual(previous["patientUuid"], self.previous["patientUuid"])
        self.assertEqual(len(previous["diagnoses"]), 2)
        self.assertEqual({item["status"] for item in previous["drugOrders"]},
                         {"active", "discontinued"})
        self.record("previous finalized consultation re-read after restart",
                    encounterUuid=self.previous["encounterUuid"])

    def test_01_catalogue_readiness(self):
        status = self.client.json(f"{VINSHC}/clinical-configuration")
        self.assertTrue(status["diagnosis"]["ready"])
        for key, value in status["allergy"].items():
            if isinstance(value, dict):
                self.assertTrue(value["ready"], key)
        self.assertFalse(status["allergy"]["vinshc.allergy.allowNonCoded"])
        for key, value in status["drugOrder"].items():
            if isinstance(value, dict):
                self.assertTrue(value["ready"], key)
        self.assertGreaterEqual(status["drugOrder"]["orderFrequencies"], 1)
        self.record("catalogue readiness endpoint reports every B4 catalogue configured")

    def test_02_consultation_validation_and_create(self):
        path = f"{VINSHC}/consultation"
        self.rejected(path, self.consultation_payload({"history.tien_su_ban_than": "THA"}),
                      "requires history.tien_su_ban_than_trang_thai=present")
        self.rejected(path, self.consultation_payload(
            {"history.tien_su_gia_dinh_trang_thai": "present"}), "requires history.tien_su_gia_dinh")
        self.rejected(path, self.consultation_payload({"exam.tom_tat": "   "}), "must not be blank")
        self.rejected(path, self.consultation_payload({"exam.khong_ton_tai": "x"}),
                      "unknown consultation field")
        self.rejected(path, self.consultation_payload({"allergy.trang_thai": "none"}),
                      "invalid allergy.trang_thai")
        yesterday = (date.fromisoformat(self.ctx["encounterDate"]) - timedelta(days=1)).isoformat()
        self.rejected(path, self.consultation_payload({"followup.ngay_tai_kham": yesterday}),
                      "cannot be before the encounter date")
        self.rejected(path, self.consultation_payload(
            {"visit.ly_do_kham": "x"}, self.ctx["vitalsEncounterUuid"]), "not a VinSHC consultation")
        followup = (date.fromisoformat(self.ctx["encounterDate"]) + timedelta(days=7)).isoformat()
        values = {
            "visit.ly_do_kham": "Sốt và ho hai ngày",
            "history.benh_su": "Sốt 38.5 độ, ho khan",
            "history.tien_su_ban_than_trang_thai": "present",
            "history.tien_su_ban_than": "Hen phế quản thời thơ ấu",
            "history.tien_su_gia_dinh_trang_thai": "not_asked",
            "allergy.trang_thai": "unknown",
            "exam.tom_tat": "Viêm đường hô hấp trên",
            "followup.ngay_tai_kham": followup,
        }
        status, created = self.call(path, method="POST", payload=self.consultation_payload(values))
        self.assertEqual(status, 201, created)
        self.assertEqual(created["values"], values)
        self.assertEqual(created["encounterUuid"], self.ctx["encounterUuid"])
        type(self).ctx["consultationGroupUuid"] = created["groupUuid"]
        group = self.client.json(f"{REST}/obs/{created['groupUuid']}?v=full")
        self.assertEqual(group["concept"]["uuid"], self.entities["group.consultation"])
        self.assertEqual(len(group["groupMembers"]), len(values))
        self.rejected(path, self.consultation_payload({"exam.tom_tat": "lần hai"}),
                      "already has a consultation")
        self.record("consultation rejects incoherent/blank/unknown/out-of-order input and stores native Obs",
                    groupUuid=created["groupUuid"])

    def test_03_allergy_contract_and_screen_coherence(self):
        path = f"{VINSHC}/allergy"
        base = {"patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"]}
        self.rejected(path, {**base, "allergenType": "DRUG", "allergen": {"nonCoded": "Thuốc lạ"}},
                      "non-coded allergy text is not permitted")
        self.rejected(path, {**base, "allergenType": "DRUG",
                             "allergen": {"concept": self.catalogue["food"]}},
                      "allergen.concept is not in the configured catalogue")
        self.rejected(path, {**base, "allergenType": "DRUG",
                             "allergen": {"concept": self.catalogue["drugConcepts"]["a"]},
                             "reactions": [{"concept": self.catalogue["severity"]}]},
                      "reaction is not in the configured catalogue")
        payload = {**base, "allergenType": "DRUG",
                   "allergen": {"concept": self.catalogue["drugConcepts"]["a"]},
                   "severity": self.catalogue["severity"],
                   "reactions": [{"concept": self.catalogue["reaction"]}],
                   "comment": "Nổi mẩn sau uống thuốc năm 2020"}
        status, allergy = self.call(path, method="POST", payload=payload)
        self.assertEqual(status, 201, allergy)
        self.assertEqual(allergy["allergen"]["concept"]["uuid"], self.catalogue["drugConcepts"]["a"])
        self.assertEqual(allergy["reactions"][0]["concept"]["uuid"], self.catalogue["reaction"])
        type(self).ctx["allergyUuid"] = allergy["uuid"]
        self.rejected(path, payload, "already has an active allergy")

        group = self.ctx["consultationGroupUuid"]
        self.rejected(f"{VINSHC}/consultation/{group}",
                      {"values": {"allergy.trang_thai": "no_known_allergy"}},
                      "contradicts active allergies")
        before = self.client.json(f"{VINSHC}/consultation/{group}", method="POST",
                                  payload={"values": {"allergy.trang_thai": "present"}})
        self.assertEqual(before["values"]["allergy.trang_thai"], "present")
        native = self.client.json(f"{REST}/patient/{self.ctx['patientUuid']}/allergy?v=full")
        self.assertIn(allergy["uuid"], {item["uuid"] for item in native["results"]})
        fhir = self.client.json(
            f"/openmrs/ws/fhir2/R4/AllergyIntolerance?patient={self.ctx['patientUuid']}")
        fhir_ids = {entry["resource"]["id"] for entry in fhir.get("entry", [])}
        self.assertIn(allergy["uuid"], fhir_ids)
        self.record("coded allergy only from catalogue, no_known_allergy contradiction blocked, "
                    "native REST and FHIR AllergyIntolerance read back", allergyUuid=allergy["uuid"])

    def test_04_diagnosis_contract(self):
        path = f"{VINSHC}/diagnosis"
        base = {"patient": self.ctx["patientUuid"], "encounter": self.ctx["encounterUuid"]}
        dx = self.catalogue["diagnoses"]
        self.rejected(path, {**base, "nonCoded": "Viêm họng", "rank": "primary",
                             "certainty": "confirmed"}, "free-text diagnosis is not accepted")
        self.rejected(path, {**base, "concept": dx["unmapped"], "rank": "primary",
                             "certainty": "confirmed"}, "no SAME-AS mapping")
        self.rejected(path, {**base, "concept": dx["a"], "rank": "main", "certainty": "confirmed"},
                      "rank must be primary or secondary")
        status, primary = self.call(path, method="POST", payload={
            **base, "concept": dx["a"], "rank": "primary", "certainty": "confirmed"})
        self.assertEqual(status, 201, primary)
        self.assertEqual(primary["code"], "SYN-001")
        self.assertEqual(primary["system"]["version"], b4_catalogue.SYNTHETIC_VERSION)
        self.rejected(path, {**base, "concept": dx["b"], "rank": "primary",
                             "certainty": "confirmed"}, "already has a primary diagnosis")
        self.rejected(path, {**base, "concept": dx["a"], "rank": "secondary",
                             "certainty": "provisional"}, "already has this diagnosis")
        status, secondary = self.call(path, method="POST", payload={
            **base, "concept": dx["b"], "rank": "secondary", "certainty": "provisional"})
        self.assertEqual(status, 201, secondary)
        self.rejected(f"{path}/{secondary['uuid']}", {"certainty": "confirmed"},
                      "replacement requires reason")
        replaced = self.client.json(f"{path}/{secondary['uuid']}", method="POST", payload={
            "certainty": "confirmed", "reason": "Có kết quả xét nghiệm xác nhận"})
        self.assertNotEqual(replaced["uuid"], secondary["uuid"])
        self.assertEqual(replaced["certainty"], "confirmed")
        active = {item["uuid"] for item in self.summary()["diagnoses"]}
        self.assertEqual(active, {primary["uuid"], replaced["uuid"]})
        # FHIR2 4.2.0 exposes active encounter diagnoses as Condition (category encounter-diagnosis);
        # superseded diagnoses disappear. Server-side category filtering returns nothing, so filter here.
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Condition?patient={self.ctx['patientUuid']}")
        conditions = {entry["resource"]["id"]: entry["resource"] for entry in fhir.get("entry", [])}
        self.assertEqual(set(conditions), active)
        for resource in conditions.values():
            codes = {coding.get("code") for category in resource.get("category", [])
                     for coding in category.get("coding", [])}
            self.assertIn("encounter-diagnosis", codes)
        type(self).ctx["primaryDiagnosisUuid"] = primary["uuid"]
        self.record("diagnosis accepts only mapped catalogue concepts, one primary, append-only replace",
                    primaryUuid=primary["uuid"], replacedUuid=replaced["uuid"],
                    supersededUuid=secondary["uuid"])

    def test_05_drug_order_contract(self):
        path = f"{VINSHC}/drug-order"
        self.rejected(path, self.order_payload("b", orderer=self.ctx["otherProviderUuid"]),
                      "orderer must be the clinician")
        self.rejected(path, self.order_payload("b", dose=0), "dose must be a finite number > 0")
        self.rejected(path, self.order_payload("b", route=self.catalogue["routeNotInSet"]),
                      "route is not in the configured catalogue")
        self.rejected(path, self.order_payload("b", duration=None), "durationUnits requires duration")
        self.rejected(path, self.order_payload("b", allergyOverrideReason="không cần"),
                      "only accepted when the drug matches an active allergy")
        self.rejected(path, self.order_payload("a"), "matches active allergy")
        status, order_b = self.call(path, method="POST", payload=self.order_payload("b"))
        self.assertEqual(status, 201, order_b)
        self.assertEqual(order_b["status"], "active")
        self.assertEqual(order_b["frequency"]["uuid"], self.catalogue["frequency"])
        self.assertTrue(order_b["autoExpireDate"], "duration with SNOMED day unit sets autoExpireDate")
        self.rejected(path, self.order_payload("b"), "already has an active order for this drug")
        status, order_a = self.call(path, method="POST", payload=self.order_payload(
            "a", allergyOverrideReason="Đã hỏi lại: phản ứng nhẹ, lợi ích vượt nguy cơ"))
        self.assertEqual(status, 201, order_a)
        self.rejected(f"{path}/{order_b['uuid']}/discontinue",
                      {"orderer": self.ctx["providerUuid"]}, "reason is required")
        stopped = self.client.json(f"{path}/{order_b['uuid']}/discontinue", method="POST", payload={
            "orderer": self.ctx["providerUuid"], "reason": "Hết triệu chứng"})
        self.assertEqual(stopped["status"], "discontinued")
        native = self.client.json(f"{REST}/order/{order_a['uuid']}?v=full")
        self.assertEqual(native["drug"]["uuid"], self.catalogue["drugs"]["a"])
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/MedicationRequest/{order_a['uuid']}")
        self.assertEqual(fhir["subject"]["reference"], "Patient/" + self.ctx["patientUuid"])
        events = {item["type"] for item in self.summary()["events"]}
        self.assertIn("drug_order_allergy_override", events)
        self.record("drug order validates orderer/catalogue/units/allergy, duplicates and discontinue; "
                    "native REST and FHIR MedicationRequest read back",
                    activeOrder=order_a["uuid"], discontinuedOrder=order_b["uuid"],
                    fhirMedicationRequestStatus=fhir.get("status"))

    def test_06_finalize_and_post_final_corrections(self):
        encounter = self.ctx["encounterUuid"]
        status = self.summary()
        self.assertEqual(status["status"], "draft")
        final = self.client.json(f"{VINSHC}/encounter/{encounter}/finalize", method="POST")
        self.assertEqual(final["status"], "final")
        self.assertEqual(final["finalization"]["type"], "consultation_finalized")
        self.rejected(f"{VINSHC}/encounter/{encounter}/finalize", None, "already finalized")
        group = self.ctx["consultationGroupUuid"]
        self.rejected(f"{VINSHC}/consultation/{group}", {"values": {"exam.loi_dan": "Nghỉ ngơi"}},
                      "require reason")
        self.rejected(f"{VINSHC}/consultation/{group}",
                      {"values": {"visit.ly_do_kham": None}, "reason": "xóa"},
                      "finalization requires visit.ly_do_kham")
        corrected = self.client.json(f"{VINSHC}/consultation/{group}", method="POST", payload={
            "values": {"exam.loi_dan": "Nghỉ ngơi, uống nhiều nước"},
            "reason": "Bổ sung lời dặn sau khi chốt"})
        self.assertEqual(corrected["values"]["exam.loi_dan"], "Nghỉ ngơi, uống nhiều nước")
        reason = urllib.parse.quote("thử xóa chẩn đoán chính")
        self.rejected(f"{VINSHC}/diagnosis/{self.ctx['primaryDiagnosisUuid']}?reason={reason}", None,
                      "must keep its primary diagnosis", method="DELETE")
        summary = self.summary()
        self.assertEqual(summary["status"], "final")
        self.assertEqual(len(summary["diagnoses"]), 2)
        self.assertEqual(len(summary["allergies"]["allergies"]), 1)
        self.assertEqual(len(summary["drugOrders"]), 2)
        corrections = [item for item in summary["events"] if item["type"] == "consultation_corrected"]
        self.assertEqual(corrections[-1]["reason"], "Bổ sung lời dặn sau khi chốt")
        self.record("finalize requires completeness, is single-shot, and later corrections need reason",
                    eventTypes=sorted({item["type"] for item in summary["events"]}))

    def test_07_finalize_preconditions(self):
        # A second consultation encounter in the same visit, without a primary diagnosis.
        encounter = self.client.json(f"{REST}/encounter", method="POST", statuses=(200, 201), payload={
            "patient": self.ctx["patientUuid"], "visit": self.ctx["visitUuid"],
            "encounterType": self.entities["encounter.consultation"],
            "location": self.entities["location.development.clinic"],
            "encounterDatetime": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "encounterProviders": [{"provider": self.ctx["providerUuid"],
                                    "encounterRole": self.entities["encounter_role.clinician"]}]})
        path = f"{VINSHC}/encounter/{encounter['uuid']}/finalize"
        self.rejected(path, None, "no consultation to finalize")
        self.client.json(f"{VINSHC}/consultation", method="POST", statuses=(201,),
                         payload=self.consultation_payload({"exam.tom_tat": "Khám lại"},
                                                           encounter["uuid"]))
        self.rejected(path, None, "requires visit.ly_do_kham")
        self.record("finalization blocked without consultation or required fields")

    def test_08_privileges_enforced(self):
        person = self.client.json(f"{REST}/person", method="POST", statuses=(200, 201), payload={
            "names": [{"givenName": "Restricted", "familyName": "B4B"}], "gender": "U"})
        username = "b4b-restricted-" + uuid.uuid4().hex[:12]
        password = "B4b-local-" + uuid.uuid4().hex
        user = self.client.json(f"{REST}/user", method="POST", statuses=(200, 201), payload={
            "username": username, "password": password, "person": person["uuid"], "roles": []})
        restricted = Client(self.client.base_url, username, password)
        try:
            checks = (
                ("POST", f"{VINSHC}/consultation", self.consultation_payload({"exam.tom_tat": "x"})),
                ("POST", f"{VINSHC}/diagnosis", {"patient": self.ctx["patientUuid"]}),
                ("POST", f"{VINSHC}/allergy", {"patient": self.ctx["patientUuid"]}),
                ("POST", f"{VINSHC}/drug-order", {"patient": self.ctx["patientUuid"]}),
                ("POST", f"{VINSHC}/encounter/{self.ctx['encounterUuid']}/finalize", None),
                ("GET", f"{VINSHC}/encounter/{self.ctx['encounterUuid']}/clinical-summary", None),
            )
            for method, path, payload in checks:
                status, body = self.call(path, method=method, payload=payload, client=restricted)
                self.assertEqual(status, 403, f"{method} {path}: {body}")
        finally:
            self.client.request(f"{REST}/user/{user['uuid']}?reason=B4B%20test%20complete",
                                method="DELETE")
            self.client.request(f"{REST}/person/{person['uuid']}?reason=B4B%20test%20complete",
                                method="DELETE")
        self.record("every B4 endpoint returns 403 without its VinSHC privilege",
                    endpoints=len(checks))


if __name__ == "__main__":
    unittest.main()
