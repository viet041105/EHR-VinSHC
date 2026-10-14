"""Chuyển payload của backend thành dữ kiện có nguồn.

Quy tắc chung: mọi bản ghi phải thuộc đúng bệnh nhân của ngữ cảnh (nếu không → ContextMismatch, dừng lượt
hỏi); trạng thái thiếu giữ nguyên ý nghĩa; không ghi tên, điện thoại, CCCD, địa chỉ vào dữ kiện.
"""

from __future__ import annotations

from typing import Any

from .facts import ContextMismatch, Recorder, Source
from .fields import FieldCatalog
from .text import clock, day, instant, number

CONSULTATION_LAYOUT = {
    "visit.ly_do_kham": "reason",
    "history.benh_su": "reason",
    "exam.trieu_chung": "reason",
    "history.tien_su_ban_than_trang_thai": "history",
    "history.tien_su_ban_than": "history",
    "history.tien_su_gia_dinh_trang_thai": "history",
    "history.tien_su_gia_dinh": "history",
    "exam.toan_than": "exam",
    "exam.bo_phan": "exam",
    "exam.tom_tat": "exam",
    "allergy.trang_thai": "allergies",
    "exam.huong_dieu_tri": "plan",
    "exam.loi_dan": "plan",
    "followup.ngay_tai_kham": "plan",
    "followup.loi_dan": "plan",
}
# Trường nên có trong phiếu đã lưu; thiếu thì báo "phiếu chưa ghi", không suy ra kết luận lâm sàng.
EXPECTED_FIELDS = (
    "visit.ly_do_kham",
    "history.benh_su",
    "exam.tom_tat",
    "allergy.trang_thai",
    "exam.huong_dieu_tri",
    "exam.loi_dan",
)
# Cùng nhãn với FE (infra/frontend/connected-actions.js).
STATE_TEXT = {
    "not_asked": "Chưa khai thác",
    "unknown": "Không rõ",
    "no_known_allergy": "Không ghi nhận dị ứng",
    "present": "Có ghi nhận",
    "none_reported": "Không ghi nhận",
    "refused": "Từ chối",
    "not_applicable": "Không áp dụng",
    "not_recorded": "Chưa ghi",
    "unreadable": "Không đọc được",
    "masked": "Đã che",
}
ANSWERED_STATES = {"present", "none_reported", "no_known_allergy"}
ORDER_STATUS = {"active": "đang hiệu lực", "discontinued": "đã ngừng", "expired": "hết hiệu lực", "voided": "đã hủy"}
CERTAINTY = {"confirmed": "xác định", "provisional": "tạm thời"}
RANK = {"primary": "Chẩn đoán chính", "secondary": "Chẩn đoán kèm theo"}
ALLERGEN_TYPE = {"DRUG": "thuốc", "FOOD": "thực phẩm", "ENVIRONMENT": "môi trường", "OTHER": "khác"}
CORRECTION_EVENTS = {
    "consultation_corrected",
    "diagnosis_replaced",
    "diagnosis_voided",
    "allergy_voided",
    "drug_order_discontinued",
}
VISIT_STATUS = {"open": "đang mở", "closed": "đã kết thúc"}
VISIT_CLOSE = {"completed": "hoàn tất", "left_early": "người bệnh về sớm", "cancelled": "đã hủy", "referred": "chuyển cơ sở khác"}
ENCOUNTER_TYPE = {"consultation": "khám bệnh", "vitals": "sinh hiệu", "administrative": "hành chính"}
SERVICE_ORDER_STATE = {
    "requested": "đã chỉ định",
    "assigned": "đã phân công",
    "in_progress": "đang thực hiện",
    "completed": "hoàn tất",
    "cancelled": "đã hủy",
    "entered-in-error": "nhập nhầm",
}
RESULT_STATE = {
    "draft": "nháp",
    "preliminary": "sơ bộ",
    "final": "chính thức",
    "corrected": "đã đính chính",
    "entered-in-error": "nhập nhầm",
}
APPOINTMENT_STATUS = {
    "booked": "đã đặt",
    "confirmed": "đã xác nhận",
    "arrived": "đã đến",
    "fulfilled": "đã khám",
    "cancelled": "đã hủy",
    "no_show": "không đến",
}
GENDER = {"M": "Nam", "F": "Nữ", "O": "Khác", "U": "Không rõ"}
PORTAL_PRESCRIPTION_STATUS = {
    "active": "đang dùng theo đơn",
    "discontinued": "bác sĩ đã ngừng",
    "expired": "đã hết thời gian dùng",
}


