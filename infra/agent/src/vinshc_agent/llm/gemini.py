"""Gemini GenerateContent REST adapter; preserves model parts and thought signatures."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from typing import Any

import httpx

from . import FINAL_SCHEMA, Conversation, FinalAnswer, ModelTurn, ModelUnavailable, ToolCall

API = "https://generativelanguage.googleapis.com/v1beta/models/"


def build_contents(conversation: Conversation) -> list[dict[str, Any]]:
    contents = [{"role": "user" if t.role == "user" else "model", "parts": [{"text": t.text}]}
                for t in conversation.history]
    contents.append({"role": "user", "parts": [{"text":
        f"<context>\n{conversation.context}\n</context>\n\n<message>\n{conversation.message}\n</message>"}]})
    for exchange in conversation.exchanges:
        # Gemini requires the original signatures on subsequent tool rounds.
        contents.append(deepcopy(exchange.turn.raw))
        names = {call.id: call.name for call in exchange.turn.tool_calls}
        native_ids = {p["functionCall"].get("id") for p in exchange.turn.raw["parts"] if "functionCall" in p}
        parts = []
        for result in exchange.results:
            if result.call_id not in names:
                raise ModelUnavailable("invalid_output")
            response = json.loads(result.content)
            if not isinstance(response, dict):
                raise ModelUnavailable("invalid_output")
            function = {"name": names[result.call_id], "response": response}
            if result.call_id in native_ids:
                function["id"] = result.call_id
            parts.append({"functionResponse": function})
        contents.append({"role": "user", "parts": parts})
    return contents


class GeminiChatModel:
    provider = "gemini"

    def __init__(self, model: str, thinking_level: str, timeout: float, max_retries: int,
                 api_key: str, max_tokens: int = 4096, client: httpx.AsyncClient | None = None):
        self.name = model
        self._thinking_level = thinking_level
        self._timeout = timeout
        self._max_retries = max_retries
        self._api_key = api_key
        self._max_tokens = max_tokens
        self._client = client

    async def _request(self, method: str, suffix: str = "", payload: dict | None = None) -> dict:
        headers = {"x-goog-api-key": self._api_key, "Accept": "application/json"}
        for attempt in range(self._max_retries + 1):
            try:
                if self._client is not None:
                    response = await self._client.request(method, API + self.name + suffix,
                        headers=headers, json=payload, timeout=self._timeout)
                else:
                    async with httpx.AsyncClient(trust_env=False, follow_redirects=False) as client:
                        response = await client.request(method, API + self.name + suffix,
                            headers=headers, json=payload, timeout=self._timeout)
            except httpx.RequestError:
                if attempt < self._max_retries:
                    await asyncio.sleep(min(0.5 * 2 ** attempt, 2))
                    continue
                raise ModelUnavailable("connection") from None
            if response.status_code >= 500 and attempt < self._max_retries:
                await asyncio.sleep(min(0.5 * 2 ** attempt, 2))
                continue
            if response.status_code != 200:
                # Do not retry quota failures or include the provider body/key in errors.
                code = {401: "auth_invalid", 403: "permission_denied", 404: "model_not_found",
                        429: "rate_limited"}.get(response.status_code, f"http_{response.status_code}")
                if response.status_code == 400:
                    try:
                        details = response.json().get("error", {}).get("details", [])
                        if any(d.get("reason") == "API_KEY_INVALID" for d in details if isinstance(d, dict)):
                            code = "auth_invalid"
                    except (ValueError, AttributeError):
                        pass
                raise ModelUnavailable(code)
            try:
                value = response.json()
            except ValueError:
                raise ModelUnavailable("invalid_output") from None
            if not isinstance(value, dict):
                raise ModelUnavailable("invalid_output")
            return value
        raise ModelUnavailable("connection")

    async def check(self) -> str:
        """Only retrieve model metadata; does not submit a chat or patient data."""
        result = await self._request("GET")
        if "generateContent" not in result.get("supportedGenerationMethods", []):
            raise ModelUnavailable("model_not_found")
        return result.get("displayName") or self.name

    async def next_turn(self, system: str, tools: list[dict[str, Any]], conversation: Conversation) -> ModelTurn:
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": build_contents(conversation),
            "tools": [{"functionDeclarations": [{"name": t["name"], "description": t["description"],
                        "parametersJsonSchema": t["input_schema"]} for t in tools]}],
            "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}},
            "generationConfig": {"maxOutputTokens": self._max_tokens,
                "thinkingConfig": {"thinkingLevel": self._thinking_level.upper()},
                "responseMimeType": "application/json", "responseJsonSchema": FINAL_SCHEMA},
        }
        response = await self._request("POST", ":generateContent", payload)
        if response.get("promptFeedback", {}).get("blockReason"):
            raise ModelUnavailable("refusal")
        try:
            candidate = response["candidates"][0]
            reason = candidate.get("finishReason")
            if reason == "MAX_TOKENS":
                raise ModelUnavailable("truncated")
            if reason in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}:
                raise ModelUnavailable("refusal")
            if reason != "STOP":
                raise ModelUnavailable("invalid_output")
            content = candidate["content"]
            parts = content["parts"]
            calls = []
            for index, part in enumerate(parts):
                if "functionCall" in part:
                    call = part["functionCall"]
                    calls.append(ToolCall(call.get("id") or f"gemini_{len(conversation.exchanges)}_{index}",
                                          call["name"], call.get("args", {})))
            if calls:
                if len({c.id for c in calls}) != len(calls):
                    raise ModelUnavailable("invalid_output")
                return ModelTurn(calls, None, deepcopy(content))
            text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
            return ModelTurn([], FinalAnswer.model_validate_json(text), deepcopy(content))
        except (AttributeError, KeyError, IndexError, TypeError, ValueError):
            raise ModelUnavailable("invalid_output") from None
