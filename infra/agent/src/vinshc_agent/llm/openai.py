"""OpenAI Chat Completions REST adapter: tool calling plus a JSON-schema final answer."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from typing import Any

import httpx

from . import FINAL_SCHEMA, Conversation, FinalAnswer, ModelTurn, ModelUnavailable, ToolCall

API = "https://api.openai.com/v1/"


def build_messages(system: str, conversation: Conversation) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    messages += [{"role": t.role, "content": t.text} for t in conversation.history]
    messages.append({"role": "user", "content":
        f"<context>\n{conversation.context}\n</context>\n\n<message>\n{conversation.message}\n</message>"})
    for exchange in conversation.exchanges:
        # The assistant message carrying tool_calls must be replayed before its tool results.
        messages.append(deepcopy(exchange.turn.raw))
        ids = {call.id for call in exchange.turn.tool_calls}
        for result in exchange.results:
            if result.call_id not in ids:
                raise ModelUnavailable("invalid_output")
            messages.append({"role": "tool", "tool_call_id": result.call_id, "content": result.content})
    return messages


class OpenAIChatModel:
    provider = "openai"

    def __init__(self, model: str, reasoning_effort: str | None, timeout: float, max_retries: int,
                 api_key: str, max_tokens: int = 4096, client: httpx.AsyncClient | None = None):
        self.name = model
        self._reasoning_effort = reasoning_effort
        self._timeout = timeout
        self._max_retries = max_retries
        self._api_key = api_key
        self._max_tokens = max_tokens
        self._client = client

    async def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self._api_key}", "Accept": "application/json"}
        for attempt in range(self._max_retries + 1):
            try:
                if self._client is not None:
                    response = await self._client.request(method, API + path, headers=headers,
                                                          json=payload, timeout=self._timeout)
                else:
                    async with httpx.AsyncClient(trust_env=False, follow_redirects=False) as client:
                        response = await client.request(method, API + path, headers=headers,
                                                        json=payload, timeout=self._timeout)
            except httpx.RequestError:
                if attempt < self._max_retries:
                    await asyncio.sleep(min(0.5 * 2 ** attempt, 2))
                    continue
                raise ModelUnavailable("connection") from None
            if response.status_code >= 500 and attempt < self._max_retries:
                await asyncio.sleep(min(0.5 * 2 ** attempt, 2))
                continue
            if response.status_code != 200:
                # Do not include the provider body or key in errors.
                code = {401: "auth_invalid", 403: "permission_denied", 404: "model_not_found",
                        429: "rate_limited"}.get(response.status_code, f"http_{response.status_code}")
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
        result = await self._request("GET", "models/" + self.name)
        return result.get("id") or self.name

    async def next_turn(self, system: str, tools: list[dict[str, Any]], conversation: Conversation) -> ModelTurn:
        payload: dict[str, Any] = {
            "model": self.name,
            "messages": build_messages(system, conversation),
            "tools": [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                       "parameters": t["input_schema"]}} for t in tools],
            "tool_choice": "auto",
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "final_answer", "strict": True, "schema": FINAL_SCHEMA}},
            "max_completion_tokens": self._max_tokens,
        }
        if self._reasoning_effort:
            payload["reasoning_effort"] = self._reasoning_effort
        if not tools:
            del payload["tools"], payload["tool_choice"]
        response = await self._request("POST", "chat/completions", payload)
        raw_usage = response.get("usage") or {}
        if not isinstance(raw_usage, dict):
            raw_usage = {}
        details = raw_usage.get("completion_tokens_details") or {}
        usage = {"inputTokens": raw_usage.get("prompt_tokens"), "outputTokens": raw_usage.get("completion_tokens"),
                 "thinkingTokens": details.get("reasoning_tokens") if isinstance(details, dict) else None}
        usage = {k: v for k, v in usage.items() if isinstance(v, int) and not isinstance(v, bool) and v >= 0} or None
        try:
            choice = response["choices"][0]
            reason = choice.get("finish_reason")
            message = choice["message"]
            if reason == "length":
                raise ModelUnavailable("truncated")
            if reason == "content_filter" or message.get("refusal"):
                raise ModelUnavailable("refusal")
            raw = {"role": "assistant", "content": message.get("content")}
            calls = []
            for call in message.get("tool_calls") or []:
                if call.get("type") != "function":
                    raise ModelUnavailable("invalid_output")
                function = call["function"]
                calls.append(ToolCall(call["id"], function["name"], json.loads(function.get("arguments") or "{}")))
            if calls:
                if len({c.id for c in calls}) != len(calls):
                    raise ModelUnavailable("invalid_output")
                raw["tool_calls"] = deepcopy(message["tool_calls"])
                return ModelTurn(calls, None, raw, usage)
            if reason != "stop":
                raise ModelUnavailable("invalid_output")
            return ModelTurn([], FinalAnswer.model_validate_json(message.get("content") or ""), raw, usage)
        except (AttributeError, KeyError, IndexError, TypeError, ValueError):
            raise ModelUnavailable("invalid_output") from None