def display(ref: Any) -> str | None:
    return ref.get("display") if isinstance(ref, dict) else None


def _owned(record: dict[str, Any], patient: str, key: str = "patientUuid") -> None:
    value = record.get(key)
    if value is not None and str(value).lower() != patient:
        raise ContextMismatch("bản ghi thuộc bệnh nhân khác")


def _join(*parts: str | None) -> str:
    return "; ".join(p for p in parts if p)


# ---------------------------------------------------------------- staff API (luồng bác sĩ)


def clinical_summary(
    rec: Recorder, summary: dict[str, Any], catalog: FieldCatalog, patient: str, encounter: str
) -> str | None:
    """Ghi dữ kiện của một encounter; trả về UUID lượt khám (visit) của encounter đó."""
    if str(summary.get("encounterUuid") or "").lower() != encounter or str(summary.get("patientUuid") or "").lower() != patient:
        raise ContextMismatch("clinical-summary không thuộc encounter/bệnh nhân đã yêu cầu")
    visit = str(summary["visitUuid"]).lower() if summary.get("visitUuid") else None
    consultation = summary.get("consultation") or {}
    for record in ([consultation] if consultation else []) + (summary.get("diagnoses") or []) + (summary.get("drugOrders") or []):
        _owned(record, patient)
        _owned(record, encounter, "encounterUuid")
    allergy_payload = summary.get("allergies") or {}
    allergies = allergy_payload.get("allergies", []) if isinstance(allergy_payload, dict) else allergy_payload
    if isinstance(allergy_payload, dict):
        _owned(allergy_payload, patient)
    for record in allergies:
        _owned(record, patient)
    for record in summary.get("vitals") or []:
        _owned(record, patient)
        if visit and record.get("visitUuid") and str(record["visitUuid"]).lower() != visit:
            raise ContextMismatch("sinh hiệu thuộc lượt khám khác")

    status = summary.get("status") or "draft"
    rec.add(
        "visits",
        "Lần khám",
        _join(clock(summary.get("encounterDatetime")), "phiếu đã chốt" if status == "final" else "phiếu là bản nháp, chưa chốt"),
        "recorded",
        Source("encounter", encounter, None, summary.get("encounterDatetime"), status),
    )
    _consultation(rec, summary.get("consultation"), status, catalog)
    groups = summary.get("vitals") or []
    if groups:
        for group in groups:
            _vital_group(rec, group, catalog)
        rec.note("Sinh hiệu trong tóm tắt lần khám lấy từ toàn bộ lượt khám (visit); nhóm đo đã hủy không hiển thị.")
    else:
        rec.gap("vitals", "Sinh hiệu", "none_in_source", "Nguồn đang đọc không có nhóm sinh hiệu nào cho lượt khám này.")
    diagnoses = [d for d in summary.get("diagnoses") or [] if not d.get("voided")]
    if not diagnoses:
        rec.gap("diagnoses", "Chẩn đoán", "none_in_source", "Chưa có chẩn đoán nào được ghi cho lần khám này.")
    for dx in diagnoses:
        _diagnosis(rec, dx)
    orders = summary.get("drugOrders") or []
    if not orders:
        rec.gap("medications", "Thuốc", "none_in_source", "Lần khám này không có dòng thuốc nào trong dữ liệu trả về.")
    for order in orders:
        _drug_order(rec, order)
    for allergy in allergies:
        _allergy(rec, allergy)
    if summary.get("allergies") or orders:
        rec.note("Danh sách dị ứng và trạng thái thuốc phản ánh thời điểm đọc, không phải ảnh chụp tại ngày khám.")
    corrections = sum(1 for e in summary.get("events") or [] if e.get("type") in CORRECTION_EVENTS)
    if corrections:
        rec.note(f"Lần khám có {corrections} thao tác sửa/thay thế/hủy; dữ kiện chỉ gồm phiên bản hiện hành.")
    return visit


