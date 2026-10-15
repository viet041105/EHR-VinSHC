"""Graph LangGraph của chatbot: screen → think ⇄ act → check.

- screen: guardrail đầu vào; từ chối/cấp cứu thì dừng, không gọi model.
- think: model đọc hội thoại và chọn gọi tool hoặc trả câu trả lời có cấu trúc.
- act: chạy tool trong allowlist của vai trò, với giới hạn số vòng và số tool mỗi vòng.
- check: kiểm tra nguồn và guardrail đầu ra cho từng câu.

Phụ thuộc (model, tool, credential, registry) đi qua `context` của LangGraph, không nằm trong state.
"""

from __future__ import annotations

import json
import asyncio
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, TypedDict, Callable, Awaitable

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from . import guardrails
from .guardrails import Verdict
from .llm import ChatModel, Conversation, Exchange, FinalAnswer, HistoryTurn, ModelUnavailable, ToolResult
from .schemas import DISCLAIMERS, AnswerOut, ChatOut, DoctorContextOut, MissingOut, ModelOut, SourceOut
from .text import fold
from .tools import Tool, ToolContext, execute
from .validate import Validation, validate

LIMIT_MESSAGE = "Đã đạt giới hạn số lần đọc dữ liệu trong một lượt hỏi; hãy trả lời bằng dữ kiện đã có."
PER_ROUND_MESSAGE = "Vượt giới hạn số tool trong một vòng; chỉ gọi những tool cần thiết nhất."
SOURCE_REPAIR = """\n\n## Yêu cầu sửa phản hồi chưa đọc nguồn
Phản hồi vừa rồi có statements nhưng chưa gọi tool nào, nên không có nguồn và chưa được hiển thị.
Đọc lại ý định của câu hỏi và lịch sử: nếu hỏi về cuộc trò chuyện, gọi recall_conversation;
nếu hỏi bệnh án hoặc tài liệu, gọi tool đọc nguồn phù hợp. Không viết lại lời hội thoại thành
statements không có fact_ids. Nếu câu hỏi ngoài phạm vi thì trả out_of_scope. Chỉ có một lần sửa này.
"""


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
    progress: Callable[[dict], Awaitable[None]] | None = None

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
    model_calls: int
    usage: dict[str, int]
    service_message: str | None
    source_repair: bool
    conversation_allowed: bool


def service_message(persona: str, message: str) -> str | None:
    """Only standalone greetings/help; mixed requests still go through the model and tools."""
    text = fold(message.strip().rstrip(".!?…,:; "))
    greeting = re.fullmatch(r"(?:hello|hi|hey|(?:xin )?chao)(?: ban| bac si| tro ly)?", text)
    help_request = text in {
        "ban la ai", "ban ten la gi", "ban lam duoc gi", "ban co the lam gi",
        "ban giup duoc gi", "ban co the giup gi", "who are you", "what can you do",
    }
    if not greeting and not help_request:
        return None
    if persona == "doctor":
        return ("Chào bác sĩ. Tôi là trợ lý hồ sơ VinSHC. Tôi có thể tóm tắt lần khám, "
                "tra thông tin đã ghi, xem lịch sử và trả lời kèm nguồn để bác sĩ đối chiếu. "
                "Bác sĩ có thể thử: ‘Tóm tắt lần khám này’ hoặc ‘Mạch lần khám này bao nhiêu?’.")
    return ("Chào bạn. Tôi là trợ lý hồ sơ VinSHC. Tôi giúp bạn xem lời dặn sau khám, "
            "hướng dẫn dùng thuốc đã ghi và lịch tái khám trong hồ sơ phòng khám đã cung cấp cho bạn. "
            "Bạn có thể thử: ‘Lời dặn sau khám của tôi là gì?’.")


async def emit(deps, event, **details):
    if deps.progress:
        await deps.progress({"event": event, **details})


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
        deps.ctx.conversation_history = tuple(conversation.history)
    return {"verdict": verdict, "conversation": conversation, "rounds": 0,
            "service_message": service_message(conversation.persona, conversation.message)
            if verdict.action == "allow" else None}


