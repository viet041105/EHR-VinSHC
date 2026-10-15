"""Các lệnh phát triển agent độc lập với Docker, database và FE nghiệp vụ."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "infra" / "agent"
VENV = ROOT / ".runtime" / "agent-venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(command: list[str], **kwargs) -> int:
    return subprocess.run(command, cwd=ROOT, check=False, **kwargs).returncode


def setup() -> int:
    if not PYTHON.is_file():
        # The workspace venv is a Windows CPython, even if PATH contains an MSYS2 python.
        base = ROOT / ".venv" / "Scripts" / "python.exe"
        status = run([str(base) if os.name == "nt" and base.is_file() else sys.executable, "-m", "venv", str(VENV)])
        if status:
            return status
    return run([str(PYTHON), "-m", "pip", "install", "-c", str(AGENT / "constraints.txt"), "-e", str(AGENT) + "[dev,anthropic]"])


def request(url: str, body: dict | None = None, headers: dict | None = None) -> dict:
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=105) as response:
        return json.load(response)


def chat(args) -> int:
    base = f"http://127.0.0.1:{args.port}"
    try:
        health = request(base + "/healthz")
        if health.get("dataProvider") != "mock":
            print("Lệnh chat này chỉ dùng bộ hồ sơ giả. Chạy npm run agent:dev trước.", file=sys.stderr)
            return 2
        cases = request(base + "/dev/cases")["cases"]
    except (OSError, ValueError):
        print("Chưa kết nối được agent local. Mở terminal khác và chạy npm run agent:dev.", file=sys.stderr)
        return 2
    if not 1 <= args.case <= len(cases):
        print(f"--case phải từ 1 đến {len(cases)}.", file=sys.stderr)
        return 2
    case = cases[args.case - 1]
    identity = args.identity or ("doctor" if args.persona == "doctor" else case["patientIdentity"])
    headers = {"Authorization": f"Bearer demo-{identity}"}
    if args.persona == "doctor":
        # Keep doctor A's facility for an explicit denied scenario on case C.
        facility = cases[0]["facilityUuid"] if identity == "doctor" else case["facilityUuid"]
        headers.update({"X-VinSHC-Workspace-Role": "doctor", "X-VinSHC-Workspace-Facility": facility})
    print(f"Model: {health['modelProvider']} · Dữ liệu: giả lập · Vai trò: {args.persona} · Danh tính: demo-{identity}")
    print(f"Hồ sơ: {case['name']}")
    print("Gợi ý: Tóm tắt lần khám / Sinh hiệu? / Đơn thuốc? / Lời dặn? / Lịch hẹn?")
    print("Gõ /new để xóa lịch sử, /quit để thoát. Ctrl+C cũng dừng chương trình.")
    history: list[dict] = []
    conversation = None
    memory = health.get("advanced", {}).get("enabled", False)
    while True:
        try:
            question = input("\nBạn: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if question == "/quit":
            return 0
        if question == "/new":
            if conversation:
                try:
                    # DELETE uses the same authenticated identity as this console session.
                    req = urllib.request.Request(base + f"/v1/{args.persona}/conversations/{conversation}", headers=headers, method="DELETE")
                    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=10):
                        pass
                except OSError:
                    pass
            conversation = None
            history.clear()
            print("Đã bắt đầu hội thoại mới.")
            continue
        if not question:
            continue
        body = {"message": question, "remember": True} if memory else {"message": question, "history": history[-12:]}
        if memory and conversation:
            body["conversationId"] = conversation
        if args.persona == "doctor":
            body.update({key: case[key] for key in ("patientUuid", "encounterUuid", "visitUuid")})
        elif args.case == 1:
            body["visitUuid"] = case["visitUuid"]
        try:
            result = request(base + f"/v1/{args.persona}/chat", body, headers)
        except urllib.error.HTTPError as ex:
            try:
                message = json.load(ex).get("detail", "Yêu cầu không hợp lệ.")
            except ValueError:
                message = "Không đọc được phản hồi agent."
            print(f"HTTP {ex.code}: {message}")
            continue
        except (OSError, ValueError):
            print("Agent không phản hồi kịp hoặc chưa chạy.")
            continue
        print(f"\nTrợ lý [{result['status']}]:")
        if result.get("message"):
            print(result["message"])
        for answer in result["answer"]:
            print(answer["text"])
            for source in answer["sources"]:
                if source['kind'] == 'document':
                    print(f"  Nguồn: {source['documentTitle']} · v{source['documentVersion']} · {source['documentSection']}")
                else:
                    print(f"  Nguồn: {source['label']} · {source['kind']} · {source.get('recordedAt') or 'chưa ghi thời điểm'}")
        if result["missing"]:
            print("Thông tin thiếu/chưa đọc được:")
            for item in result["missing"]:
                print(f"  - {item['label']}: {item['detail']}")
        print("Tool:", ", ".join(result["toolsUsed"]) or "không gọi")
        if memory:
            conversation = result.get("conversationId")
        if (result.get("diagnostics") or {}).get("modelError"):
            print("Lỗi model:", result["diagnostics"]["modelError"])
        if result["answer"]:
            history.extend([{"role": "user", "text": question}, {"role": "assistant", "text": "\n".join(item["text"] for item in result["answer"])[:2000]}])
            history = history[-12:]


def main(argv=None) -> int:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["setup", "dev", "demo", "check", "chat", "test"])
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--model", choices=["fake", "gemini", "anthropic", "openai"])
    parser.add_argument("--rag", choices=["offline", "gemini"], help="cách tìm tài liệu; gemini cần index đã tạo")
    parser.add_argument("--persona", choices=["doctor", "patient"], default="doctor")
    parser.add_argument("--case", type=int, default=1)
    parser.add_argument("--identity", help="tên danh tính giả lập, ví dụ doctor-other")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port phải từ 1 đến 65535")
    if args.action == "setup":
        return setup()
    if args.action == "chat":
        return chat(args)
    if not PYTHON.is_file():
        print("Chạy npm run agent:setup một lần để tạo môi trường Python riêng.", file=sys.stderr)
        return 2
    if args.action == "test":
        return run([str(PYTHON), "-m", "pytest", str(AGENT / "tests"), "-q"])
    command = [str(PYTHON), str(AGENT / "src" / "main.py"), "--data-provider", "mock", "--host", "127.0.0.1", "--port", str(args.port)]
    if args.rag:
        command.extend(["--knowledge-mode", args.rag])
    if args.model or args.action == "demo":
        command.extend(["--model", args.model or "fake"])
    if args.action == "check":
        command.append("--check")
    else:
        command.append("--reload")
        print(f"Agent độc lập: http://127.0.0.1:{args.port}/docs", flush=True)
        port_option = f" -- --port {args.port}" if args.port != 8001 else ""
        print(f"Mở terminal khác: npm run agent:chat{port_option}. Dừng service bằng Ctrl+C.", flush=True)
    try:
        return run(command)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
