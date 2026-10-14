import pytest

from vinshc_agent import records
from vinshc_agent.facts import ContextMismatch, ToolError

from conftest import ENCOUNTER, PATIENT, load, summary_payload


def facts(rec, label):
    return [f for f in rec.output.facts if f.label == label]


def test_summary_keeps_units_times_and_missing_states(rec, catalog):
    records.clinical_summary(rec, summary_payload(), catalog, PATIENT, ENCOUNTER)
    [temperature] = facts(rec, "Nhiệt độ")
    assert temperature.value == "38.5 °C (đo lúc 08:50 13/10/2026)"
    assert temperature.source.uuid == "d2000000-0000-4000-8000-000000000001"
    [spo2] = facts(rec, "SpO2")
    assert spo2.state == "not_recorded" and spo2.value.startswith("Chưa ghi (nhóm đo lúc")
    [family] = facts(rec, "Trạng thái tiền sử gia đình")
    assert (family.state, family.value) == ("not_asked", "Chưa khai thác")
    reasons = {(g.label, g.reason) for g in rec.registry.missing()}
    assert ("Trạng thái tiền sử gia đình", "not_asked") in reasons


def test_summary_medication_status_and_notes(rec, catalog):
    records.clinical_summary(rec, summary_payload(), catalog, PATIENT, ENCOUNTER)
    meds = {f.label: f for f in rec.output.facts if f.section == "medications"}
    assert "trạng thái lúc đọc: đang hiệu lực" in meds["Paracetamol 500 mg"].value
    assert "trạng thái lúc đọc: đã ngừng" in meds["Ibuprofen 400 mg"].value
    assert any("thời điểm đọc" in n for n in rec.output.notes)
    assert any("1 thao tác sửa" in n for n in rec.output.notes)


def test_empty_draft_reports_gaps_not_negative_findings(rec, catalog):
    s = summary_payload()
    s.update(status="draft", consultation=None, diagnoses=[], drugOrders=[], allergies=[], vitals=[], events=[])
    records.clinical_summary(rec, s, catalog, PATIENT, ENCOUNTER)
    [encounter] = facts(rec, "Lần khám")
    assert "bản nháp" in encounter.value
    reasons = {(g.section, g.reason) for g in rec.output.gaps}
    assert {("reason", "no_consultation"), ("vitals", "none_in_source"), ("diagnoses", "none_in_source")} <= reasons
    assert all("bình thường" not in g.detail for g in rec.output.gaps)


@pytest.mark.parametrize("mutate", [
    lambda s: s.update(encounterUuid="c9999999-0000-4000-8000-000000000001"),
    lambda s: s["drugOrders"][0].update(patientUuid="a9999999-0000-4000-8000-000000000001"),
    lambda s: s["vitals"][0].update(visitUuid="b9999999-0000-4000-8000-000000000001"),
])
def test_summary_from_other_context_is_rejected(rec, catalog, mutate):
    s = summary_payload()
    mutate(s)
    with pytest.raises(ContextMismatch):
        records.clinical_summary(rec, s, catalog, PATIENT, ENCOUNTER)


def test_visit_list_issues_refs_instead_of_uuids(rec):
    records.visit_list(rec, load("staff_api.json")["visits"], PATIENT)
    refs = {(r["kind"], r["ref"]) for r in rec.output.references}
    assert {("visit", "V1"), ("visit", "V2"), ("encounter", "E1"), ("encounter", "E2"), ("encounter", "E3")} <= refs
    uuid, meta = rec.registry.resolve("e3", "encounter")
    assert uuid == "c0000000-0000-4000-8000-000000000009" and meta["type"] == "khám bệnh"
    assert "c0000000" not in rec.output.to_model()
    with pytest.raises(ToolError):
        rec.registry.resolve("E3", "visit")
    with pytest.raises(ToolError):
        rec.registry.resolve("E99", "encounter")


def test_service_orders_handle_epoch_timestamps_and_result_ref(rec):
    records.service_orders(rec, load("staff_api.json")["service_orders"], PATIENT, 50)
    [order] = rec.output.facts
    assert order.label == "Glucose máu (LAB-GLU)"
    assert "kết quả mới nhất: phiên bản 1, chính thức" in order.value
    assert [r["ref"] for r in rec.output.references] == ["R1"]
    _, meta = rec.registry.resolve("R1", "result")
    records.diagnostic_result(rec, load("staff_api.json")["results"]["e6000000-0000-4000-8000-000000000001"], PATIENT, meta)
    result = rec.output.facts[-1]
    assert result.label == "Kết quả Glucose máu"
    assert result.value.startswith("5.6 mmol/L; trạng thái chính thức")


def test_demographics_never_include_identity_details(rec):
    records.demographics(rec, load("staff_api.json")["patient"], PATIENT)
    text = rec.output.to_model()
    for secret in ("Bình", "0912345678", "001090000001", "12 Hoa", "VSHC-000123"):
        assert secret not in text
    assert [f.label for f in rec.output.facts] == ["Giới tính", "Tuổi"]
    assert rec.output.facts[1].value == "36 (ngày sinh ước tính)"


def test_allergy_empty_list_is_not_no_allergy(rec):
    records.allergy_list(rec, {"patientUuid": PATIENT, "allergies": []}, PATIENT)
    [gap] = rec.output.gaps
    assert "không thay cho trạng thái sàng lọc" in gap.detail
