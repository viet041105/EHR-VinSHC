"""Client chỉ đọc tới adapter VinSHC, dùng credential và workspace của chính người đang hỏi.

Agent không có tài khoản riêng: mỗi request chuyển tiếp `Authorization` và hai header workspace mà FE gửi,
để backend kiểm quyền và ghi audit như khi người dùng tự mở hồ sơ. Credential chỉ nằm ở tầng HTTP này,
không đi vào state của graph, prompt hay log. Mọi đường dẫn được liệt kê cố định trong lớp này; tool không
truyền URL hay tham số tùy ý.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


class BackendError(Exception):
    """Lỗi đã chuẩn hóa để trả cho FE; `message` không chứa nội dung bệnh án."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Credentials:
    authorization: str = field(repr=False)
    role: str
    facility: str

    def headers(self) -> dict[str, str]:
        return {
            "Authorization": self.authorization,
            "X-VinSHC-Workspace-Role": self.role,
            "X-VinSHC-Workspace-Facility": self.facility,
            "X-VinSHC-Request-Origin": "agent",
        }


def require_uuid(value: str | None, name: str) -> str:
    if not UUID_PATTERN.match(value or ""):
        raise BackendError(400, "invalid_uuid", f"{name} không phải UUID hợp lệ.")
    return str(value).lower()


class ClinicalDataProvider(Protocol):
    """Dữ liệu chuẩn hóa mà tool cần; API/DB/xác thực cụ thể thuộc lớp adapter.

    Đây là interface nội bộ của agent, không buộc BE mới giữ URL hoặc schema OpenMRS.
    Mỗi lần đọc phải kiểm tra quyền bằng danh tính của người hỏi.
    """

    async def workspace(self, credentials: Credentials) -> dict[str, Any]: ...
    async def clinical_summary(self, credentials: Credentials, encounter: str) -> dict[str, Any]: ...
    async def patient(self, credentials: Credentials, patient: str) -> dict[str, Any]: ...
    async def visits(self, credentials: Credentials, patient: str, limit: int) -> dict[str, Any]: ...
    async def vitals(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]: ...
    async def allergies(self, credentials: Credentials, patient: str) -> dict[str, Any]: ...
    async def service_orders(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]: ...
    async def result(self, credentials: Credentials, result: str) -> dict[str, Any]: ...
    async def appointments(self, credentials: Credentials, patient: str) -> dict[str, Any]: ...


class DoctorContextAuthorizer(Protocol):
    """Optional server check before the model runs, supplied by a mock or a new BE adapter."""

    async def validate_doctor_context(self, credentials: Credentials, patient: str, encounter: str, visit: str | None) -> dict[str, Any] | None: ...


class VinshcBackend:
    def __init__(self, client: httpx.AsyncClient):
        self._client = client

    async def workspace(self, credentials: Credentials) -> dict[str, Any]:
        return await self._get("vinshc/authorization/workspace", credentials)

    async def clinical_summary(self, credentials: Credentials, encounter: str) -> dict[str, Any]:
        encounter = require_uuid(encounter, "encounterUuid")
        return await self._get(f"vinshc/encounter/{encounter}/clinical-summary", credentials)

    async def validate_doctor_context(self, credentials: Credentials, patient: str, encounter: str,
                                      visit: str | None) -> dict[str, Any]:
        # The scoped clinical endpoint enforces the doctor's backend privileges/facility.
        # Check the relationship even when no model/tool will run (greeting/history recap).
        return await read_doctor_context(self, credentials, patient, encounter, visit)

    async def patient(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        return await self._get(f"vinshc/patients/{require_uuid(patient, 'patientUuid')}", credentials)

    async def visits(self, credentials: Credentials, patient: str, limit: int) -> dict[str, Any]:
        params = {"patient": require_uuid(patient, "patientUuid"), "status": "all", "limit": limit}
        return await self._get("vinshc/visits", credentials, params)

    async def vitals(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]:
        params = {"patient": require_uuid(patient, "patientUuid")}
        if visit:
            params["visit"] = require_uuid(visit, "visitUuid")
        return await self._get("vinshc/vitals", credentials, params)

    async def allergies(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        return await self._get("vinshc/allergy", credentials, {"patient": require_uuid(patient, "patientUuid")})

    async def service_orders(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]:
        params: dict[str, Any] = {"patient": require_uuid(patient, "patientUuid"), "state": "all", "limit": 100}
        if visit:
            params["visit"] = require_uuid(visit, "visitUuid")
        return await self._get("vinshc/operations/service-orders", credentials, params)

    async def result(self, credentials: Credentials, result: str) -> dict[str, Any]:
        return await self._get(f"vinshc/operations/results/{require_uuid(result, 'resultUuid')}", credentials)

    async def appointments(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        params = {"patient": require_uuid(patient, "patientUuid"), "limit": 100}
        return await self._get("vinshc/operations/appointments", credentials, params)

    async def _get(self, path: str, credentials: Credentials, params: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.get(
                path, params=params, headers={"Accept": "application/json", "Cookie": "", **credentials.headers()}
            )
        except httpx.TimeoutException as ex:
            raise BackendError(504, "backend_timeout", "OpenMRS không phản hồi kịp.") from ex
        except httpx.HTTPError as ex:
            raise BackendError(503, "backend_unavailable", "Không kết nối được OpenMRS.") from ex
        return decode(response)


async def read_doctor_context(backend: ClinicalDataProvider, credentials: Credentials, patient: str,
                              encounter: str, visit: str | None) -> dict[str, Any]:
    """A provider's scoped read is required before any positive doctor response or memory access."""
    summary = await backend.clinical_summary(credentials, encounter)
    if (str(summary.get("patientUuid") or "").lower() != patient
            or str(summary.get("encounterUuid") or "").lower() != encounter
            or visit and str(summary.get("visitUuid") or "").lower() != visit):
        raise BackendError(400, "invalid_context", "Bệnh nhân, lượt khám và phiếu khám không khớp nhau.")
    return summary


def decode(response: httpx.Response) -> dict[str, Any]:
    if response.status_code == 401:
        raise BackendError(401, "unauthenticated", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")
    if response.status_code == 403:
        raise BackendError(403, "forbidden", "Tài khoản/workspace không có quyền đọc dữ liệu này.")
    if response.status_code == 404:
        raise BackendError(404, "not_found", "Không tìm thấy bản ghi được yêu cầu.")
    if response.status_code == 400:
        raise BackendError(400, "bad_request", "Backend từ chối yêu cầu đọc.")
    if response.status_code != 200:
        raise BackendError(502, "backend_error", f"Backend trả lỗi HTTP {response.status_code}.")
    if "json" not in response.headers.get("content-type", ""):
        raise BackendError(502, "backend_error", "Backend không trả JSON.")
    try:
        data = response.json()
    except ValueError as ex:
        raise BackendError(502, "backend_error", "Không đọc được phản hồi backend.") from ex
    if not isinstance(data, dict):
        raise BackendError(502, "backend_error", "Phản hồi backend không đúng dạng.")
    return data
