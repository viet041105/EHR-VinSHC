"""Tool cho bệnh nhân (luồng P): chỉ đọc phần hồ sơ đã được phòng khám công bố cho chính người đăng nhập."""

from __future__ import annotations

from typing import Any

from .. import records
from ..facts import Recorder, ToolError, ToolOutput
from . import Tool, ToolContext, ref_param


def _portal(ctx: ToolContext):
    if ctx.portal is None or ctx.session is None:
        raise ToolError("Tool này chỉ dùng trong cổng bệnh nhân.")
    return ctx.portal, ctx.session


async def list_my_visits(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    portal, session = _portal(ctx)
    rec = Recorder(ctx.registry)
    data = await portal.visits(session)
    if ctx.visit_uuid:
        data = {**data, "results": [v for v in data.get("results", []) if v.get("uuid") == ctx.visit_uuid]}
    records.portal_visits(rec, data)
    return rec.output


async def get_visit_instructions(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    portal, session = _portal(ctx)
    visit, _ = ctx.registry.resolve(args["visit_ref"], "visit")
    rec = Recorder(ctx.registry)
    records.portal_instructions(rec, await portal.visit_instructions(session, visit), visit)
    return rec.output


async def get_my_prescriptions(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    portal, session = _portal(ctx)
    ref = args["visit_ref"]
    visit = ctx.visit_uuid if ref.lower() == "all" else ctx.registry.resolve(ref, "visit")[0]
    rec = Recorder(ctx.registry)
    records.portal_prescriptions(rec, await portal.prescriptions(session, visit))
    return rec.output


async def list_my_appointments(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    portal, session = _portal(ctx)
    rec = Recorder(ctx.registry)
    records.portal_appointments(rec, await portal.appointments(session))
    return rec.output


PATIENT_TOOLS = [
    Tool(
        "list_my_visits",
        "Liệt kê các lần khám đã được phòng khám công bố cho người bệnh và cấp mã V… để đọc lời dặn.",
        {},
        list_my_visits,
    ),
    Tool(
        "get_visit_instructions",
        "Đọc lời dặn, hướng dẫn sau khám và ngày tái khám bác sĩ đã công bố cho một lần khám.",
        {"visit_ref": ref_param("Mã V… do list_my_visits trả về.")},
        get_visit_instructions,
    ),
    Tool(
        "get_my_prescriptions",
        "Đọc các đơn thuốc đã được xác nhận: tên thuốc, liều, số lần dùng, đường dùng, thời gian dùng, hướng dẫn, trạng thái.",
        {"visit_ref": ref_param("'all' cho mọi đơn, hoặc mã V… do list_my_visits trả về.")},
        get_my_prescriptions,
    ),
    Tool(
        "list_my_appointments",
        "Liệt kê lịch hẹn và lịch tái khám của người bệnh.",
        {},
        list_my_appointments,
    ),
]