def _consultation(rec: Recorder, consultation: dict[str, Any] | None, status: str, catalog: FieldCatalog) -> None:
    if not consultation:
        rec.gap("reason", "Phiếu khám", "no_consultation", "Lần khám này chưa có phiếu khám được lưu.")
        return
    values: dict[str, Any] = consultation.get("values") or {}
    members: dict[str, str] = consultation.get("memberUuids") or {}
    ordered = [code for code in CONSULTATION_LAYOUT if code in values]
    ordered += sorted(code for code in values if code not in CONSULTATION_LAYOUT)
    for code in ordered:
        raw = values[code]
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            continue
        meta = catalog.get(code)
        source = Source("consultation", members.get(code), code, None, status, consultation.get("encounterUuid"))
        section = CONSULTATION_LAYOUT.get(code, "other")
        if meta.type == "coded" and isinstance(raw, str) and raw in STATE_TEXT:
            state = "recorded" if raw in ANSWERED_STATES else raw
            rec.add(section, meta.label, STATE_TEXT[raw], state, source)
        elif meta.type == "date":
            rec.add(section, meta.label, day(str(raw)) or str(raw), "recorded", source)
        else:
            rec.add(section, meta.label, str(raw).strip(), "recorded", source)
    for code in EXPECTED_FIELDS:
        if values.get(code) in (None, ""):
            rec.gap(CONSULTATION_LAYOUT[code], catalog.get(code).label, "not_in_form", "Phiếu khám chưa ghi mục này.")


def _vital_group(rec: Recorder, group: dict[str, Any], catalog: FieldCatalog) -> None:
    if group.get("voided"):
        return
    measured = group.get("measuredAt")
    when = clock(measured)
    status = "needs_verification" if group.get("needsVerification") else "recorded"
    verify = " — cần xác minh" if status == "needs_verification" else ""
    values: dict[str, Any] = group.get("values") or {}
    states: dict[str, str] = group.get("states") or {}
    for code in list(values) + [c for c in states if c not in values]:
        meta = catalog.get(code)
        source = Source("vitals", group.get("uuid"), code, measured, status, group.get("encounterUuid"), group.get("visitUuid"))
        if code in values and values[code] is not None:
            unit = f" {meta.unit_display}" if meta.unit_display else ""
            at = f" (đo lúc {when})" if when else ""
            rec.add("vitals", meta.label, f"{number(values[code])}{unit}{at}{verify}", status, source)
        else:
            state = states[code]
            at = f" (nhóm đo lúc {when})" if when else ""
            rec.add("vitals", meta.label, f"{STATE_TEXT.get(state, state)}{at}", state, source)


def _diagnosis(rec: Recorder, dx: dict[str, Any]) -> None:
    name = display(dx.get("concept")) or "Chẩn đoán không có tên hiển thị"
    code = f" ({dx['code']})" if dx.get("code") else ""
    certainty = CERTAINTY.get(dx.get("certainty") or "", dx.get("certainty") or "chưa ghi mức độ chắc chắn")
    status = "/".join(str(x) for x in (dx.get("rank"), dx.get("certainty")) if x) or None
    source = Source("diagnosis", dx.get("uuid"), "diagnosis", dx.get("dateCreated"), status, dx.get("encounterUuid"))
    rec.add("diagnoses", RANK.get(dx.get("rank") or "", "Chẩn đoán"), f"{name}{code} — {certainty}", "recorded", source)


def _drug_order(rec: Recorder, order: dict[str, Any]) -> None:
    drug = order.get("drug") or {}
    name = " ".join(x for x in (drug.get("name"), drug.get("strength")) if x) or "Thuốc không có tên"
    parts = []
    if order.get("dose") is not None:
        parts.append(" ".join(x for x in (number(order["dose"]), display(order.get("doseUnits"))) if x))
    for ref in (order.get("route"), order.get("frequency")):
        if display(ref):
            parts.append(display(ref))
    if order.get("duration") is not None:
        parts.append("trong " + " ".join(x for x in (number(order["duration"]), display(order.get("durationUnits"))) if x))
    if order.get("quantity") is not None:
        parts.append("tổng " + " ".join(x for x in (number(order["quantity"]), display(order.get("quantityUnits"))) if x))
    if order.get("asNeeded"):
        parts.append("khi cần" + (f" ({order['asNeededCondition']})" if order.get("asNeededCondition") else ""))
    if order.get("dosingInstructions"):
        parts.append(f"hướng dẫn: {order['dosingInstructions']}")
    status = order.get("status") or "active"
    parts.append(f"trạng thái lúc đọc: {ORDER_STATUS.get(status, status)}")
    source = Source("drug_order", order.get("uuid"), "drug_order", order.get("dateActivated"), status, order.get("encounterUuid"))
    rec.add("medications", name, "; ".join(parts), "recorded", source)


