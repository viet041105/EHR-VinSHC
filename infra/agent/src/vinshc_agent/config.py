"""Cấu hình đọc từ biến môi trường `VINSHC_AGENT_*`; lỗi cấu hình làm service dừng ngay khi khởi động."""

from __future__ import annotations

import importlib.util
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit

AGENT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FIELDS_CSV = AGENT_ROOT.parent.parent / "metadata" / "vinshc" / "fields.csv"
DEMO_PATIENT_FIXTURE = AGENT_ROOT / "fixtures" / "patient_portal.demo.json"
EFFORTS = ("low", "medium", "high", "xhigh", "max")
# Các nguồn credential Anthropic SDK tự đọc từ môi trường (theo thứ tự ưu tiên của SDK).
ANTHROPIC_CREDENTIAL_ENV = (
    ("ANTHROPIC_API_KEY", "biến ANTHROPIC_API_KEY"),
    ("ANTHROPIC_AUTH_TOKEN", "biến ANTHROPIC_AUTH_TOKEN"),
    ("ANTHROPIC_PROFILE", "profile `ant auth login`"),
    ("ANTHROPIC_FEDERATION_RULE_ID", "workload identity federation"),
)


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    backend_url: str = "http://127.0.0.1:8080/openmrs/ws/rest/v1"
    backend_timeout: float = 15.0
    fields_csv: Path = DEFAULT_FIELDS_CSV
    model_provider: str = "fake"
    allow_external_model: bool = False
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: str = "high"
    anthropic_api_key_file: Path | None = None
    # Mô tả nguồn credential đã tìm thấy (không bao giờ là giá trị khóa), để hiển thị khi khởi động.
    anthropic_credential: str | None = None
    model_timeout: float = 120.0
    model_max_retries: int = 2
    patient_portal: str = "disabled"
    patient_fixture: Path = DEMO_PATIENT_FIXTURE
    clinic_contact: str | None = None
    rate_limit_per_minute: int = 20
    max_tool_rounds: int = 4
    max_tool_calls_per_round: int = 4


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes")


def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    d = Settings()
    settings = Settings(
        backend_url=env.get("VINSHC_AGENT_BACKEND_URL", d.backend_url).rstrip("/"),
        backend_timeout=float(env.get("VINSHC_AGENT_BACKEND_TIMEOUT", d.backend_timeout)),
        fields_csv=Path(env.get("VINSHC_AGENT_FIELDS_CSV", str(d.fields_csv))),
        model_provider=env.get("VINSHC_AGENT_MODEL_PROVIDER", d.model_provider).strip().lower(),
        allow_external_model=_flag(env.get("VINSHC_AGENT_ALLOW_EXTERNAL_MODEL")),
        anthropic_model=env.get("VINSHC_AGENT_ANTHROPIC_MODEL", d.anthropic_model),
        anthropic_effort=env.get("VINSHC_AGENT_ANTHROPIC_EFFORT", d.anthropic_effort),
        anthropic_api_key_file=Path(env["VINSHC_AGENT_ANTHROPIC_API_KEY_FILE"])
        if (env.get("VINSHC_AGENT_ANTHROPIC_API_KEY_FILE") or "").strip()
        else None,
        model_timeout=float(env.get("VINSHC_AGENT_MODEL_TIMEOUT", d.model_timeout)),
        model_max_retries=int(env.get("VINSHC_AGENT_MODEL_MAX_RETRIES", d.model_max_retries)),
        patient_portal=env.get("VINSHC_AGENT_PATIENT_PORTAL", d.patient_portal).strip().lower(),
        patient_fixture=Path(env.get("VINSHC_AGENT_PATIENT_FIXTURE", str(d.patient_fixture))),
        clinic_contact=(env.get("VINSHC_AGENT_CLINIC_CONTACT") or "").strip() or None,
        rate_limit_per_minute=int(env.get("VINSHC_AGENT_RATE_LIMIT_PER_MINUTE", d.rate_limit_per_minute)),
        max_tool_rounds=int(env.get("VINSHC_AGENT_MAX_TOOL_ROUNDS", d.max_tool_rounds)),
        max_tool_calls_per_round=int(env.get("VINSHC_AGENT_MAX_TOOL_CALLS_PER_ROUND", d.max_tool_calls_per_round)),
    )
    validate(settings)
    if settings.model_provider == "anthropic":
        settings = replace(settings, anthropic_credential=anthropic_credential_source(settings, env))
    return settings


