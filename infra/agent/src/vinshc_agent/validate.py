"""Kiểm tra từng câu model viết trước khi trả cho người dùng.

Một câu bị loại khi: rỗng hoặc quá dài; không trích dữ kiện; trích mã không có trong lượt hỏi này; chứa con
số không có trong các dữ kiện được trích; hoặc vi phạm guardrail đầu ra theo vai trò. Luật không bắt được câu
phủ định sai ngữ nghĩa ("không có dị ứng"); trường hợp đó thuộc bộ ca đánh giá.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .facts import Fact, FactRegistry
from .guardrails import screen_statement
from .llm import FinalAnswer, Statement

NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
MAX_STATEMENT_CHARS = 1200


@dataclass
class Checked:
    statement: Statement
    facts: list[Fact]


@dataclass
class Validation:
    accepted: list[Checked] = field(default_factory=list)
    rejected: list[tuple[Statement, str]] = field(default_factory=list)


def numbers(text: str) -> set[str]:
    found = set()
    for token in NUMBER.findall(text):
        token = token.replace(",", ".")
        if "." in token:
            token = token.rstrip("0").rstrip(".")
        found.add(token.lstrip("0") or "0")
    return found


def validate(final: FinalAnswer, registry: FactRegistry, persona: str) -> Validation:
    result = Validation()
    for statement in final.statements:
        text = statement.text.strip()
        if not text:
            result.rejected.append((statement, "empty"))
            continue
        if len(text) > MAX_STATEMENT_CHARS:
            result.rejected.append((statement, "too_long"))
            continue
        ids = list(dict.fromkeys(i.strip() for i in statement.fact_ids))
        if not ids:
            result.rejected.append((statement, "no_source"))
            continue
        cited = [registry.fact(i) for i in ids]
        facts = [f for f in cited if f is not None]
        if len(facts) != len(cited):
            result.rejected.append((statement, "unknown_source"))
            continue
        allowed = set().union(*(numbers(f"{f.label} {f.value}") for f in facts))
        if not numbers(text) <= allowed:
            result.rejected.append((statement, "unsupported_number"))
            continue
        reason = screen_statement(persona, text, facts)
        if reason:
            result.rejected.append((statement, reason))
            continue
        result.accepted.append(Checked(Statement(text=text, fact_ids=ids), facts))
    return result
