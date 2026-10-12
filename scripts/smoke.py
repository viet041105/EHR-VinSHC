"""Exercise real local REST/FHIR endpoints and a synthetic persistence fixture."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import time
import urllib.parse
import uuid

from api_client import Client, SmokeError
from common import ROOT, read_settings


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
                resource_type = resource.get("type")
                if not isinstance(resource_type, str) or not resource_type:
                    continue
                resources[resource_type] = {
                    item.get("code") for item in resource.get("interaction", [])
                    if isinstance(item.get("code"), str) and item.get("code")
                }
    for name in ("Patient", "Encounter", "Observation"):
        require("read" in resources.get(name, set()), f"FHIR does not advertise {name} read support.")
    return resources


def assert_modules(modules, expected_components, expected_modules=None):
    by_id = {module.get("uuid"): module for module in modules}
    versions = {}
    for module_id, component in (("webservices.rest", "webservicesRest"), ("fhir2", "fhir2"),
                                 ("initializer", "initializer")):
        module = by_id.get(module_id, {})
        require(module.get("started") is True, f"Required module {module_id} is not started.")
        require(module.get("version") == expected_components[component],
                f"Required module {module_id} differs from the reviewed baseline version.")
        versions[module_id] = module["version"]
    for module_id, expected_version in (expected_modules or {}).items():
        module = by_id.get(module_id, {})
        require(module.get("started") is True, f"Baseline module {module_id} is not started.")
        require(module.get("version") == expected_version,
                f"Baseline module {module_id} differs from the reviewed version.")
        versions[module_id] = module["version"]
    return versions


def module_status(modules, expected_ids):
    """Return an explicit, stable module inventory for the B0 evidence report."""
    by_id = {module.get("uuid"): module for module in modules}
    return {
        module_id: {
            "version": by_id[module_id]["version"],
            "started": by_id[module_id].get("started") is True,
        }
        for module_id in sorted(expected_ids)
    }


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
    fixture.update(create_clinical_fixture(client, patient["uuid"], location_uuid))
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    return fixture


def create_clinical_fixture(client, patient_uuid, location_uuid):
    """Exercise PostgreSQL relationships, numeric/Unicode text values and timestamps."""
    def named_type(resource, name):
        items = client.json(f"/openmrs/ws/rest/v1/{resource}?v=full").get("results", [])
        item = next((item for item in items if item.get("name") == name), None)
        if item is None:
            item = client.json(f"/openmrs/ws/rest/v1/{resource}", method="POST", statuses=(200, 201),
                               payload={"name": name, "description": "Synthetic local/CI data only"})
        return item["uuid"]

    visit_type = named_type("visittype", "VinSHC synthetic smoke visit")
    encounter_type = named_type("encountertype", "VinSHC synthetic smoke encounter")
    datatypes = client.json("/openmrs/ws/rest/v1/conceptdatatype?v=full").get("results", [])
    classes = client.json("/openmrs/ws/rest/v1/conceptclass?v=full").get("results", [])
    numeric = next((item["uuid"] for item in datatypes if item.get("name") == "Numeric"), None)
    text_type = next((item["uuid"] for item in datatypes if item.get("name") == "Text"), None)
    test_class = next((item["uuid"] for item in classes if item.get("name") == "Test"), None)
    require(bool(numeric and text_type and test_class), "Numeric/Text datatype or Test concept class is missing.")
    concept = client.json("/openmrs/ws/rest/v1/concept", method="POST", statuses=(200, 201), payload={
        "names": [{"name": "VinSHC synthetic measurement " + uuid.uuid4().hex[:8],
                   "locale": "en", "conceptNameType": "FULLY_SPECIFIED"}],
        "datatype": numeric, "conceptClass": test_class, "units": "degC", "allowDecimal": True,
    })
    timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    visit = client.json("/openmrs/ws/rest/v1/visit", method="POST", statuses=(200, 201), payload={
        "patient": patient_uuid, "visitType": visit_type, "location": location_uuid,
        "startDatetime": timestamp,
    })
    encounter = client.json("/openmrs/ws/rest/v1/encounter", method="POST", statuses=(200, 201), payload={
        "patient": patient_uuid, "encounterType": encounter_type, "location": location_uuid,
        "visit": visit["uuid"], "encounterDatetime": timestamp,
    })
    obs = client.json("/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201), payload={
        "person": patient_uuid, "encounter": encounter["uuid"], "concept": concept["uuid"],
        "location": location_uuid, "obsDatetime": timestamp, "value": 36.7,
    })
    text_value = ("Ghi chú giả lập VinSHC: kiểm tra lưu văn bản tiếng Việt. " * 32).strip()
    text_concept = client.json("/openmrs/ws/rest/v1/concept", method="POST", statuses=(200, 201), payload={
        "names": [{"name": "VinSHC synthetic note " + uuid.uuid4().hex[:8],
                   "locale": "en", "conceptNameType": "FULLY_SPECIFIED"}],
        "datatype": text_type, "conceptClass": test_class,
        "descriptions": [{"description": text_value, "locale": "vi"}],
    })
    text_obs = client.json("/openmrs/ws/rest/v1/obs", method="POST", statuses=(200, 201), payload={
        "person": patient_uuid, "encounter": encounter["uuid"], "concept": text_concept["uuid"],
        "location": location_uuid, "obsDatetime": timestamp, "value": text_value,
    })
    return {"visitUuid": visit["uuid"], "encounterUuid": encounter["uuid"],
            "obsUuid": obs["uuid"], "conceptUuid": concept["uuid"], "numericValue": 36.7,
            "textObsUuid": text_obs["uuid"], "textConceptUuid": text_concept["uuid"], "textValue": text_value,
            "clinicalDatetime": timestamp}


def verify_clinical_fixture(client, fixture):
    patient_uuid = fixture["patientUuid"]
    visit = client.json(f"/openmrs/ws/rest/v1/visit/{fixture['visitUuid']}?v=full")
    encounter = client.json(f"/openmrs/ws/rest/v1/encounter/{fixture['encounterUuid']}?v=full")
    obs = client.json(f"/openmrs/ws/rest/v1/obs/{fixture['obsUuid']}?v=full")
    require(visit.get("patient", {}).get("uuid") == patient_uuid,
            "Visit references a different patient.")
    require(encounter.get("patient", {}).get("uuid") == patient_uuid
            and encounter.get("visit", {}).get("uuid") == fixture["visitUuid"],
            "Encounter lost its patient or visit relationship.")
    require(obs.get("person", {}).get("uuid") == patient_uuid
            and obs.get("encounter", {}).get("uuid") == fixture["encounterUuid"]
            and obs.get("concept", {}).get("uuid") == fixture["conceptUuid"]
            and obs.get("value") == fixture["numericValue"],
            "Observation lost its relationships or numeric value.")
    observed = datetime.fromisoformat(obs["obsDatetime"].replace("Z", "+00:00"))
    expected = datetime.fromisoformat(fixture["clinicalDatetime"])
    require(abs((observed - expected).total_seconds()) < 1, "Observation timestamp changed.")
    fhir_encounter = client.json(f"/openmrs/ws/fhir2/R4/Encounter/{fixture['encounterUuid']}")
    fhir_obs = client.json(f"/openmrs/ws/fhir2/R4/Observation/{fixture['obsUuid']}")
    require(fhir_encounter.get("resourceType") == "Encounter"
            and fhir_encounter.get("id") == fixture["encounterUuid"]
            and fhir_encounter.get("subject", {}).get("reference", "").endswith("Patient/" + patient_uuid),
            "FHIR Encounter maps to a different patient or encounter.")
    require(fhir_obs.get("resourceType") == "Observation" and fhir_obs.get("id") == fixture["obsUuid"]
            and fhir_obs.get("subject", {}).get("reference", "").endswith("Patient/" + patient_uuid)
            and fhir_obs.get("encounter", {}).get("reference", "").endswith("Encounter/" + fixture["encounterUuid"])
            and fhir_obs.get("valueQuantity", {}).get("value") == fixture["numericValue"]
            and fhir_obs.get("valueQuantity", {}).get("unit") == "degC",
            "FHIR Observation lost its patient, encounter, numeric value or unit.")
    if fixture.get("textObsUuid"):
        text_obs = client.json(f"/openmrs/ws/rest/v1/obs/{fixture['textObsUuid']}?v=full")
        text_concept = client.json(
            f"/openmrs/ws/rest/v1/concept/{fixture['textConceptUuid']}?v=custom:(uuid,descriptions:(uuid,description))")
        fhir_text = client.json(f"/openmrs/ws/fhir2/R4/Observation/{fixture['textObsUuid']}")
        require(text_obs.get("value") == fixture["textValue"]
                and text_obs.get("person", {}).get("uuid") == patient_uuid
                and text_obs.get("encounter", {}).get("uuid") == fixture["encounterUuid"]
                and any(item.get("description") == fixture["textValue"].strip()
                        for item in text_concept.get("descriptions", [])),
                "REST lost Unicode text or the concept description.")
        require(fhir_text.get("id") == fixture["textObsUuid"]
                and fhir_text.get("subject", {}).get("reference", "").endswith("Patient/" + patient_uuid)
                and fhir_text.get("valueString") == fixture["textValue"],
                "FHIR lost Unicode observation text or its patient relationship.")


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
    if fixture.get("obsUuid"):
        verify_clinical_fixture(client, fixture)


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
    report["moduleVersions"] = assert_modules(modules, baseline["upstreamComponents"], baseline["requiredModules"])
    report["modules"] = module_status(modules, baseline["requiredModules"])
    system_info = client.json("/openmrs/ws/rest/v1/systeminformation").get("systemInfo", {})
    core_version = baseline["upstreamComponents"]["openmrsCore"]
    report["coreVersion"] = assert_core_version(system_info, core_version)
    report["referenceApplicationVersion"] = baseline["referenceApplication"]["version"]
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
    report["fhirVersion"] = "4.0.1"
    report["fhirCapabilities"] = {
        name: sorted(interactions) for name, interactions in sorted(resources.items())
    }
    passed("REST patient search and FHIR R4 capabilities")
    bundle = client.json("/openmrs/ws/fhir2/R4/Patient?_count=1")
    require(bundle.get("resourceType") == "Bundle" and bundle.get("type") == "searchset",
            "FHIR Patient search returned an unexpected resource.")
    passed("FHIR Patient search")
    if args.create_fixture:
        fixture = create_fixture(client, args.fixture)
        verify_fixture(client, fixture)
        passed("synthetic patient and clinical fixture stored and read through REST/FHIR"
               if fixture.get("obsUuid") else "synthetic patient stored and read through REST/FHIR")
    elif args.require_fixture:
        require(args.fixture.is_file(), "Persistence fixture is missing; run --create-fixture before restarting.")
        fixture = json.loads(args.fixture.read_text(encoding="utf-8"))
        verify_fixture(client, fixture)
        passed("existing patient, visit, encounter and observation survive restart through REST/FHIR"
               if fixture.get("obsUuid") else "existing synthetic patient survives restart through REST/FHIR")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Local HTTP origin; defaults to EHR_HTTP_PORT in .env")
    parser.add_argument("--timeout", type=int, default=300, help="Maximum seconds waiting for readiness")
    parser.add_argument("--report", type=Path, default=ROOT / ".runtime/reports/smoke.json")
    parser.add_argument("--fixture", type=Path, default=ROOT / ".runtime/smoke-fixture.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--create-fixture", action="store_true", help="Create/reuse a synthetic patient and clinical fixture")
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
