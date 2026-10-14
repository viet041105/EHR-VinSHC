"""Client chỉ đọc tới adapter VinSHC, dùng credential và workspace của chính người đang hỏi.

Agent không có tài khoản riêng: mỗi request chuyển tiếp `Authorization` và hai header workspace mà FE gửi,
để backend kiểm quyền và ghi audit như khi người dùng tự mở hồ sơ. Credential chỉ nằm ở tầng HTTP này,
không đi vào state của graph, prompt hay log. Mọi đường dẫn được liệt kê cố định trong lớp này; tool không
truyền URL hay tham số tùy ý.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

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
        }


def require_uuid(value: str | None, name: str) -> str:
    if not UUID_PATTERN.match(value or ""):
        raise BackendError(400, "invalid_uuid", f"{name} không phải UUID hợp lệ.")
    return str(value).lower()


class VinshcBackend:
    def __init__(self, client: httpx.AsyncClient):
        self._client = client

    async def workspace(self, credentials: Credentials) -> dict[str, Any]:
        return await self._get("vinshc/authorization/workspace", credentials)

    async def clinical_summary(self, credentials: Credentials, encounter: str) -> dict[str, Any]:
        encounter = require_uuid(encounter, "encounterUuid")
        return await self._get(f"vinshc/encounter/{encounter}/clinical-summary", credentials)

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
                path, params=params, headers={"Accept": "application/json", **credentials.headers()}
            )
        except httpx.TimeoutException as ex:
            raise BackendError(504, "backend_timeout", "OpenMRS không phản hồi kịp.") from ex
        except httpx.HTTPError as ex:
            raise BackendError(503, "backend_unavailable", "Không kết nối được OpenMRS.") from ex
        return decode(response)


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
