"""Tool đọc hồ sơ cho bác sĩ (luồng A), gọi API nhân viên của adapter VinSHC bằng credential của bác sĩ."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, NoReturn

from .. import records
from ..backend import require_uuid
from ..facts import ContextMismatch, Gap, Recorder, Source, ToolError, ToolOutput
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


def _time(value: Any) -> datetime | None:
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo is not None else None
    except (ValueError, TypeError):
        return None


def _missing_current(ctx: ToolContext, detail: str) -> NoReturn:
    ctx.registry.gap(Gap("visits", "Phiếu khám để đọc", "no_current_encounter", detail))
    raise ToolError(detail)


async def _read_current_visit(ctx: ToolContext, selected: str | None) -> dict[str, Any]:
    backend, credentials = _staff(ctx)
    payload = await backend.visits(credentials, ctx.patient_uuid, 100 if selected else VISITS_LIMIT)
    rows = payload.get("results") or []
    records._owned(payload, ctx.patient_uuid)
    for row in rows:
        if str(row.get("patientUuid") or "").lower() != ctx.patient_uuid:
            raise ContextMismatch("Lượt khám thuộc bệnh nhân khác")
    rows = [row for row in rows if not row.get("voided")]
    if selected:
        row = next((row for row in rows if str(row.get("uuid") or row.get("visitUuid") or "").lower() == selected), None)
        if row is None:
            _missing_current(ctx, "Không đọc được lượt khám đang chọn; hãy chọn lại lượt khám trong danh sách.")
        return row
    if not rows:
        _missing_current(ctx, "Bệnh nhân chưa có lượt khám trong phạm vi được phép đọc; chưa có phiếu để tóm tắt.")
    if any(_time(row.get("startDatetime")) is None for row in rows):
        _missing_current(ctx, "Chưa xác định được lượt khám gần nhất vì thiếu thời điểm có múi giờ; hãy chọn lượt và phiếu khám cụ thể.")
    return max(rows, key=lambda row: (_time(row["startDatetime"]), str(row.get("uuid") or row.get("visitUuid"))))


async def _current_visit_row(ctx: ToolContext) -> dict[str, Any]:
    # All parallel tools in this request share one selection and one authorized read.
    key = "current_visit_selection"
    if key not in ctx.cache:
        ctx.cache["current_visit_explicit"] = ctx.visit_uuid is not None
        ctx.cache[key] = asyncio.create_task(_read_current_visit(ctx, ctx.visit_uuid))
    row = await ctx.cache[key]
    ctx.visit_uuid = require_uuid(row.get("uuid") or row.get("visitUuid"), "current visit")
    return row


async def _read_current_encounter(ctx: ToolContext) -> str:
    row = await _current_visit_row(ctx)
    selected_visit = ctx.cache["current_visit_explicit"]
    encounters = row.get("encounters") or []
    for encounter in encounters:
        records._owned(encounter, ctx.patient_uuid)
        records._owned(encounter, ctx.visit_uuid, "visitUuid")
    candidates = [encounter for encounter in encounters
                  if (encounter.get("encounterType") or {}).get("key") == "consultation"
                  and not encounter.get("voided")
                  and encounter.get("status") not in {"voided", "entered-in-error"}]
    if not candidates:
        _missing_current(ctx, "Lượt khám đang chọn chưa có phiếu khám bệnh để tóm tắt." if selected_visit else
                         "Lượt khám gần nhất chưa có phiếu khám bệnh để tóm tắt; hãy chọn một lượt và phiếu khám đã có.")
    if any(_time(encounter.get("encounterDatetime")) is None for encounter in candidates):
        _missing_current(ctx, "Chưa xác định được phiếu khám bệnh gần nhất vì thiếu thời điểm có múi giờ; hãy chọn phiếu khám cụ thể.")
    encounter = max(candidates, key=lambda item: (_time(item["encounterDatetime"]), str(item.get("encounterUuid") or item.get("uuid"))))
    uuid = require_uuid(encounter.get("encounterUuid") or encounter.get("uuid"), "current encounter")
    summary = await _summary(ctx, uuid)
    if (str(summary.get("patientUuid") or "").lower() != ctx.patient_uuid
            or str(summary.get("encounterUuid") or "").lower() != uuid
            or str(summary.get("visitUuid") or "").lower() != ctx.visit_uuid):
        raise ContextMismatch("Phiếu khám gần nhất không khớp bệnh nhân/lượt khám")
    ctx.encounter_uuid = uuid
    note = (f"Chưa chọn phiếu khám: đang đọc phiếu khám bệnh gần nhất lúc {records.clock(encounter['encounterDatetime'])} "
            + ("trong lượt khám đã chọn." if selected_visit else
               f"của lượt khám gần nhất ({records.clock(row['startDatetime'])}) trong phạm vi được phép đọc."))
    ctx.cache["current_encounter_note"] = note
    ctx.registry.note(note)
    return uuid


async def _current_encounter(ctx: ToolContext) -> str:
    if ctx.encounter_uuid:
        return ctx.encounter_uuid
    key = "current_encounter_selection"
    if key not in ctx.cache:
        ctx.cache[key] = asyncio.create_task(_read_current_encounter(ctx))
    return await ctx.cache[key]


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
            await _current_visit_row(ctx)
        return ctx.visit_uuid
    uuid, _ = ctx.registry.resolve(ref, "visit")
    return uuid


async def get_encounter_summary(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    ref = args["encounter_ref"]
    if ref.lower() == "current":
        encounter = await _current_encounter(ctx)
    else:
        encounter, _ = ctx.registry.resolve(ref, "encounter")
    rec = Recorder(ctx.registry)
    visit = records.clinical_summary(rec, await _summary(ctx, encounter), ctx.catalog, ctx.patient_uuid, encounter)
    if encounter == ctx.encounter_uuid and visit:
        if ctx.visit_uuid and ctx.visit_uuid != visit:
            raise ContextMismatch("visit không thuộc encounter đang mở")
        ctx.visit_uuid = visit
    if ref.lower() == "current" and (note := ctx.cache.get("current_encounter_note")):
        rec.note(note)
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
    records.vitals_history(rec, await backend.vitals(credentials, ctx.patient_uuid, visit), ctx.catalog, ctx.patient_uuid, VITALS_LIMIT, visit)
    return rec.output


async def get_active_allergies(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    rec = Recorder(ctx.registry)
    records.allergy_list(rec, await backend.allergies(credentials, ctx.patient_uuid), ctx.patient_uuid)
    if ctx.encounter_uuid:
        summary = await _summary(ctx, ctx.encounter_uuid)
        consultation = summary.get("consultation") or {}
        state = (consultation.get("values") or {}).get("allergy.trang_thai")
        if isinstance(state, str) and state in records.STATE_TEXT:
            rec.add("allergies", ctx.catalog.get("allergy.trang_thai").label, records.STATE_TEXT[state],
                    "recorded" if state in records.ANSWERED_STATES else state,
                    Source("consultation", (consultation.get("memberUuids") or {}).get("allergy.trang_thai"),
                           "allergy.trang_thai", None, summary.get("status"), ctx.encounter_uuid))
    return rec.output


async def list_diagnostic_orders(ctx: ToolContext, args: dict[str, Any]) -> ToolOutput:
    backend, credentials = _staff(ctx)
    visit = await _visit(ctx, args["visit_ref"])
    rec = Recorder(ctx.registry)
    records.service_orders(rec, await backend.service_orders(credentials, ctx.patient_uuid, visit), ctx.patient_uuid, ORDERS_LIMIT, visit)
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


VISIT_REF = ref_param("'current' cho lượt đã chọn (hoặc lượt gần nhất nếu chưa chọn), 'all' cho mọi lượt, hoặc mã V… do list_visits trả về.")

DOCTOR_TOOLS = [
    Tool(
        "get_encounter_summary",
        "Đọc một lần khám: lý do khám, bệnh sử, tiền sử và trạng thái khai thác, khám, chẩn đoán ICD-10, thuốc đã kê "
        "kèm trạng thái, dị ứng, sinh hiệu của lượt khám, lời dặn và hẹn tái khám. Dùng cho tóm tắt và hầu hết câu hỏi "
        "về lần khám đang mở. Chưa chọn phiếu: đọc phiếu khám bệnh gần nhất trong lượt đã chọn; "
        "chưa chọn lượt thì dùng lượt gần nhất được phép đọc. Không tự chuyển sang lượt cũ nếu lượt đó chưa có phiếu khám bệnh.",
        {"encounter_ref": ref_param("'current' cho phiếu đã chọn hoặc phiếu khám bệnh gần nhất trong ngữ cảnh, hoặc mã E… do list_visits trả về.")},
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
