"""Exercise real local REST/FHIR endpoints and a synthetic persistence fixture."""

import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from common import ROOT, read_settings


class SmokeError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A redirect/login page must not count as a successful API check or receive credentials.
        return None


class Client:
    def __init__(self, base_url, username, password):
        parsed = urllib.parse.urlsplit(base_url)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.username or parsed.password or parsed.path not in {"", "/"}
                or parsed.query or parsed.fragment):
            raise SmokeError("Smoke tests accept only a local HTTP origin; use an isolated development database.")
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, path, *, method="GET", payload=None, auth=True, password=None, timeout=10):
        headers = {"Accept": "application/json, application/fhir+json"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth:
            token = base64.b64encode(f"{self.username}:{password or self.password}".encode()).decode()
            headers["Authorization"] = f"Basic {token}"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=timeout) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers, error.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise SmokeError(f"{method} {path}: cannot reach local service.") from error

    def json(self, path, *, statuses=(200,), **kwargs):
        status, headers, body = self.request(path, **kwargs)
        if status not in statuses:
            raise SmokeError(f"{kwargs.get('method', 'GET')} {path}: expected {statuses}, got HTTP {status}.")
        if "json" not in headers.get("Content-Type", "").lower():
            raise SmokeError(f"{path}: expected JSON, not an HTML/login response.")
        try:
            result = json.loads(body)
        except (ValueError, UnicodeDecodeError) as error:
            raise SmokeError(f"{path}: invalid JSON response.") from error
        if not isinstance(result, dict):
            raise SmokeError(f"{path}: expected a JSON object.")
        return result


def require(condition, message):
    if not condition:
        raise SmokeError(message)


def wait_until_started(client, timeout):
    deadline = time.monotonic() + timeout
    last_message = "Backend not ready."
    while time.monotonic() < deadline:
        try:
            status, _, _ = client.request("/openmrs/health/started", auth=False,
                                          timeout=max(0.1, min(10, deadline - time.monotonic())))
            if status == 200:
                return
            last_message = f"Health endpoint returned HTTP {status}."
        except SmokeError as error:
            last_message = str(error)
        time.sleep(min(5, max(0, deadline - time.monotonic())))
    raise SmokeError(f"Backend readiness timeout: {last_message}")


def assert_session(session):
    require(session.get("authenticated") is True and bool(session.get("user", {}).get("uuid")),
            "REST session did not authenticate the configured user.")


def assert_capabilities(statement):
    require(statement.get("resourceType") == "CapabilityStatement", "Expected a FHIR CapabilityStatement.")
    require(statement.get("fhirVersion") == "4.0.1", "Baseline must expose FHIR R4 (4.0.1).")
    resources = {}
    for rest in statement.get("rest", []):
        if rest.get("mode") == "server":
            for resource in rest.get("resource", []):
                resources[resource.get("type")] = {item.get("code") for item in resource.get("interaction", [])}
    for name in ("Patient", "Encounter", "Observation"):
        require("read" in resources.get(name, set()), f"FHIR does not advertise {name} read support.")
    return resources


def assert_modules(modules, expected_components):
    by_id = {module.get("uuid"): module for module in modules}
    versions = {}
    for module_id, component in (("webservices.rest", "webservicesRest"), ("fhir2", "fhir2"),
                                 ("initializer", "initializer")):
        module = by_id.get(module_id, {})
        require(module.get("started") is True, f"Required module {module_id} is not started.")
        require(module.get("version") == expected_components[component],
                f"Required module {module_id} differs from the reviewed baseline version.")
        versions[module_id] = module["version"]
    return versions


def assert_core_version(system_info, expected):
    # OpenMRS groups its system-information fields into nested sections.
    for key, value in system_info.items():
        if key == "SystemInfo.OpenMRSInstallation.openmrsVersion":
            parts = value.split() if isinstance(value, str) else []
            require(bool(parts) and parts[0] == expected,
                    "OpenMRS core version differs from the reviewed baseline.")
            return expected
        if isinstance(value, dict):
            try:
                return assert_core_version(value, expected)
            except KeyError:
                continue
    raise KeyError("OpenMRS core version is missing from system information.")


