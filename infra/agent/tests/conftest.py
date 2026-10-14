from __future__ import annotations

import copy
import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest
from fastapi.testclient import TestClient

from vinshc_agent.app import create_app
from vinshc_agent.config import DEMO_PATIENT_FIXTURE, Settings
from vinshc_agent.facts import FactRegistry, Recorder
from vinshc_agent.fields import FieldCatalog
from vinshc_agent.llm import FinalAnswer, ModelTurn, Statement, ToolCall
from vinshc_agent.portal import FixturePortal

FIXTURES = Path(__file__).parent / "fixtures"
PATIENT = "a1000000-0000-4000-8000-000000000001"
VISIT = "b1000000-0000-4000-8000-000000000001"
ENCOUNTER = "c1000000-0000-4000-8000-000000000001"
PREVIOUS_ENCOUNTER = "c0000000-0000-4000-8000-000000000009"
FACILITY = "f1000000-0000-4000-8000-000000000001"
AUTH = "Basic ZG9jdG9yOnN5bnRoZXRpYw=="
HEADERS = {"Authorization": AUTH, "X-VinSHC-Workspace-Role": "doctor", "X-VinSHC-Workspace-Facility": FACILITY}
PATIENT_HEADERS = {"Authorization": "Bearer demo-patient-binh"}
REST = "/openmrs/ws/rest/v1/vinshc"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def summary_payload() -> dict:
    return load("clinical_summary_final.json")


def previous_summary() -> dict:
    """Lần khám tháng 8 của cùng bệnh nhân, dẫn xuất từ fixture chính."""
    s = summary_payload()
    s.update(encounterUuid=PREVIOUS_ENCOUNTER, visitUuid="b0000000-0000-4000-8000-000000000009",
             encounterDatetime="2026-08-02T14:20:00+07:00", vitals=[], drugOrders=[], events=[])
    s["consultation"]["encounterUuid"] = PREVIOUS_ENCOUNTER
    s["consultation"]["values"] = {"visit.ly_do_kham": "Đau đầu", "allergy.trang_thai": "no_known_allergy"}
    s["diagnoses"][0].update(encounterUuid=PREVIOUS_ENCOUNTER, code="R51", concept={"display": "Đau đầu"})
    return s


class FakeVinshc:
    """Thay OpenMRS cho các API nhân viên; ghi lại mọi request agent gửi."""

    def __init__(self, role: str = "doctor"):
        staff = load("staff_api.json")
        self.summaries = {ENCOUNTER: summary_payload(), PREVIOUS_ENCOUNTER: previous_summary()}
        self.payloads = staff
        self.workspace = {"userUuid": "d1000000-0000-4000-8000-000000000001", "role": role,
                          "facilityUuid": FACILITY, "roleName": f"VinSHC App: {role}"}
        self.status: dict[str, int] = {}
        self.timeout = False
        self.requests: list[httpx.Request] = []

    def route(self, path: str) -> tuple[str, dict | None]:
        tail = path.removeprefix(REST + "/")
        parts = tail.split("/")
        if tail == "authorization/workspace":
            return "workspace", self.workspace
        if parts[0] == "encounter" and parts[-1] == "clinical-summary":
            return "summary", self.summaries.get(parts[1])
        if parts[0] == "patients":
            return "patient", self.payloads["patient"] if parts[1] == PATIENT else None
        if tail == "visits":
            return "visits", self.payloads["visits"]
        if tail == "vitals":
            return "vitals", self.payloads["vitals"]
        if tail == "allergy":
            return "allergy", {"patientUuid": PATIENT, "allergies": summary_payload()["allergies"]["allergies"]}
        if tail == "operations/service-orders":
            return "service-orders", self.payloads["service_orders"]
        if parts[:2] == ["operations", "results"]:
            return "result", self.payloads["results"].get(parts[2])
        if tail == "operations/appointments":
            return "appointments", self.payloads["appointments"]
        return "unknown", None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.timeout:
            raise httpx.ReadTimeout("timeout", request=request)
        name, payload = self.route(request.url.path)
        if name in self.status:
            return httpx.Response(self.status[name], json={"error": "synthetic"})
        if payload is None:
            return httpx.Response(404, json={"error": "not found"})
        return httpx.Response(200, json=copy.deepcopy(payload))

    def calls(self, name: str) -> list[httpx.Request]:
        return [r for r in self.requests if self.route(r.url.path)[0] == name]

    def query(self, request: httpx.Request) -> dict[str, str]:
        return {k: v[0] for k, v in parse_qs(request.url.query.decode()).items()}


class ScriptedModel:
    """Model giả theo kịch bản: mỗi phần tử là danh sách ToolCall hoặc một FinalAnswer."""

    provider, name = "test", "scripted"

    def __init__(self, *steps):
        self.steps = list(steps)
        self.seen: list = []

    async def next_turn(self, system, tools, conversation):
        self.seen.append((system, [t["name"] for t in tools], len(conversation.exchanges)))
        step = self.steps[min(len(conversation.exchanges), len(self.steps) - 1)]
        if isinstance(step, FinalAnswer):
            return ModelTurn([], step)
        if callable(step):
            return step(conversation)
        return ModelTurn([ToolCall(f"t{len(conversation.exchanges)}_{i}", n, a) for i, (n, a) in enumerate(step)])


def answer(*pairs, scope="answered") -> FinalAnswer:
    return FinalAnswer(scope=scope, statements=[Statement(text=t, fact_ids=list(ids)) for t, ids in pairs])


def fact_ids(conversation, label_startswith: str) -> list[str]:
    ids = []
    for exchange in conversation.exchanges:
        for result in exchange.results:
            for fact in json.loads(result.content).get("facts", []):
                if fact["label"].startswith(label_startswith):
                    ids.append(fact["id"])
    return ids


@pytest.fixture
def catalog() -> FieldCatalog:
    return FieldCatalog.load(Settings().fields_csv)


@pytest.fixture
def rec() -> Recorder:
    return Recorder(FactRegistry())


@pytest.fixture
def vinshc() -> FakeVinshc:
    return FakeVinshc()


@pytest.fixture
def make_client():
    clients: list[TestClient] = []

    def factory(backend: FakeVinshc | None = None, model=None, portal="fixture", **settings) -> TestClient:
        config = Settings(**settings)
        backend = backend or FakeVinshc()
        http = httpx.AsyncClient(base_url=config.backend_url + "/", transport=httpx.MockTransport(backend))
        portal_impl = FixturePortal(DEMO_PATIENT_FIXTURE) if portal == "fixture" else None
        client = TestClient(create_app(config, http_client=http, model=model, portal=portal_impl))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


def doctor_body(message: str, **extra) -> dict:
    return {"patientUuid": PATIENT, "encounterUuid": ENCOUNTER, "message": message, **extra}
