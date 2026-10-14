"""Kiểu dữ liệu trung lập với nhà cung cấp cho vòng hội thoại có gọi tool.

Một lượt hỏi gồm: lịch sử dạng văn bản (chỉ để hiểu câu hỏi, không phải nguồn), tin nhắn mới, rồi các vòng
model gọi tool → agent trả kết quả. Vòng nào cũng chỉ nối thêm vào cuối (append-only); `ModelTurn.raw` giữ
nguyên nội dung nhà cung cấp trả về để gửi lại đúng như cũ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from pydantic import BaseModel


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: Any


@dataclass(frozen=True)
class ToolResult:
    call_id: str
    content: str
    is_error: bool


class Statement(BaseModel):
    text: str
    fact_ids: list[str]


class FinalAnswer(BaseModel):
    scope: Literal["answered", "not_found", "out_of_scope"]
    statements: list[Statement]


@dataclass
class ModelTurn:
    tool_calls: list[ToolCall]
    final: FinalAnswer | None = None
    raw: Any = None


@dataclass
class Exchange:
    turn: ModelTurn
    results: list[ToolResult] = field(default_factory=list)


@dataclass(frozen=True)
class HistoryTurn:
    role: Literal["user", "assistant"]
    text: str


@dataclass
class Conversation:
    persona: Literal["doctor", "patient"]
    context: str
    history: list[HistoryTurn]
    message: str
    exchanges: list[Exchange] = field(default_factory=list)


class ModelUnavailable(Exception):
    """Model lỗi, bị từ chối hoặc trả kết quả không dùng được; agent trả trạng thái hạn chế."""


class ChatModel(Protocol):
    provider: str
    name: str

    async def next_turn(self, system: str, tools: list[dict[str, Any]], conversation: Conversation) -> ModelTurn: ...


FINAL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "scope": {"type": "string", "enum": ["answered", "not_found", "out_of_scope"]},
        "statements": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "fact_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["text", "fact_ids"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scope", "statements"],
    "additionalProperties": False,
}
