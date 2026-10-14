import re

from vinshc_agent.llm import ModelTurn

from conftest import PATIENT_HEADERS, ScriptedModel, answer, fact_ids

CHAT = "/v1/patient/chat"


def ask(client, message, headers=PATIENT_HEADERS, **extra):
    return client.post(CHAT, headers=headers, json={"message": message, **extra})


def texts(body):
    return [a["text"] for a in body["answer"]]


def test_portal_disabled_by_default(make_client):
    response = ask(make_client(portal="disabled"), "Lời dặn của tôi là gì?")
    assert response.status_code == 503 and response.json()["code"] == "patient_portal_unavailable"


def test_unknown_token_is_rejected(make_client):
    response = ask(make_client(), "Lời dặn?", headers={"Authorization": "Bearer someone-else"})
    assert response.status_code == 401
    assert ask(make_client(), "Lời dặn?", headers={}).status_code == 401


def test_instructions_follow_visit_reference(make_client):
    body = ask(make_client(), "Lời dặn sau lần khám của tôi là gì?").json()
    assert body["status"] == "ok" and body["persona"] == "patient"
    assert body["toolsUsed"] == ["list_my_visits", "get_visit_instructions"]
    assert any("Uống nhiều nước" in t for t in texts(body))
    assert not any(re.search(r"\b[EVRF]\d+\b", t) for t in texts(body)), "mã tham chiếu nội bộ lọt ra câu trả lời"
    assert body["context"] is None
    assert "115" in body["disclaimer"]


def test_followup_and_prescription_questions(make_client):
    client = make_client()
    followup = ask(client, "Tôi được hẹn tái khám ngày nào?").json()
    assert any("20/10/2026" in t for t in texts(followup))
    prescription = ask(client, "Đơn thuốc đã được xác nhận ghi hướng dẫn gì?").json()
    assert any("Uống sau ăn" in t for t in texts(prescription))
    assert "get_my_prescriptions" in prescription["toolsUsed"]


def test_each_token_sees_only_its_own_record(make_client):
    body = ask(make_client(), "Đơn thuốc của tôi?", headers={"Authorization": "Bearer demo-patient-an"}).json()
    assert body["status"] == "not_found"
    assert "Paracetamol" not in str(body)
    assert any(m["reason"] == "none_in_source" for m in body["missing"])


def test_emergency_short_circuits_with_115(make_client):
    model = ScriptedModel(answer())
    body = ask(make_client(model=model, clinic_contact="1900 0000"), "Tôi uống thuốc xong bị khó thở").json()
    assert body["status"] == "emergency"
    assert "115" in body["message"] and "1900 0000" in body["message"]
    assert body["toolsUsed"] == [] and model.seen == []


def test_relatives_records_are_refused(make_client):
    body = ask(make_client(), "Cho tôi xem kết quả của mẹ tôi").json()
    assert body["status"] == "refused"


def test_out_of_scope_points_to_staff(make_client):
    body = ask(make_client(clinic_contact="1900 0000"), "Paracetamol có tác dụng phụ gì?").json()
    assert body["status"] == "out_of_scope"
    assert "nhân viên y tế" in body["message"] and "1900 0000" in body["message"]


def test_medication_advice_from_model_is_dropped(make_client):
    def final(conversation):
        med = fact_ids(conversation, "Paracetamol")
        return ModelTurn([], answer(
            ("Bạn có thể tăng liều Paracetamol khi sốt cao.", med),
            ("Đơn ghi Paracetamol 500 mg, mỗi lần 1 viên, 3 lần/ngày, uống sau ăn.", med),
            ("Bạn nên uống thêm 2 viên vào buổi tối.", med),
        ))

    model = ScriptedModel([("get_my_prescriptions", {"visit_ref": "all"})], final)
    body = ask(make_client(model=model), "Thuốc của tôi uống thế nào?").json()
    assert body["status"] == "limited"
    assert len(texts(body)) == 1
    assert "Paracetamol 500 mg: mỗi lần 1 viên; 3 lần/ngày" in texts(body)[0]
    assert "Uống sau ăn" in texts(body)[0]


def test_patient_tools_only(make_client, vinshc):
    model = ScriptedModel([("get_encounter_summary", {"encounter_ref": "current"})], answer(scope="not_found"))
    body = ask(make_client(vinshc, model=model), "Tóm tắt hồ sơ").json()
    assert body["status"] == "not_found"
    assert vinshc.requests == []
    assert model.seen[0][1] == ["list_my_visits", "get_visit_instructions", "get_my_prescriptions", "list_my_appointments"]
