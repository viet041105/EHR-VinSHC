"""Merging equal rendered lines must retain all distinct source evidence."""
from dataclasses import replace

import pytest

from vinshc_agent.agent import AgentDeps, build_response
from vinshc_agent.facts import FactRegistry, Source
from vinshc_agent.guardrails import Verdict
from vinshc_agent.llm import FinalAnswer, Statement
from vinshc_agent.llm.fake import FakeChatModel
from vinshc_agent.tools import ToolContext
from vinshc_agent.validate import validate

from conftest import PATIENT


SOURCE = Source("diagnosis", "d1000000-0000-4000-8000-000000000001", "code", "2026-10-13T09:15:00+07:00", "active")


def response(catalog, registry, facts):
    final = FinalAnswer(scope="answered", statements=[Statement(text="Nội dung đã ghi", fact_ids=[f.id]) for f in facts])
    validation = validate(final, registry, "doctor")
    assert not validation.rejected
    deps = AgentDeps(FakeChatModel(), {}, "", ToolContext("doctor", registry, catalog, PATIENT), frozenset(), 4, 3)
    return build_response({"verdict": Verdict("allow"), "final": final, "validation": validation}, "test", deps, None)


@pytest.mark.parametrize("difference", [
    {"uuid": "d2000000-0000-4000-8000-000000000002"},
    {"field": "other-field"},
    {"recordedAt": "2026-08-02T14:20:00+07:00"},
    {"encounterUuid": "c2000000-0000-4000-8000-000000000002"},
    {"documentVersion": "2.0.0"},
])
def test_equal_text_preserves_distinct_evidence(catalog, difference):
    registry = FactRegistry()
    first = registry.add("diagnoses", "Chẩn đoán", "Đau đầu", "recorded", SOURCE)
    second = registry.add("diagnoses", "Chẩn đoán", "Đau đầu", "recorded", replace(SOURCE, **difference))
    result = response(catalog, registry, [first, second, first])
    assert len(result.answer) == 1
    assert [s.factId for s in result.answer[0].sources] == [first.id, second.id]


def test_same_evidence_read_by_two_tools_is_only_cited_once(catalog):
    registry = FactRegistry()
    first = registry.add("diagnoses", "Chẩn đoán", "Đau đầu", "recorded", SOURCE)
    reread = registry.add("diagnoses", "Chẩn đoán", "Đau đầu", "recorded", SOURCE)
    result = response(catalog, registry, [first, reread, first])
    assert len(result.answer) == len(result.answer[0].sources) == 1
    assert result.answer[0].sources[0].factId == first.id


def test_repeated_derived_comparison_keeps_both_original_sources(catalog):
    registry = FactRegistry()
    old = registry.add("vitals", "Mạch", "78 lần/phút", "recorded", SOURCE)
    new = registry.add("vitals", "Mạch", "92 lần/phút", "recorded", replace(SOURCE, uuid="d2000000-0000-4000-8000-000000000002"))
    derived = registry.add("comparison", "Mạch", "78 lần/phút; 92 lần/phút", "recorded", new.source, (old.id, new.id))
    result = response(catalog, registry, [derived, derived])
    assert len(result.answer) == 1
    assert [s.factId for s in result.answer[0].sources] == [old.id, new.id]
