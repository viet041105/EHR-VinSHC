"""Patient-only requests select an existing, authorized consultation consistently."""
import copy
import json

import pytest

from conftest import ENCOUNTER, HEADERS, PATIENT, PREVIOUS_ENCOUNTER, VISIT, ScriptedModel, answer
from vinshc_agent.llm import ModelTurn

CHAT = "/v1/doctor/chat"
OLD_VISIT = "b0000000-0000-4000-8000-000000000009"
NEW_ENCOUNTER = "c3000000-0000-4000-8000-000000000003"


def sourced(conversation):
    facts = [fact for exchange in conversation.exchanges for result in exchange.results
             for fact in json.loads(result.content).get("facts", [])]
    return ModelTurn([], answer(*[(fact["label"], [fact["id"]]) for fact in facts]))


def ask(make_client, backend, *, visit=None, model=None, **settings):
    body = {"message": "Tóm tắt lần khám", "patientUuid": PATIENT}
    if visit:
        body["visitUuid"] = visit
    model = model or ScriptedModel([("get_encounter_summary", {"encounter_ref": "current"})], sourced)
    return make_client(backend, model=model, **settings).post(CHAT, headers=HEADERS, json=body)


@pytest.mark.parametrize("visit,expected", [(None, ENCOUNTER), (VISIT, ENCOUNTER), (OLD_VISIT, PREVIOUS_ENCOUNTER)])
def test_summary_without_encounter_reads_existing_consultation(make_client, vinshc, visit, expected):
    response = ask(make_client, vinshc, visit=visit)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok" and body["answer"]
    assert body["context"]["encounterUuid"] is None
    assert body["context"]["visitUuid"] == visit  # Keep the FE/session context unchanged.
    encounter_sources = [s for a in body["answer"] for s in a["sources"] if s["kind"] == "encounter"]
    assert {s["uuid"] for s in encounter_sources} == {expected}
    assert any("Chưa chọn phiếu khám" in note for note in body["notes"])
    assert [r.url.path.split("/")[-2] for r in vinshc.calls("summary")] == [expected]
    assert all(r.method == "GET" for r in vinshc.requests)
    assert all(r.headers["authorization"] == HEADERS["Authorization"] for r in vinshc.requests)


def test_latest_selection_uses_instants_and_consultation_type_not_array_order(make_client, vinshc):
    visits = vinshc.payloads["visits"]["results"]
    visits.reverse()
    current = visits[-1]
    newer = copy.deepcopy(current["encounters"][-1])
    # This is 09:20 local time; lexical ordering would put it before 09:15+07:00.
    newer.update(uuid=NEW_ENCOUNTER, encounterUuid=NEW_ENCOUNTER, encounterDatetime="2026-10-13T02:20:00Z")
    current["encounters"].insert(0, newer)
    current["encounters"][1]["encounterDatetime"] = "2026-10-13T11:00:00+07:00"  # Vitals, not consultation.
    admin = copy.deepcopy(newer)
    admin.update(encounterDatetime="2026-10-13T12:00:00+07:00", encounterType={"key": "administrative"})
    voided = copy.deepcopy(newer)
    voided.update(encounterDatetime="2026-10-13T13:00:00+07:00", voided=True)
    current["encounters"].extend([admin, voided])
    summary = copy.deepcopy(vinshc.summaries[ENCOUNTER])
    summary.update(encounterUuid=NEW_ENCOUNTER, encounterDatetime=newer["encounterDatetime"])
    for record in [summary["consultation"], *summary["diagnoses"], *summary["drugOrders"]]:
        record["encounterUuid"] = NEW_ENCOUNTER
    vinshc.summaries[NEW_ENCOUNTER] = summary
    result = ask(make_client, vinshc).json()
    assert result["status"] == "ok"
    assert [r.url.path.split("/")[-2] for r in vinshc.calls("summary")] == [NEW_ENCOUNTER]


