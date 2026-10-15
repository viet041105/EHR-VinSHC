"""HTTP API của chatbot. Chạy: uvicorn --factory vinshc_agent.app:create_app

- `POST /v1/doctor/chat`: bác sĩ hỏi về bệnh nhân/lần khám đang mở. FE gửi cùng các header đang dùng cho
  backend VinSHC (`Authorization`, `X-VinSHC-Workspace-Role`, `X-VinSHC-Workspace-Facility`).
- `POST /v1/patient/chat`: bệnh nhân hỏi về phần hồ sơ đã được công bố. Danh tính lấy từ cổng bệnh nhân.

Mặc định FE gửi lịch sử; nâng cao có thể lưu phiên RAM có TTL và ràng buộc actor/context.
Mỗi lượt luôn đọc lại dữ kiện qua tool, không dùng lịch sử làm nguồn.
Vai trò (và do đó prompt, tool, guardrail) được quyết định từ danh tính đã xác thực, không từ nội dung câu hỏi.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import replace
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse

from . import __version__
from langsmith import tracing_context

from .agent import AgentDeps, build_graph, build_response
from .backend import BackendError, ClinicalDataProvider, Credentials, DoctorContextAuthorizer, VinshcBackend, require_uuid, read_doctor_context
from .config import AGENT_ROOT, Settings, load_settings, read_api_key
from .facts import ContextMismatch, FactRegistry
from .fields import FieldCatalog
from .llm import ChatModel, Conversation, HistoryTurn
from .llm.fake import FakeChatModel
from .knowledge import KnowledgeBase, KnowledgeScope, make_knowledge
from .portal import PatientPortal, make_portal
from .prompts import doctor_context, patient_context, system_prompt
from .schemas import ChatOut, DoctorChatIn, DoctorContextOut, ErrorOut, PatientChatIn, KnowledgeSearchIn
from .guardrails import RateLimiter, screen_input
from .tools import ToolContext
from .tools.doctor import DOCTOR_TOOLS
from .tools.patient import PATIENT_TOOLS
from .tools.conversation import CONVERSATION_TOOLS
from .tools.knowledge import KNOWLEDGE_TOOLS
from .tools.timeline import DOCTOR_ADVANCED_TOOLS, PATIENT_ADVANCED_TOOLS
from .runtime import CircuitChatModel, ConversationStore, Metrics

log = logging.getLogger("vinshc_agent")
ROLE_PATTERN = re.compile(r"^[a-z_]{1,32}$")
GRAPH = build_graph()


def make_model(settings: Settings) -> ChatModel:
    if settings.model_provider == "gemini":
        from .llm.gemini import GeminiChatModel
        api_key = read_api_key(settings.gemini_api_key_file) if settings.gemini_api_key_file else os.environ["GEMINI_API_KEY"].strip()
        return GeminiChatModel(settings.gemini_model, settings.gemini_thinking_level,
            settings.model_timeout, settings.model_max_retries, api_key, settings.model_max_tokens)
    if settings.model_provider == "anthropic":
        from .llm.claude import ClaudeChatModel

        # Khóa từ file (nếu cấu hình) được truyền thẳng cho SDK; nếu không, SDK tự đọc từ môi trường.
        api_key = read_api_key(settings.anthropic_api_key_file) if settings.anthropic_api_key_file else None
        return ClaudeChatModel(
            settings.anthropic_model,
            settings.anthropic_effort,
            settings.model_timeout,
            settings.model_max_retries,
            api_key=api_key,
            max_tokens=settings.model_max_tokens,
        )
    return FakeChatModel()


def staff_credentials(authorization: str | None, role: str | None, facility: str | None) -> Credentials:
    if not authorization:
        raise BackendError(401, "unauthenticated", "Thiếu thông tin đăng nhập.")
    if not role or not facility or not ROLE_PATTERN.match(role):
        raise BackendError(403, "workspace_required", "Chưa chọn workspace hợp lệ.")
    return Credentials(authorization, role, require_uuid(facility, "X-VinSHC-Workspace-Facility"))


def _history(body) -> list[HistoryTurn]:
    return [HistoryTurn(h.role, h.text) for h in body.history]


def create_app(
    settings: Settings | None = None,
    *,
    http_client: httpx.AsyncClient | None = None,
    model: ChatModel | None = None,
    portal: PatientPortal | None = None,
    backend: ClinicalDataProvider | None = None,
    context_authorizer: DoctorContextAuthorizer | None = None,
    knowledge: KnowledgeBase | None = None,
) -> FastAPI:
    settings = settings or load_settings()
    if not logging.getLogger().handlers and not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        log.addHandler(handler)
    log.setLevel(logging.INFO)
    catalog = FieldCatalog.load(settings.fields_csv)
    dataset = None
    if settings.data_provider == "mock":
        from .mock import MockBackend, MockDataset, MockPortal
        dataset = MockDataset.load(settings.mock_fixture, settings.fields_csv)
        backend = backend or MockBackend(dataset)
        portal = portal or MockPortal(dataset)
        context_authorizer = context_authorizer or MockBackend(dataset)
    model = model or make_model(settings)
    if settings.advanced_enabled:
        model = CircuitChatModel(model, settings.model_circuit_failures, settings.model_circuit_cooldown)
    sessions = ConversationStore(settings.conversation_ttl, settings.conversation_limit, busy_timeout=settings.request_timeout)
    metrics = Metrics()
    knowledge = knowledge or make_knowledge(settings)
    if portal is None and settings.patient_portal != "http":
        portal = make_portal(settings.patient_portal, settings.patient_fixture)
    limiter = RateLimiter(settings.rate_limit_per_minute)
    doctor_tools = {tool.name: tool for tool in DOCTOR_TOOLS}
    patient_tools = {tool.name: tool for tool in PATIENT_TOOLS}
    doctor_tools.update({tool.name: tool for tool in CONVERSATION_TOOLS})
    patient_tools.update({tool.name: tool for tool in CONVERSATION_TOOLS})
    if knowledge is not None:
        doctor_tools.update({tool.name: tool for tool in KNOWLEDGE_TOOLS})
        patient_tools.update({tool.name: tool for tool in KNOWLEDGE_TOOLS})
    if settings.advanced_enabled:
        doctor_tools.update({tool.name: tool for tool in DOCTOR_ADVANCED_TOOLS})
        patient_tools.update({tool.name: tool for tool in PATIENT_ADVANCED_TOOLS})

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = http_client
        owns_client = False
        if backend is None or portal is None:
            if client is None:
                client = httpx.AsyncClient(base_url=settings.backend_url + "/", timeout=settings.backend_timeout, follow_redirects=False)
                owns_client = True
        app.state.backend = backend if backend is not None else VinshcBackend(client)
        if portal is None:
            from .portal import HttpPortal
            app.state.portal = HttpPortal(client)
        else:
            app.state.portal = portal
        try:
            yield
        finally:
            if owns_client:
                await client.aclose()

    app = FastAPI(title="VinSHC agent", version=__version__, lifespan=lifespan)

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex
        if dataset is not None and (not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}):
            response = error(request, 403, "mock_local_only", "Bộ hồ sơ giả chỉ phục vụ phát triển local.")
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    def error(request: Request, status: int, code: str, detail: str) -> JSONResponse:
        log.info("chat_error request=%s status=%d code=%s", request.state.request_id, status, code)
        body = ErrorOut(code=code, detail=detail, requestId=request.state.request_id)
        return JSONResponse(body.model_dump(), status_code=status)

    @app.exception_handler(BackendError)
    async def backend_error(request: Request, ex: BackendError):
        return error(request, ex.status, ex.code, ex.message)

    @app.exception_handler(ContextMismatch)
    async def context_mismatch(request: Request, ex: ContextMismatch):
        return error(request, 502, "context_mismatch", "Dữ liệu trả về không khớp hồ sơ đang mở; không hiển thị.")

    def throttle(persona: str, authorization: str) -> None:
        if not limiter.allow(RateLimiter.key(persona, authorization)):
            raise BackendError(429, "rate_limited", "Bạn hỏi quá nhanh; vui lòng thử lại sau ít phút.")

    async def run_once(request: Request, deps: AgentDeps, conversation: Conversation, context: DoctorContextOut | None) -> ChatOut:
        started = time.perf_counter()
        try:
            with tracing_context(enabled=False):
                state = await asyncio.wait_for(GRAPH.ainvoke({"conversation": conversation}, context=deps), settings.request_timeout)
        except asyncio.TimeoutError as ex:
            raise BackendError(504, "agent_timeout", "Trợ lý chưa trả lời kịp; hãy đọc hồ sơ hoặc thử lại.") from ex
        result = build_response(state, request.state.request_id, deps, context)
        elapsed = (time.perf_counter() - started) * 1000
        metrics.add(result.status, elapsed, state.get("model_calls", 0), len(deps.ctx.used), state.get("model_error"))
        if settings.advanced_enabled:
            result.diagnostics = {"durationMs": round(elapsed, 2), "modelCalls": state.get("model_calls", 0),
                                  "toolCalls": len(deps.ctx.used), "rounds": state.get("rounds", 0),
                                  "modelError": state.get("model_error"), "grounding": "source-rendered",
                                  "sourceRepairs": int(bool(state.get("source_repair"))),
                                  "responseMode": "conversation" if state.get("conversation_allowed") else
                                  "service" if state.get("service_message") else "model"}
            result.diagnostics["usage"] = state.get("usage") or None
            result.diagnostics["costUSD"] = None  # no fabricated price or zero-cost claim
        validation = state.get("validation")
        # Chỉ ghi số liệu vận hành; không ghi nội dung hồ sơ, câu hỏi, câu trả lời hay header.
        log.info(
            "chat request=%s persona=%s status=%s guard=%s rounds=%d tools=%s facts=%d accepted=%d rejected=%s "
            "model=%s model_error=%s ms=%d",
            request.state.request_id,
            deps.ctx.persona,
            result.status,
            state["verdict"].code,
            state.get("rounds", 0),
            result.toolsUsed,
            len(deps.ctx.registry.facts),
            len(validation.accepted) if validation else 0,
            [reason for _, reason in validation.rejected] if validation else [],
            deps.model.provider,
            state.get("model_error") or state.get("stopped"),
            (time.perf_counter() - started) * 1000,
        )
        return result

    async def run(request, deps, conversation, context, body, actor, context_key):
        if (body.remember or body.conversationId or body.stream) and not settings.advanced_enabled:
            raise BackendError(400, "advanced_disabled", "Phiên nhớ/streaming chưa được bật trong môi trường này.")
        session = None
        if body.remember or body.conversationId:
            session = sessions.acquire(actor, context_key, body.conversationId)
            if body.conversationId:
                conversation.history = list(session.history)

        async def produce(active_deps):
            try:
                result = await run_once(request, active_deps, conversation, context)
                if session:
                    sessions.finish(session, conversation.message, result, conversation.history)
                    result.conversationId, result.conversationRevision = session.id, session.revision
                return result
            except BaseException:
                if session:
                    sessions.release(session)
                raise

        if not body.stream:
            return await produce(deps)

        async def events():
            queue = asyncio.Queue(maxsize=128)
            task = asyncio.create_task(produce(replace(deps, progress=queue.put)))
            def packet(name, data):
                return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
            try:
                yield packet("start", {"requestId": request.state.request_id})
                while not task.done() or not queue.empty():
                    try:
                        item = await asyncio.wait_for(queue.get(), 1)
                        yield packet("progress", item)
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                result = await task
                for answer in result.answer:
                    yield packet("answer", answer.model_dump())
                yield packet("final", result.model_dump())
                yield packet("done", {"requestId": result.requestId})
            except BackendError as ex:
                yield packet("error", {"code": ex.code, "detail": ex.message, "requestId": request.state.request_id})
            except ContextMismatch:
                yield packet("error", {"code": "context_mismatch", "detail": "Nguồn không khớp ngữ cảnh; không hiển thị.", "requestId": request.state.request_id})
            finally:
                if not task.done():
                    task.cancel()
                try:
                    await task
                except BaseException:
                    pass
        return StreamingResponse(events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "version": __version__, "modelProvider": model.provider,
                "dataProvider": settings.data_provider, "patientPortal": "http" if portal is None else portal.mode,
                "knowledge": {"enabled": knowledge is not None, "mode": knowledge.mode if knowledge else None,
                              "version": knowledge.corpus.manifest.version if knowledge else None},
                "advanced": {"enabled": settings.advanced_enabled, "memoryTtlSeconds": settings.conversation_ttl,
                             "retrieval": "multiquery-rule-rerank-cache" if knowledge and knowledge.advanced else "basic",
                             "modelCircuit": "open" if isinstance(model, CircuitChatModel) and model.open_until > time.monotonic() else "closed"}}

    async def knowledge_access(request, persona, authorization, role=None, facility=None):
        if knowledge is None:
            raise BackendError(404, "knowledge_disabled", "Tìm tài liệu chưa được bật.")
        if persona == "doctor":
            credentials = staff_credentials(authorization, role, facility)
            throttle("doctor", credentials.authorization)
            workspace = await request.app.state.backend.workspace(credentials)
            throttle("doctor-user", str(workspace.get("userUuid") or credentials.authorization))
            if workspace.get("role") != "doctor" or str(workspace.get("facilityUuid") or "").lower() != credentials.facility:
                raise BackendError(403, "workspace_mismatch", "Cần workspace bác sĩ đã được backend xác thực.")
            return KnowledgeScope("doctor", credentials.facility)
        if persona != "patient":
            raise BackendError(404, "knowledge_not_found", "Không tìm thấy tài liệu được phép đọc.")
        if not authorization:
            raise BackendError(401, "unauthenticated", "Thiếu thông tin đăng nhập.")
        throttle("patient", authorization)
        session = await request.app.state.portal.authenticate(authorization)
        throttle("patient-user", session.patient_uuid)
        return KnowledgeScope("patient")

    @app.post("/v1/{persona}/knowledge/search", tags=["Reference retrieval"])
    async def knowledge_search(body: KnowledgeSearchIn, persona: str, request: Request,
        authorization: str | None = Header(None), x_vinshc_workspace_role: str | None = Header(None),
        x_vinshc_workspace_facility: str | None = Header(None)):
        scope = await knowledge_access(request, persona, authorization, x_vinshc_workspace_role, x_vinshc_workspace_facility)
        chunks = await knowledge.search(body.query, scope, body.limit)
        return {"mode": knowledge.mode, "version": knowledge.corpus.manifest.version,
                "synthetic": knowledge.corpus.manifest.synthetic, "chunks": [c.public(persona) for c in chunks]}

    @app.get("/v1/{persona}/knowledge/chunks/{chunk_uuid}", tags=["Reference retrieval"])
    async def knowledge_chunk(chunk_uuid: str, persona: str, request: Request,
        authorization: str | None = Header(None), x_vinshc_workspace_role: str | None = Header(None),
        x_vinshc_workspace_facility: str | None = Header(None)):
        scope = await knowledge_access(request, persona, authorization, x_vinshc_workspace_role, x_vinshc_workspace_facility)
        return knowledge.corpus.read(require_uuid(chunk_uuid, "chunkUuid"), scope).public(persona)

    if dataset is not None:
        @app.get("/dev/cases", tags=["Local synthetic development"])
        async def mock_cases():
            return dataset.cases()
        @app.get("/dev/playground", include_in_schema=False)
        async def playground():
            return FileResponse(AGENT_ROOT / "playground" / "index.html", media_type="text/html")

    async def memory_actor(request, persona, authorization, role, facility):
        if not settings.advanced_enabled:
            raise BackendError(404, "advanced_disabled", "Phần nâng cao chưa được bật.")
        if persona == "doctor":
            c = staff_credentials(authorization, role, facility)
            workspace = await request.app.state.backend.workspace(c)
            if workspace.get("role") != "doctor" or str(workspace.get("facilityUuid") or "").lower() != c.facility:
                raise BackendError(403, "workspace_mismatch", "Cần workspace bác sĩ hợp lệ.")
            return sessions.actor("doctor", c.authorization, workspace.get("userUuid"), c.facility)
        if persona != "patient" or not authorization:
            raise BackendError(401, "unauthenticated", "Cần đăng nhập đúng vai trò.")
        s = await request.app.state.portal.authenticate(authorization)
        return sessions.actor("patient", authorization, s.patient_uuid)

    @app.delete("/v1/{persona}/conversations/{conversation_id}")
    async def forget_conversation(persona: str, conversation_id: str, request: Request,
        authorization: str | None = Header(None), x_vinshc_workspace_role: str | None = Header(None),
        x_vinshc_workspace_facility: str | None = Header(None)):
        actor = await memory_actor(request, persona, authorization, x_vinshc_workspace_role, x_vinshc_workspace_facility)
        sessions.delete(actor, require_uuid(conversation_id, "conversationId"))
        return {"deleted": True}

    @app.get("/v1/doctor/metrics")
    async def operational_metrics(request: Request, authorization: str | None = Header(None),
        x_vinshc_workspace_role: str | None = Header(None), x_vinshc_workspace_facility: str | None = Header(None)):
        await memory_actor(request, "doctor", authorization, x_vinshc_workspace_role, x_vinshc_workspace_facility)
        return {**metrics.snapshot(), "retrieval": dict(knowledge.search_stats) if knowledge else None}

    @app.post("/v1/doctor/chat", response_model=ChatOut)
    async def doctor_chat(
        body: DoctorChatIn,
        request: Request,
        authorization: str | None = Header(None),
        x_vinshc_workspace_role: str | None = Header(None),
        x_vinshc_workspace_facility: str | None = Header(None),
    ):
        credentials = staff_credentials(authorization, x_vinshc_workspace_role, x_vinshc_workspace_facility)
        throttle("doctor", credentials.authorization)
        patient = require_uuid(body.patientUuid, "patientUuid")
        encounter = require_uuid(body.encounterUuid, "encounterUuid")
        visit = require_uuid(body.visitUuid, "visitUuid") if body.visitUuid else None
        backend: ClinicalDataProvider = request.app.state.backend
        workspace = await backend.workspace(credentials)
        throttle("doctor-user", str(workspace.get("userUuid") or credentials.authorization))
        if workspace.get("role") != "doctor":
            raise BackendError(403, "role_not_supported", "Trợ lý hồ sơ cho nhân viên hiện chỉ mở cho workspace bác sĩ.")
        if str(workspace.get("facilityUuid") or "").lower() != credentials.facility:
            raise BackendError(403, "workspace_mismatch", "Workspace backend trả về không khớp cơ sở đang chọn.")
        verified_summary = None
        preliminary = screen_input("doctor", body.message, [turn.text for turn in body.history],
                                   set(u for u in (patient, encounter, visit) if u), None)
        if preliminary.action == "allow":
            verified_summary = (await context_authorizer.validate_doctor_context(credentials, patient, encounter, visit)
                                if context_authorizer is not None else
                                await read_doctor_context(backend, credentials, patient, encounter, visit))
        ctx = ToolContext(
            persona="doctor",
            registry=FactRegistry(),
            catalog=catalog,
            patient_uuid=patient,
            backend=backend,
            credentials=credentials,
            encounter_uuid=encounter,
            visit_uuid=visit,
            knowledge=knowledge,
            knowledge_scope=KnowledgeScope("doctor", credentials.facility),
            parallel=settings.advanced_enabled,
        )
        if isinstance(verified_summary, dict):
            # Reuse this request's authorized snapshot instead of fetching the chart twice.
            ctx.cache[f"summary:{encounter}"] = verified_summary
        deps = AgentDeps(
            model=model,
            tools=doctor_tools,
            system=system_prompt("doctor", knowledge is not None, settings.advanced_enabled),
            ctx=ctx,
            allowed_uuids=frozenset(u for u in (patient, encounter, visit) if u),
            max_rounds=settings.max_tool_rounds,
            max_calls_per_round=settings.max_tool_calls_per_round,
        )
        conversation = Conversation("doctor", doctor_context(), _history(body), body.message)
        context = DoctorContextOut(
            patientUuid=patient, encounterUuid=encounter, visitUuid=visit, role="doctor", facilityUuid=credentials.facility
        )
        actor = sessions.actor("doctor", credentials.authorization, workspace.get("userUuid"), credentials.facility)
        context_key = sessions.actor("context", patient, encounter, visit)
        return await run(request, deps, conversation, context, body, actor, context_key)

    @app.post("/v1/patient/chat", response_model=ChatOut)
    async def patient_chat(body: PatientChatIn, request: Request, authorization: str | None = Header(None)):
        if not authorization:
            raise BackendError(401, "unauthenticated", "Thiếu thông tin đăng nhập.")
        throttle("patient", authorization)
        active_portal = request.app.state.portal
        session = await active_portal.authenticate(authorization)
        throttle("patient-user", session.patient_uuid)
        visit = require_uuid(body.visitUuid, "visitUuid") if body.visitUuid else None
        if visit:
            await active_portal.visit_instructions(session, visit)  # server verifies ownership and publication
        ctx = ToolContext(
            persona="patient",
            registry=FactRegistry(),
            catalog=catalog,
            patient_uuid=session.patient_uuid,
            portal=active_portal,
            session=session,
            visit_uuid=visit,
            knowledge=knowledge,
            knowledge_scope=KnowledgeScope("patient"),
            parallel=settings.advanced_enabled,
        )
        deps = AgentDeps(
            model=model,
            tools=patient_tools,
            system=system_prompt("patient", knowledge is not None, settings.advanced_enabled),
            ctx=ctx,
            allowed_uuids=frozenset(),
            max_rounds=settings.max_tool_rounds,
            max_calls_per_round=settings.max_tool_calls_per_round,
            clinic_contact=settings.clinic_contact,
        )
        conversation = Conversation("patient", patient_context(settings.clinic_contact), _history(body), body.message)
        actor = sessions.actor("patient", authorization, session.patient_uuid)
        context_key = sessions.actor("context", session.patient_uuid, visit)
        return await run(request, deps, conversation, None, body, actor, context_key)

    return app