def check_local_javascript(client, source):
    target = urllib.parse.urlsplit(urllib.parse.urljoin(client.base_url + "/openmrs/spa/", source))
    origin = urllib.parse.urlsplit(client.base_url)
    require((target.scheme, target.netloc) == (origin.scheme, origin.netloc)
            and target.path.startswith("/openmrs/spa/") and target.path.endswith(".js"),
            "Baseline JavaScript must be served locally through the gateway.")
    path = target.path + ("?" + target.query if target.query else "")
    status, headers, body = client.request(path, auth=False)
    require(status == 200 and "javascript" in headers.get("Content-Type", "").lower() and bool(body),
            "Frontend JavaScript is missing or returned HTML instead.")


def create_fixture(client, fixture_path):
    # Reuse an existing fixture only after verification; never recreate it to hide data loss.
    if fixture_path.exists():
        return json.loads(fixture_path.read_text(encoding="utf-8"))
    types = client.json("/openmrs/ws/rest/v1/patientidentifiertype?v=full").get("results", [])
    type_name = "VinSHC synthetic smoke ID"
    identifier_type = next((item for item in types if item.get("name") == type_name), None)
    if identifier_type is None:
        identifier_type = client.json(
            "/openmrs/ws/rest/v1/patientidentifiertype", method="POST", statuses=(200, 201),
            payload={"name": type_name, "description": "Synthetic development/CI identifiers only", "required": False},
        )
    baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
    location_uuid = baseline["developmentLocation"]["uuid"]
    identifier = "VSHC-SYNTH-" + uuid.uuid4().hex[:16]
    patient = client.json(
        "/openmrs/ws/rest/v1/patient", method="POST", statuses=(200, 201),
        payload={
            "person": {"names": [{"givenName": "Synthetic", "familyName": "VinSHC Smoke"}],
                       "gender": "M", "birthdate": "2000-01-01"},
            "identifiers": [{"identifier": identifier, "identifierType": identifier_type["uuid"],
                             "location": location_uuid, "preferred": True}],
        },
    )
    require(bool(patient.get("uuid")), "REST did not return a synthetic patient UUID.")
    fixture = {"patientUuid": patient["uuid"], "identifier": identifier,
               "createdAt": datetime.now(timezone.utc).isoformat()}
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    return fixture


def verify_fixture(client, fixture):
    patient_uuid = fixture["patientUuid"]
    require(str(uuid.UUID(patient_uuid)) == patient_uuid, "Invalid synthetic fixture UUID.")
    patient = client.json(f"/openmrs/ws/rest/v1/patient/{patient_uuid}?v=full")
    require(patient.get("uuid") == patient_uuid, "REST returned a different patient.")
    require(any(item.get("identifier") == fixture["identifier"] for item in patient.get("identifiers", [])),
            "Synthetic identifier was lost or changed.")
    fhir_patient = client.json(f"/openmrs/ws/fhir2/R4/Patient/{patient_uuid}")
    require(fhir_patient.get("resourceType") == "Patient" and fhir_patient.get("id") == patient_uuid,
            "FHIR mapping points to a different patient.")
    require(any(item.get("value") == fixture["identifier"] for item in fhir_patient.get("identifier", [])),
            "FHIR mapping lost the synthetic identifier.")


