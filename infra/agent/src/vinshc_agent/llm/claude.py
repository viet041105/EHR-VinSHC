"""Adapter Claude cho vòng gọi tool. Chỉ bật khi cấu hình cho phép gửi dữ liệu ra ngoài (config.validate)."""

from __future__ import annotations

from typing import Any

from . import FINAL_SCHEMA, Conversation, FinalAnswer, ModelTurn, ModelUnavailable, ToolCall


def user_content(conversation: Conversation) -> str:
    return f"<context>\n{conversation.context}\n</context>\n\n<message>\n{conversation.message}\n</message>"


def build_messages(conversation: Conversation) -> list[dict[str, Any]]:
    """Lịch sử chỉ là văn bản (không mang thinking của lượt trước); các vòng tool của lượt này nối nguyên vẹn."""
    messages: list[dict[str, Any]] = [{"role": t.role, "content": t.text} for t in conversation.history]
    messages.append({"role": "user", "content": user_content(conversation)})
    for exchange in conversation.exchanges:
        messages.append({"role": "assistant", "content": exchange.turn.raw})
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": r.call_id, "content": r.content, "is_error": r.is_error}
                    for r in exchange.results
                ],
            }
        )
    return messages


class ClaudeChatModel:
    provider = "anthropic"

    def __init__(
        self, model: str, effort: str, timeout: float, max_retries: int, client: Any = None, api_key: str | None = None, max_tokens: int = 4096
    ):
        import anthropic  # chỉ cần khi bật provider này: pip install "vinshc-agent[anthropic]"

        self._anthropic = anthropic
        # api_key=None: SDK tự đọc ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / profile `ant auth login`.
        self._client = client or anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=max_retries)
        self.name = model
        self._effort = effort
        self._max_tokens = max_tokens

    def _unavailable(self, ex: Exception) -> ModelUnavailable:
        anthropic = self._anthropic
        if isinstance(ex, anthropic.AuthenticationError):
            return ModelUnavailable("auth_invalid")
        if isinstance(ex, anthropic.PermissionDeniedError):
            return ModelUnavailable("permission_denied")
        if isinstance(ex, anthropic.NotFoundError):
            return ModelUnavailable("model_not_found")
        if isinstance(ex, anthropic.RateLimitError):
            return ModelUnavailable("rate_limited")
        if isinstance(ex, anthropic.APIStatusError):
            return ModelUnavailable(f"http_{ex.status_code}")
        return ModelUnavailable("connection")  # APIConnectionError, gồm cả APITimeoutError

    async def check(self) -> str:
        """Xác nhận credential và quyền dùng model qua Models API (không tốn token, không gửi dữ liệu hồ sơ)."""
        try:
            info = await self._client.models.retrieve(self.name)
        except (self._anthropic.APIStatusError, self._anthropic.APIConnectionError) as ex:
            raise self._unavailable(ex) from ex
        return info.display_name or info.id

    async def next_turn(self, system: str, tools: list[dict[str, Any]], conversation: Conversation) -> ModelTurn:
        try:
            response = await self._client.beta.messages.create(
                model=self.name,
                max_tokens=self._max_tokens,
                system=system,
                tools=[{**tool, "strict": True} for tool in tools],
                messages=build_messages(conversation),
                output_config={"effort": self._effort, "format": {"type": "json_schema", "schema": FINAL_SCHEMA}},
                # system + tools cố định theo vai trò nên các vòng trong một lượt dùng lại cache.
                cache_control={"type": "ephemeral"},
                # Khi bộ lọc an toàn từ chối, API tự chạy lại trên model dự phòng phù hợp.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            )
        except (self._anthropic.APIStatusError, self._anthropic.APIConnectionError) as ex:
            raise self._unavailable(ex) from ex

        if response.stop_reason == "refusal":
            raise ModelUnavailable("refusal")
        if response.stop_reason == "max_tokens":
            raise ModelUnavailable("truncated")
        calls = [
            ToolCall(block.id, block.name, block.input)
            for block in response.content
            if block.type == "tool_use"
        ]
        if calls:
            return ModelTurn(calls, None, response.content)
        if response.stop_reason != "end_turn":
            raise ModelUnavailable(f"stop_{response.stop_reason}")
        text = next((block.text for block in response.content if block.type == "text"), None)
        if text is None:
            raise ModelUnavailable("empty")
        try:
            final = FinalAnswer.model_validate_json(text)
        except ValueError as ex:
            raise ModelUnavailable("invalid_output") from ex
        return ModelTurn([], final, response.content)
