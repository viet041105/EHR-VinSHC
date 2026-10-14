"""Adapter Claude với transport giả: không gọi mạng, không cần API key thật."""

import asyncio
import json

import pytest

anthropic = pytest.importorskip("anthropic")
httpx2 = pytest.importorskip("httpx2")

from vinshc_agent.llm import Conversation, Exchange, HistoryTurn, ModelUnavailable, ToolResult  # noqa: E402
from vinshc_agent.llm.claude import ClaudeChatModel  # noqa: E402
from vinshc_agent.prompts import DOCTOR_SYSTEM  # noqa: E402
from vinshc_agent.tools.doctor import DOCTOR_TOOLS  # noqa: E402

SPECS = [t.spec() for t in DOCTOR_TOOLS]


def model_with(replies: list[dict], seen: list):
    def handler(request):
        seen.append(json.loads(request.content))
        seen[-1]["_beta"] = request.headers.get("anthropic-beta")
        return httpx2.Response(200, json=replies[len(seen) - 1])

    client = anthropic.AsyncAnthropic(
        api_key="test-key", max_retries=0,
        http_client=anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    return ClaudeChatModel("claude-opus-5-5", "high", 10, 0, client=client)


def message(content: list[dict], stop_reason: str) -> dict:
    return {"id": "msg_test", "type": "message", "role": "assistant", "model": "claude-opus-5-5", "content": content,
            "stop_reason": stop_reason, "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}


def conversation():
    return Conversation("doctor", "Thời điểm hiện tại: …", [HistoryTurn("user", "Chào"), HistoryTurn("assistant", "Chào bác sĩ.")],
                        "Tóm tắt lần khám")


def test_tool_round_then_final_answer_append_only():
    seen = []
    tool_use = {"type": "tool_use", "id": "toolu_1", "name": "get_encounter_summary", "input": {"encounter_ref": "current"}}
    final = {"type": "text", "text": json.dumps({"scope": "answered", "statements": [{"text": "Mạch 92 lần/phút.", "fact_ids": ["F1"]}]})}
    model = model_with([message([tool_use], "tool_use"), message([final], "end_turn")], seen)
    conv = conversation()

    turn = asyncio.run(model.next_turn(DOCTOR_SYSTEM, SPECS, conv))
    assert [(c.name, c.arguments) for c in turn.tool_calls] == [("get_encounter_summary", {"encounter_ref": "current"})]
    conv.exchanges.append(Exchange(turn, [ToolResult("toolu_1", '{"facts": []}', False)]))
    turn = asyncio.run(model.next_turn(DOCTOR_SYSTEM, SPECS, conv))
    assert turn.final.statements[0].fact_ids == ["F1"]

    first, second = seen
    assert first["model"] == "claude-opus-5-5" and first["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in first["_beta"]
    assert first["output_config"]["effort"] == "high" and first["output_config"]["format"]["type"] == "json_schema"
    assert all(t["strict"] and t["input_schema"]["additionalProperties"] is False for t in first["tools"])
    assert first["cache_control"] == {"type": "ephemeral"}
    assert "thinking" not in first and "tool_choice" not in first
    assert first["system"] == second["system"] and first["tools"] == second["tools"]
    # Vòng sau giữ nguyên các message trước (append-only), rồi thêm assistant + tool_result.
    assert second["messages"][: len(first["messages"])] == first["messages"]
    assert second["messages"][-2]["content"][0]["id"] == "toolu_1"
    assert second["messages"][-1]["content"][0] == {"type": "tool_result", "tool_use_id": "toolu_1",
                                                     "content": '{"facts": []}', "is_error": False}
    assert first["messages"][2]["content"].startswith("<context>")


@pytest.mark.parametrize("reply", [
    message([], "refusal"),
    message([{"type": "text", "text": "không phải JSON"}], "end_turn"),
    message([{"type": "text", "text": "{}"}], "max_tokens"),
])
def test_unusable_replies_raise_model_unavailable(reply):
    with pytest.raises(ModelUnavailable):
        asyncio.run(model_with([reply], []).next_turn(DOCTOR_SYSTEM, SPECS, conversation()))


def models_api(status: int, seen: list):
    def handler(request):
        seen.append(request)
        if status != 200:
            return httpx2.Response(status, json={"type": "error", "error": {"type": "authentication_error", "message": "x"}})
        return httpx2.Response(200, json={"type": "model", "id": "claude-opus-5-5", "display_name": "Claude Opus 5.5",
                                          "created_at": "2026-09-01T00:00:00Z"})

    client = anthropic.AsyncAnthropic(
        api_key="sk-test-key", max_retries=0,
        http_client=anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    return ClaudeChatModel("claude-opus-5-5", "high", 10, 0, client=client)


def test_check_verifies_key_with_models_api_only():
    seen = []
    assert asyncio.run(models_api(200, seen).check()) == "Claude Opus 5.5"
    [request] = seen
    assert request.method == "GET" and request.url.path == "/v1/models/claude-opus-5-5"
    assert request.headers["x-api-key"] == "sk-test-key"


@pytest.mark.parametrize("status,code", [(401, "auth_invalid"), (403, "permission_denied"), (404, "model_not_found")])
def test_check_maps_errors(status, code):
    with pytest.raises(ModelUnavailable, match=code):
        asyncio.run(models_api(status, []).check())


def test_explicit_key_is_passed_to_sdk():
    model = ClaudeChatModel("claude-opus-5-5", "high", 10, 0, api_key="sk-from-file")
    assert model._client.api_key == "sk-from-file"