def run_checks(client, args, report):
    def passed(name):
        report["checks"].append({"name": name, "passed": True})
        print(f"PASS: {name}")

    wait_until_started(client, args.timeout)
    passed("backend readiness")
    status, headers, html = client.request("/openmrs/spa/index.html", auth=False)
    require(status == 200 and "text/html" in headers.get("Content-Type", ""), "O3 entrypoint is unavailable.")
    require(b"importmap" in html and b"<script" in html, "O3 entrypoint does not contain the app shell.")
    require(b"$SPA_" not in html and b"$API_URL" not in html, "Frontend runtime variables were not substituted.")
    importmap = client.json("/openmrs/spa/importmap.json", auth=False)
    require(bool(importmap.get("imports")), "O3 import map has no frontend modules.")
    scripts = re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']', html.decode("utf-8"))
    app_shell = next((source for source in scripts if urllib.parse.urlsplit(source).path.endswith(".js")), None)
    require(bool(app_shell), "O3 app shell JavaScript is missing from the entrypoint.")
    login_app = importmap["imports"].get("@openmrs/esm-login-app")
    require(isinstance(login_app, str) and bool(login_app), "O3 import map is missing the login app.")
    check_local_javascript(client, app_shell)
    check_local_javascript(client, login_app)
    passed("O3 HTML, import map and app-shell/login JavaScript through gateway")
    assert_session(client.json("/openmrs/ws/rest/v1/session"))
    passed("REST authentication")
    baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
    modules = client.json("/openmrs/ws/rest/v1/module?v=full").get("results", [])
    report["moduleVersions"] = assert_modules(modules, baseline["upstreamComponents"])
    system_info = client.json("/openmrs/ws/rest/v1/systeminformation").get("systemInfo", {})
    core_version = baseline["upstreamComponents"]["openmrsCore"]
    report["coreVersion"] = assert_core_version(system_info, core_version)
    passed("reviewed core, REST, FHIR2 and Initializer versions")
    locations = client.json("/openmrs/ws/rest/v1/location?tag=Login%20Location&v=full").get("results", [])
    expected_location = baseline["developmentLocation"]
    location = next((item for item in locations if item.get("uuid") == expected_location["uuid"]), {})
    require(location.get("name") == expected_location["name"], "Synthetic login location is missing.")
    require(set(expected_location["tags"]).issubset({tag.get("name") for tag in location.get("tags", [])}),
            "Synthetic location is missing login/facility/visit tags.")
    location_session = client.json("/openmrs/ws/rest/v1/session", method="POST",
                                   payload={"sessionLocation": expected_location["uuid"]})
    assert_session(location_session)
    require(location_session.get("sessionLocation", {}).get("uuid") == expected_location["uuid"],
            "REST session did not accept the configured login location.")
    passed("Initializer location loaded and selected in authenticated session")
    bad_status, _, bad_body = client.request("/openmrs/ws/rest/v1/session", password=client.password + "-invalid")
    if bad_status == 200:
        try:
            bad_session = json.loads(bad_body)
        except ValueError as error:
            raise SmokeError("Invalid-password session returned a non-JSON success response.") from error
        require(isinstance(bad_session, dict) and bad_session.get("authenticated") is False,
                "REST accepted an invalid password or returned an unexpected session.")
    else:
        require(bad_status in (401, 403), "Invalid-password request failed with an unexpected response.")
    anonymous_status, _, _ = client.request("/openmrs/ws/rest/v1/patient?q=VinSHC", auth=False)
    require(anonymous_status in (401, 403), "Anonymous patient lookup was not denied by the API.")
    anonymous_fhir_status, _, _ = client.request("/openmrs/ws/fhir2/R4/Patient?_count=1", auth=False)
    require(anonymous_fhir_status in (401, 403), "Anonymous FHIR patient lookup was not denied by the API.")
    passed("invalid credentials and anonymous access denied")
    patients = client.json("/openmrs/ws/rest/v1/patient?q=VinSHC")
    require(isinstance(patients.get("results"), list), "REST patient search returned an unexpected structure.")
    resources = assert_capabilities(client.json("/openmrs/ws/fhir2/R4/metadata"))
    report["fhirCapabilities"] = {name: sorted(resources[name]) for name in ("Patient", "Encounter", "Observation")}
    passed("REST patient search and FHIR R4 capabilities")
    bundle = client.json("/openmrs/ws/fhir2/R4/Patient?_count=1")
    require(bundle.get("resourceType") == "Bundle" and bundle.get("type") == "searchset",
            "FHIR Patient search returned an unexpected resource.")
    passed("FHIR Patient search")
    if args.create_fixture:
        fixture = create_fixture(client, args.fixture)
        verify_fixture(client, fixture)
        passed("synthetic patient stored and read through REST/FHIR")
    elif args.require_fixture:
        require(args.fixture.is_file(), "Persistence fixture is missing; run --create-fixture before restarting.")
        verify_fixture(client, json.loads(args.fixture.read_text(encoding="utf-8")))
        passed("existing synthetic patient survives restart through REST/FHIR")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Local HTTP origin; defaults to EHR_HTTP_PORT in .env")
    parser.add_argument("--timeout", type=int, default=300, help="Maximum seconds waiting for readiness")
    parser.add_argument("--report", type=Path, default=ROOT / ".runtime/reports/smoke.json")
    parser.add_argument("--fixture", type=Path, default=ROOT / ".runtime/smoke-fixture.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--create-fixture", action="store_true", help="Create/reuse one synthetic local patient")
    mode.add_argument("--require-fixture", action="store_true", help="Verify an existing fixture without recreating it")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "passed": False, "checks": []}
    try:
        settings = read_settings()
        client = Client(args.base_url or f"http://127.0.0.1:{settings['EHR_HTTP_PORT']}",
                        settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
        run_checks(client, args, report)
        report["passed"] = True
    except (SmokeError, ValueError, OSError, KeyError) as error:
        report["error"] = str(error)
        print(f"FAIL: {error}", file=sys.stderr)
    finally:
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
