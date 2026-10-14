"""Nguồn dữ liệu cho luồng bệnh nhân (P).

Backend chưa có đăng nhập bệnh nhân, liên kết tài khoản–hồ sơ hay API công bố hồ sơ, nên đây là **hợp đồng
đề xuất** (xem README, mục Luồng bệnh nhân). Có hai bản cài đặt:

- `DisabledPortal` (mặc định): mọi lời gọi trả 503, agent không đọc dữ liệu bệnh nhân.
- `FixturePortal`: đọc file JSON synthetic, chỉ để phát triển FE/agent trước khi backend có API thật.

Không dùng API nhân viên hay tài khoản dùng chung để đọc thay bệnh nhân. Bản cài đặt thật phải để backend xác
định bệnh nhân từ phiên đăng nhập và chỉ trả phần hồ sơ đã được công bố.
"""

from __future__ import annotations

import copy
import hmac
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .backend import BackendError


@dataclass(frozen=True)
class PatientSession:
    """Danh tính bệnh nhân do backend xác nhận; `patient_uuid` không bao giờ được gửi cho model."""

    patient_uuid: str
    authorization: str = field(repr=False)


class PatientPortal(Protocol):
    mode: str

    async def authenticate(self, authorization: str) -> PatientSession: ...

    async def visits(self, session: PatientSession) -> dict[str, Any]: ...

    async def visit_instructions(self, session: PatientSession, visit: str) -> dict[str, Any]: ...

    async def prescriptions(self, session: PatientSession, visit: str | None) -> dict[str, Any]: ...

    async def appointments(self, session: PatientSession) -> dict[str, Any]: ...


def _unavailable() -> BackendError:
    return BackendError(503, "patient_portal_unavailable", "Cổng bệnh nhân chưa được kết nối với backend.")


class DisabledPortal:
    mode = "disabled"

    async def authenticate(self, authorization: str) -> PatientSession:
        raise _unavailable()

    async def visits(self, session: PatientSession) -> dict[str, Any]:
        raise _unavailable()

    async def visit_instructions(self, session: PatientSession, visit: str) -> dict[str, Any]:
        raise _unavailable()

    async def prescriptions(self, session: PatientSession, visit: str | None) -> dict[str, Any]:
        raise _unavailable()

    async def appointments(self, session: PatientSession) -> dict[str, Any]:
        raise _unavailable()


class FixturePortal:
    """Dữ liệu synthetic theo hợp đồng đề xuất. Token là chuỗi Authorization đầy đủ, ví dụ `Bearer demo-…`."""

    mode = "fixture"

    def __init__(self, path: Path):
        data = json.loads(path.read_text(encoding="utf-8"))
        self._tokens: dict[str, str] = data["tokens"]
        self._patients: dict[str, dict[str, Any]] = data["patients"]

    async def authenticate(self, authorization: str) -> PatientSession:
        for token, patient in self._tokens.items():
            if hmac.compare_digest(token.encode(), (authorization or "").encode()):
                return PatientSession(patient, authorization)
        raise BackendError(401, "unauthenticated", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")

    def _record(self, session: PatientSession) -> dict[str, Any]:
        return copy.deepcopy(self._patients[session.patient_uuid])

    async def visits(self, session: PatientSession) -> dict[str, Any]:
        return {"results": self._record(session)["visits"]}

    async def visit_instructions(self, session: PatientSession, visit: str) -> dict[str, Any]:
        instructions = self._record(session)["instructions"]
        if visit not in instructions:
            raise BackendError(404, "not_found", "Không tìm thấy lời dặn đã công bố cho lần khám này.")
        return instructions[visit]

    async def prescriptions(self, session: PatientSession, visit: str | None) -> dict[str, Any]:
        items = self._record(session)["prescriptions"]
        return {"results": [i for i in items if visit is None or i.get("visitUuid") == visit]}

    async def appointments(self, session: PatientSession) -> dict[str, Any]:
        return {"results": self._record(session)["appointments"]}


def make_portal(mode: str, fixture: Path) -> PatientPortal:
    return FixturePortal(fixture) if mode == "fixture" else DisabledPortal()
