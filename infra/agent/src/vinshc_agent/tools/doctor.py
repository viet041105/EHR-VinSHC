"""Tool đọc hồ sơ cho bác sĩ (luồng A), gọi API nhân viên của adapter VinSHC bằng credential của bác sĩ."""

from __future__ import annotations

from typing import Any

from .. import records
from ..facts import Recorder, ToolError, ToolOutput
from . import Tool, ToolContext, ref_param

VISITS_LIMIT = 20
VITALS_LIMIT = 20
ORDERS_LIMIT = 50
APPOINTMENTS_LIMIT = 30


def _staff(ctx: ToolContext):
    if ctx.backend is None or ctx.credentials is None:
        raise ToolError("Tool này chỉ dùng trong workspace bác sĩ.")
    return ctx.backend, ctx.credentials


async def _summary(ctx: ToolContext, encounter: str) -> dict[str, Any]:
    backend, credentials = _staff(ctx)
    key = f"summary:{encounter}"
    if key not in ctx.cache:
        ctx.cache[key] = await backend.clinical_summary(credentials, encounter)
    return ctx.cache[key]


async def _visit(ctx: ToolContext, visit_ref: str) -> str | None:
    """`all` → None (mọi lượt), `current` → lượt của lần khám đang mở, `V…` → lượt do list_visits cấp."""
    ref = visit_ref.strip()
    if ref.lower() == "all":
        return None
    if ref.lower() == "current":
        if ctx.visit_uuid is None and ctx.encounter_uuid:
            summary = await _summary(ctx, ctx.encounter_uuid)
            ctx.visit_uuid = (summary.get("visitUuid") or "").lower() or None
        if ctx.visit_uuid is None:
            raise ToolError("Không xác định được lượt khám hiện tại; dùng 'all' hoặc mã V… từ list_visits.")
        return ctx.visit_uuid
    uuid, _ = ctx.registry.resolve(ref, "visit")
    return uuid


async def get_encounter_summary(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    ref = args["encounter_ref"]
    if ref.lower() == "current":
        if not ctx.encounter_uuid:
            raise ToolError("Chưa có lần khám đang mở trong ngữ cảnh.")
        encounter = ctx.encounter_uuid
    else:
        encounter, _ = ctx.registry.resolve(ref, "encounter")
    rec = Recorder(ctx.registry)
    visit = records.clinical_summary(rec, await _summary(ctx, encounter), ctx.catalog, ctx.patient_uuid, encounter)
    if encounter == ctx.encounter_uuid and visit:
        if ctx.visit_uuid and ctx.visit_uuid != visit:
            from ..facts import ContextMismatch
            raise ContextMismatch("visit không thuộc encounter đang mở")
        ctx.visit_uuid = visit
    return rec.output


async def list_visits(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    rec = Recorder(ctx.registry)
    records.visit_list(rec, await backend.visits(credentials, ctx.patient_uuid, VISITS_LIMIT), ctx.patient_uuid)
    return rec.output


async def get_vitals_history(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    visit = await _visit(ctx, args["visit_ref"])
    rec = Recorder(ctx.registry)
    records.vitals_history(rec, await backend.vitals(credentials, ctx.patient_uuid, visit), ctx.catalog, ctx.patient_uuid, VITALS_LIMIT)
    return rec.output


async def get_active_allergies(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    rec = Recorder(ctx.registry)
    records.allergy_list(rec, await backend.allergies(credentials, ctx.patient_uuid), ctx.patient_uuid)
    return rec.output


async def list_diagnostic_orders(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    visit = await _visit(ctx, args["visit_ref"])
    rec = Recorder(ctx.registry)
    records.service_orders(rec, await backend.service_orders(credentials, ctx.patient_uuid, visit), ctx.patient_uuid, ORDERS_LIMIT)
    return rec.output


async def get_diagnostic_result(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    result, meta = ctx.registry.resolve(args["result_ref"], "result")
    rec = Recorder(ctx.registry)
    records.diagnostic_result(rec, await backend.result(credentials, result), ctx.patient_uuid, meta)
    return rec.output


async def list_appointments(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    rec = Recorder(ctx.registry)
    records.appointments(rec, await backend.appointments(credentials, ctx.patient_uuid), ctx.patient_uuid, APPOINTMENTS_LIMIT)
    return rec.output


async def get_patient_demographics(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    rec = Recorder(ctx.registry)
    records.demographics(rec, await backend.patient(credentials, ctx.patient_uuid), ctx.patient_uuid)
    return rec.output


VISIT_REF = ref_param("'current' cho lượt khám đang mở, 'all' cho mọi lượt, hoặc mã V… do list_visits trả về.")

DOCTOR_TOOLS = [
    Tool(
        "get_encounter_summary",
        "Đọc một lần khám: lý do khám, bệnh sử, tiền sử và trạng thái khai thác, khám, chẩn đoán ICD-10, thuốc đã kê "
        "kèm trạng thái, dị ứng, sinh hiệu của lượt khám, lời dặn và hẹn tái khám. Dùng cho tóm tắt và hầu hết câu hỏi "
        "về lần khám đang mở.",
        {"encounter_ref": ref_param("'current' cho lần khám đang mở, hoặc mã E… do list_visits trả về.")},
        get_encounter_summary,
    ),
    Tool(
        "list_visits",
        f"Liệt kê tối đa {VISITS_LIMIT} lượt khám gần nhất của bệnh nhân tại cơ sở (ngày, loại, trạng thái, lý do kết thúc) "
        "và cấp mã V…/E… để đọc chi tiết. Dùng khi hỏi về lần khám trước hoặc so sánh giữa các lần.",
        {},
        list_visits,
    ),
    Tool(
        "get_vitals_history",
        f"Đọc tối đa {VITALS_LIMIT} nhóm sinh hiệu gần nhất (mạch, huyết áp, nhiệt độ, nhịp thở, SpO2, cân nặng, chiều cao) "
        "kèm thời điểm đo, đơn vị và trạng thái thiếu.",
        {"visit_ref": VISIT_REF},
        get_vitals_history,
    ),
    Tool(
        "get_active_allergies",
        "Đọc danh sách dị ứng đang hoạt động của bệnh nhân tại thời điểm hỏi (tác nhân, loại, mức độ, phản ứng).",
        {},
        get_active_allergies,
    ),
    Tool(
        "list_diagnostic_orders",
        "Liệt kê chỉ định cận lâm sàng (xét nghiệm, chẩn đoán hình ảnh…) với trạng thái và cấp mã R… cho kết quả mới nhất.",
        {"visit_ref": VISIT_REF},
        list_diagnostic_orders,
    ),
    Tool(
        "get_diagnostic_result",
        "Đọc một kết quả cận lâm sàng: giá trị, đơn vị, trạng thái (nháp/sơ bộ/chính thức/đính chính), thời điểm ghi và duyệt.",
        {"result_ref": ref_param("Mã R… do list_diagnostic_orders trả về.")},
        get_diagnostic_result,
    ),
    Tool(
        "list_appointments",
        "Liệt kê lịch hẹn của bệnh nhân tại cơ sở (thời gian, dịch vụ, bác sĩ, trạng thái).",
        {},
        list_appointments,
    ),
    Tool(
        "get_patient_demographics",
        "Đọc giới tính và tuổi của bệnh nhân. Không trả tên, số điện thoại, CCCD hay địa chỉ.",
        {},
        get_patient_demographics,
    ),
]