def _allergy(rec: Recorder, allergy: dict[str, Any]) -> None:
    if allergy.get("voided"):
        return
    allergen = allergy.get("allergen") or {}
    name = display(allergen.get("concept")) or allergen.get("nonCoded") or "Tác nhân không rõ tên"
    kind = allergy.get("allergenType") or ""
    parts = [f"loại {ALLERGEN_TYPE.get(kind, kind or 'chưa ghi')}"]
    if display(allergy.get("severity")):
        parts.append(f"mức độ {display(allergy['severity'])}")
    reactions = [display(r.get("concept")) or r.get("nonCoded") for r in allergy.get("reactions") or []]
    if any(reactions):
        parts.append("phản ứng: " + ", ".join(r for r in reactions if r))
    if allergy.get("comment"):
        parts.append(f"ghi chú: {allergy['comment']}")
    rec.add("allergies", f"Dị ứng {name}", "; ".join(parts), "recorded", Source("allergy", allergy.get("uuid"), "allergy", None, "active"))


def vitals_history(rec: Recorder, payload: dict[str, Any], catalog: FieldCatalog, patient: str, limit: int) -> None:
    _owned(payload, patient)
    groups = [g for g in payload.get("results") or [] if not g.get("voided")]
    for group in groups:
        _owned(group, patient)
    if not groups:
        rec.gap("vitals", "Sinh hiệu", "none_in_source", "Không có nhóm sinh hiệu nào trong phạm vi đọc.")
        return
    for group in groups[:limit]:
        _vital_group(rec, group, catalog)
    if len(groups) > limit:
        rec.note(f"Chỉ hiển thị {limit} nhóm sinh hiệu gần nhất trong {len(groups)} nhóm.")


def allergy_list(rec: Recorder, payload: dict[str, Any], patient: str) -> None:
    _owned(payload, patient)
    active = [a for a in payload.get("allergies") or [] if not a.get("voided")]
    for allergy in active:
        _owned(allergy, patient)
        _allergy(rec, allergy)
    if not active:
        rec.gap(
            "allergies",
            "Danh sách dị ứng",
            "none_in_source",
            "Danh sách dị ứng đang hoạt động trống; điều này không thay cho trạng thái sàng lọc dị ứng trong phiếu khám.",
        )
    rec.note("Danh sách dị ứng phản ánh thời điểm đọc.")


def visit_list(rec: Recorder, payload: dict[str, Any], patient: str) -> None:
    visits = payload.get("results") or []
    if not visits:
        rec.gap("visits", "Các lượt khám", "none_in_source", "Không có lượt khám nào trong phạm vi cơ sở đang chọn.")
        return
    for visit in visits:
        _owned(visit, patient)
        visit_uuid = visit.get("visitUuid") or visit.get("uuid")
        start = visit.get("startDatetime")
        vref = rec.ref("visit", visit_uuid, start=clock(start), status=VISIT_STATUS.get(visit.get("status") or ""))
        encounters = []
        for encounter in visit.get("encounters") or []:
            _owned(encounter, patient)
            key = (encounter.get("encounterType") or {}).get("key") or ""
            # Mã E… chỉ nằm trong references để model gọi tool; nhãn/giá trị hiển thị không chứa mã.
            rec.ref(
                "encounter",
                encounter.get("encounterUuid") or encounter.get("uuid"),
                visit=vref,
                type=ENCOUNTER_TYPE.get(key, key or None),
                at=clock(encounter.get("encounterDatetime")),
            )
            encounters.append(f"{ENCOUNTER_TYPE.get(key, key or 'encounter')} lúc {clock(encounter.get('encounterDatetime'))}")
        close = visit.get("closeReason")
        value = _join(
            (visit.get("visitType") or {}).get("name"),
            VISIT_STATUS.get(visit.get("status") or "", visit.get("status")),
            f"kết thúc: {VISIT_CLOSE.get(close, close)}" if close else None,
            f"ghi chú kết thúc: {visit['closeNote']}" if visit.get("closeNote") else None,
            ("gồm " + ", ".join(encounters)) if encounters else "chưa có encounter",
        )
        rec.add("visits", f"Lượt khám {clock(start)}", value, "recorded",
                Source("visit", visit_uuid, None, start, visit.get("status")))
    if payload.get("hasMore"):
        rec.note("Còn lượt khám cũ hơn chưa được liệt kê.")


