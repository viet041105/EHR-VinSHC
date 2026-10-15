"""Reproducible synthetic baseline, deliberately separate from clinical quality approval."""
from __future__ import annotations
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import subprocess
import time

from fastapi.testclient import TestClient
from .app import create_app
from .config import AGENT_ROOT, Settings


def evaluate(settings: Settings | None = None, case_limit: int | None = None):
    settings = settings or Settings()
    settings = replace(settings, data_provider="mock", advanced_enabled=True, knowledge_enabled=True, rate_limit_per_minute=1000)
    suite = json.loads((AGENT_ROOT / "evaluations/cases.json").read_text(encoding="utf-8"))
    if case_limit is not None and not 1 <= case_limit <= len(suite["cases"]):
        raise ValueError("case_limit phải nằm trong số ca của bộ đánh giá")
    rows, grounded, total = [], 0, 0
    with TestClient(create_app(settings)) as client:
        cases = client.get("/dev/cases").json()["cases"]
        for case in suite["cases"][:case_limit]:
            data = cases[case["case"] - 1]
            identity = case.get("identity") or ("doctor" if case["persona"] == "doctor" else data["patientIdentity"])
            headers = {"Authorization": "Bearer demo-" + identity}
            body = {"message": case["message"]}
            if case["persona"] == "doctor":
                headers.update({"X-VinSHC-Workspace-Role":"doctor", "X-VinSHC-Workspace-Facility":cases[0]["facilityUuid"]})
                body.update({k:data[k] for k in ("patientUuid","visitUuid","encounterUuid")})
            start = time.perf_counter()
            response = client.post(f"/v1/{case['persona']}/chat", headers=headers, json=body)
            elapsed = (time.perf_counter() - start) * 1000
            r = response.json()
            errors = []
            if response.status_code != case.get("httpStatus", 200):
                errors.append("http_status")
            if "status" in case and r.get("status") != case["status"]:
                errors.append("status")
            if "tools" in case and set(r.get("toolsUsed", [])) != set(case["tools"]):
                errors.append("tools")
            text = "\n".join(a["text"] for a in r.get("answer", []))
            if any(value not in text for value in case.get("contains", [])):
                errors.append("expected_value")
            missing = {g["reason"] for g in r.get("missing", [])}
            if not set(case.get("missing", [])) <= missing:
                errors.append("missing_states")
            source_docs = {s.get("documentId") for a in r.get("answer", []) for s in a["sources"]}
            if not set(case.get("documentIds", [])) <= source_docs:
                errors.append("reference_source")
            for answer in r.get("answer", []):
                total += 1
                if answer["sources"] and all(s.get("uuid") for s in answer["sources"]):
                    grounded += 1
                else:
                    errors.append("ungrounded")
            rows.append({"id":case["id"], "passed":not errors, "errors":errors, "httpStatus":response.status_code,
                         "status":r.get("status"), "latencyMs":round(elapsed,2), "tools":r.get("toolsUsed",[]),
                         "diagnostics":r.get("diagnostics")})
    times = sorted(row["latencyMs"] for row in rows)
    def pct(p):
        return times[int((len(times)-1)*p)]
    root = AGENT_ROOT.parent.parent
    sha = subprocess.run(["git","rev-parse","HEAD"],cwd=root,capture_output=True,text=True).stdout.strip() or None
    files = sorted((AGENT_ROOT/"src").rglob("*.py")) + sorted((AGENT_ROOT/"knowledge").rglob("*.md")) + sorted((AGENT_ROOT/"playground").rglob("*.html")) + [AGENT_ROOT/"fixtures/clinical.demo.json", AGENT_ROOT/"knowledge/manifest.json", AGENT_ROOT/"evaluations/cases.json"]
    digest = hashlib.sha256(b"".join(p.read_bytes() for p in files)).hexdigest()
    return {"suiteVersion":suite["version"],"synthetic":True,"model":settings.model_provider,"retrieval":settings.knowledge_mode,
            "gitHead":sha,"workingSourceSha256":digest,"total":len(rows),"passed":sum(r["passed"] for r in rows),
            "groundedAnswers":grounded,"totalAnswers":total,"sourceCoverage":grounded/total if total else None,
            "p50Ms":pct(.5),"p95Ms":pct(.95),"costUSD":None,"cases":rows,
            "limitations":["Synthetic technical baseline, not clinical accuracy.","Fake model does not measure real LLM quality.","No clinician-approved expected prose or verified real-provider cost."]}


def save_report(report, directory: Path, stem: str = "agent-advanced"):
    directory.mkdir(parents=True,exist_ok=True)
    json_path = directory/(stem+".json")
    json_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines = ["# Agent advanced — synthetic baseline", "", f"Passed: {report['passed']}/{report['total']}",
             f"Model: {report['model']} · retrieval: {report['retrieval']}",
             f"Source coverage: {report['groundedAnswers']}/{report['totalAnswers']} answers", f"p50: {report['p50Ms']} ms · p95: {report['p95Ms']} ms", "",
             "| Case | Passed | Errors |", "| --- | --- | --- |"]
    lines += [f"| {r['id']} | {r['passed']} | {', '.join(r['errors'])} |" for r in report["cases"]]
    lines += ["",*report["limitations"]]
    (directory/(stem+".md")).write_text("\n".join(lines)+"\n",encoding="utf-8")
    return json_path
