"""Shared settings for local-only development and CI checks (standard library)."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _test_output_path(filename: str, kind: str, override: str) -> Path:
    """Keep synthetic test artifacts in a project-specific folder when requested.

    Default paths remain unchanged for CI. Explicit overrides must be inside
    the ignored .runtime directory so fixtures cannot leak into tracked files.
    """
    base = ROOT / ".runtime"
    directory = Path(os.environ.get(override, "")) if os.environ.get(override) else base / kind
    if not directory.is_absolute():
        directory = ROOT / directory
    directory = directory.resolve()
    if not directory.is_relative_to(base.resolve()):
        raise ValueError(f"{override} must be inside .runtime")
    if Path(filename).name != filename:
        raise ValueError("A test output name must not contain directories")
    return directory / filename


def fixture_path(filename: str) -> Path:
    return _test_output_path(filename, "fixtures", "VINSHC_TEST_FIXTURE_DIR")


def report_path(filename: str) -> Path:
    return _test_output_path(filename, "reports", "VINSHC_TEST_REPORT_DIR")


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
    for key in ("OMRS_DB_USER", "OMRS_DB_PASSWORD",
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
