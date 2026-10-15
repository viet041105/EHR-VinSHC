import os

import pytest

import main

KEYS = ("VINSHC_AGENT_MODEL_PROVIDER", "VINSHC_AGENT_PATIENT_PORTAL", "VINSHC_AGENT_PORT", "VINSHC_AGENT_DATA_PROVIDER", "VINSHC_AGENT_MOCK_FIXTURE", "QUOTED", "EXPORTED")


@pytest.fixture
def clean_env(monkeypatch):
    for key in KEYS:
        monkeypatch.delenv(key, raising=False)  # pytest xóa lại các khóa này sau test


def test_env_file_parsing_does_not_override(tmp_path, clean_env, monkeypatch):
    monkeypatch.setenv("VINSHC_AGENT_PORT", "9001")
    env = tmp_path / ".env"
    env.write_text(
        "# chú thích\n\nVINSHC_AGENT_PATIENT_PORTAL=fixture  # bật luồng bệnh nhân\n"
        "QUOTED=\"giá trị # giữ nguyên\"\nexport EXPORTED='a b'\nVINSHC_AGENT_PORT=8123\nkhong hop le\n",
        encoding="utf-8",
    )
    loaded = main.load_env_file(env)
    assert loaded == ["VINSHC_AGENT_PATIENT_PORTAL", "QUOTED", "EXPORTED"]
    assert os.environ["VINSHC_AGENT_PATIENT_PORTAL"] == "fixture"
    assert os.environ["QUOTED"] == "giá trị # giữ nguyên"
    assert os.environ["EXPORTED"] == "a b"
    assert os.environ["VINSHC_AGENT_PORT"] == "9001"


def test_check_reports_valid_configuration(tmp_path, clean_env, capsys):
    env = tmp_path / ".env"
    env.write_text("VINSHC_AGENT_PATIENT_PORTAL=fixture\n", encoding="utf-8")
    assert main.main(["--check", "--env-file", str(env)]) == 0
    out = capsys.readouterr().out
    assert "Cổng bệnh nhân: fixture" in out and "Cấu hình hợp lệ." in out


def test_http_check_accepts_explicit_synthetic_reference_opt_in(tmp_path, clean_env, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("", encoding="utf-8")
    monkeypatch.setenv("VINSHC_AGENT_DATA_PROVIDER", "http")
    monkeypatch.setenv("VINSHC_AGENT_MODEL_PROVIDER", "fake")
    monkeypatch.setenv("VINSHC_AGENT_KNOWLEDGE_ENABLED", "true")
    monkeypatch.setenv("VINSHC_AGENT_KNOWLEDGE_ALLOW_DEVELOPMENT", "true")
    assert main.main(["--check", "--env-file", str(env)]) == 0


def test_invalid_configuration_exits_before_serving(tmp_path, clean_env, capsys):
    env = tmp_path / ".env"
    env.write_text("VINSHC_AGENT_MODEL_PROVIDER=anthropic\n", encoding="utf-8")
    assert main.main(["--check", "--env-file", str(env)]) == 2
    assert "VINSHC_AGENT_ALLOW_EXTERNAL_MODEL" in capsys.readouterr().err


def test_port_is_validated(clean_env):
    with pytest.raises(SystemExit):
        main.main(["--check", "--port", "70000", "--env-file", "missing.env"])


def test_mock_cli_checks_fixture_and_rejects_public_binding(tmp_path, clean_env, capsys):
    args = ['--data-provider', 'mock', '--model', 'fake', '--env-file', str(tmp_path / 'none.env'), '--check']
    assert main.main(args) == 0
    output = capsys.readouterr().out
    assert 'Nguồn dữ liệu: mock' in output and 'Cổng bệnh nhân: mock' in output
    assert main.main([*args, '--host', '0.0.0.0']) == 2
    assert 'loopback' in capsys.readouterr().err


CLAUDE_KEYS = ("VINSHC_AGENT_ALLOW_EXTERNAL_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE",
               "ANTHROPIC_FEDERATION_RULE_ID", "VINSHC_AGENT_ANTHROPIC_API_KEY_FILE")


@pytest.fixture
def claude_env(tmp_path, clean_env, monkeypatch):
    for key in CLAUDE_KEYS:
        monkeypatch.delenv(key, raising=False)
    env = tmp_path / ".env"
    env.write_text("VINSHC_AGENT_MODEL_PROVIDER=anthropic\nVINSHC_AGENT_ALLOW_EXTERNAL_MODEL=true\n"
                   "ANTHROPIC_API_KEY=sk-test-secret\n", encoding="utf-8")
    return env


def test_check_model_is_skipped_for_fake(tmp_path, clean_env, capsys):
    assert main.main(["--check-model", "--env-file", str(tmp_path / "none.env")]) == 0
    assert "không cần API key" in capsys.readouterr().out


def test_check_model_reports_credential_source_without_secret(claude_env, monkeypatch, capsys):
    from vinshc_agent.llm.claude import ClaudeChatModel

    async def ok(self):
        return "Claude Opus 5.5"

    monkeypatch.setattr(ClaudeChatModel, "check", ok)
    assert main.main(["--check-model", "--env-file", str(claude_env)]) == 0
    out = capsys.readouterr().out
    assert "Credential: biến ANTHROPIC_API_KEY" in out and "Claude Opus 5.5" in out
    assert "sk-test-secret" not in out


def test_check_model_fails_with_hint(claude_env, monkeypatch, capsys):
    from vinshc_agent.llm import ModelUnavailable
    from vinshc_agent.llm.claude import ClaudeChatModel

    async def bad(self):
        raise ModelUnavailable("auth_invalid")

    monkeypatch.setattr(ClaudeChatModel, "check", bad)
    assert main.main(["--check-model", "--env-file", str(claude_env)]) == 3
    assert "API key không hợp lệ" in capsys.readouterr().err


def test_empty_values_are_not_exported(tmp_path, claude_env, monkeypatch):
    env = tmp_path / "copied-from-example.env"
    env.write_text("ANTHROPIC_API_KEY=\nANTHROPIC_PROFILE=default\n", encoding="utf-8")
    assert main.load_env_file(env) == ["ANTHROPIC_PROFILE"]
    assert "ANTHROPIC_API_KEY" not in os.environ
