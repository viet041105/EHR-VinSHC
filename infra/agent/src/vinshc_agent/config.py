"""Cấu hình đọc từ biến môi trường `VINSHC_AGENT_*`; lỗi cấu hình làm service dừng ngay khi khởi động."""

from __future__ import annotations

import importlib.util
import os
import math
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit

# A wheel lives in site-packages, while Docker assets live in /app. Source/editable
# installs keep the repository default; packaged deployments set this root explicitly.
AGENT_ROOT = Path((os.environ.get("VINSHC_AGENT_ASSET_ROOT") or "").strip() or Path(__file__).resolve().parents[2]).resolve()
DEFAULT_FIELDS_CSV = AGENT_ROOT.parent.parent / "metadata" / "vinshc" / "fields.csv"
DEMO_PATIENT_FIXTURE = AGENT_ROOT / "fixtures" / "patient_portal.demo.json"
DEMO_CLINICAL_FIXTURE = AGENT_ROOT / "fixtures" / "clinical.demo.json"
DEFAULT_KNOWLEDGE = AGENT_ROOT / "knowledge" / "manifest.json"
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
    data_provider: str = "http"
    mock_fixture: Path = DEMO_CLINICAL_FIXTURE
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
    gemini_model: str = "gemini-3.8-flash"
    gemini_thinking_level: str = "low"
    gemini_api_key_file: Path | None = None
    gemini_credential: str | None = None
    openai_model: str = "gpt-5-mini"
    openai_reasoning_effort: str = "low"
    openai_api_key_file: Path | None = None
    openai_credential: str | None = None
    model_timeout: float = 45.0
    request_timeout: float = 90.0
    model_max_tokens: int = 4096
    model_max_retries: int = 2
    patient_portal: str = "disabled"
    patient_fixture: Path = DEMO_PATIENT_FIXTURE
    clinic_contact: str | None = None
    rate_limit_per_minute: int = 20
    max_tool_rounds: int = 4
    max_tool_calls_per_round: int = 4
    knowledge_enabled: bool = False
    knowledge_allow_development: bool = False
    knowledge_manifest: Path = DEFAULT_KNOWLEDGE
    knowledge_mode: str = "offline"
    knowledge_index: Path = AGENT_ROOT.parent.parent / ".runtime" / "agent-rag" / "gemini-768.json"
    advanced_enabled: bool = False
    conversation_ttl: int = 900
    conversation_limit: int = 256
    model_circuit_failures: int = 3
    model_circuit_cooldown: float = 30.0


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes")


