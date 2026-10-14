"""HTTP API của chatbot. Chạy: uvicorn --factory vinshc_agent.app:create_app

- `POST /v1/doctor/chat`: bác sĩ hỏi về bệnh nhân/lần khám đang mở. FE gửi cùng các header đang dùng cho
  backend VinSHC (`Authorization`, `X-VinSHC-Workspace-Role`, `X-VinSHC-Workspace-Facility`).
- `POST /v1/patient/chat`: bệnh nhân hỏi về phần hồ sơ đã được công bố. Danh tính lấy từ cổng bệnh nhân.

Agent không lưu hội thoại: FE gửi lại lịch sử dạng văn bản, và mỗi lượt đọc lại dữ kiện qua tool.
Vai trò (và do đó prompt, tool, guardrail) được quyết định từ danh tính đã xác thực, không từ nội dung câu hỏi.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

from . import __version__
from .agent import AgentDeps, build_graph, build_response
from .backend import BackendError, Credentials, VinshcBackend, require_uuid
from .config import Settings, load_settings, read_api_key
from .facts import ContextMismatch, FactRegistry
from .fields import FieldCatalog
from .llm import ChatModel, Conversation, HistoryTurn
from .llm.fake import FakeChatModel
from .portal import PatientPortal, make_portal
from .prompts import DOCTOR_SYSTEM, PATIENT_SYSTEM, doctor_context, patient_context
from .schemas import ChatOut, DoctorChatIn, DoctorContextOut, ErrorOut, PatientChatIn
from .guardrails import RateLimiter
from .tools import ToolContext
from .tools.doctor import DOCTOR_TOOLS
from .tools.patient import PATIENT_TOOLS

log = logging.getLogger("vinshc_agent")
ROLE_PATTERN = re.compile(r"^[a-z_]{1,32}$")
GRAPH = build_graph()


def make_model(settings: Settings) -> ChatModel:
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
) -> FastAPI:
    settings = settings or load_settings()
    if not logging.getLogger().handlers and not log.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        log.addHandler(handler)
    log.setLevel(logging.INFO)
    catalog = FieldCatalog.load(settings.fields_csv)
    model = model or make_model(settings)
    portal = portal or make_portal(settings.patient_portal, settings.patient_fixture)
    limiter = RateLimiter(settings.rate_limit_per_minute)
    doctor_tools = {tool.name: tool for tool in DOCTOR_TOOLS}
    patient_tools = {tool.name: tool for tool in PATIENT_TOOLS}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = http_client or httpx.AsyncClient(
            base_url=settings.backend_url + "/", timeout=settings.backend_timeout, follow_redirects=False
        )
        app.state.backend = VinshcBackend(client)
        try:
            yield
        finally:
            if http_client is None:
                await client.aclose()

    app = FastAPI(title="VinSHC agent", version=__version__, lifespan=lifespan)

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex
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

    async def run(request: Request, deps: AgentDeps, conversation: Conversation, context: DoctorContextOut | None) -> ChatOut:
        started = time.perf_counter()
        state = await GRAPH.ainvoke({"conversation": conversation}, context=deps)
        result = build_response(state, request.state.request_id, deps, context)
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

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "version": __version__, "modelProvider": model.provider, "patientPortal": portal.mode}

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
        backend: VinshcBackend = request.app.state.backend
        workspace = await backend.workspace(credentials)
        if workspace.get("role") != "doctor":
            raise BackendError(403, "role_not_supported", "Trợ lý hồ sơ cho nhân viên hiện chỉ mở cho workspace bác sĩ.")
        if str(workspace.get("facilityUuid") or "").lower() != credentials.facility:
            raise BackendError(403, "workspace_mismatch", "Workspace backend trả về không khớp cơ sở đang chọn.")
        ctx = ToolContext(
            persona="doctor",
            registry=FactRegistry(),
            catalog=catalog,
            patient_uuid=patient,
            backend=backend,
            credentials=credentials,
            encounter_uuid=encounter,
            visit_uuid=visit,
        )
        deps = AgentDeps(
            model=model,
            tools=doctor_tools,
            system=DOCTOR_SYSTEM,
            ctx=ctx,
            allowed_uuids=frozenset(u for u in (patient, encounter, visit) if u),
            max_rounds=settings.max_tool_rounds,
            max_calls_per_round=settings.max_tool_calls_per_round,
        )
        conversation = Conversation("doctor", doctor_context(), _history(body), body.message)
        context = DoctorContextOut(
            patientUuid=patient, encounterUuid=encounter, visitUuid=visit, role="doctor", facilityUuid=credentials.facility
        )
        return await run(request, deps, conversation, context)

    @app.post("/v1/patient/chat", response_model=ChatOut)
    async def patient_chat(body: PatientChatIn, request: Request, authorization: str | None = Header(None)):
        if not authorization:
            raise BackendError(401, "unauthenticated", "Thiếu thông tin đăng nhập.")
        throttle("patient", authorization)
        session = await portal.authenticate(authorization)
        ctx = ToolContext(
            persona="patient",
            registry=FactRegistry(),
            catalog=catalog,
            patient_uuid=session.patient_uuid,
            portal=portal,
            session=session,
        )
        deps = AgentDeps(
            model=model,
            tools=patient_tools,
            system=PATIENT_SYSTEM,
            ctx=ctx,
            allowed_uuids=frozenset(),
            max_rounds=settings.max_tool_rounds,
            max_calls_per_round=settings.max_tool_calls_per_round,
            clinic_contact=settings.clinic_contact,
        )
        conversation = Conversation("patient", patient_context(settings.clinic_contact), _history(body), body.message)
        return await run(request, deps, conversation, None)

    return app
