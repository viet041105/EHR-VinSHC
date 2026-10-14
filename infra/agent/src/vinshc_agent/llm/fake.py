"""Model tất định để chạy contract/test/demo mà không gọi mạng.

Chọn tool theo từ khóa trong câu hỏi, đọc kết quả tool và trả mỗi dữ kiện liên quan thành một câu kèm mã
dữ kiện. Không thay thế model thật về chất lượng ngôn ngữ; dùng để kiểm chứng vòng tool, quyền và guardrail.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ..text import fold
from . import Conversation, FinalAnswer, ModelTurn, Statement, ToolCall

SUMMARY = ("get_encounter_summary", {"encounter_ref": "current"})


@dataclass(frozen=True)
class Rule:
    keywords: tuple[str, ...]
    calls: tuple[tuple[str, dict[str, str]], ...]
    sections: frozenset[str] | None  # None = mọi mục


DOCTOR_RULES = (
    Rule(("tom tat", "tong quan", "tong hop"), (SUMMARY,), None),
    Rule(("thuoc", "don ", "ke don"), (SUMMARY,), frozenset({"medications"})),
    Rule(("di ung",), (("get_active_allergies", {}),), frozenset({"allergies"})),
    Rule(("sinh hieu", "mach", "huyet ap", "nhiet do", "nhip tho", "spo2", "can nang", "chieu cao"),
         (("get_vitals_history", {"visit_ref": "all"}),), frozenset({"vitals"})),
    Rule(("lan truoc", "lich su kham", "cac lan kham", "truoc day", "so voi"), (("list_visits", {}),), frozenset({"visits"})),
    Rule(("xet nghiem", "can lam sang", "ket qua", "chi dinh"),
         (("list_diagnostic_orders", {"visit_ref": "all"}),), frozenset({"results"})),
    Rule(("lich hen", "hen kham"), (("list_appointments", {}),), frozenset({"appointments"})),
    Rule(("tai kham",), (SUMMARY, ("list_appointments", {})), frozenset({"plan", "appointments"})),
    Rule(("tien su",), (SUMMARY,), frozenset({"history"})),
    Rule(("benh su", "ly do"), (SUMMARY,), frozenset({"reason"})),
    Rule(("chan doan", "icd"), (SUMMARY,), frozenset({"diagnoses"})),
    Rule(("loi dan", "huong dieu tri"), (SUMMARY,), frozenset({"plan"})),
    Rule(("trieu chung", "kham thay"), (SUMMARY,), frozenset({"exam", "reason"})),
    Rule(("tuoi", "gioi tinh"), (("get_patient_demographics", {}),), frozenset({"patient"})),
)

PATIENT_RULES = (
    Rule(("loi dan", "dan do", "huong dan", "can lam gi", "kieng", "tai kham"), (("list_my_visits", {}),), frozenset({"plan"})),
    Rule(("thuoc", "don ", "uong"), (("get_my_prescriptions", {"visit_ref": "all"}),), frozenset({"medications"})),
    Rule(("lich hen", "hen ", "tai kham"), (("list_my_appointments", {}),), frozenset({"appointments"})),
    Rule(("lan kham", "lich su"), (("list_my_visits", {}),), frozenset({"visits"})),
)


class FakeChatModel:
    provider = "fake"
    name = "scripted"

    async def next_turn(self, system: str, tools: list[dict[str, Any]], conversation: Conversation) -> ModelTurn:
        allowed = {tool["name"] for tool in tools}
        rules = [r for r in (DOCTOR_RULES if conversation.persona == "doctor" else PATIENT_RULES)
                 if any(k in f" {fold(conversation.message)} " for k in r.keywords)]
        if not rules:
            return ModelTurn([], FinalAnswer(scope="out_of_scope", statements=[]))
        sections = None if any(r.sections is None for r in rules) else frozenset().union(*(r.sections for r in rules))
        payloads = [json.loads(r.content) for ex in conversation.exchanges for r in ex.results if not r.is_error]
        round_no = len(conversation.exchanges)

        if round_no == 0:
            calls = list(dict.fromkeys((name, json.dumps(args)) for r in rules for name, args in r.calls))
            return self._calls(round_no, [(n, json.loads(a)) for n, a in calls if n in allowed])
        if round_no == 1:
            follow = self._follow_up(sections, payloads, allowed)
            if follow:
                return self._calls(round_no, follow)

        facts = [f for p in payloads for f in p.get("facts", [])]
        chosen = [f for f in facts if sections is None or f["section"] in sections]
        statements = [Statement(text=f"{f['label']}: {f['value']}", fact_ids=[f["id"]]) for f in chosen]
        return ModelTurn([], FinalAnswer(scope="answered" if statements else "not_found", statements=statements))

    @staticmethod
    def _calls(round_no: int, calls: list[tuple[str, dict[str, Any]]]) -> ModelTurn:
        return ModelTurn([ToolCall(f"fake_{round_no}_{i}", name, args) for i, (name, args) in enumerate(calls)])

    @staticmethod
    def _follow_up(sections, payloads, allowed) -> list[tuple[str, dict[str, Any]]]:
        refs = [ref for p in payloads for ref in p.get("references", [])]
        follow: list[tuple[str, dict[str, Any]]] = []
        if sections and "results" in sections and "get_diagnostic_result" in allowed:
            follow += [("get_diagnostic_result", {"result_ref": r["ref"]}) for r in refs if r["kind"] == "result"][:3]
        if sections and "plan" in sections and "get_visit_instructions" in allowed:
            visits = [r["ref"] for r in refs if r["kind"] == "visit"]
            if visits:
                follow.append(("get_visit_instructions", {"visit_ref": visits[0]}))
        return follow
