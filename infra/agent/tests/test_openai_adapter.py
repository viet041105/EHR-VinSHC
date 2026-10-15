"""OpenAI protocol/error regressions using MockTransport; never send data to OpenAI."""
import asyncio
import json

import httpx
import pytest

from vinshc_agent.config import ConfigError, load_settings
from vinshc_agent.llm import Conversation, Exchange, HistoryTurn, ModelUnavailable, ToolResult
from vinshc_agent.llm.openai import OpenAIChatModel
from vinshc_agent.prompts import DOCTOR_SYSTEM
from vinshc_agent.tools.doctor import DOCTOR_TOOLS

SPECS = [t.spec() for t in DOCTOR_TOOLS]


def reply(message, finish="stop"):
    return {"choices": [{"finish_reason": finish, "message": {"role": "assistant", **message}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "completion_tokens_details": {"reasoning_tokens": 2}}}


def test_tool_round_replays_assistant_message_and_parses_final():
    async def run():
        seen = []
        calls = [{"id": "call_1", "type": "function",
                  "function": {"name": "get_encounter_summary", "arguments": '{"encounter_ref": "current"}'}},
                 {"id": "call_2", "type": "function", "function": {"name": "get_active_allergies", "arguments": "{}"}}]
        final = {"scope": "answered", "statements": [{"text": "Mạch: 92", "fact_ids": ["F1"]}]}
        def handler(request):
            assert request.url.host == "api.openai.com"
            assert request.headers["authorization"] == "Bearer test-only-key"
            seen.append(json.loads(request.content))
            if len(seen) == 1:
                return httpx.Response(200, json=reply({"content": None, "tool_calls": calls}, "tool_calls"))
            return httpx.Response(200, json=reply({"content": json.dumps(final)}))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = OpenAIChatModel("gpt-5-mini", "low", 10, 0, "test-only-key", client=client)
            conv = Conversation("doctor", "Current encounter", [HistoryTurn("user", "Chào"), HistoryTurn("assistant", "Hello")], "Tóm tắt")
            first = await model.next_turn(DOCTOR_SYSTEM, SPECS, conv)
            assert [c.name for c in first.tool_calls] == ["get_encounter_summary", "get_active_allergies"]
            assert first.tool_calls[0].arguments == {"encounter_ref": "current"}
            assert first.usage == {"inputTokens": 10, "outputTokens": 5, "thinkingTokens": 2}
            conv.exchanges.append(Exchange(first, [ToolResult("call_1", '{"facts": []}', False),
                                                   ToolResult("call_2", '{"error": "Permission denied"}', True)]))
            second = await model.next_turn(DOCTOR_SYSTEM, SPECS, conv)
            assert second.final.statements[0].fact_ids == ["F1"]
        assert seen[0]["messages"][0] == {"role": "system", "content": DOCTOR_SYSTEM}
        assert seen[1]["messages"][:-3] == seen[0]["messages"]
        assert seen[1]["messages"][-3]["tool_calls"] == calls
        assert seen[1]["messages"][-1] == {"role": "tool", "tool_call_id": "call_2", "content": '{"error": "Permission denied"}'}
        assert seen[0]["reasoning_effort"] == "low"
        assert seen[0]["response_format"]["json_schema"]["strict"] is True
    asyncio.run(run())


@pytest.mark.parametrize("status,code", [(401, "auth_invalid"), (403, "permission_denied"),
                                        (404, "model_not_found"), (429, "rate_limited")])
def test_check_error_codes_are_safe_and_not_retried(status, code):
    async def run():
        seen = []
        def handler(request):
            seen.append(request)
            assert request.method == "GET" and request.url.path == "/v1/models/gpt-5-mini"
            return httpx.Response(status, json={"error": {"message": "Never expose test-only-key"}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = OpenAIChatModel("gpt-5-mini", None, 10, 3, "test-only-key", client=client)
            with pytest.raises(ModelUnavailable, match=code) as err:
                await model.check()
            assert "test-only-key" not in str(err.value)
        assert len(seen) == 1
    asyncio.run(run())


@pytest.mark.parametrize("message,finish,code", [({"content": "{}"}, "length", "truncated"),
                                                 ({"content": None, "refusal": "no"}, "stop", "refusal"),
                                                 ({"content": "not json"}, "stop", "invalid_output")])
def test_unusable_outputs_raise(message, finish, code):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=reply(message, finish)))) as client:
            model = OpenAIChatModel("gpt-4.1-mini", None, 10, 0, "k", client=client)
            with pytest.raises(ModelUnavailable, match=code):
                await model.next_turn(DOCTOR_SYSTEM, SPECS, Conversation("doctor", "c", [], "q"))
    asyncio.run(run())


def test_config_requires_key_and_external_flag(tmp_path):
    base = {"VINSHC_AGENT_MODEL_PROVIDER": "openai"}
    with pytest.raises(ConfigError, match="ALLOW_EXTERNAL_MODEL"):
        load_settings(base)
    with pytest.raises(ConfigError, match="OPENAI_API_KEY"):
        load_settings({**base, "VINSHC_AGENT_ALLOW_EXTERNAL_MODEL": "true"})
    settings = load_settings({**base, "VINSHC_AGENT_ALLOW_EXTERNAL_MODEL": "true", "OPENAI_API_KEY": "k",
                              "VINSHC_AGENT_OPENAI_MODEL": "gpt-4.1-mini", "VINSHC_AGENT_OPENAI_REASONING_EFFORT": ""})
    assert (settings.openai_model, settings.openai_reasoning_effort, settings.openai_credential) == ("gpt-4.1-mini", "", "OPENAI_API_KEY")
