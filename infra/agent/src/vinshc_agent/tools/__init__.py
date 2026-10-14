"""Khung tool chỉ đọc cho agent.

Quy tắc chung của mọi tool:
- Bệnh nhân/lần khám lấy từ `ToolContext` (đã xác thực phía server), không bao giờ từ tham số của model.
- Tham số chỉ là mã tham chiếu do tool trước đó cấp (`E…`, `V…`, `R…`) hoặc từ khóa cố định (`current`, `all`).
- Kết quả trả về là dữ kiện đã chuẩn hóa; lỗi quyền/không tìm thấy trả cho model dưới dạng `is_error`,
  còn lỗi phiên (401) và dữ liệu sai ngữ cảnh dừng cả lượt hỏi.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from ..backend import BackendError, Credentials, VinshcBackend
from ..facts import FactRegistry, ToolError, ToolOutput
from ..fields import FieldCatalog
from ..llm import ToolCall, ToolResult
from ..portal import PatientPortal, PatientSession

REF_PARAM_MAX = 16


@dataclass
class ToolContext:
    persona: str
    registry: FactRegistry
    catalog: FieldCatalog
    patient_uuid: str
    backend: VinshcBackend | None = None
    credentials: Credentials | None = None
    encounter_uuid: str | None = None
    visit_uuid: str | None = None
    portal: PatientPortal | None = None
    session: PatientSession | None = None
    used: list[str] = field(default_factory=list)
    cache: dict[str, Any] = field(default_factory=dict)


Handler = Callable[[ToolContext, dict[str, Any]], Awaitable[ToolOutput]]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, dict[str, Any]]
    handler: Handler

    def spec(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.parameters,
                "required": list(self.parameters),
                "additionalProperties": False,
            },
        }


def ref_param(description: str) -> dict[str, Any]:
    return {"type": "string", "description": description}


def check_arguments(tool: Tool, arguments: Any) -> dict[str, Any]:
    if not isinstance(arguments, dict) or set(arguments) != set(tool.parameters):
        raise ToolError(f"Tham số không hợp lệ cho {tool.name}; cần đúng các khóa: {', '.join(tool.parameters) or 'không có'}.")
    for name, schema in tool.parameters.items():
        value = arguments[name]
        if schema.get("type") == "string" and (not isinstance(value, str) or not value.strip() or len(value) > REF_PARAM_MAX):
            raise ToolError(f"Tham số {name} phải là chuỗi ngắn không rỗng.")
        if "enum" in schema and value not in schema["enum"]:
            raise ToolError(f"Tham số {name} chỉ nhận: {', '.join(schema['enum'])}.")
    return {k: v.strip() if isinstance(v, str) else v for k, v in arguments.items()}


async def execute(tools: dict[str, Tool], ctx: ToolContext, call: ToolCall) -> ToolResult:
    tool = tools.get(call.name)
    if tool is None:
        return ToolResult(call.id, _error(f"Tool '{call.name}' không tồn tại hoặc không được phép trong vai trò này."), True)
    ctx.used.append(tool.name)
    try:
        output = await tool.handler(ctx, check_arguments(tool, call.arguments))
    except ToolError as ex:
        return ToolResult(call.id, _error(str(ex)), True)
    except BackendError as ex:
        if ex.status == 401:
            raise
        return ToolResult(call.id, _error(ex.message), True)
    return ToolResult(call.id, output.to_model(), False)


def _error(message: str) -> str:
    return json.dumps({"error": message}, ensure_ascii=False)
