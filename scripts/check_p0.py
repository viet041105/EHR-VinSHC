"""P0 release and production authorization verification.

Static checks are safe for CI without a running backend. Use --runtime on an
isolated OpenMRS instance to verify actual Initializer-imported roles and modules.
"""
from __future__ import annotations

import argparse
import csv
import os
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

from api_client import Client
from common import ROOT, read_settings


CONFIG = ROOT / "infra/backend/configuration"
ROLES_CSV = CONFIG / "roles/vinshc/metadata.csv"
PRIVILEGES_CSV = CONFIG / "privileges/vinshc/metadata.csv"
MATRIX_CSV = ROOT / "metadata/vinshc/permission-matrix.csv"
ACTIONS = ("read", "create", "update", "void", "cancel", "print", "download")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load_json(relative_path: str) -> dict:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def module_version() -> str:
    pom = ET.parse(ROOT / "infra/backend/vinshc-module/pom.xml").getroot()
    ns = {"m": "http://maven.apache.org/POM/4.0.0"}
    version = pom.findtext("m:version", namespaces=ns)
    require(bool(version), "Missing root Maven module version.")
    return version


def verify_versions() -> tuple[dict, dict]:
    baseline = load_json("config/baseline.json")
    release = baseline["vinshcRelease"]
    version = release["version"]
    sources = {
        "backend module": module_version(),
        "metadata pack": load_json("metadata/vinshc/pack.json")["version"],
        "frontend package": load_json("infra/frontend/package.json")["version"],
        "frontend lockfile": load_json("infra/frontend/package-lock.json")["version"],
        "frontend lock root": load_json("infra/frontend/package-lock.json")["packages"][""]["version"],
        "print templates": load_json("metadata/vinshc/contracts/printing-reporting.json")["version"],
    }
    for name, actual in sources.items():
        require(actual == version, f"{name}: expected release {version}, got {actual}.")
    for key in ("backendModule", "metadataPack", "frontend", "printTemplates"):
        require(release[key] == version, f"baseline vinshcRelease.{key} differs from {version}.")
    require(baseline["requiredModules"].get("vinshc") == version,
            "Pinned module vinshc missing or differs from Maven version.")
    require(len(baseline["requiredModules"]) == release["expectedStartedModules"],
            "Expected module count differs from the requiredModules inventory.")
    dockerfile = (ROOT / "infra/backend/Dockerfile").read_text(encoding="utf-8")
    for marker in (f"/src/omod/target/vinshc-{version}.omod",
                   f"/openmrs/distribution/openmrs_modules/vinshc-{version}.omod"):
        require(marker in dockerfile, f"Backend image artifact drift: {marker}.")
    # Liquibase changeset identifiers are immutable migration history, not release tags.
    require("0.4.0" not in sources.values(),
            "A migration identifier must not be treated as a release version.")
    return baseline, sources


def verify_permissions() -> tuple[dict[str, set[str]], dict[str, str]]:
    permissions = load_json("metadata/vinshc/permissions.json")
    roles = load_csv(ROLES_CSV)
    privileges = load_csv(PRIVILEGES_CSV)
    rows = load_csv(MATRIX_CSV)
    role_names = set(permissions["roles"])
    require(role_names == {"reception", "nurse", "doctor", "lab", "cashier",
                           "pharmacy", "manager", "admin"}, "Expected exactly 8 roles.")
    require(len(roles) == len(role_names), "Missing or duplicate production role CSV rows.")
    require(len(rows) == len(role_names) * len(permissions["resources"]) * len(ACTIONS),
            "Incomplete permission matrix (8 roles × resources × 7 actions).")
    require(len({(r["role"], r["resource"], r["action"]) for r in rows}) == len(rows),
            "Duplicate matrix cell.")
    expected: dict[str, set[str]] = {role: set() for role in role_names}
    for row in rows:
        role, resource, action = row["role"], row["resource"], row["action"]
        require(role in role_names and resource in permissions["resources"] and action in ACTIONS,
                f"Unknown permission matrix cell {row!r}.")
        require(row["allowed"] in ("True", "False"), "Permission matrix must explicitly allow or deny.")
        if row["allowed"] == "True":
            require(row["privilege"] == f"VinSHC {resource} {action}",
                    f"Privilege naming mismatch: {role}/{resource}/{action}.")
            expected[role].add(row["privilege"])
        else:
            require(not row["privilege"], "Denied matrix cell must not carry a privilege.")

    by_name = {row["Privilege name"]: row["Uuid"] for row in privileges}
    all_expected = set().union(*expected.values())
    require(len(by_name) == len(privileges) and len({r["Uuid"] for r in privileges}) == len(privileges),
            "Duplicate production privileges/UUIDs.")
    require(set(by_name) == all_expected,
            f"Production privilege drift; missing={sorted(all_expected-set(by_name))}, "
            f"extra={sorted(set(by_name)-all_expected)}.")

    seen = set()
    for row in roles:
        name = row["Role name"]
        require(name.startswith("VinSHC App: "), f"Unexpected production role: {name}.")
        role = name.removeprefix("VinSHC App: ")
        require(role in role_names and role not in seen, f"Unknown or duplicated role: {role}.")
        seen.add(role)
        require(row["Uuid"] == permissions["roles"][role]["openmrs"]["uuid"],
                f"Role UUID drift for {role}.")
        require(not row["Inherited roles"].strip(), f"Broad role inheritance forbidden: {role}.")
        actual = set(row["Privileges"].split(";")) if row["Privileges"] else set()
        require(len(row["Privileges"].split(";")) == len(actual),
                f"Duplicate privilege in role {role}.")
        require(actual == expected[role],
                f"Role {role} privilege drift; missing={sorted(expected[role]-actual)}, "
                f"extra={sorted(actual-expected[role])}.")
    overlay = (ROOT / "tests/integration/compose.b4-metadata.yaml").read_text(encoding="utf-8")
    require("initializer-test/roles/" not in overlay and "initializer-test/privileges/" not in overlay,
            "Test overlay must not replace production role/privilege metadata.")
    require("COPY --chown=1001:0 infra/backend/configuration/" in
            (ROOT / "infra/backend/Dockerfile").read_text(encoding="utf-8"),
            "Production role/privilege CSV must be baked into backend image.")
    return expected, by_name


