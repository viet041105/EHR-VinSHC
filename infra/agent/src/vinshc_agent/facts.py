"""Dữ kiện có nguồn và sổ đăng ký dữ kiện của một lượt hỏi.

Mỗi lượt hỏi có một `FactRegistry` mới. Tool ghi dữ kiện vào đó và trả cho model bản rút gọn
(mã `F…`, mục, nhãn, giá trị, trạng thái). UUID nguồn chỉ nằm ở registry; model tham chiếu bản ghi bằng mã
mờ (`E…` encounter, `V…` lượt khám, `R…` kết quả) do chính tool cấp, nên không thể tự đoán hay chèn UUID.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

SECTIONS = {
    "patient": "Thông tin hành chính tối thiểu",
    "reason": "Lý do khám và bệnh sử",
    "history": "Tiền sử",
    "vitals": "Sinh hiệu",
    "exam": "Thăm khám",
    "diagnoses": "Chẩn đoán",
    "medications": "Thuốc",
    "allergies": "Dị ứng",
    "plan": "Hướng điều trị, lời dặn và tái khám",
    "results": "Cận lâm sàng",
    "visits": "Các lượt khám",
    "appointments": "Lịch hẹn",
    "other": "Thông tin khác",
}

# Câu trả lời đã khai thác là dữ kiện; các mã còn lại là trạng thái thiếu.
PRESENT_STATES = {"recorded", "needs_verification"}
REF_PREFIX = {"encounter": "E", "visit": "V", "result": "R"}


class ContextMismatch(Exception):
    """Dữ liệu trả về không thuộc đúng bệnh nhân/lượt/encounter của ngữ cảnh; dừng cả lượt hỏi."""


class ToolError(Exception):
    """Lỗi trả lại cho model dưới dạng tool_result is_error; nội dung phải an toàn để hiển thị."""


@dataclass(frozen=True)
class Source:
    kind: str
    uuid: str | None
    field: str | None
    recordedAt: str | None
    status: str | None


@dataclass(frozen=True)
class Fact:
    id: str
    section: str
    label: str
    value: str
    state: str
    source: Source

    def for_model(self) -> dict[str, str]:
        return {"id": self.id, "section": self.section, "label": self.label, "value": self.value, "state": self.state}


@dataclass(frozen=True)
class Gap:
    section: str
    label: str
    reason: str
    detail: str


@dataclass
class ToolOutput:
    facts: list[Fact] = field(default_factory=list)
    gaps: list[Gap] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    references: list[dict[str, Any]] = field(default_factory=list)

    def to_model(self) -> str:
        payload: dict[str, Any] = {"facts": [f.for_model() for f in self.facts]}
        if self.gaps:
            payload["gaps"] = [{"section": g.section, "label": g.label, "detail": g.detail} for g in self.gaps]
        if self.notes:
            payload["notes"] = self.notes
        if self.references:
            payload["references"] = self.references
        return json.dumps(payload, ensure_ascii=False)


class FactRegistry:
    def __init__(self) -> None:
        self._facts: dict[str, Fact] = {}
        self._refs: dict[str, tuple[str, str, dict[str, Any]]] = {}
        self._ref_of: dict[tuple[str, str], str] = {}
        self.gaps: list[Gap] = []
        self.notes: list[str] = []

    @property
    def facts(self) -> list[Fact]:
        return list(self._facts.values())

    def fact(self, fact_id: str) -> Fact | None:
        return self._facts.get(fact_id)

    def add(self, section: str, label: str, value: str, state: str, source: Source) -> Fact:
        fact = Fact(f"F{len(self._facts) + 1}", section, label, value, state, source)
        self._facts[fact.id] = fact
        return fact

    def gap(self, gap: Gap) -> None:
        if gap not in self.gaps:
            self.gaps.append(gap)

    def note(self, text: str) -> None:
        if text not in self.notes:
            self.notes.append(text)

    def ref(self, kind: str, uuid: str, meta: dict[str, Any] | None = None) -> str:
        key = (kind, uuid.lower())
        if key not in self._ref_of:
            count = sum(1 for k, _, _ in self._refs.values() if k == kind)
            ref = f"{REF_PREFIX[kind]}{count + 1}"
            self._ref_of[key] = ref
            self._refs[ref] = (kind, uuid.lower(), dict(meta or {}))
        return self._ref_of[key]

    def resolve(self, ref: str, kind: str) -> tuple[str, dict[str, Any]]:
        entry = self._refs.get((ref or "").strip().upper())
        if entry is None or entry[0] != kind:
            raise ToolError(
                f"Mã tham chiếu '{ref}' không hợp lệ cho {kind}; chỉ dùng mã do tool trả về trong lượt này."
            )
        return entry[1], entry[2]

    def missing(self) -> list[Gap]:
        """Khoảng trống của nguồn cộng với dữ kiện mang trạng thái thiếu."""
        stated = [
            Gap(f.section, f.label, f.state, f"Hồ sơ ghi: {f.value}.")
            for f in self._facts.values()
            if f.state not in PRESENT_STATES
        ]
        return self.gaps + stated


class Recorder:
    """Ghi đồng thời vào registry của lượt hỏi và vào kết quả của một lần gọi tool."""

    def __init__(self, registry: FactRegistry):
        self.registry = registry
        self.output = ToolOutput()

    def add(self, section: str, label: str, value: str, state: str, source: Source) -> Fact:
        fact = self.registry.add(section, label, value, state, source)
        self.output.facts.append(fact)
        return fact

    def gap(self, section: str, label: str, reason: str, detail: str) -> None:
        gap = Gap(section, label, reason, detail)
        self.registry.gap(gap)
        self.output.gaps.append(gap)

    def note(self, text: str) -> None:
        self.registry.note(text)
        if text not in self.output.notes:
            self.output.notes.append(text)

    def ref(self, kind: str, uuid: str, **meta: Any) -> str:
        ref = self.registry.ref(kind, uuid, meta)
        self.output.references.append({"ref": ref, "kind": kind, **{k: v for k, v in meta.items() if v is not None}})
        return ref
