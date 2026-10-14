"""Graph LangGraph của chatbot: screen → think ⇄ act → check.

- screen: guardrail đầu vào; từ chối/cấp cứu thì dừng, không gọi model.
- think: model đọc hội thoại và chọn gọi tool hoặc trả câu trả lời có cấu trúc.
- act: chạy tool trong allowlist của vai trò, với giới hạn số vòng và số tool mỗi vòng.
- check: kiểm tra nguồn và guardrail đầu ra cho từng câu.

Phụ thuộc (model, tool, credential, registry) đi qua `context` của LangGraph, không nằm trong state.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from . import guardrails
from .guardrails import Verdict
from .llm import ChatModel, Conversation, Exchange, FinalAnswer, HistoryTurn, ModelUnavailable, ToolResult
from .schemas import DISCLAIMERS, AnswerOut, ChatOut, DoctorContextOut, MissingOut, ModelOut, SourceOut
from .tools import Tool, ToolContext, execute
from .validate import Validation, validate

LIMIT_MESSAGE = "Đã đạt giới hạn số lần đọc dữ liệu trong một lượt hỏi; hãy trả lời bằng dữ kiện đã có."
PER_ROUND_MESSAGE = "Vượt giới hạn số tool trong một vòng; chỉ gọi những tool cần thiết nhất."


@dataclass(frozen=True)
class AgentDeps:
    model: ChatModel
    tools: dict[str, Tool]
    system: str
    ctx: ToolContext
    allowed_uuids: frozenset[str]
    max_rounds: int
    max_calls_per_round: int
    clinic_contact: str | None = None

    @property
    def specs(self) -> list[dict[str, Any]]:
        return [tool.spec() for tool in self.tools.values()]


class ChatState(TypedDict, total=False):
    conversation: Conversation
    verdict: Verdict
    rounds: int
    final: FinalAnswer | None
    model_error: str | None
    stopped: str | None
    validation: Validation
    leaked: bool


async def screen(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    conversation = state["conversation"]
    verdict = guardrails.screen_input(
        conversation.persona,
        conversation.message,
        [turn.text for turn in conversation.history],
        set(deps.allowed_uuids),
        deps.clinic_contact,
    )
    if verdict.action == "allow":
        conversation.message = guardrails.redact(conversation.message)
        conversation.history = [HistoryTurn(t.role, guardrails.redact(t.text)) for t in conversation.history]
    return {"verdict": verdict, "conversation": conversation, "rounds": 0}


async def think(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    conversation = state["conversation"]
    try:
        turn = await deps.model.next_turn(deps.system, deps.specs, conversation)
    except ModelUnavailable as ex:
        return {"model_error": str(ex)}
    if not turn.tool_calls:
        if turn.final is None:
            return {"model_error": "empty_turn"}
        return {"final": turn.final}
    if state.get("rounds", 0) > deps.max_rounds:
        return {"stopped": "tool_limit"}
    conversation.exchanges.append(Exchange(turn))
    return {"conversation": conversation}


async def act(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    exchange = state["conversation"].exchanges[-1]
    rounds = state.get("rounds", 0) + 1
    for index, call in enumerate(exchange.turn.tool_calls):
        # Mỗi tool_use phải có đúng một tool_result, kể cả khi bị từ chối vì vượt giới hạn.
        if rounds > deps.max_rounds:
            exchange.results.append(ToolResult(call.id, json.dumps({"error": LIMIT_MESSAGE}, ensure_ascii=False), True))
        elif index >= deps.max_calls_per_round:
            exchange.results.append(ToolResult(call.id, json.dumps({"error": PER_ROUND_MESSAGE}, ensure_ascii=False), True))
        else:
            exchange.results.append(await execute(deps.tools, deps.ctx, call))
    return {"rounds": rounds}


def check(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    final = state["final"]
    leaked = any(guardrails.leaks_prompt(s.text) for s in final.statements)
    return {"validation": validate(final, deps.ctx.registry, deps.ctx.persona), "leaked": leaked}


def after_screen(state: ChatState) -> str:
    return "think" if state["verdict"].action == "allow" else END


def after_think(state: ChatState) -> str:
    if state.get("final") is not None:
        return "check"
    if state.get("model_error") or state.get("stopped"):
        return END
    return "act"


def build_graph():
    builder = StateGraph(ChatState, context_schema=AgentDeps)
    builder.add_node("screen", screen)
    builder.add_node("think", think)
    builder.add_node("act", act)
    builder.add_node("check", check)
    builder.add_edge(START, "screen")
    builder.add_conditional_edges("screen", after_screen, ["think", END])
    builder.add_conditional_edges("think", after_think, ["check", "act", END])
    builder.add_edge("act", "think")
    builder.add_edge("check", END)
    return builder.compile()


def _status(state: ChatState, persona: str, clinic_contact: str | None) -> tuple[str, str | None, bool]:
    """(status, message, có hiển thị câu trả lời không)."""
    verdict = state["verdict"]
    contact = f" Liên hệ phòng khám: {clinic_contact}." if clinic_contact else ""
    if verdict.action == "emergency":
        return "emergency", verdict.message, False
    if verdict.action == "refuse":
        return "refused", verdict.message, False
    if state.get("leaked"):
        return "refused", "Không thể hiển thị câu trả lời này.", False
    if state.get("model_error"):
        fallback = "hãy đọc hồ sơ trực tiếp." if persona == "doctor" else "vui lòng thử lại sau hoặc liên hệ phòng khám." + contact
        return "limited", "Trợ lý tạm thời không trả lời được; " + fallback, False
    if state.get("stopped"):
        return "limited", "Câu hỏi cần đọc quá nhiều dữ liệu trong một lượt; hãy hỏi cụ thể hơn.", False
    final = state["final"]
    validation = state["validation"]
    if final.scope == "out_of_scope":
        if persona == "doctor":
            return "out_of_scope", "Câu hỏi nằm ngoài phạm vi hồ sơ đang mở; trợ lý chỉ đọc và tóm tắt hồ sơ này.", False
        return "out_of_scope", "Câu hỏi này cần nhân viên y tế trả lời; trợ lý chỉ giải thích thông tin đã có trong hồ sơ của bạn." + contact, False
    if not validation.accepted:
        if validation.rejected:
            return "limited", "Không câu trả lời nào qua được kiểm tra nguồn và an toàn.", False
        return "not_found", "Không tìm thấy dữ kiện phù hợp trong nguồn đang đọc.", False
    if validation.rejected:
        return "limited", f"Đã bỏ {len(validation.rejected)} ý không kiểm chứng được nguồn hoặc không an toàn.", True
    return "ok", None, True


def build_response(
    state: ChatState, request_id: str, deps: AgentDeps, context: DoctorContextOut | None
) -> ChatOut:
    persona = deps.ctx.persona
    status, message, show = _status(state, persona, deps.clinic_contact)
    answer: list[AnswerOut] = []
    if show:
        for checked in state["validation"].accepted:
            answer.append(
                AnswerOut(
                    text=checked.statement.text,
                    sources=[
                        SourceOut(factId=f.id, section=f.section, label=f.label, **asdict(f.source)) for f in checked.facts
                    ],
                )
            )
    blocked = state["verdict"].action != "allow"
    registry = deps.ctx.registry
    return ChatOut(
        requestId=request_id,
        persona=persona,
        status=status,
        message=message,
        answer=answer,
        missing=[] if blocked else [MissingOut(**asdict(g)) for g in registry.missing()],
        notes=[] if blocked else registry.notes,
        toolsUsed=list(dict.fromkeys(deps.ctx.used)),
        context=context,
        disclaimer=DISCLAIMERS[persona],
        generatedAt=datetime.now(timezone.utc).isoformat(),
        model=ModelOut(provider=deps.model.provider, name=deps.model.name),
    )
