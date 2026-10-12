"""Regression checks for contact identity, missing reasons, address versions and BP."""

import copy
import importlib.util
import json
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import metadata_b2_b3 as B

SPEC = importlib.util.spec_from_file_location("metadata_contract_test_tool", ROOT / "tools/metadata.py")
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class HandoffMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = TOOL.load_pack()
        cls.cases = B.read_json(ROOT, "metadata/vinshc/fixtures/b2-b3.json")["cases"]
        cls.catalogue = B.read_json(ROOT, cls.base["catalogues"]["address"])

    def setUp(self):
        self.pack = copy.deepcopy(self.base)

    def test_all_handoff_examples(self):
        errors, count = B.check_handoff_cases(self.pack, ROOT)
        self.assertEqual([], errors)
        self.assertEqual(47, count)

    def test_contacts_keep_distinct_rows_with_same_name_phone(self):
        rows = copy.deepcopy(next(c["input"] for c in self.cases if c["id"] == "two-emergency-one-primary"))
        self.assertEqual(rows[0]["fullName"], rows[1]["fullName"])
        self.assertEqual(rows[0]["phone"], rows[1]["phone"])
        self.assertNotEqual(rows[0]["rowKey"], rows[1]["rowKey"])
        self.assertEqual([], B.validate_contacts(rows, self.pack, ROOT))

    def test_void_row_does_not_count_as_primary_or_priority_collision(self):
        rows = copy.deepcopy(next(c["input"] for c in self.cases if c["id"] == "two-emergency-one-primary"))
        rows[1].update(status="void", voidReason="Synthetic replacement", isPrimary=True, priority=1)
        self.assertEqual([], B.validate_contacts(rows, self.pack, ROOT))

    def test_contact_missing_state_cannot_target_another_row(self):
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-phone-refused"))
        row["fieldStates"][0]["rowKey"] = "de47c8f2-903e-4be8-85c1-e899fc5a3eec"
        self.assertTrue(B.validate_contacts([row], self.pack, ROOT))

    def test_contact_cannot_inject_new_patient_or_untyped_properties(self):
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-complete"))
        row["createPatient"] = True
        self.assertTrue(B.validate_contacts([row], self.pack, ROOT))

    def test_malformed_contact_and_source_are_errors(self):
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-complete"))
        for prop in ["status", "source"]:
            malformed = copy.deepcopy(row)
            malformed[prop] = []
            self.assertTrue(B.validate_contacts([malformed], self.pack, ROOT))
        self.assertTrue(B.source_errors({"kind": [], "recordedAt": "no date"}))

    def test_raw_phone_is_preserved_and_bare_digits_not_inferred(self):
        raw = " (090) 123-4567 "
        self.assertEqual(raw, B.normalize_phone(raw)["raw"])
        self.assertEqual("+84901234567", B.normalize_phone(raw)["normalized"])
        for value in ["901234567", "0901234567 ext 2", "+" + "1" * 16, True, []]:
            self.assertEqual("needs_review", B.normalize_phone(value)["status"])

    def test_phone_contract_regex_and_raw_length_limits(self):
        contract = B.read_json(ROOT, self.pack["contracts"]["b2"])
        self.assertIsNotNone(re.fullmatch(contract["phone"]["vnSyntax"], "+84901234567"))
        self.assertIsNotNone(re.fullmatch(contract["phone"]["internationalSyntax"], "+12025550123"))
        self.assertIsNone(re.fullmatch(contract["phone"]["vnSyntax"], "0901234567"))
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-complete"))
        row.update(phone=" " * 60 + "0901234567", phoneNormalized=None, phoneNormalizationStatus="needs_review",
                   source={"kind": "legacy_import", "recordedAt": "2026-10-11T13:00:00+07:00", "sourceReference": "synthetic-only"})
        self.assertTrue(any("phone length/type" in e for e in B.validate_contacts([row], self.pack, ROOT)))

    def test_contact_row_uuid_requires_canonical_lowercase(self):
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-complete"))
        row["rowKey"] = row["rowKey"].upper()
        self.assertTrue(any("rowKey invalid" in e for e in B.validate_contacts([row], self.pack, ROOT)))

    def test_missing_state_policy_covers_every_b2_field(self):
        fields = [f for f in self.pack["fields"] if f["code"].split(".")[0] in {"patient", "contact"}]
        self.assertEqual(37, len(fields))
        self.assertTrue(all("b2Missing" in f for f in fields))

    def test_required_identity_and_derived_fields_disallow_missing_reasons(self):
        for code in ["patient.ho_ten", "patient.ma_noi_bo", "patient.dien_thoai_chuan_hoa"]:
            self.assertTrue(TOOL.validate_values({code: {"state": "unknown"}}, self.pack))

    def test_recorded_value_cannot_have_sidecar_reason(self):
        value = next(c["input"] for c in self.cases if c["id"] == "value-and-reason")
        self.assertTrue(B.validate_field_states(value["values"], value["states"], self.pack))

    def test_missing_source_state_requires_document_evidence(self):
        state = {"fieldCode": "patient.dien_thoai", "rowKey": None, "context": "patient",
                 "dataStatus": "masked", "source": {"kind": "paper", "recordedAt": "2026-10-11T13:00:00+07:00", "documentUuid": "de47c8f2-903e-4be8-85c1-e899fc5a3eec", "page": 1}, "recordedAt": "2026-10-11T13:00:00+07:00"}
        self.assertEqual([], B.validate_field_states({"patient.dien_thoai": None}, [state], self.pack))
        state["source"].pop("page")
        self.assertTrue(B.validate_field_states({"patient.dien_thoai": None}, [state], self.pack))

    def test_identifier_systems_are_stable_project_namespaces(self):
        refs = {e["key"]: e for e in self.pack["entities"]}
        for key, value in self.pack["identifierSystems"].items():
            self.assertEqual("urn:uuid:" + refs[key]["uuid"], value["system"])
            self.assertNotIn("localhost", value["system"])

    def test_official_catalogue_counts_parents_and_leading_zero(self):
        self.assertEqual([], B.validate_address_catalogue(self.catalogue))
        by_code = {r["code"]: r for r in self.catalogue["records"]}
        self.assertEqual("Thành phố Hà Nội", by_code["01"]["name"])
        self.assertEqual("Phường Bạch Mai", by_code["00292"]["name"])
        self.assertEqual("01", by_code["00292"]["parentCode"])
        self.assertEqual([], by_code["00292"]["legacyMappings"])

    def test_catalogue_corruption_and_reparenting_are_rejected(self):
        for change in ["duplicate", "parent", "version"]:
            catalogue = copy.deepcopy(self.catalogue)
            commune = next(r for r in catalogue["records"] if r["level"] == "commune")
            if change == "duplicate":
                catalogue["records"].append(copy.deepcopy(commune))
            elif change == "parent":
                commune["parentCode"] = "79"
            else:
                commune["version"] = "unversioned"
            self.assertTrue(B.validate_address_catalogue(catalogue))

    def test_address_effective_end_is_exclusive(self):
        catalogue = copy.deepcopy(self.catalogue)
        row = next(r for r in catalogue["records"] if r["code"] == "00292")
        row["effectiveTo"] = "2026-10-11"
        selection = {"provinceCode": "01", "communeCode": "00292", "catalogueVersion": catalogue["version"], "addressAsOfDate": "2026-10-11"}
        self.assertTrue(B.validate_address_selection(selection, catalogue))
        selection["addressAsOfDate"] = "2026-10-10"
        self.assertEqual([], B.validate_address_selection(selection, catalogue))

    def test_bp_does_not_combine_different_patients_or_times(self):
        for case in self.cases:
            if case["id"] in {"mixed-time", "mixed-patient"}:
                self.assertTrue(B.validate_bp_measurement(case["input"])[0])

    def test_bp_partial_and_comparison_are_not_fabricated(self):
        partial = next(c["input"] for c in self.cases if c["id"] == "bp-one-component-with-reason")
        errors, warnings = B.validate_bp_measurement(partial)
        self.assertEqual(([], []), (errors, warnings))
        comparison = copy.deepcopy(next(c["input"] for c in self.cases if c["id"] == "comparison-is-warning-not-rejection"))
        original = copy.deepcopy(comparison)
        errors, warnings = B.validate_bp_measurement(comparison)
        self.assertEqual([], errors)
        self.assertTrue(warnings)
        self.assertEqual(original, comparison)

    def test_bp_rejects_boolean_non_finite_and_invalid_cells(self):
        original = next(c["input"] for c in self.cases if c["id"] == "bp-complete")
        for value in [True, "120", float("nan"), float("inf"), 10 ** 1000]:
            bp = copy.deepcopy(original)
            bp["components"][0]["value"] = value
            self.assertTrue(B.validate_bp_measurement(bp)[0])

    def test_terminology_approval_gate_and_spo2_confirmation(self):
        contract = B.read_json(ROOT, self.pack["contracts"]["b3"])
        self.assertEqual("pulse_oximetry", contract["spo2"]["method"])
        self.assertEqual("confirmed_by_project_user", contract["spo2"]["methodConfirmation"]["status"])
        self.assertTrue(all(not m["enabledForImport"] and m["approval"]["approvedBy"] is None for m in contract["terminology"]["mappings"]))

    def test_enabled_terminology_requires_approval_and_method_evidence(self):
        original_read = B.read_json
        b3_path = self.pack["contracts"]["b3"]
        for mode in ["no_approval", "no_method"]:
            contract = original_read(ROOT, b3_path)
            mapping = contract["terminology"]["mappings"][0]
            mapping["enabledForImport"] = True
            if mode == "no_method":
                mapping["approval"] = {"status": "approved", "approvedBy": "Synthetic reviewer for negative test", "approvedAt": "2026-10-11T13:00:00+07:00", "evidenceReference": "synthetic-only"}
            def read(root, relative):
                return contract if relative == b3_path else original_read(root, relative)
            with patch.object(B, "read_json", side_effect=read):
                errors = B.check_contracts(self.pack, ROOT)
            self.assertTrue(any("without clinical approval" in e if mode == "no_approval" else "without method confirmation" in e for e in errors))

    def test_unknown_contact_relationship_is_not_other(self):
        row = copy.deepcopy(next(c["input"][0] for c in self.cases if c["id"] == "contact-phone-refused"))
        row.update(relationshipCode=None, relationshipName=None, relationshipVersion=None)
        state = copy.deepcopy(row["fieldStates"][0])
        state.update(fieldCode="contact.quan_he", dataStatus="unknown")
        row["fieldStates"].append(state)
        self.assertEqual([], B.validate_contacts([row], self.pack, ROOT))

    def test_compact_address_date_and_label_corruption_are_rejected(self):
        selection = {"provinceCode": "01", "communeCode": "00292", "catalogueVersion": self.catalogue["version"], "addressAsOfDate": "20250701"}
        self.assertTrue(B.validate_address_selection(selection, self.catalogue))
        catalogue = copy.deepcopy(self.catalogue)
        catalogue["records"][0]["name"] = "Wrong official label"
        self.assertTrue(B.validate_address_catalogue(catalogue))

    def test_controlled_update_preserves_all_entity_semantics_except_label_note(self):
        recipe = B.read_json(ROOT, "metadata/vinshc/fixtures/update-label.json")
        updated = B.prepare_update_pack(self.pack, recipe)
        self.assertEqual(recipe["toVersion"], updated["version"])
        for before, after in zip(self.pack["entities"], updated["entities"]):
            self.assertEqual(before["uuid"], after["uuid"])
            expected = copy.deepcopy(before)
            if before["key"] == recipe["entityKey"]:
                expected.update(label=recipe["afterLabel"], note=recipe["afterNote"])
            self.assertEqual(expected, after)
        self.assertEqual(self.pack["fields"], updated["fields"])
        self.assertEqual(self.pack["codeLists"], updated["codeLists"])

    def test_update_refuses_changed_base_pack(self):
        recipe = B.read_json(ROOT, "metadata/vinshc/fixtures/update-label.json")
        self.pack["entities"][0]["label"] = "Unreviewed change"
        with self.assertRaises(ValueError):
            B.prepare_update_pack(self.pack, recipe)


if __name__ == "__main__":
    unittest.main()
