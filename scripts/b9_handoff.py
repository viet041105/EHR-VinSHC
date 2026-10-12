"""Build a redacted B9 backend handoff report from checked integration evidence."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys

try:
    from common import ROOT
except ModuleNotFoundError:  # Imported as scripts.b9_handoff by unit tests.
    from scripts.common import ROOT


REQUIRED_REPORTS = {
    "b1-integration.json": 4,
    "b2-integration.json": 5,
    "b3-integration.json": 6,
    "b23-extension-integration.json": 5,
    "b4a-integration.json": 6,
    "b4b-clinical.json": 9,
    "b5-authorization.json": 5,
    "b7-fhir.json": 6,
    "b8-operations.json": 7,
}
ALLOWED_PHASES = {"restart", "restore"}


class HandoffError(RuntimeError):
    pass


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HandoffError(f"invalid or missing evidence: {path.name}") from error


def checked_report(path, expected_checks):
    value = load_json(path)
    checks = value.get("checks")
    if value.get("passed") is not True or not isinstance(checks, list):
        raise HandoffError(f"evidence did not pass: {path.name}")
    if len(checks) != expected_checks or not all(item.get("passed") is True for item in checks):
        raise HandoffError(f"unexpected check set: {path.name}")
    return {
        "file": path.name,
        "passed": True,
        "checks": len(checks),
        "startedAt": value.get("startedAt"),
        "finishedAt": value.get("finishedAt"),
    }


def git_value(*arguments):
    result = subprocess.run(
        ["git", *arguments], cwd=ROOT, text=True, capture_output=True, check=False
    )
    if result.returncode:
        raise HandoffError("cannot read Git revision for handoff")
    return result.stdout.strip()


def checked_metadata(paths):
    values = []
    identities = None
    for path in paths:
        value = load_json(path)
        runtime = value.get("runtime", {})
        current = runtime.get("identities")
        if not str(value.get("status", "")).startswith("PASS") or runtime.get("checked") != 78 \
                or not isinstance(current, list):
            raise HandoffError(f"metadata runtime evidence did not pass: {path.name}")
        if identities is not None and current != identities:
            raise HandoffError("metadata identities changed between clean/restart/restore")
        identities = current
        values.append({"file": path.name, "version": value.get("version"), "checked": len(current)})
    return values


def build_report(report_root, persistence_phases, metadata_paths=None, recovery_path=None):
    results = [
        checked_report(report_root / filename, count)
        for filename, count in REQUIRED_REPORTS.items()
    ]
    for phase in persistence_phases:
        if phase not in ALLOWED_PHASES:
            raise HandoffError(f"unknown persistence phase: {phase}")
        value = checked_report(report_root / f"b9-{phase}.json", 4)
        if load_json(report_root / f"b9-{phase}.json").get("phase") != phase:
            raise HandoffError(f"wrong phase in b9-{phase}.json")
        results.append(value)

    metadata_paths = list(metadata_paths or [])
    if persistence_phases and len(metadata_paths) < len(persistence_phases) + 1:
        raise HandoffError("clean/restart/restore metadata reports are required")
    metadata_results = checked_metadata(metadata_paths)
    recovery = None
    if "restore" in persistence_phases:
        if recovery_path is None:
            raise HandoffError("restore report is required")
        recovery = load_json(recovery_path)
        if recovery.get("passed") is not True or recovery.get("operation") != "restore":
            raise HandoffError("restore evidence did not pass")

    baseline = load_json(ROOT / "config/baseline.json")
    metadata = load_json(ROOT / "metadata/vinshc/pack.json")
    adapters = load_json(ROOT / "integrations/manifest.json")
    if adapters.get("defaultEnabled") is not False:
        raise HandoffError("external integrations must default to disabled")
    if any(item.get("enabled") is not False for item in adapters.get("adapters", [])):
        raise HandoffError("every external adapter must remain disabled for B9")

    dirty = bool(git_value("status", "--porcelain"))
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "passed": True,
        "scope": "synthetic backend acceptance only",
        "source": {
            "commit": git_value("rev-parse", "HEAD"),
            "branch": git_value("branch", "--show-current"),
            "workingTreeDirty": dirty,
        },
        "versions": {
            "referenceApplication": baseline["referenceApplication"]["version"],
            "openmrsCore": baseline["upstreamComponents"]["openmrsCore"],
            "postgresql": baseline["database"]["version"],
            "metadata": metadata["version"],
            "vinshcModule": "0.3.0",
        },
        "evidence": results,
        "metadataEvidence": metadata_results,
        "initializerIdentityStable": len(metadata_results) >= 2,
        "persistencePhases": list(persistence_phases),
        "recoveryEvidence": None if recovery is None else {
            "file": recovery_path.name,
            "sourceProject": recovery.get("sourceProject"),
            "targetProject": recovery.get("targetProject"),
            "elapsedSeconds": recovery.get("elapsedSeconds"),
        },
        "externalAdapters": {
            "defaultEnabled": False,
            "codes": [item["code"] for item in adapters["adapters"]],
        },
        "deliverables": [
            "compose.yaml",
            "config/baseline.json",
            "docs/DEVELOPMENT.md",
            "docs/api/README.md",
            "docs/RECOVERY_RUNBOOK.md",
            "docs/PILOT_READINESS.md",
            "metadata/vinshc/pack.json",
        ],
        "acceptedTechnicalLimits": [
            "Synthetic metadata/catalogues are not approved for production.",
            "Production attachment scanning and object storage are disabled.",
            "BHYT, e-invoice, national prescription, LIS and PACS adapters are contracts only.",
            "FHIR write is restricted to supported native/adapter APIs documented by the project.",
            "Browser/FE workflow and clinic-owner written acceptance require separate evidence.",
        ],
        "pilotReadiness": "NOT_APPROVED_FOR_REAL_DATA",
        "containsCredentialsOrDatabaseDump": False,
    }


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--report-root", type=Path, default=ROOT / ".runtime/reports")
    result.add_argument("--require-persistence", action="append", default=[], choices=sorted(ALLOWED_PHASES))
    result.add_argument("--metadata-report", action="append", type=Path, default=[])
    result.add_argument("--recovery-report", type=Path)
    result.add_argument("--output", type=Path, default=ROOT / ".runtime/reports/b9-handoff.json")
    return result


def main():
    args = parser().parse_args()
    report = build_report(
        args.report_root.resolve(), args.require_persistence,
        [path.resolve() for path in args.metadata_report],
        args.recovery_report.resolve() if args.recovery_report else None,
    )
    destination = args.output.resolve()
    if destination != (ROOT / ".runtime/reports/b9-handoff.json").resolve() \
            and (ROOT / ".runtime").resolve() not in destination.parents:
        raise HandoffError("handoff output must stay under .runtime")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "output": str(destination),
                      "evidence": len(report["evidence"])}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except HandoffError as error:
        print(f"B9 handoff failed: {error}", file=sys.stderr)
        sys.exit(1)
