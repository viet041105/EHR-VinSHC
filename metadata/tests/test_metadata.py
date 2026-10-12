"""Metadata integrity and regression cases; no containers/patient data required."""

import copy
import csv
import importlib.util
import io
import json
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("metadata_tool", ROOT / "tools/metadata.py")
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def cell(value, **extra):
    return {"state": "recorded", "value": value, **extra}


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.pack = TOOL.load_pack()

    def test_pack_integrity(self):
        self.assertEqual([], TOOL.validate_pack(self.pack))

    def test_uuid_change_is_rejected(self):
        self.pack["entities"][1]["uuid"] = "8edfe4f2-200a-4416-9569-70912e2aeafe"
        self.assertTrue(TOOL.validate_pack(self.pack))

    def test_dangling_member_is_rejected(self):
        group = next(e for e in self.pack["entities"] if e["key"] == "group.vitals")
        group["members"].append("nonexistent.concept")
        self.assertTrue(TOOL.validate_pack(self.pack))

    def test_field_unit_divergence_is_rejected(self):
        f = next(f for f in self.pack["fields"] if f["code"] == "vitals.nhiet_do")
        f["unit"] = "F"
        self.assertTrue(TOOL.validate_pack(self.pack))

    def test_duplicate_field_is_rejected(self):
        self.pack["fields"].append(copy.deepcopy(self.pack["fields"][0]))
        self.assertTrue(TOOL.validate_pack(self.pack))

    def test_source_typo_is_rejected(self):
        self.pack["fields"][0]["sourceRows"] = ["K9999"]
        self.assertTrue(TOOL.validate_pack(self.pack))

    def test_generated_files_are_current(self):
        for path, expected in TOOL.compile_outputs(self.pack).items():
            self.assertEqual(expected, (ROOT / path).read_text(encoding="utf-8"), path)

    def test_csv_references_are_loaded_in_order(self):
        outputs = TOOL.compile_outputs(self.pack)
        known = set()
        for name in ["010-answers", "020-observations", "030-groups"]:
            path = "infra/backend/configuration/concepts/vinshc/" + name + ".csv"
            for row in csv.DictReader(io.StringIO(outputs[path])):
                for column in ["Answers", "Members"]:
                    for ref in filter(None, row[column].split(";")):
                        self.assertIn(ref, known, name)
                self.assertNotIn(row["Uuid"], known)
                known.add(row["Uuid"])

    def test_synthetic_positive_and_negative_cases(self):
        cases = json.loads((ROOT / "metadata/vinshc/fixtures/cases.json").read_text(encoding="utf-8"))["cases"]
        self.assertEqual(len(cases), len({c["id"] for c in cases}))
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertEqual(not bool(TOOL.validate_values(case["values"], self.pack)), case["valid"])

    def test_nan_infinity_and_boolean_are_not_numbers(self):
        for value in [math.nan, math.inf, -math.inf, True, 10 ** 1000]:
            self.assertTrue(TOOL.validate_values({"vitals.mach": cell(value)}, self.pack))

    def test_missing_states_remain_distinct(self):
        for state in ["unknown", "not_asked", "not_applicable", "masked", "unreadable", "refused", "not_recorded"]:
            self.assertEqual([], TOOL.validate_values({"vitals.nhiet_do": {"state": state}}, self.pack))
            self.assertTrue(TOOL.validate_values({"vitals.nhiet_do": {"state": state, "value": 0}}, self.pack))

    def test_full_birth_date_is_not_required_for_year_only_registration(self):
        values = {"patient.ma_noi_bo": cell("NB-GIA-000003"), "patient.ho_ten": cell("Người bệnh giả"), "patient.gioi_tinh": cell("U"),
                  "patient.do_chinh_xac_ngay_sinh": cell("year"), "patient.nam_sinh": cell(1990)}
        self.assertEqual([], TOOL.validate_operation("patient.create", values, self.pack))

    def test_registration_requires_identity_fields(self):
        self.assertTrue(TOOL.validate_operation("patient.create", {}, self.pack))

    def test_visit_type_must_reference_its_own_metadata_domain(self):
        wrong = next(e["uuid"] for e in self.pack["entities"] if e["key"] == "encounter.vitals")
        self.assertTrue(TOOL.validate_values({"visit.loai": cell(wrong)}, self.pack))

    def test_left_early_requires_note(self):
        values = {"visit.ket_thuc": cell("2026-10-10T10:00:00+07:00"), "visit.ly_do_ket_thuc": cell("left_early")}
        self.assertTrue(TOOL.validate_operation("visit.close", values, self.pack))
        values["visit.ghi_chu_ket_thuc"] = cell("Dữ liệu giả: người bệnh xin về")
        self.assertEqual([], TOOL.validate_operation("visit.close", values, self.pack))

    def test_labels_do_not_change_entity_uuids(self):
        original = {e["key"]: e["uuid"] for e in self.pack["entities"]}
        self.pack["entities"][1]["label"] = "VinSHC Test changed label"
        self.assertEqual([], TOOL.validate_pack(self.pack))
        self.assertEqual(original, {e["key"]: e["uuid"] for e in self.pack["entities"]})

    def test_malformed_state_and_coded_values_are_errors_not_crashes(self):
        for values in [[], {"vitals.mach": {"state": []}}, {"patient.do_chinh_xac_ngay_sinh": cell({"year": 1990})}, {"patient.do_chinh_xac_ngay_sinh": cell(["year"])}, {"patient.do_chinh_xac_ngay_sinh": ["year"]}]:
            self.assertTrue(TOOL.validate_values(values, self.pack))

    def test_non_object_required_cells_are_rejected(self):
        self.assertTrue(TOOL.validate_operation("patient.create", {"patient.ma_noi_bo": "NB-GIA-000001"}, self.pack))


if __name__ == "__main__":
    unittest.main()
