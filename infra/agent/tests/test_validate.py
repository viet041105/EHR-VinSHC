from vinshc_agent import records
from vinshc_agent.validate import validate

from conftest import ENCOUNTER, PATIENT, answer, summary_payload


def chart(rec, catalog):
    records.clinical_summary(rec, summary_payload(), catalog, PATIENT, ENCOUNTER)
    return {f.label: f.id for f in rec.registry.facts}


def test_accepts_statement_backed_by_cited_fact(rec, catalog):
    ids = chart(rec, catalog)
    result = validate(answer(("Nhiệt độ 38,5 °C lúc 08:50.", [ids["Nhiệt độ"]])), rec.registry, "doctor")
    assert len(result.accepted) == 1 and not result.rejected


def test_rejects_missing_or_unknown_source(rec, catalog):
    chart(rec, catalog)
    result = validate(answer(("Huyết áp ổn định.", []), ("Huyết áp ổn định.", ["F999"])), rec.registry, "doctor")
    assert [reason for _, reason in result.rejected] == ["no_source", "unknown_source"]


def test_numbers_must_come_from_the_cited_facts(rec, catalog):
    ids = chart(rec, catalog)
    result = validate(answer(
        ("Nhiệt độ 39 °C.", [ids["Nhiệt độ"]]),
        ("Nhiệt độ 38.5 °C.", [ids["Mạch"]]),
    ), rec.registry, "doctor")
    assert [reason for _, reason in result.rejected] == ["unsupported_number", "unsupported_number"]


def test_doctor_treatment_advice_is_rejected(rec, catalog):
    ids = chart(rec, catalog)
    result = validate(answer(("Nên kê thêm kháng sinh.", [ids["Chẩn đoán chính"]])), rec.registry, "doctor")
    assert [reason for _, reason in result.rejected] == ["treatment_advice"]


def test_patient_medication_change_is_rejected_but_source_wording_passes(rec, catalog):
    ids = chart(rec, catalog)
    med = ids["Paracetamol 500 mg"]
    result = validate(answer(
        ("Bạn có thể tăng liều Paracetamol khi sốt cao.", [med]),
        ("Bạn nên ngừng thuốc khi hết sốt.", [med]),
        ("Hồ sơ ghi bạn đang dùng thuốc Paracetamol 500 mg, uống sau ăn.", [med]),
        ("Hỏi thầy thuốc nếu còn thắc mắc về Paracetamol.", [med]),
    ), rec.registry, "patient")
    assert [reason for _, reason in result.rejected] == ["medication_advice", "medication_advice"]
    assert len(result.accepted) == 2


def test_patient_diagnostic_claim_needs_diagnosis_source(rec, catalog):
    ids = chart(rec, catalog)
    result = validate(answer(
        ("Bạn bị viêm phổi.", [ids["Lời dặn"]]),
        ("Bạn bị viêm họng cấp theo chẩn đoán ghi trong hồ sơ.", [ids["Chẩn đoán chính"]]),
    ), rec.registry, "patient")
    assert [reason for _, reason in result.rejected] == ["diagnostic_claim"]
    assert len(result.accepted) == 1