def service_orders(rec: Recorder, payload: dict[str, Any], patient: str, limit: int) -> None:
    orders = payload.get("results") or []
    if not orders:
        rec.gap("results", "Chỉ định cận lâm sàng", "none_in_source", "Không có chỉ định cận lâm sàng nào trong phạm vi đọc.")
        return
    for order in orders[-limit:]:
        _owned(order, patient)
        name = order.get("serviceName") or order.get("serviceCode") or "Dịch vụ không rõ tên"
        state = order.get("state") or ""
        results = sorted(order.get("results") or [], key=lambda r: r.get("version_number") or 0)
        if results:
            latest = results[-1]
            result_state = RESULT_STATE.get(latest.get("state") or "", latest.get("state"))
            rec.ref("result", latest["result_uuid"], service=name, state=result_state)
            result_text = f"kết quả mới nhất: phiên bản {latest.get('version_number')}, {result_state}"
        else:
            result_text = "chưa có kết quả"
        value = _join(
            f"trạng thái {SERVICE_ORDER_STATE.get(state, state)}",
            f"lý do: {order['stateReason']}" if order.get("stateReason") else None,
            f"chỉ định lúc {clock(order.get('createdAt'))}" if order.get("createdAt") else None,
            result_text,
        )
        label = f"{name} ({order['serviceCode']})" if order.get("serviceCode") and order.get("serviceName") else name
        rec.add("results", label, value, "recorded",
                Source("service_order", order.get("uuid"), order.get("serviceCode"), instant(order.get("createdAt")), state))
    if len(orders) > limit:
        rec.note(f"Chỉ hiển thị {limit} chỉ định gần nhất trong {len(orders)} chỉ định.")


def diagnostic_result(rec: Recorder, payload: dict[str, Any], patient: str, meta: dict[str, Any]) -> None:
    _owned(payload, patient)
    service = meta.get("service") or "cận lâm sàng"
    state = payload.get("state") or ""
    if payload.get("numericValue") is not None:
        measured = " ".join(x for x in (number(payload["numericValue"]), payload.get("unit")) if x)
    else:
        measured = payload.get("textValue") or "không có giá trị"
    attachments = payload.get("attachments") or []
    value = _join(
        measured,
        f"trạng thái {RESULT_STATE.get(state, state)}",
        f"phiên bản {payload.get('version')}" if payload.get("version") is not None else None,
        f"ghi lúc {clock(payload.get('recordedAt'))}" if payload.get("recordedAt") else None,
        f"duyệt lúc {clock(payload.get('reviewedAt'))}" if payload.get("reviewedAt") else "chưa duyệt",
        f"lý do đính chính: {payload['correctionReason']}" if payload.get("correctionReason") else None,
        f"{len(attachments)} tệp đính kèm" if attachments else None,
    )
    rec.add("results", f"Kết quả {service}", value, "recorded",
            Source("result", payload.get("uuid"), None, payload.get("recordedAt"), state))
    if state in ("draft", "preliminary"):
        rec.note(f"Kết quả {service} chưa chính thức ({RESULT_STATE[state]}).")


def appointments(rec: Recorder, payload: dict[str, Any], patient: str, limit: int) -> None:
    items = payload.get("results") or []
    if not items:
        rec.gap("appointments", "Lịch hẹn", "none_in_source", "Không có lịch hẹn nào trong phạm vi cơ sở đang chọn.")
        return
    for item in items[-limit:]:
        _owned(item, patient)
        status = item.get("status") or ""
        value = _join(
            item.get("serviceName") or item.get("appointmentType"),
            f"bác sĩ {item['providerName']}" if item.get("providerName") else None,
            f"trạng thái {APPOINTMENT_STATUS.get(status, status)}",
            f"ghi chú: {item['note']}" if item.get("note") else None,
        )
        rec.add("appointments", f"Lịch hẹn {clock(item.get('startAt'))}", value, "recorded",
                Source("appointment", item.get("uuid"), None, item.get("startAt"), status))
    if payload.get("hasMore") or len(items) > limit:
        rec.note("Còn lịch hẹn khác chưa được liệt kê.")


