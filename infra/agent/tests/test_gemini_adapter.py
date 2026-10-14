"""Gemini protocol/error regressions using MockTransport; never send data to Google."""
import asyncio
import json

import httpx
import pytest

from vinshc_agent.llm import Conversation, Exchange, HistoryTurn, ModelUnavailable, ToolResult
from vinshc_agent.llm.gemini import GeminiChatModel
from vinshc_agent.prompts import DOCTOR_SYSTEM
from vinshc_agent.tools.doctor import DOCTOR_TOOLS

SPECS = [t.spec() for t in DOCTOR_TOOLS]


def reply(parts, finish="STOP"):
    return {"candidates": [{"finishReason": finish, "content": {"role": "model", "parts": parts}}]}


@pytest.mark.parametrize("native_id", [None, "native-call-1"])
def test_parallel_tool_round_keeps_signatures_and_final_fact_ids(native_id):
    async def run():
        seen = []
        function = {"name": "get_encounter_summary", "args": {"encounter_ref": "current"}}
        if native_id:
            function["id"] = native_id
        raw = [{"functionCall": function, "thoughtSignature": "opaque-signature"},
               {"functionCall": {"name": "get_active_allergies", "args": {}}}]
        final = {"scope": "answered", "statements": [{"text": "Mạch: 92", "fact_ids": ["F1"]}]}
        def handler(request):
            assert request.url.host == "generativelanguage.googleapis.com"
            assert request.headers["x-goog-api-key"] == "test-only-key"
            assert "key" not in request.url.params
            seen.append(json.loads(request.content))
            return httpx.Response(200, json=reply(raw) if len(seen) == 1 else reply([
                {"thought": True, "text": "internal reasoning"}, {"text": json.dumps(final)}]))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 0, "test-only-key", client=client)
            conv = Conversation("doctor", "Current encounter", [HistoryTurn("assistant", "Hello")], "Tóm tắt")
            first = await model.next_turn(DOCTOR_SYSTEM, SPECS, conv)
            assert [c.name for c in first.tool_calls] == ["get_encounter_summary", "get_active_allergies"]
            conv.exchanges.append(Exchange(first, [
                ToolResult(first.tool_calls[0].id, '{"facts": []}', False),
                ToolResult(first.tool_calls[1].id, '{"error": "Permission denied"}', True)]))
            second = await model.next_turn(DOCTOR_SYSTEM, SPECS, conv)
            assert second.final.statements[0].fact_ids == ["F1"]
        assert seen[1]["contents"][:-2] == seen[0]["contents"]
        assert seen[1]["contents"][-2]["parts"] == raw
        responses = seen[1]["contents"][-1]["parts"]
        assert responses[1]["functionResponse"]["response"] == {"error": "Permission denied"}
        assert responses[0]["functionResponse"].get("id") == native_id
        assert "id" not in responses[1]["functionResponse"]
        assert seen[0]["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "LOW"
        assert seen[0]["generationConfig"]["responseJsonSchema"]["required"] == ["scope", "statements"]
    asyncio.run(run())


@pytest.mark.parametrize("status,code", [(401, "auth_invalid"), (403, "permission_denied"),
                                        (404, "model_not_found"), (429, "rate_limited")])
def test_check_error_codes_are_safe_and_quota_is_not_retried(status, code):
    async def run():
        seen = []
        def handler(request):
            seen.append(request)
            return httpx.Response(status, json={"error": {"message": "Never expose test-only-key"}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 3, "test-only-key", client=client)
            with pytest.raises(ModelUnavailable, match=code) as err:
                await model.check()
            assert "test-only-key" not in str(err.value)
        assert len(seen) == 1
    asyncio.run(run())


def test_check_is_metadata_only_and_invalid_key_400_is_recognized():
    async def run():
        def handler(request):
            assert request.method == "GET"
            assert request.url.path == "/v1beta/models/gemini-3.8-flash"
            assert request.content == b""
            return httpx.Response(200, json={"displayName": "Gemini 3.8 Flash",
                                            "supportedGenerationMethods": ["generateContent"]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 0, "test-only-key", client=client)
            assert await model.check() == "Gemini 3.8 Flash"
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(400,
                json={"error": {"details": [{"reason": "API_KEY_INVALID"}]}}))) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 0, "test-only-key", client=client)
            with pytest.raises(ModelUnavailable, match="auth_invalid"):
                await model.check()
    asyncio.run(run())


@pytest.mark.parametrize("data,code", [
    (reply([{"text": "{}"}], "MAX_TOKENS"), "truncated"),
    ({"promptFeedback": {"blockReason": "SAFETY"}}, "refusal"),
    (reply([], "SAFETY"), "refusal"),
    (reply([{"text": "plain text"}]), "invalid_output"),
    (reply([{"text": '{}'}]), "invalid_output"),
    ({"candidates": []}, "invalid_output"),
])
def test_unusable_model_output_fails_closed(data, code):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=data))) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 0, "test-only-key", client=client)
            with pytest.raises(ModelUnavailable, match=code):
                await model.next_turn(DOCTOR_SYSTEM, SPECS, Conversation("doctor", "Context", [], "Question"))
    asyncio.run(run())


def test_transient_server_failure_can_retry_without_retrying_quota():
    async def run():
        seen = []
        def handler(request):
            seen.append(request)
            return httpx.Response(503, json={}) if len(seen) == 1 else httpx.Response(200,
                json={"displayName": "Gemini", "supportedGenerationMethods": ["generateContent"]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            model = GeminiChatModel("gemini-3.8-flash", "low", 10, 1, "test-only-key", client=client)
            assert await model.check() == "Gemini"
        assert len(seen) == 2
    asyncio.run(run())


def test_doctor_endpoint_runs_gemini_tool_loop_and_returns_source_facts(make_client):
    from conftest import HEADERS, doctor_body
    seen = []
    def handler(request):
        assert "authorization" not in request.headers
        assert "x-vinshc-workspace-role" not in request.headers
        payload = json.loads(request.content)
        seen.append(payload)
        if len(seen) == 1:
            return httpx.Response(200, json=reply([{"functionCall": {
                "name": "get_encounter_summary", "args": {"encounter_ref": "current"}},
                "thoughtSignature": "signature"}]))
        facts = payload["contents"][-1]["parts"][0]["functionResponse"]["response"]["facts"]
        assert facts
        final = {"scope": "answered", "statements": [{
            "text": f"{facts[0]['label']}: {facts[0]['value']}", "fact_ids": [facts[0]["id"]]}]}
        return httpx.Response(200, json=reply([{"text": json.dumps(final)}]))
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    model = GeminiChatModel("gemini-3.8-flash", "low", 10, 0, "test-only-key", client=http)
    try:
        client = make_client(model=model)
        response = client.post("/v1/doctor/chat", headers=HEADERS, json=doctor_body("Tóm tắt lần khám này"))
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["model"] == {"provider": "gemini", "name": "gemini-3.8-flash"}
        assert data["answer"][0]["sources"]
        assert data["toolsUsed"] == ["get_encounter_summary"]
        assert len(seen) == 2
    finally:
        asyncio.run(http.aclose())