@pytest.mark.parametrize("mode,expected", [
    ("no_visits", "chưa có lượt khám"),
    ("no_consultation", "chưa có phiếu khám bệnh"),
    ("undated_visit", "thiếu thời điểm"),
    ("undated_consultation", "thiếu thời điểm"),
])
def test_missing_current_record_is_actionable_and_never_falls_back_to_another_visit(make_client, vinshc, mode, expected):
    current = vinshc.payloads["visits"]["results"][0]
    if mode == "no_visits":
        vinshc.payloads["visits"]["results"] = []
    elif mode == "no_consultation":
        current["encounters"] = current["encounters"][:1]
    elif mode == "undated_visit":
        current["startDatetime"] = "2026-10-13T08:40:00"
    else:
        current["encounters"][-1]["encounterDatetime"] = None
    model = ScriptedModel([("get_encounter_summary", {"encounter_ref": "current"})], answer(scope="not_found"))
    result = ask(make_client, vinshc, model=model).json()
    assert result["status"] == "not_found" and result["answer"] == []
    assert expected in result["message"]
    assert any(g["reason"] == "no_current_encounter" for g in result["missing"])
    assert vinshc.calls("summary") == []


@pytest.mark.parametrize("field", ["patientUuid", "visitUuid", "encounterUuid"])
def test_resolved_summary_must_match_patient_visit_and_encounter(make_client, vinshc, field):
    vinshc.summaries[ENCOUNTER][field] = "f0000000-0000-4000-8000-000000000099"
    result = ask(make_client, vinshc)
    assert result.status_code == 502 and result.json()["code"] == "context_mismatch"
    assert "answer" not in result.json()


@pytest.mark.parametrize("level", ["visit", "encounter"])
def test_foreign_patient_in_visit_listing_stops_before_summary_read(make_client, vinshc, level):
    current = vinshc.payloads["visits"]["results"][0]
    record = current if level == "visit" else current["encounters"][-1]
    record["patientUuid"] = "a9999999-0000-4000-8000-000000000001"
    result = ask(make_client, vinshc)
    assert result.status_code == 502 and result.json()["code"] == "context_mismatch"
    assert vinshc.calls("summary") == []


def test_forbidden_selected_summary_does_not_try_older_records(make_client, vinshc):
    vinshc.status["summary"] = 403
    model = ScriptedModel([("get_encounter_summary", {"encounter_ref": "current"})], answer(scope="not_found"))
    result = ask(make_client, vinshc, model=model).json()
    assert result["status"] == "limited" and result["answer"] == []
    assert any(g["reason"] == "forbidden" for g in result["missing"])
    assert len(vinshc.calls("summary")) == 1


@pytest.mark.parametrize("reverse", [False, True])
def test_parallel_tools_share_the_selected_visit(make_client, vinshc, reverse):
    vinshc.payloads["vitals"]["results"] = vinshc.payloads["vitals"]["results"][:1]
    tools = [("get_encounter_summary", {"encounter_ref": "current"}),
             ("get_vitals_history", {"visit_ref": "current"})]
    model = ScriptedModel(list(reversed(tools)) if reverse else tools, sourced)
    result = ask(make_client, vinshc, model=model, advanced_enabled=True).json()
    assert result["status"] == "ok" and result["answer"]
    assert len(vinshc.calls("visits")) == len(vinshc.calls("summary")) == 1
    assert vinshc.query(vinshc.calls("vitals")[0])["visit"] == VISIT
    assert any("của lượt khám gần nhất" in note for note in result["notes"])


def test_comparison_without_selected_encounter_uses_the_same_current_selection(make_client, vinshc):
    model = ScriptedModel([("compare_previous_visit", {})], sourced)
    result = ask(make_client, vinshc, model=model, advanced_enabled=True).json()
    assert result["status"] == "ok" and result["answer"]
    assert {r.url.path.split("/")[-2] for r in vinshc.calls("summary")} == {ENCOUNTER, PREVIOUS_ENCOUNTER}