def demographics(rec: Recorder, payload: dict[str, Any], patient: str) -> None:
    if str(payload.get("uuid") or payload.get("patientUuid") or "").lower() != patient:
        raise ContextMismatch("hồ sơ hành chính thuộc bệnh nhân khác")
    source = Source("patient", patient, None, None, None)
    gender = payload.get("gender")
    rec.add("patient", "Giới tính", GENDER.get(gender, "Chưa ghi"), "recorded" if gender in GENDER else "not_recorded", source)
    if payload.get("age") is not None:
        estimated = " (ngày sinh ước tính)" if payload.get("birthdateEstimated") else ""
        rec.add("patient", "Tuổi", f"{payload['age']}{estimated}", "recorded", source)
    elif payload.get("birthYear"):
        rec.add("patient", "Năm sinh", str(payload["birthYear"]), "recorded", source)
    else:
        rec.add("patient", "Tuổi", "Chưa ghi", "not_recorded", source)


# ---------------------------------------------------------------- cổng bệnh nhân (luồng P, hợp đồng đề xuất)


def portal_visits(rec: Recorder, payload: dict[str, Any]) -> None:
    visits = payload.get("results") or []
    if not visits:
        rec.gap("visits", "Các lần khám", "none_in_source", "Chưa có lần khám nào được phòng khám công bố cho bạn.")
        return
    for visit in visits:
        start = visit.get("startDatetime")
        rec.ref("visit", visit["uuid"], start=clock(start))
        rec.add("visits", f"Lần khám {day(start)}", _join(visit.get("facilityName"), visit.get("serviceName")),
                "recorded", Source("visit", visit["uuid"], None, start, "published"))


def portal_instructions(rec: Recorder, payload: dict[str, Any], visit: str) -> None:
    if str(payload.get("visitUuid") or "").lower() != visit:
        raise ContextMismatch("lời dặn thuộc lần khám khác")
    items = [i for i in payload.get("items") or [] if (i.get("text") or "").strip()]
    if not items:
        rec.gap("plan", "Lời dặn", "none_in_source", "Lần khám này chưa có lời dặn được công bố.")
        return
    for item in items:
        value = item["text"].strip()
        if item.get("field") == "followup.ngay_tai_kham":
            value = day(value) or value
        rec.add("plan", item.get("label") or "Lời dặn", value, "recorded",
                Source("published_instruction", payload.get("visitUuid"), item.get("field"), payload.get("publishedAt"), "published"))


def portal_prescriptions(rec: Recorder, payload: dict[str, Any]) -> None:
    items = payload.get("results") or []
    if not items:
        rec.gap("medications", "Đơn thuốc", "none_in_source", "Chưa có đơn thuốc đã xác nhận nào được công bố cho bạn.")
        return
    for item in items:
        status = item.get("status") or "active"
        parts = [
            f"mỗi lần {item['dose']}" if item.get("dose") else None,
            item.get("frequency"),
            item.get("route"),
            f"trong {item['duration']}" if item.get("duration") else None,
            f"hướng dẫn: {item['instructions']}" if item.get("instructions") else "đơn không ghi hướng dẫn thêm",
            f"trạng thái: {PORTAL_PRESCRIPTION_STATUS.get(status, status)}",
        ]
        name = " ".join(x for x in (item.get("drugName"), item.get("strength")) if x) or "Thuốc"
        rec.add("medications", name, _join(*parts), "recorded",
                Source("published_prescription", item.get("uuid"), None, item.get("confirmedAt"), status))


def portal_appointments(rec: Recorder, payload: dict[str, Any]) -> None:
    items = payload.get("results") or []
    if not items:
        rec.gap("appointments", "Lịch hẹn", "none_in_source", "Bạn chưa có lịch hẹn nào được ghi nhận.")
        return
    for item in items:
        status = item.get("status") or ""
        rec.add("appointments", f"Lịch hẹn {clock(item.get('startAt'))}",
                _join(item.get("serviceName"), f"trạng thái {APPOINTMENT_STATUS.get(status, status)}"), "recorded",
                Source("appointment", item.get("uuid"), None, item.get("startAt"), status))
