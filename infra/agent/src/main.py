"""Điểm chạy chatbot trợ lý hồ sơ VinSHC.

    python src/main.py                 # 127.0.0.1:8000, đọc infra/agent/.env nếu có
    python src/main.py --reload        # tự khởi động lại khi sửa code
    python src/main.py --check         # chỉ kiểm tra cấu hình rồi thoát
    python src/main.py --check-model   # kiểm tra thêm API key và quyền dùng model rồi thoát

Biến trong file .env không ghi đè biến môi trường đã đặt sẵn. Cấu hình sai thì dừng ngay với mã thoát 2,
API key/model không dùng được thì mã thoát 3, trước khi mở cổng. Ứng dụng được tạo bằng factory
`vinshc_agent.app:create_app`.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path
from typing import MutableMapping, Sequence

SRC_DIR = Path(__file__).resolve().parent
AGENT_DIR = SRC_DIR.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from vinshc_agent.config import ConfigError, load_settings  # noqa: E402

ENV_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def load_env_file(path: Path, environ: MutableMapping[str, str] = os.environ) -> list[str]:
    """Nạp các dòng KEY=VALUE; bỏ dòng trống/chú thích và giá trị rỗng, hỗ trợ `export` và ngoặc kép/đơn.

    Trả về danh sách khóa đã nạp. Biến đã có trong môi trường được giữ nguyên.
    """
    if not path.is_file():
        return []
    loaded = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not ENV_KEY.match(key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        else:
            value = value.split(" #", 1)[0].rstrip()
        # Dòng để trống (ví dụ `ANTHROPIC_API_KEY=` chép từ .env.example) nghĩa là chưa đặt: không xuất biến rỗng,
        # vì SDK coi ANTHROPIC_API_KEY rỗng là có khóa và bỏ qua profile `ant auth login`.
        if not value:
            continue
        if key not in environ:
            environ[key] = value
            loaded.append(key)
    return loaded


def port(value: str) -> int:
    number = int(value)
    if not 1 <= number <= 65535:
        raise argparse.ArgumentTypeError("cổng phải trong khoảng 1–65535")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python src/main.py", description="Chạy chatbot trợ lý hồ sơ VinSHC.")
    parser.add_argument("--host", default=os.environ.get("VINSHC_AGENT_HOST", "127.0.0.1"),
                        help="địa chỉ lắng nghe (mặc định 127.0.0.1; dùng 0.0.0.0 trong container)")
    parser.add_argument("--port", type=port, default=os.environ.get("VINSHC_AGENT_PORT", "8000"),
                        help="cổng lắng nghe (mặc định 8000)")
    parser.add_argument("--env-file", type=Path, default=AGENT_DIR / ".env",
                        help="file biến môi trường (mặc định infra/agent/.env)")
    parser.add_argument("--reload", action="store_true", help="tự khởi động lại khi sửa code (chỉ dùng khi phát triển)")
    parser.add_argument("--data-provider", choices=["http", "mock"], help="nguồn dữ liệu: BE qua HTTP hoặc bộ hồ sơ giả độc lập")
    parser.add_argument("--model", choices=["fake", "gemini", "anthropic"], help="ghi đè model trong .env; không thay đổi nguồn dữ liệu")
    parser.add_argument("--knowledge-mode", choices=["offline", "gemini"], help="chế độ tìm tài liệu; không thay đổi model chat")
    parser.add_argument("--log-level", default="info", choices=["critical", "error", "warning", "info", "debug"])
    parser.add_argument("--check", action="store_true", help="chỉ kiểm tra cấu hình rồi thoát")
    parser.add_argument("--check-model", action="store_true",
                        help="kiểm tra cấu hình, API key và quyền dùng model (gọi Models API, không gửi dữ liệu hồ sơ) rồi thoát")
    return parser


KEY_HINTS = {
    "auth_invalid": "API key không hợp lệ hoặc đã bị thu hồi.",
    "permission_denied": "API key không có quyền dùng model này.",
    "model_not_found": "Không tìm thấy model; kiểm tra model ID của provider đang dùng.",
    "rate_limited": "Bị giới hạn tần suất; thử lại sau.",
    "connection": "Không kết nối được API model (mạng/proxy/tường lửa).",
}


def check_model(settings) -> int:
    from vinshc_agent.app import make_model
    from vinshc_agent.llm import ModelUnavailable

    if settings.model_provider == "fake":
        print("Model fake: không cần API key.")
        return 0
    model = make_model(settings)
    try:
        display = asyncio.run(model.check())
    except ModelUnavailable as ex:
        code = str(ex)
        sys.stdout.flush()
        print(f"Không dùng được model ({code}): {KEY_HINTS.get(code, 'API model trả lỗi.')}", file=sys.stderr)
        return 3
    print(f"API key hợp lệ; model khả dụng: {display}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    # Nạp .env trước để --host/--port lấy được mặc định từ file đó.
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--env-file", type=Path, default=AGENT_DIR / ".env")
    pre.add_argument("--data-provider", choices=["http", "mock"])
    pre.add_argument("--model", choices=["fake", "gemini", "anthropic"])
    pre.add_argument("--knowledge-mode", choices=["offline", "gemini"])
    known, _ = pre.parse_known_args(argv)
    loaded = load_env_file(known.env_file)
    if known.data_provider:
        os.environ["VINSHC_AGENT_DATA_PROVIDER"] = known.data_provider
    if known.model:
        os.environ["VINSHC_AGENT_MODEL_PROVIDER"] = known.model
    if known.knowledge_mode:
        os.environ["VINSHC_AGENT_KNOWLEDGE_MODE"] = known.knowledge_mode
    args = build_parser().parse_args(argv)

    try:
        settings = load_settings()
        if settings.knowledge_enabled:
            from vinshc_agent.knowledge import Corpus
            Corpus(settings.knowledge_manifest, allow_development=settings.data_provider == "mock" or settings.knowledge_allow_development)
        if settings.data_provider == "mock":
            from vinshc_agent.mock import MockDataset
            MockDataset.load(settings.mock_fixture, settings.fields_csv)
            if args.host not in LOOPBACK:
                raise ConfigError("Chế độ hồ sơ giả chỉ chạy trên loopback (127.0.0.1, localhost hoặc ::1).")
    except (ConfigError, ValueError) as ex:
        print(f"Lỗi cấu hình: {ex}", file=sys.stderr)
        return 2

    model = settings.model_provider + (f" ({settings.anthropic_model}, effort {settings.anthropic_effort})"
                                       if settings.model_provider == "anthropic" else "")
    if settings.model_provider == "gemini":
        model += f" ({settings.gemini_model}, thinking {settings.gemini_thinking_level})"
    print(f"Env file: {known.env_file} ({len(loaded)} biến)" if loaded else f"Env file: không dùng ({known.env_file})")
    print(f"Nguồn dữ liệu: {settings.data_provider}")
    print(f"Hồ sơ giả: {settings.mock_fixture}" if settings.data_provider == "mock" else f"Backend: {settings.backend_url}")
    print(f"Model: {model}")
    if settings.anthropic_credential:
        print(f"Credential: {settings.anthropic_credential}")
    if settings.gemini_credential:
        print(f"Credential: {settings.gemini_credential}")
    print(f"Cổng bệnh nhân: {'mock' if settings.data_provider == 'mock' else settings.patient_portal}")
    print(f"Tài liệu RAG: {settings.knowledge_mode if settings.knowledge_enabled else 'tắt'}")
    if args.check_model:
        return check_model(settings)
    if args.check:
        print("Cấu hình hợp lệ.")
        return 0
    if args.host not in LOOPBACK:
        print(f"Cảnh báo: agent lắng nghe trên {args.host}; chỉ mở ra ngoài sau gateway có HTTPS.", file=sys.stderr)

    import uvicorn

    sys.stdout.flush()
    uvicorn.run(
        "vinshc_agent.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(SRC_DIR)] if args.reload else None,
        log_level=args.log_level,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