def read_api_key(path: Path) -> str:
    """Đọc khóa từ file (kiểu Docker secret). Khóa chỉ đi tới SDK, không lưu vào Settings hay log."""
    try:
        key = path.read_text(encoding="utf-8").strip()
    except OSError as ex:
        raise ConfigError(f"Không đọc được file khóa {path}: {ex.strerror or ex}") from ex
    if not key or any(c.isspace() for c in key):
        raise ConfigError(f"File khóa {path} rỗng hoặc chứa nhiều hơn một khóa.")
    return key


def anthropic_credential_source(settings: Settings, env: Mapping[str, str]) -> str:
    """Kiểm tra đã cài SDK và có credential; trả về mô tả nguồn (không phải giá trị khóa)."""
    if importlib.util.find_spec("anthropic") is None:
        raise ConfigError(
            'Chưa cài Anthropic SDK: chạy pip install -e ".[anthropic]" (Docker: --build-arg AGENT_EXTRAS=anthropic).'
        )
    if settings.anthropic_api_key_file is not None:
        read_api_key(settings.anthropic_api_key_file)
        return f"file {settings.anthropic_api_key_file}"
    for name, label in ANTHROPIC_CREDENTIAL_ENV:
        if (env.get(name) or "").strip():
            return label
    raise ConfigError(
        "Chưa có credential để gọi Claude. Chọn một cách: đặt ANTHROPIC_API_KEY trong infra/agent/.env; "
        "hoặc VINSHC_AGENT_ANTHROPIC_API_KEY_FILE trỏ tới file chứa khóa; "
        "hoặc ANTHROPIC_PROFILE sau khi chạy `ant auth login`."
    )


def validate(settings: Settings) -> None:
    url = urlsplit(settings.backend_url)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ConfigError("VINSHC_AGENT_BACKEND_URL phải là URL http(s) tới /openmrs/ws/rest/v1.")
    if url.username or url.password or url.query or url.fragment:
        raise ConfigError("VINSHC_AGENT_BACKEND_URL không được chứa credential, query hoặc fragment.")
    if not settings.fields_csv.is_file():
        raise ConfigError(f"Không tìm thấy metadata trường: {settings.fields_csv}")
    if settings.model_provider not in ("fake", "anthropic"):
        raise ConfigError("VINSHC_AGENT_MODEL_PROVIDER chỉ nhận 'fake' hoặc 'anthropic'.")
    if settings.model_provider != "fake" and not settings.allow_external_model:
        # Dữ liệu sức khỏe là dữ liệu nhạy cảm (docs/VIETNAM_COMPLIANCE.md): chỉ gửi ra dịch vụ ngoài
        # khi môi trường chỉ có dữ liệu synthetic hoặc đã có đánh giá tác động được duyệt.
        raise ConfigError(
            "Model bên ngoài cần VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true; chỉ bật với dữ liệu synthetic "
            "hoặc sau khi đánh giá tác động xử lý dữ liệu cá nhân được duyệt."
        )
    if settings.anthropic_effort not in EFFORTS:
        raise ConfigError(f"VINSHC_AGENT_ANTHROPIC_EFFORT phải thuộc {', '.join(EFFORTS)}.")
    if settings.patient_portal not in ("disabled", "fixture"):
        # "http" được thêm khi backend có API cổng bệnh nhân (xem README, mục Luồng bệnh nhân).
        raise ConfigError("VINSHC_AGENT_PATIENT_PORTAL chỉ nhận 'disabled' hoặc 'fixture'.")
    if settings.patient_portal == "fixture" and not settings.patient_fixture.is_file():
        raise ConfigError(f"Không tìm thấy fixture cổng bệnh nhân: {settings.patient_fixture}")
    if settings.backend_timeout <= 0 or settings.model_timeout <= 0 or settings.model_max_retries < 0:
        raise ConfigError("Timeout phải dương và số lần retry không âm.")
    if settings.rate_limit_per_minute < 1 or settings.max_tool_rounds < 1 or settings.max_tool_calls_per_round < 1:
        raise ConfigError("Giới hạn tần suất và số lượt gọi tool phải ≥ 1.")