async def think(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    conversation = state["conversation"]
    calls = state.get("model_calls", 0) + 1
    await emit(deps, "thinking", round=state.get("rounds", 0))
    try:
        system = deps.system + SOURCE_REPAIR if state.get("source_repair") else deps.system
        turn = await deps.model.next_turn(system, deps.specs, conversation)
    except ModelUnavailable as ex:
        code = str(ex)
        if not re.fullmatch(r"(?:http_\d{3}|[a-z_]{1,48})", code):
            code = "model_unavailable"
        return {"model_error": code, "model_calls": calls}
    usage = dict(state.get("usage", {}))
    for key, value in (turn.usage or {}).items():
        usage[key] = usage.get(key, 0) + value
    counters = {"model_calls": calls, "usage": usage}
    if not turn.tool_calls:
        if turn.final is None:
            return {"model_error": "empty_turn", **counters}
        return {"final": turn.final, **counters}
    if state.get("rounds", 0) > deps.max_rounds:
        return {"stopped": "tool_limit", **counters}
    conversation.exchanges.append(Exchange(turn))
    return {"conversation": conversation, **counters}


async def act(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    exchange = state["conversation"].exchanges[-1]
    rounds = state.get("rounds", 0) + 1
    async def perform(index, call):
        # Mỗi tool_use phải có đúng một tool_result, kể cả khi bị từ chối vì vượt giới hạn.
        if rounds > deps.max_rounds:
            return ToolResult(call.id, json.dumps({"error": LIMIT_MESSAGE}, ensure_ascii=False), True)
        elif index >= deps.max_calls_per_round:
            return ToolResult(call.id, json.dumps({"error": PER_ROUND_MESSAGE}, ensure_ascii=False), True)
        else:
            safe_name = call.name if call.name in deps.tools else "unknown_tool"
            await emit(deps, "tool_start", tool=safe_name)
            result = await execute(deps.tools, deps.ctx, call)
            await emit(deps, "tool_end", tool=safe_name, ok=not result.is_error)
            return result
    if deps.ctx.parallel:
        tasks = [asyncio.create_task(perform(i, call)) for i, call in enumerate(exchange.turn.tool_calls)]
        try:
            exchange.results.extend(await asyncio.gather(*tasks))
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
    else:
        for i, call in enumerate(exchange.turn.tool_calls):
            exchange.results.append(await perform(i, call))
    return {"rounds": rounds}


def check(state: ChatState, runtime: Runtime[AgentDeps]) -> dict[str, Any]:
    deps = runtime.context
    if deps.ctx.knowledge is not None and deps.ctx.knowledge_scope is not None:
        for fact in deps.ctx.registry.facts:
            if fact.source.kind == "document":
                deps.ctx.knowledge.corpus.read(fact.source.uuid, deps.ctx.knowledge_scope)
    final = state["final"]
    leaked = any(guardrails.leaks_prompt(s.text) for s in final.statements)
    validation = validate(final, deps.ctx.registry, deps.ctx.persona)
    # Selecting recall is not proof that it answers the current request. The model
    # must finish the turn after seeing its result; out-of-scope/wrong routes never
    # bypass the final check or expose an unrelated transcript.
    conversation_allowed = bool(deps.ctx.conversation_reply and final.scope == "answered" and not leaked
                                and (validation.accepted or not final.statements))
    if conversation_allowed and set(deps.ctx.used) == {"recall_conversation"} and not final.statements:
        return {"validation": validation, "leaked": False, "conversation_allowed": True,
                "service_message": deps.ctx.conversation_reply}
    # A provider can answer directly instead of selecting a source tool. Give it one
    # bounded correction for any wording/topic; never accept unsourced prose as a fix.
    if (not leaked and not deps.ctx.used and not state.get("source_repair")
            and final.scope == "answered" and validation.rejected
            and all(reason == "no_source" for _, reason in validation.rejected)):
        return {"validation": validation, "leaked": False, "source_repair": True, "final": None}
    return {"validation": validation, "leaked": leaked, "conversation_allowed": conversation_allowed}


def after_screen(state: ChatState) -> str:
    return "think" if state["verdict"].action == "allow" and not state.get("service_message") else END


def after_think(state: ChatState) -> str:
    if state.get("final") is not None:
        return "check"
    if state.get("model_error") or state.get("stopped"):
        return END
    return "act"


def after_check(state: ChatState) -> str:
    return "think" if state.get("source_repair") and state.get("final") is None else END


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
    builder.add_conditional_edges("check", after_check, ["think", END])
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
    if state.get("service_message"):
        return "ok", state["service_message"], False
    if model_error := state.get("model_error"):
        fallback = "hãy đọc hồ sơ trực tiếp." if persona == "doctor" else "vui lòng thử lại sau hoặc liên hệ phòng khám." + contact
        reason = {
            "connection": "Không nhận được phản hồi từ dịch vụ AI do lỗi kết nối hoặc quá thời gian chờ",
            "http_503": "Dịch vụ AI đang tạm thời không sẵn sàng (503)",
            "rate_limited": "Dịch vụ AI đã đạt giới hạn lượt gọi",
            "circuit_open": "Kết nối dịch vụ AI đang tạm ngắt sau nhiều lần lỗi",
            "auth_invalid": "Khóa truy cập dịch vụ AI không hợp lệ; cần người quản trị kiểm tra",
            "permission_denied": "Dịch vụ AI từ chối quyền truy cập; cần người quản trị kiểm tra",
            "model_not_found": "Model AI được cấu hình không khả dụng; cần người quản trị kiểm tra",
        }.get(model_error, "Trợ lý tạm thời không trả lời được")
        return "limited", reason + "; " + fallback, False
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
    if all(f.state == "none_in_source" for checked in validation.accepted for f in checked.facts):
        return "not_found", None, True
    return "ok", None, True


def build_response(
    state: ChatState, request_id: str, deps: AgentDeps, context: DoctorContextOut | None
) -> ChatOut:
    persona = deps.ctx.persona
    status, message, show = _status(state, persona, deps.clinic_contact)
    if status == "out_of_scope" and deps.ctx.knowledge is not None:
        message = "Trợ lý chỉ đọc hồ sơ được phép và tài liệu hướng dẫn hệ thống; câu hỏi này cần nhân viên y tế hoặc người phụ trách trả lời."
    if context is not None and context.patientUuid is None and status in ("not_found", "out_of_scope"):
        message = ("Chưa chọn hồ sơ nên trợ lý chỉ trả lời từ tài liệu hướng dẫn. "
                   "Để hỏi về một bệnh nhân, hãy chọn bệnh nhân và lần khám.")
    if deps.ctx.read_errors and status not in ("refused", "emergency"):
        status, message = "limited", "Một số nguồn chưa đọc được; xem thông tin thiếu/lỗi bên dưới."
    # A verified absence from the comparison tool is an operational result. Do not
    # rely on the model to cite a fact ID for a gap, or show current facts as a comparison.
    no_prior = next((gap for gap in deps.ctx.registry.gaps if gap.reason == "no_previous_visit"), None)
    comparison_only = set(deps.ctx.used) == {"compare_previous_visit"}
    accepted = state.get("validation", Validation()).accepted
    if (no_prior and "compare_previous_visit" in deps.ctx.used
            and state["verdict"].action == "allow" and not state.get("leaked")
            and not state.get("model_error") and not deps.ctx.read_errors):
        status, message, show = "not_found", no_prior.detail, bool(accepted and not comparison_only)
    no_current = next((gap for gap in deps.ctx.registry.gaps if gap.reason == "no_current_encounter"), None)
    if (no_current and not accepted and state["verdict"].action == "allow" and not state.get("leaked")
            and not state.get("model_error") and not deps.ctx.read_errors):
        status, message, show = "not_found", no_current.detail, False
    if (state.get("conversation_allowed") and not state.get("service_message")
            and status in ("ok", "limited")):
        message = deps.ctx.conversation_reply + ("\n\n" + message if message else "")
    answer: list[AnswerOut] = []
    answers_by_text: dict[str, AnswerOut] = {}
    sources_by_text: dict[str, set] = {}
    if show:
        for checked in state["validation"].accepted:
            text = checked.statement.text
            if text not in answers_by_text:
                answers_by_text[text] = AnswerOut(text=text, sources=[])
                sources_by_text[text] = set()
                answer.append(answers_by_text[text])
            for fact in checked.facts:
                for evidence in deps.ctx.registry.evidence(fact):
                    # A request-local fact ID may change when two tools read the same record.
                    # Merge the line, but retain every distinct record/field/time/version.
                    key = (evidence.section, evidence.label, evidence.source)
                    if key not in sources_by_text[text]:
                        sources_by_text[text].add(key)
                        answers_by_text[text].sources.append(
                            SourceOut(factId=evidence.id, section=evidence.section, label=evidence.label,
                                      **asdict(evidence.source))
                        )
    blocked = state["verdict"].action != "allow"
    registry = deps.ctx.registry
    relevant_sections = {fact.section for checked in state.get("validation", Validation()).accepted for fact in checked.facts}
    if no_prior and status == "not_found":
        relevant_sections = {no_prior.section}
    missing = registry.missing()
    full_summary = "get_encounter_summary" in deps.ctx.used and "visits" in relevant_sections
    if relevant_sections and not full_summary:
        missing = [gap for gap in missing if gap.section in relevant_sections]
    return ChatOut(
        requestId=request_id,
        persona=persona,
        status=status,
        message=message,
        answer=answer,
        missing=[] if blocked else [MissingOut(**asdict(g)) for g in missing],
        notes=[] if blocked else registry.notes,
        toolsUsed=list(dict.fromkeys(deps.ctx.used)),
        context=context,
        disclaimer=DISCLAIMERS[persona],
        generatedAt=datetime.now(timezone.utc).isoformat(),
        model=ModelOut(provider=deps.model.provider, name=deps.model.name),
    )
