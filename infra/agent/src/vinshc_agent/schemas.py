"""Hợp đồng HTTP giữa FE và agent (camelCase như các API VinSHC)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

DISCLAIMERS = {
    "doctor": "AI hỗ trợ — cần bác sĩ kiểm tra lại với hồ sơ gốc.",
    "patient": "Thông tin chỉ giúp bạn hiểu hồ sơ phòng khám đã cung cấp, không thay thế tư vấn của bác sĩ. "
    "Khi có dấu hiệu nguy hiểm, gọi cấp cứu 115.",
}


class HistoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    message: str = Field(min_length=1, max_length=1000)
    history: list[HistoryIn] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def alternating_history(self) -> "ChatIn":
        expected = ["user", "assistant"] * (len(self.history) // 2)
        if len(self.history) % 2 or [h.role for h in self.history] != expected:
            raise ValueError("history phải xen kẽ user/assistant, bắt đầu bằng user và kết thúc bằng assistant")
        return self


class DoctorChatIn(ChatIn):
    patientUuid: str
    encounterUuid: str
    visitUuid: str | None = None


class PatientChatIn(ChatIn):
    visitUuid: str | None = None


class SourceOut(BaseModel):
    factId: str
    section: str
    label: str
    kind: str
    uuid: str | None
    field: str | None
    recordedAt: str | None
    status: str | None
    encounterUuid: str | None = None
    visitUuid: str | None = None


class AnswerOut(BaseModel):
    text: str
    sources: list[SourceOut]


class MissingOut(BaseModel):
    section: str
    label: str
    reason: str
    detail: str


class DoctorContextOut(BaseModel):
    patientUuid: str
    encounterUuid: str
    visitUuid: str | None
    role: str
    facilityUuid: str


class ModelOut(BaseModel):
    provider: str
    name: str


Status = Literal["ok", "limited", "not_found", "out_of_scope", "refused", "emergency"]


class ChatOut(BaseModel):
    requestId: str
    persona: Literal["doctor", "patient"]
    status: Status
    message: str | None = None
    answer: list[AnswerOut]
    missing: list[MissingOut]
    notes: list[str]
    toolsUsed: list[str]
    context: DoctorContextOut | None = None
    disclaimer: str
    generatedAt: str
    model: ModelOut


class ErrorOut(BaseModel):
    code: str
    detail: str
    requestId: str
