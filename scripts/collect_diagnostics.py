"""Collect local synthetic-stack diagnostics and redact configured credentials."""

import base64
from pathlib import Path
import subprocess

from common import ROOT, read_settings


def redact(text, settings):
    sensitive = [settings.get(key, "") for key in
                 ("OMRS_DB_PASSWORD", "MYSQL_ROOT_PASSWORD", "EHR_ADMIN_PASSWORD")]
    auth = f"{settings.get('EHR_ADMIN_USERNAME', '')}:{settings.get('EHR_ADMIN_PASSWORD', '')}"
    sensitive.extend([auth, base64.b64encode(auth.encode()).decode()])
    for value in sorted(set(sensitive), key=len, reverse=True):
        if value:
            text = text.replace(value, "[REDACTED]")
    return text


def main():
    settings = read_settings()
    destination = ROOT / ".runtime/reports"
    destination.mkdir(parents=True, exist_ok=True)
    commands = {
        "compose.log": ["docker", "compose", "logs", "--no-color", "--tail", "500"],
        "containers.json": ["docker", "compose", "ps", "--all", "--format", "json"],
    }
    for name, command in commands.items():
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", check=False, timeout=60)
        text = result.stdout + result.stderr
        (destination / name).write_text(redact(text, settings), encoding="utf-8")
    print("Saved redacted diagnostics to .runtime/reports (no .env or database export).")


if __name__ == "__main__":
    main()
