"""Contract regression tests. In-memory checks do not prove runtime enforcement."""
import copy
import csv
import io
import json
from pathlib import Path
import sys
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import metadata as M
import metadata_b4_b9 as B


class B4B9MetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = M.load_pack()
        cls.bundle = B.load_bundle(cls.pack, ROOT)
        cls.fixtures = B.read_json(ROOT, "metadata/vinshc/fixtures/b4-b9.json")["cases"]
        cls.cases = {c["id"]:c for c in cls.fixtures}
        cls.permissions = B.read_json(ROOT, "metadata/vinshc/permissions.json")

    def test_all_positive_and_negative_fixture_outcomes(self):
        errors, count = B.run_fixtures(self.pack, ROOT)
        self.assertEqual([], errors)
        self.assertEqual(len(self.fixtures), count)
        self.assertTrue(any(not c["valid"] for c in self.fixtures))

    def test_new_catalogues_are_not_in_live_initializer_configuration(self):
        new_ids = {e["uuid"] for e in self.pack["entities"] if e.get("importPolicy") == "isolated_test_manifest_only"}
        outputs = M.compile_outputs(self.pack)
        for path, content in outputs.items():
            if path.startswith("infra/backend/configuration/"):
                self.assertFalse(any(identity in content for identity in new_ids), path)

    def test_test_csv_dependency_references_and_immutable_role_names(self):
        outputs = B.compile_test_outputs(self.pack, ROOT)
        prefix = "metadata/vinshc/initializer-test/"
        concepts = {r["Uuid"] for r in csv.DictReader(io.StringIO(outputs[prefix + "concepts/vinshc/040-test-catalogues.csv"]))}
        concept_rows = list(csv.DictReader(io.StringIO(outputs[prefix + "concepts/vinshc/040-test-catalogues.csv"])))
        for locale in ("en", "vi"):
            self.assertEqual(len(concept_rows), len({r["Fully specified name:" + locale] for r in concept_rows}))
        for row in csv.DictReader(io.StringIO(outputs[prefix + "drugs/vinshc/medications.csv"])):
            self.assertIn(row["Concept Drug"], concepts)
            self.assertIn(row["Concept Dosage Form"], concepts)
        privileges = {r["Privilege name"] for r in csv.DictReader(io.StringIO(outputs[prefix + "privileges/vinshc/metadata.csv"]))}
        roles = list(csv.DictReader(io.StringIO(outputs[prefix + "roles/vinshc/metadata.csv"])))
        self.assertEqual(8, len(roles))
        for row in roles:
            self.assertEqual("", row["Inherited roles"])
            self.assertTrue(set(row["Privileges"].split(";")) <= privileges)
            self.assertTrue(row["Role name"].startswith("VinSHC App: "))

    def test_manifest_hashes_match_generated_bytes(self):
        outputs = B.compile_test_outputs(self.pack, ROOT)
        manifest = json.loads(outputs["metadata/vinshc/import-manifest.json"])
        import hashlib
        for path, digest in manifest["fileSha256"].items():
            self.assertEqual(digest, hashlib.sha256(outputs[path].encode()).hexdigest())
        self.assertFalse(manifest["autoInstalled"])
        self.assertFalse(manifest["clinicalMappingsImported"])

    def test_repeated_catalogue_import_and_label_update_preserve_identity(self):
        rows = self.bundle["medications"]["records"]
        first = B.simulate_catalogue_import(rows)
        second = B.simulate_catalogue_import(rows, first)
        self.assertEqual(first, second)
        updated = copy.deepcopy(rows)
        updated[0]["name"] += " (updated test label)"
        third = B.simulate_catalogue_import(updated, second)
        self.assertEqual(set(first), set(third))
        self.assertEqual(len(rows), len(third))
        self.assertEqual(rows[0]["code"], third[rows[0]["uuid"]]["code"])

    def test_import_rejects_uuid_reuse_and_stable_code_uuid_change(self):
        rows = self.bundle["medications"]["records"]
        existing = B.simulate_catalogue_import(rows)
        bad = copy.deepcopy(rows[0]); bad["uuid"] = str(uuid.uuid4())
        with self.assertRaises(ValueError):B.simulate_catalogue_import([bad], existing)
        bad = copy.deepcopy(rows[0]); bad["code"] = "repurposed"
        with self.assertRaises(ValueError):B.simulate_catalogue_import([bad], existing)

    def test_cashier_admin_manager_never_receive_clinical_cells(self):
        clinical = {"vitals","clinical_chart","diagnosis","allergy","prescription","diagnostic_order","diagnostic_result"}
        for row in self.permissions["matrix"]:
            if row["role"] in {"cashier","admin","manager"} and row["resource"] in clinical:
                self.assertFalse(any(row["actions"].values()))

    def test_missing_identity_does_not_equal_missing_assignment(self):
        request = self.cases["permission-null-assignment"]["input"]
        self.assertEqual(403, B.authorize(request, self.permissions))

    def test_privilege_requires_scope_projection_and_active_workspace(self):
        request = copy.deepcopy(self.cases["permission-allow-doctor"]["input"])
        self.assertEqual(200, B.authorize(request, self.permissions))
        for prop, value in (("facilityUuid", str(uuid.uuid4())), ("patientAssigned", False), ("projection", "administrative")):
            bad = copy.deepcopy(request); bad["context"][prop] = value
            self.assertEqual(403, B.authorize(bad, self.permissions))
        request["actor"]["activeRole"] = "unassigned-role"
        self.assertEqual(403, B.authorize(request, self.permissions))

    def test_partial_dispense_duplicate_and_oversupply_have_one_effect(self):
        ledger = B.TestLedger()
        event = self.cases["dispense-partial-full-replay"]["input"][0]
        self.assertEqual(200, ledger.apply(event))
        self.assertEqual(200, ledger.apply(event))
        bad = dict(event, idempotencyKey="new-key", quantity="7")
        self.assertEqual(400, ledger.apply(bad))
        changed_snapshot = dict(event, idempotencyKey="changed-snapshot", prescribedQuantity="20")
        self.assertEqual(409, ledger.apply(changed_snapshot))
        self.assertEqual(1, len(ledger.events))
        self.assertEqual(B.decimal_value("4"), next(iter(ledger.dispensed.values())))

    def test_refund_remainder_not_original_receipt_total(self):
        ledger = B.TestLedger()
        events = self.cases["refund-over-remaining"]["input"]
        self.assertEqual([200,200,400], [ledger.apply(e) for e in events])
        self.assertEqual(10000, sum(r["amountVnd"] for r in ledger.refunds.values()))

    def test_decimal_math_is_exact_and_money_rejects_bool_float(self):
        self.assertEqual(B.decimal_value("0.3"), B.decimal_value("0.1") + B.decimal_value("0.2"))
        self.assertEqual("3.0", B.rounded_quantity("2.6", "0.5"))
        for value in (True, 1.5, -1, float("nan"), 9007199254740992):self.assertFalse(B.money(value))
        for value in ("NaN", "Infinity", "-1", 0.5, True):
            with self.assertRaises(ValueError):B.decimal_value(value)

    def test_unanswered_screening_does_not_resolve_prior_allergy(self):
        previous = self.cases["allergy-revisit-not_asked"]["input"]["previous"]
        after, conflict = B.reconcile_screening("not_asked", previous)
        self.assertEqual(previous, after)
        self.assertFalse(conflict)
        after[0]["status"] = "resolved"
        self.assertEqual("active", previous[0]["status"])

    def test_icd_category_restrictions_are_preserved(self):
        rows = {r["code"]:r for r in self.bundle["icd10"]["records"]}
        self.assertFalse(rows["E11"]["selectable"])
        self.assertFalse(rows["M10.9"]["selectable"])
        self.assertTrue(rows["M10.90"]["selectable"])
        self.assertEqual("2019", rows["I10"]["terminologyVersion"])
        self.assertFalse(self.bundle["icd10"]["productionEnabled"])

    def test_provider_and_fhir_person_id_are_distinct(self):
        for provider in self.bundle["facilities"]["providers"]:
            self.assertNotEqual(provider["uuid"], provider["personUuid"])
            self.assertEqual(provider["personUuid"], provider["practitionerUuid"])
            self.assertTrue(provider["synthetic"])
            self.assertFalse(provider["licenceVerified"])

    def test_unsourced_reference_range_and_final_overwrite_rejected(self):
        bad = self.cases["result-invented-range"]["input"]
        self.assertTrue(B.validate_result(bad, self.bundle))
        self.assertTrue(B.validate_result(self.cases["result-corrected-same-uuid"]["input"], self.bundle))

    def test_slot_overlap_and_half_open_adjacent_intervals(self):
        self.assertEqual([], B.validate_slots(self.cases["appointment-adjacent-slots"]["input"]))
        self.assertTrue(B.validate_slots(self.cases["appointment-overlap"]["input"]))

    def test_test_upload_policy_is_not_production_approval(self):
        contract = B.read_json(ROOT, self.pack["contracts"]["b4b9"])
        value = self.cases["attachment-test-pdf"]["input"]
        self.assertEqual([], B.validate_attachment(value, contract))
        self.assertTrue(B.validate_attachment(value, contract, production=True))

    def test_prints_use_fake_identity_and_do_not_invent_reference_range(self):
        docs = B.read_json(ROOT, "metadata/vinshc/fixtures/print-examples.json")["documents"]
        printing = B.read_json(ROOT, self.pack["contracts"]["printing"])
        self.assertEqual(6, len(docs))
        for doc in docs:self.assertEqual([], B.validate_print(doc, printing), doc["templateCode"])
        result = next(d for d in docs if d["templateCode"] == "result")
        self.assertIsNone(result["lines"][0]["referenceRange"])
        self.assertIsNone(result["lines"][0]["method"])

    def test_report_refund_on_its_settled_day_and_facility(self):
        value = self.cases["report-local-boundary-refund-current-day"]["input"]
        self.assertEqual(self.cases["report-local-boundary-refund-current-day"]["expected"], B.daily_report(value["date"],value["facilityUuid"],value["receipts"],value["refunds"],value["visits"]))

    def test_corrupt_price_source_or_panel_reference_fails_pack(self):
        # Mutate the bundle without filesystem changes to exercise catalogue checks.
        from unittest.mock import patch
        for mutate in (lambda b:b["prices"]["records"][0].update(amountVnd=True),lambda b:b["diagnostics"]["panels"][0].update(members=["unknown"])):
            bundle=copy.deepcopy(self.bundle);mutate(bundle)
            with patch.object(B,"load_bundle",return_value=bundle):self.assertTrue(B.check_b4_b9(self.pack,ROOT))


if __name__ == "__main__":unittest.main()
