"""Tiện ích văn bản dùng chung: bỏ dấu tiếng Việt, định dạng số và thời gian theo giờ phòng khám."""

from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    CLINIC_ZONE: Any = ZoneInfo("Asia/Ho_Chi_Minh")
except ZoneInfoNotFoundError:  # Windows không có tzdata; Việt Nam không dùng giờ mùa hè
    CLINIC_ZONE = timezone(timedelta(hours=7))


def fold(text: str) -> str:
    """Chữ thường, bỏ dấu, gộp khoảng trắng: dùng để so khớp từ khóa và mẫu guardrail."""
    text = text.lower().replace("đ", "d")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return " ".join(text.split())


def number(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def instant(value: Any) -> str | None:
    """ISO 8601 từ chuỗi ISO hoặc epoch mili-giây (cột jdbc trong một số danh sách của backend)."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return datetime.fromtimestamp(value / 1000, CLINIC_ZONE).isoformat()
    return str(value)


def clock(value: Any) -> str | None:
    value = instant(value)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(CLINIC_ZONE)
        return parsed.strftime("%H:%M %d/%m/%Y")
    except ValueError:
        return value


def day(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return value


def now_text() -> str:
    return datetime.now(CLINIC_ZONE).strftime("%H:%M %d/%m/%Y")
