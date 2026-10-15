"""Short commands for the development reference corpus; no chart data is indexed."""
from __future__ import annotations
import argparse
import asyncio
import importlib.util
import os
from pathlib import Path
import sys
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "infra" / "agent" / "src"
sys.path.insert(0, str(SRC))
from agent_dev import request


def main(argv=None):
    from agent_dev import PYTHON, run
    if PYTHON.is_file() and Path(sys.executable).resolve() != PYTHON.resolve():
        return run([str(PYTHON), str(Path(__file__).resolve()), *(sys.argv[1:] if argv is None else argv)])
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "index", "search"])
    parser.add_argument("query", nargs="?")
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--persona", choices=["doctor", "patient"], default="doctor")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port phải từ 1 đến 65535")
    if args.action == "search":
        if not args.query:
            parser.error('Cần câu tìm kiếm, ví dụ "SpO2 dùng đơn vị nào?"')
        try:
            base = f"http://127.0.0.1:{args.port}"
            if request(base + "/healthz").get("dataProvider") != "mock":
                print("Lệnh demo này chỉ gọi agent đang dùng hồ sơ giả.", file=sys.stderr)
                return 2
            case = request(base + "/dev/cases")["cases"][0]
            headers = {"Authorization": "Bearer demo-doctor" if args.persona == "doctor" else "Bearer demo-patient-a"}
            if args.persona == "doctor":
                headers.update({"X-VinSHC-Workspace-Role": "doctor", "X-VinSHC-Workspace-Facility": case["facilityUuid"]})
            result = request(base + f"/v1/{args.persona}/knowledge/search", {"query": args.query}, headers)
            print(f"Retrieval: {result['mode']} · Corpus v{result['version']} · Tài liệu mẫu dùng để phát triển")
            for c in result["chunks"]:
                print(f"\n{c['documentTitle']} · v{c['documentVersion']} · {c['documentSection']}\n{c['text']}\nNguồn: {c['sourceUrl']}")
            if not result["chunks"]:
                print("Không tìm thấy đoạn phù hợp trong nguồn được phép đọc.")
            return 0
        except urllib.error.HTTPError as ex:
            import json
            try:
                detail = json.load(ex).get("detail", "Yêu cầu không hợp lệ.")
            except ValueError:
                detail = "Agent trả lỗi."
            print(f"HTTP {ex.code}: {detail}", file=sys.stderr)
            return 3
        except (OSError, ValueError):
            print("Chưa kết nối được agent local; chạy npm run agent:dev hoặc agent:demo.", file=sys.stderr)
            return 3
    spec = importlib.util.spec_from_file_location("agent_main", SRC / "main.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_env_file(ROOT / "infra" / "agent" / ".env")
    os.environ.update({"VINSHC_AGENT_DATA_PROVIDER": "mock", "VINSHC_AGENT_MODEL_PROVIDER": "fake",
                       "VINSHC_AGENT_KNOWLEDGE_ENABLED": "true",
                       "VINSHC_AGENT_KNOWLEDGE_MODE": "gemini" if args.action == "index" else "offline"})
    try:
        from vinshc_agent.config import load_settings
        from vinshc_agent.knowledge import make_knowledge, KnowledgeError
        kb = make_knowledge(load_settings())
        if args.action == "check":
            print(f"Corpus v{kb.corpus.manifest.version}: {len(kb.corpus.manifest.documents)} tài liệu, {len(kb.corpus.chunks)} đoạn; {len(kb.corpus.quarantined)} tài liệu bị cách ly.")
        else:
            result = asyncio.run(kb.build_index())
            print(f"Gemini embedding: {result['chunks']} đoạn · {'tái dùng index hợp lệ, không gọi API' if result['reused'] else 'đã tạo index'}")
            print(f"Index local: {kb.index_path}")
        return 0
    except (ValueError, OSError) as ex:
        print(f"Lỗi cấu hình RAG: {ex}", file=sys.stderr)
        return 2
    except KnowledgeError as ex:
        print(f"RAG chưa khả dụng ({ex.code}): {ex.message}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
