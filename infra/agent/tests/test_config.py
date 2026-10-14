from pathlib import Path

import pytest

from vinshc_agent.backend import Credentials
from vinshc_agent.config import ConfigError, load_settings


def test_defaults_are_safe():
    settings = load_settings({})
    assert (settings.model_provider, settings.patient_portal) == ("fake", "disabled")


CLAUDE = {"VINSHC_AGENT_MODEL_PROVIDER": "anthropic", "VINSHC_AGENT_ALLOW_EXTERNAL_MODEL": "true"}


def test_external_model_requires_explicit_approval():
    with pytest.raises(ConfigError):
        load_settings({"VINSHC_AGENT_MODEL_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "sk-test"})
    settings = load_settings({**CLAUDE, "ANTHROPIC_API_KEY": "sk-test"})
    assert settings.anthropic_model == "claude-opus-5-5"
    assert settings.anthropic_credential == "biến ANTHROPIC_API_KEY"
    assert "sk-test" not in repr(settings)


def test_claude_needs_a_credential():
    with pytest.raises(ConfigError, match="ANTHROPIC_API_KEY"):
        load_settings(CLAUDE)
    assert load_settings({**CLAUDE, "ANTHROPIC_PROFILE": "default"}).anthropic_credential.startswith("profile")


def test_claude_key_file(tmp_path):
    key = tmp_path / "anthropic_api_key"
    key.write_text("sk-from-file\n", encoding="utf-8")
    settings = load_settings({**CLAUDE, "VINSHC_AGENT_ANTHROPIC_API_KEY_FILE": str(key)})
    assert settings.anthropic_credential == f"file {key}"
    assert "sk-from-file" not in repr(settings)
    key.write_text("   \n", encoding="utf-8")
    with pytest.raises(ConfigError, match="rỗng"):
        load_settings({**CLAUDE, "VINSHC_AGENT_ANTHROPIC_API_KEY_FILE": str(key)})
    with pytest.raises(ConfigError, match="Không đọc được"):
        load_settings({**CLAUDE, "VINSHC_AGENT_ANTHROPIC_API_KEY_FILE": str(tmp_path / "missing")})


def test_claude_needs_the_sdk(monkeypatch):
    import vinshc_agent.config as config

    monkeypatch.setattr(config.importlib.util, "find_spec", lambda name: None)
    with pytest.raises(ConfigError, match="pip install"):
        load_settings({**CLAUDE, "ANTHROPIC_API_KEY": "sk-test"})


@pytest.mark.parametrize("url", ["ftp://host/openmrs", "http://user:pw@host/openmrs", "http://host/openmrs?x=1"])
def test_backend_url_is_validated(url):
    with pytest.raises(ConfigError):
        load_settings({"VINSHC_AGENT_BACKEND_URL": url})


def test_patient_portal_modes():
    assert load_settings({"VINSHC_AGENT_PATIENT_PORTAL": "fixture"}).patient_fixture.is_file()
    with pytest.raises(ConfigError):
        load_settings({"VINSHC_AGENT_PATIENT_PORTAL": "fixture", "VINSHC_AGENT_PATIENT_FIXTURE": str(Path("missing.json"))})
    with pytest.raises(ConfigError):
        load_settings({"VINSHC_AGENT_PATIENT_PORTAL": "staff-api"})


def test_credentials_repr_hides_authorization():
    creds = Credentials("Basic c2VjcmV0", "doctor", "f1000000-0000-4000-8000-000000000001")
    assert "c2VjcmV0" not in repr(creds)