def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    d = Settings()
    settings = Settings(
        data_provider=env.get("VINSHC_AGENT_DATA_PROVIDER", d.data_provider).strip().lower(),
        mock_fixture=Path(env.get("VINSHC_AGENT_MOCK_FIXTURE", str(d.mock_fixture))),
        backend_url=env.get("VINSHC_AGENT_BACKEND_URL", d.backend_url).rstrip("/"),
        backend_timeout=float(env.get("VINSHC_AGENT_BACKEND_TIMEOUT", d.backend_timeout)),
        fields_csv=Path(env.get("VINSHC_AGENT_FIELDS_CSV", str(d.fields_csv))),
        model_provider=env.get("VINSHC_AGENT_MODEL_PROVIDER", d.model_provider).strip().lower(),
        allow_external_model=_flag(env.get("VINSHC_AGENT_ALLOW_EXTERNAL_MODEL")),
        anthropic_model=env.get("VINSHC_AGENT_ANTHROPIC_MODEL", d.anthropic_model),
        anthropic_effort=env.get("VINSHC_AGENT_ANTHROPIC_EFFORT", d.anthropic_effort),
        gemini_model=env.get("VINSHC_AGENT_GEMINI_MODEL", d.gemini_model).strip(),
        gemini_thinking_level=env.get("VINSHC_AGENT_GEMINI_THINKING_LEVEL", d.gemini_thinking_level).strip().lower(),
        gemini_api_key_file=Path(env["VINSHC_AGENT_GEMINI_API_KEY_FILE"])
        if (env.get("VINSHC_AGENT_GEMINI_API_KEY_FILE") or "").strip() else None,
        openai_model=env.get("VINSHC_AGENT_OPENAI_MODEL", d.openai_model).strip(),
        openai_reasoning_effort=env.get("VINSHC_AGENT_OPENAI_REASONING_EFFORT", d.openai_reasoning_effort).strip().lower(),
        openai_api_key_file=Path(env["VINSHC_AGENT_OPENAI_API_KEY_FILE"])
        if (env.get("VINSHC_AGENT_OPENAI_API_KEY_FILE") or "").strip() else None,
        anthropic_api_key_file=Path(env["VINSHC_AGENT_ANTHROPIC_API_KEY_FILE"])
        if (env.get("VINSHC_AGENT_ANTHROPIC_API_KEY_FILE") or "").strip()
        else None,
        model_timeout=float(env.get("VINSHC_AGENT_MODEL_TIMEOUT", d.model_timeout)),
        request_timeout=float(env.get("VINSHC_AGENT_REQUEST_TIMEOUT", d.request_timeout)),
        model_max_tokens=int(env.get("VINSHC_AGENT_MODEL_MAX_TOKENS", d.model_max_tokens)),
        model_max_retries=int(env.get("VINSHC_AGENT_MODEL_MAX_RETRIES", d.model_max_retries)),
        patient_portal=env.get("VINSHC_AGENT_PATIENT_PORTAL", d.patient_portal).strip().lower(),
        patient_fixture=Path(env.get("VINSHC_AGENT_PATIENT_FIXTURE", str(d.patient_fixture))),
        clinic_contact=(env.get("VINSHC_AGENT_CLINIC_CONTACT") or "").strip() or None,
        rate_limit_per_minute=int(env.get("VINSHC_AGENT_RATE_LIMIT_PER_MINUTE", d.rate_limit_per_minute)),
        max_tool_rounds=int(env.get("VINSHC_AGENT_MAX_TOOL_ROUNDS", d.max_tool_rounds)),
        max_tool_calls_per_round=int(env.get("VINSHC_AGENT_MAX_TOOL_CALLS_PER_ROUND", d.max_tool_calls_per_round)),
        knowledge_enabled=_flag(env.get("VINSHC_AGENT_KNOWLEDGE_ENABLED", "true" if env.get("VINSHC_AGENT_DATA_PROVIDER", d.data_provider).strip().lower() == "mock" else "false")),
        knowledge_allow_development=_flag(env.get("VINSHC_AGENT_KNOWLEDGE_ALLOW_DEVELOPMENT")),
        knowledge_manifest=Path(env.get("VINSHC_AGENT_KNOWLEDGE_MANIFEST", str(d.knowledge_manifest))),
        knowledge_mode=env.get("VINSHC_AGENT_KNOWLEDGE_MODE", d.knowledge_mode).strip().lower(),
        knowledge_index=Path(env.get("VINSHC_AGENT_KNOWLEDGE_INDEX", str(d.knowledge_index))),
        advanced_enabled=_flag(env.get("VINSHC_AGENT_ADVANCED_ENABLED", "true" if env.get("VINSHC_AGENT_DATA_PROVIDER", d.data_provider).strip().lower() == "mock" else "false")),
        conversation_ttl=int(env.get("VINSHC_AGENT_CONVERSATION_TTL", d.conversation_ttl)),
        conversation_limit=int(env.get("VINSHC_AGENT_CONVERSATION_LIMIT", d.conversation_limit)),
        model_circuit_failures=int(env.get("VINSHC_AGENT_MODEL_CIRCUIT_FAILURES", d.model_circuit_failures)),
        model_circuit_cooldown=float(env.get("VINSHC_AGENT_MODEL_CIRCUIT_COOLDOWN", d.model_circuit_cooldown)),
    )
    validate(settings)
    if settings.knowledge_enabled and settings.knowledge_mode == "gemini":
        if settings.gemini_api_key_file:
            read_api_key(settings.gemini_api_key_file)
        elif not (env.get("GEMINI_API_KEY") or "").strip():
            raise ConfigError("Gemini embedding cần GEMINI_API_KEY hoặc file khóa Gemini.")
    if settings.model_provider == "anthropic":
        settings = replace(settings, anthropic_credential=anthropic_credential_source(settings, env))
    elif settings.model_provider == "gemini":
        if settings.gemini_api_key_file:
            read_api_key(settings.gemini_api_key_file)
            source = f"file {settings.gemini_api_key_file}"
        elif (env.get("GEMINI_API_KEY") or "").strip():
            source = "GEMINI_API_KEY"
        else:
            raise ConfigError("Chưa có Gemini API key: đặt GEMINI_API_KEY trong infra/agent/.env.")
        settings = replace(settings, gemini_credential=source)
    elif settings.model_provider == "openai":
        if settings.openai_api_key_file:
            read_api_key(settings.openai_api_key_file)
            source = f"file {settings.openai_api_key_file}"
        elif (env.get("OPENAI_API_KEY") or "").strip():
            source = "OPENAI_API_KEY"
        else:
            raise ConfigError("Chưa có OpenAI API key: đặt OPENAI_API_KEY trong infra/agent/.env.")
        settings = replace(settings, openai_credential=source)
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
    if not 30 <= settings.conversation_ttl <= 3600 or not 1 <= settings.conversation_limit <= 1024:
        raise ConfigError("Conversation TTL 30–3600 giây; số phiên tối đa 1–1024.")
    if not 1 <= settings.model_circuit_failures <= 10 or not math.isfinite(settings.model_circuit_cooldown) or not 1 <= settings.model_circuit_cooldown <= 120:
        raise ConfigError("Circuit breaker: failures 1–10, cooldown 1–120 giây.")
    if settings.knowledge_mode not in ("offline", "gemini"):
        raise ConfigError("VINSHC_AGENT_KNOWLEDGE_MODE chỉ nhận offline hoặc gemini.")
    if settings.knowledge_enabled and not settings.knowledge_manifest.is_file():
        raise ConfigError("Không tìm thấy manifest tài liệu RAG.")
    if settings.knowledge_enabled and settings.knowledge_mode == "gemini" and not settings.allow_external_model:
        raise ConfigError("Gemini embedding cần VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true.")
    if settings.data_provider not in ("http", "mock"):
        raise ConfigError("VINSHC_AGENT_DATA_PROVIDER chỉ nhận 'http' hoặc 'mock'.")
    if settings.data_provider == "mock" and not settings.mock_fixture.is_file():
        raise ConfigError(f"Không tìm thấy bộ hồ sơ giả: {settings.mock_fixture}")
    url = urlsplit(settings.backend_url)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ConfigError("VINSHC_AGENT_BACKEND_URL phải là URL http(s) tới /openmrs/ws/rest/v1.")
    if url.username or url.password or url.query or url.fragment:
        raise ConfigError("VINSHC_AGENT_BACKEND_URL không được chứa credential, query hoặc fragment.")
    if not settings.fields_csv.is_file():
        raise ConfigError(f"Không tìm thấy metadata trường: {settings.fields_csv}")
    if settings.model_provider not in ("fake", "anthropic", "gemini", "openai"):
        raise ConfigError("VINSHC_AGENT_MODEL_PROVIDER chỉ nhận 'fake', 'anthropic', 'gemini' hoặc 'openai'.")
    if settings.model_provider != "fake" and not settings.allow_external_model:
        # Dữ liệu sức khỏe là dữ liệu nhạy cảm (docs/VIETNAM_COMPLIANCE.md): chỉ gửi ra dịch vụ ngoài
        # khi môi trường chỉ có dữ liệu synthetic hoặc đã có đánh giá tác động được duyệt.
        raise ConfigError(
            "Model bên ngoài cần VINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true; chỉ bật với dữ liệu synthetic "
            "hoặc sau khi đánh giá tác động xử lý dữ liệu cá nhân được duyệt."
        )
    if settings.anthropic_effort not in EFFORTS:
        raise ConfigError(f"VINSHC_AGENT_ANTHROPIC_EFFORT phải thuộc {', '.join(EFFORTS)}.")
    if not re.fullmatch(r"gemini-[a-zA-Z0-9._-]+", settings.gemini_model):
        raise ConfigError("VINSHC_AGENT_GEMINI_MODEL phải là model ID Gemini, không chứa URL hoặc đường dẫn.")
    if settings.gemini_thinking_level not in ("low", "medium", "high"):
        raise ConfigError("Gemini 3.8 Flash chỉ nhận thinking level low, medium hoặc high.")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._:-]*", settings.openai_model):
        raise ConfigError("VINSHC_AGENT_OPENAI_MODEL phải là model ID OpenAI, không chứa URL hoặc đường dẫn.")
    if settings.openai_reasoning_effort not in ("", "none", "minimal", "low", "medium", "high"):
        raise ConfigError("VINSHC_AGENT_OPENAI_REASONING_EFFORT chỉ nhận none, minimal, low, medium, high hoặc để trống.")
    if settings.patient_portal not in ("disabled", "fixture", "http"):
        # "http" được thêm khi backend có API cổng bệnh nhân (xem README, mục Luồng bệnh nhân).
        raise ConfigError("VINSHC_AGENT_PATIENT_PORTAL chỉ nhận 'disabled', 'fixture' hoặc 'http'.")
    if settings.patient_portal == "fixture" and not settings.patient_fixture.is_file():
        raise ConfigError(f"Không tìm thấy fixture cổng bệnh nhân: {settings.patient_fixture}")
    if not all(math.isfinite(v) for v in (settings.backend_timeout,settings.model_timeout,settings.request_timeout)):
        raise ConfigError("Timeout phải hữu hạn.")
    if not 1 <= settings.max_tool_rounds <= 6 or not 1 <= settings.max_tool_calls_per_round <= 8 or not 0 <= settings.model_max_retries <= 3:
        raise ConfigError("Tool rounds 1–6, calls/round 1–8, retries 0–3.")
    if settings.request_timeout <= 0 or not 256 <= settings.model_max_tokens <= 16000:
        raise ConfigError("Request timeout phải dương; model max tokens phải nằm trong 256–16000.")
    if settings.backend_timeout <= 0 or settings.model_timeout <= 0 or settings.model_max_retries < 0:
        raise ConfigError("Timeout phải dương và số lần retry không âm.")
    if settings.rate_limit_per_minute < 1 or settings.max_tool_rounds < 1 or settings.max_tool_calls_per_round < 1:
        raise ConfigError("Giới hạn tần suất và số lượt gọi tool phải ≥ 1.")
