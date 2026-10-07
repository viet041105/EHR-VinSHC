"""Shared settings for local-only development and CI checks (standard library)."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_settings(root=ROOT):
    settings = {}
    source = root / ".env"
    if not source.is_file():
        raise ValueError("Missing .env. Run: python scripts/bootstrap.py")
    for line in source.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator:
            raise ValueError("Invalid .env line; use KEY=value entries.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        settings[key.strip()] = value
    # Compose gives process environment precedence over .env; checks must agree.
    for key in settings:
        if key in os.environ:
            settings[key] = os.environ[key]
    for key in ("OMRS_DB_USER", "OMRS_DB_PASSWORD", "MYSQL_ROOT_PASSWORD",
                "EHR_ADMIN_USERNAME", "EHR_ADMIN_PASSWORD"):
        if not settings.get(key) or settings[key].startswith("GENERATE_"):
            raise ValueError(f"Set {key} in .env; bootstrap generates local passwords.")
    try:
        port = int(settings.get("EHR_HTTP_PORT", "8080"))
    except ValueError as error:
        raise ValueError("EHR_HTTP_PORT must be an integer.") from error
    if not 1 <= port <= 65535:
        raise ValueError("EHR_HTTP_PORT must be between 1 and 65535.")
    return settings