def verify_runtime(baseline: dict, expected: dict[str, set[str]],
                   privilege_uuids: dict[str, str], url: str | None) -> dict:
    settings = read_settings()
    origin = url or f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT','8080')}"
    require(re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):\d+", origin) is not None,
            "Runtime verifier accepts only local loopback URLs.")
    client = Client(origin, settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
    modules = client.json("/openmrs/ws/rest/v1/module?v=full")["results"]
    started = {m["uuid"]: m for m in modules if m.get("started") is True}
    require(len(started) == baseline["vinshcRelease"]["expectedStartedModules"],
            f"Expected {baseline['vinshcRelease']['expectedStartedModules']} started modules; "
            f"found {len(started)}.")
    for module_id, version in baseline["requiredModules"].items():
        require(started.get(module_id, {}).get("version") == version,
                f"Runtime module {module_id} version/status mismatch.")

    role_count = 0
    for role_name, allowed in sorted(expected.items()):
        role_uuid = load_json("metadata/vinshc/permissions.json")["roles"][role_name]["openmrs"]["uuid"]
        row = client.json(f"/openmrs/ws/rest/v1/role/{role_uuid}?v=full")
        actual = {p.get("name") or p.get("privilege") for p in row.get("privileges", [])}
        actual.discard(None)
        require(actual == allowed,
                f"Runtime role {role_name} privileges mismatch; "
                f"missing={sorted(allowed-actual)}, extra={sorted(actual-allowed)}.")
        inherited = row.get("inheritedRoles") or []
        require(not inherited, f"Runtime role {role_name} inherits broad roles.")
        role_count += 1

    # Check the full production privilege inventory by UUID, independent of role bindings.
    for name, uuid in privilege_uuids.items():
        row = client.json(f"/openmrs/ws/rest/v1/privilege/{uuid}?v=full")
        require((row.get("name") or row.get("privilege")) == name,
                f"Runtime missing/wrong privilege {name}.")
    image = baseline["images"]["backend"]
    project = os.environ.get("COMPOSE_PROJECT_NAME") or settings.get("COMPOSE_PROJECT_NAME")
    if project:
        container_result = subprocess.run(
            ["docker", "compose", "-p", project, "-f", "compose.yaml", "ps", "-q", "backend"],
            cwd=ROOT, text=True, capture_output=True, check=False,
        )
        require(container_result.returncode == 0 and container_result.stdout.strip(),
                f"Cannot locate running backend for Compose project {project}.")
        image_command = ["docker", "inspect", "--format", "{{.Image}}",
                         container_result.stdout.strip()]
        image_source = "runningContainer"
    else:
        image_command = ["docker", "image", "inspect", "--format", "{{.Id}}", image]
        image_source = "localImageTag"
    image_result = subprocess.run(image_command, cwd=ROOT, text=True,
                                  capture_output=True, check=False)
    require(image_result.returncode == 0
            and re.fullmatch(r"sha256:[0-9a-f]{64}", image_result.stdout.strip()),
            "Could not identify backend Docker image ID.")
    return {"startedModules": len(started), "moduleVersions": {
        k: started[k]["version"] for k in sorted(baseline["requiredModules"])},
        "verifiedRoles": role_count, "verifiedPrivileges": len(privilege_uuids),
        "backendImage": image, "backendImageId": image_result.stdout.strip(),
        "backendImageIdSource": image_source,
        "upstreamImageDigest": baseline["backendBuild"]["baseImage"].rsplit("@", 1)[-1]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", action="store_true", help="Verify local OpenMRS REST and DB import.")
    parser.add_argument("--url", help="Loopback base URL for the isolated runtime instance.")
    parser.add_argument("--report", type=Path, help="Optional synthetic metadata verification report.")
    args = parser.parse_args()
    baseline, sources = verify_versions()
    expected, uuids = verify_permissions()
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT,
                              text=True, capture_output=True, check=False)
    changes = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                             text=True, capture_output=True, check=False)
    require(revision.returncode == 0 and changes.returncode == 0,
            "Cannot identify source revision used in the build.")
    report = {"sourceCommit": revision.stdout.strip(),
              "workingTreeDirty": bool(changes.stdout.strip()),
              "release": baseline["vinshcRelease"]["version"],
              "sourceVersions": sources,
              "expectedStartedModules": baseline["vinshcRelease"]["expectedStartedModules"],
              "rolePrivilegeCounts": {role: len(items) for role, items in sorted(expected.items())},
              "privilegeCount": len(uuids), "staticVerified": True}
    if args.runtime:
        report["runtime"] = verify_runtime(baseline, expected, uuids, args.url)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as exc:
        print(f"P0 check failed: {exc}", file=sys.stderr)
        sys.exit(1)
