"""Bounded timelines and deterministic comparisons; no clinical severity judgments."""
from __future__ import annotations
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import re

from . import Tool, ToolError
from .doctor import _current_encounter, _staff, _summary
from .patient import _portal
from .. import records
from ..facts import ContextMismatch, PRESENT_STATES, Recorder, Source
from ..backend import BackendError, require_uuid

MAX_ENCOUNTERS = 4
MAX_VISITS = 8
NUMERIC = re.compile(r"^([+-]?\d+(?:[.,]\d+)?)\s+([^(;]+?)(?:\s*\(|;|$)")


def at(value):
    try:
        time = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if time.tzinfo is None:
            raise ValueError()
        return time.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def sorted_visits(payload, patient):
    items = payload.get("results") or []
    for item in items:
        if str(item.get("patientUuid") or "").lower() != patient:
            raise ContextMismatch("Timeline thuộc bệnh nhân khác")
    return sorted(items, key=lambda v: at(v.get("startDatetime")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)


async def get_patient_timeline(ctx, args):
    backend, credential = _staff(ctx)
    payload = await backend.visits(credential, ctx.patient_uuid, MAX_VISITS)
    visits = sorted_visits(payload, ctx.patient_uuid)
    rec = Recorder(ctx.registry)
    records.visit_list(rec, {**payload, "results": visits}, ctx.patient_uuid)
    encounters = [(v, e) for v in visits for e in sorted(v.get("encounters") or [],
                  key=lambda e: at(e.get("encounterDatetime")) or datetime.min.replace(tzinfo=timezone.utc))
                  if (e.get("encounterType") or {}).get("key") != "vitals"]
    # Older visits are still listed; only the latest bounded subset is read in detail.
    for v, e in encounters[:MAX_ENCOUNTERS]:
        key = require_uuid(e.get("encounterUuid") or e.get("uuid"), "timeline encounter")
        try:
            summary = await _summary(ctx, key)
            if summary.get("visitUuid") != (v.get("visitUuid") or v.get("uuid")):
                raise ContextMismatch("Phiếu timeline không thuộc lượt khám")
            records.clinical_summary(rec, summary, ctx.catalog, ctx.patient_uuid, key)
        except BackendError as ex:
            if ex.status == 401:
                raise
            ctx.read_errors.append(ex.code)
            rec.gap("visits", "Chi tiết một lần khám", ex.code, ex.message)
    if len(encounters) > MAX_ENCOUNTERS or payload.get("hasMore"):
        rec.note(f"Timeline có giới hạn: đọc chi tiết tối đa {MAX_ENCOUNTERS} phiếu trong {MAX_VISITS} lượt gần nhất; còn nguồn cũ hơn.")
    rec.note("Timeline giữ trạng thái và thời điểm của nguồn; không suy dữ liệu thiếu thành bình thường.")
    rec.note("Phiếu sinh hiệu được liệt kê trong lượt khám; chi tiết sinh hiệu lấy qua summary của lượt, không gọi clinical-summary cho riêng phiếu điều dưỡng.")
    return rec.output


def delta(old, new):
    a, b = NUMERIC.match(old), NUMERIC.match(new)
    if not a or not b or a.group(2).strip() != b.group(2).strip():
        return None
    try:
        difference = Decimal(b.group(1).replace(",", ".")) - Decimal(a.group(1).replace(",", "."))
        if not difference.is_finite():
            return None
        number = format(difference, "f")
        if "." in number:
            number = number.rstrip("0").rstrip(".")
        return f"chênh lệch {'+' if difference > 0 else ''}{number} {b.group(2).strip()}"
    except InvalidOperation:
        return None


def key_of(fact):
    return (fact.section, fact.source.field or fact.label)


async def compare_previous_visit(ctx, args):
    backend, credential = _staff(ctx)
    await _current_encounter(ctx)
    current = await _summary(ctx, ctx.encounter_uuid)
    rec = Recorder(ctx.registry)
    records.clinical_summary(rec, current, ctx.catalog, ctx.patient_uuid, ctx.encounter_uuid)
    current_facts = list(rec.output.facts)
    current_time = at(current.get("encounterDatetime"))
    if current_time is None:
        raise ToolError("Phiếu hiện tại thiếu thời điểm có múi giờ; chưa xác định được lần trước.")
    visits = sorted_visits(await backend.visits(credential, ctx.patient_uuid, MAX_VISITS), ctx.patient_uuid)
    candidates = [(v, e) for v in visits if (v.get("uuid") or v.get("visitUuid")) != current.get("visitUuid")
                  for e in v.get("encounters") or [] if at(e.get("encounterDatetime")) is not None
                  and (e.get("encounterType") or {}).get("key") != "vitals"
                  and at(e.get("encounterDatetime")) < current_time]
    if not candidates:
        rec.output.facts.clear()  # comparison-only tool does not turn a missing prior visit into a summary
        rec.gap("comparison", "Lần khám trước", "no_previous_visit", "Chưa có phiếu của lượt khám trước trong phạm vi được phép đọc.",
                Source("visit", None, None, None, None))
        return rec.output
    v, encounter = max(candidates, key=lambda pair: at(pair[1]["encounterDatetime"]))
    previous_id = require_uuid(encounter.get("encounterUuid") or encounter.get("uuid"), "previous encounter")
    prior = await _summary(ctx, previous_id)
    if prior.get("visitUuid") != (v.get("uuid") or v.get("visitUuid")):
        raise ContextMismatch("Phiếu lần trước không thuộc lượt khám")
    previous_rec = Recorder(ctx.registry)
    records.clinical_summary(previous_rec, prior, ctx.catalog, ctx.patient_uuid, previous_id)
    previous = defaultdict(list)
    now = defaultdict(list)
    for f in previous_rec.output.facts:
        previous[key_of(f)].append(f)
    for f in current_facts:
        now[key_of(f)].append(f)
    rec.output.facts.clear()
    for key in sorted(set(previous) | set(now)):
        # Repeated rows require an explicit row identity; don't compare arbitrary array positions.
        if len(previous[key]) != 1 or len(now[key]) != 1:
            label = (now[key] or previous[key])[0].label
            rec.gap("comparison", label, "unmatched_comparison", "Thiếu nguồn đối ứng hoặc có nhiều hàng; chưa đủ mã hàng để ghép chắc chắn.")
            continue
        old, new = previous[key][0], now[key][0]
        if old.section == "patient":
            continue
        detail = f"{records.clock(prior.get('encounterDatetime'))}: {old.value}; {records.clock(current.get('encounterDatetime'))}: {new.value}"
        if old.state not in PRESENT_STATES or new.state not in PRESENT_STATES:
            detail += "; thiếu dữ liệu để kết luận thay đổi"
        else:
            numerical = delta(old.value, new.value) if old.section == "vitals" else None
            detail += "; " + (numerical or ("giữ nguyên nội dung" if old.value == new.value else "nội dung nguồn khác nhau"))
        f = ctx.registry.add("comparison", new.label, detail, "recorded", new.source, (old.id, new.id))
        rec.output.facts.append(f)
    for note in previous_rec.output.notes:
        rec.note(note)
    rec.note("So sánh mô tả dữ liệu đã ghi, không kết luận cải thiện/xấu đi; thuốc và dị ứng có thể phản ánh trạng thái lúc đọc, không phải snapshot lịch sử.")
    return rec.output


async def get_my_timeline(ctx, args):
    portal, session = _portal(ctx)
    payload = await portal.visits(session)
    if payload.get("patientUuid") and payload["patientUuid"] != ctx.patient_uuid:
        raise ContextMismatch("Timeline công bố thuộc người khác")
    items = sorted(payload.get("results") or [], key=lambda v: at(v.get("startDatetime")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    rec = Recorder(ctx.registry)
    records.portal_visits(rec, {**payload, "results": items[:MAX_ENCOUNTERS]})
    for item in items[:MAX_ENCOUNTERS]:
        visit = item["uuid"]
        records.portal_instructions(rec, await portal.visit_instructions(session, visit), visit)
        records.portal_prescriptions(rec, await portal.prescriptions(session, visit))
    if len(items) > MAX_ENCOUNTERS or payload.get("hasMore"):
        rec.note(f"Chỉ đọc tối đa {MAX_ENCOUNTERS} lượt đã công bố gần nhất.")
    rec.note("Timeline bệnh nhân chỉ gồm dữ liệu đã công bố; không đọc phiếu nội bộ hoặc bản công bố bị thu hồi.")
    return rec.output


DOCTOR_ADVANCED_TOOLS = (
    Tool("get_patient_timeline", "Đọc timeline các lượt khám gần nhất và chi tiết có giới hạn, giữ thời gian, trạng thái, nguồn. Không suy diễn chẩn đoán mới.", {}, get_patient_timeline),
    Tool("compare_previous_visit", "So sánh phiếu đang mở với phiếu gần nhất của một lượt trước. Chênh lệch sinh hiệu chỉ tính nếu cùng đơn vị; giữ hai nguồn và không kết luận mức độ bệnh.", {}, compare_previous_visit),
)
PATIENT_ADVANCED_TOOLS = (
    Tool("get_my_timeline", "Đọc timeline các lượt đã công bố của chính tài khoản, kèm lời dặn và đơn đã xác nhận; không đọc phiếu nội bộ.", {}, get_my_timeline),
)
