"""Synthetic B1 fixtures. Never use against a non-loopback or real-patient instance."""

from datetime import datetime, timezone
import json
from pathlib import Path
import uuid


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def find_or_create_named(client, resource, name):
    results = client.json(f"/openmrs/ws/rest/v1/{resource}?v=full").get("results", [])
    existing = next((item for item in results if item.get("name") == name), None)
    if existing:
        return existing
    return client.json(
        f"/openmrs/ws/rest/v1/{resource}", method="POST", statuses=(200, 201),
        payload={"name": name, "description": "Synthetic B1 local/CI metadata only"},
    )


def load_or_create_patient(client, fixture_path, location_uuid):
    """Reuse only the exact saved patient; missing persisted data is a hard failure."""
    if fixture_path.is_file():
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        patient = client.json(f"/openmrs/ws/rest/v1/patient/{fixture['patientUuid']}?v=full")
        require(patient.get("uuid") == fixture["patientUuid"], "Saved fixture resolves to another patient.")
        require(any(item.get("identifier") == fixture["identifier"]
                    for item in patient.get("identifiers", [])), "Saved fixture identifier was lost.")
        return fixture

    identifier_type = find_or_create_named(client, "patientidentifiertype", "VinSHC synthetic B1 ID")
    identifier = "VSHC-B1-" + uuid.uuid4().hex.upper()
    patient = client.json(
        "/openmrs/ws/rest/v1/patient", method="POST", statuses=(200, 201),
        payload={
            "person": {
                "names": [{"givenName": "Synthetic", "familyName": "VinSHC B1"}],
                "gender": "F", "birthdate": "2001-02-03",
            },
            "identifiers": [{
                "identifier": identifier, "identifierType": identifier_type["uuid"],
                "location": location_uuid, "preferred": True,
            }],
        },
    )
    require(bool(patient.get("uuid")), "Patient create response has no UUID.")
    fixture = {
        "patientUuid": patient["uuid"], "identifier": identifier,
        "identifierTypeUuid": identifier_type["uuid"], "locationUuid": location_uuid,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    return fixture


def create_and_end_visit(client, patient_uuid, location_uuid):
    visit_type = find_or_create_named(client, "visittype", "VinSHC synthetic B1 visit")
    started = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    visit = client.json(
        "/openmrs/ws/rest/v1/visit", method="POST", statuses=(200, 201),
        payload={"patient": patient_uuid, "visitType": visit_type["uuid"],
                 "location": location_uuid, "startDatetime": started},
    )
    require(bool(visit.get("uuid")), "Visit create response has no UUID.")
    stopped = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    ended = client.json(
        f"/openmrs/ws/rest/v1/visit/{visit['uuid']}", method="POST", statuses=(200,),
        payload={"stopDatetime": stopped},
    )
    return {"visitUuid": visit["uuid"], "visitTypeUuid": visit_type["uuid"],
            "startedAt": started, "stoppedAt": stopped, "response": ended}
