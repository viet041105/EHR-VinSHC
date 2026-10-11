"""B2 patient and identifier contract tests for an isolated local instance."""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
import urllib.parse
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from api_client import Client
from common import read_settings


IDGEN_SOURCE_UUID = "3bfdfcf4-987a-521d-8e5d-7d60e782b6fa"
IDGEN_OPTION_UUID = "3f790925-f744-5b56-92cd-237d0c54e187"


def _identifiers(patient):
    return {item["identifierType"]["uuid"]: item["identifier"]
            for item in patient.get("identifiers", []) if not item.get("voided")}


class B2PatientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = read_settings()
        cls.client = Client(
            f"http://127.0.0.1:{settings.get('EHR_HTTP_PORT', '8080')}",
            settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"],
        )
        cls.entities = json.loads(
            (ROOT / "metadata/vinshc/frontend-map.json").read_text(encoding="utf-8")
        )["entities"]
        cls.fixture_path = ROOT / ".runtime/fixtures/b2-patients.json"
        cls.fixture = cls._load_or_create_fixture()
        cls.evidence = {
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "passed": False,
            "patientUuids": [item["patientUuid"] for item in cls.fixture["patients"]],
            "checks": [],
        }

    @classmethod
    def tearDownClass(cls):
        cls.evidence["passed"] = len(cls.evidence["checks"]) == 5
        cls.evidence["finishedAt"] = datetime.now(timezone.utc).isoformat()
        destination = ROOT / ".runtime/reports/b2-integration.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(cls.evidence, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")

    @classmethod
    def _generate_identifier(cls, comment):
        result = cls.client.json(
            f"/openmrs/ws/rest/v1/idgen/identifiersource/{IDGEN_SOURCE_UUID}/identifier",
            method="POST", statuses=(201,), payload={"comment": comment},
        )
        return result["identifier"]

    @classmethod
    def _load_or_create_fixture(cls):
        if cls.fixture_path.is_file():
            fixture = json.loads(cls.fixture_path.read_text(encoding="utf-8"))
            for item in fixture["patients"]:
                patient = cls.client.json(
                    f"/openmrs/ws/rest/v1/patient/{item['patientUuid']}?v=full")
                if _identifiers(patient).get(cls.entities["identifier.internal"]) != item["internalId"]:
                    raise AssertionError("Saved B2 fixture no longer has its internal identifier.")
            return fixture

        shared_name = {"givenName": "Bình", "middleName": "An", "familyName": "Nguyễn"}
        patients = []
        for index in range(2):
            internal_id = cls._generate_identifier("B2 patient fixture")
            cccd = f"{uuid.uuid4().int % 1_000_000_000_000:012d}"
            identifiers = [
                {"identifier": internal_id,
                 "identifierType": cls.entities["identifier.internal"],
                 "location": cls.entities["location.development.clinic"], "preferred": True},
                {"identifier": cccd, "identifierType": cls.entities["identifier.cccd"],
                 "preferred": False},
            ]
            if index == 0:
                identifiers.extend([
                    {"identifier": "BHXH-" + cccd[-8:],
                     "identifierType": cls.entities["identifier.bhxh"], "preferred": False},
                    {"identifier": "BHYT-" + cccd[-8:],
                     "identifierType": cls.entities["identifier.bhyt"], "preferred": False},
                ])
            person = {
                "names": [shared_name], "gender": "F", "birthdate": "1991-02-03",
            }
            if index == 0:
                person.update({
                    "addresses": [{"address1": "12 Đường Hoa", "cityVillage": "Bến Nghé",
                                   "stateProvince": "Hồ Chí Minh", "country": "Việt Nam",
                                   "postalCode": "700000", "preferred": True}],
                    "attributes": [
                        {"attributeType": cls.entities["attribute.phone"], "value": "0901234567"},
                        {"attributeType": cls.entities["attribute.occupation"], "value": "Kỹ sư"},
                        {"attributeType": cls.entities["attribute.address_raw"],
                         "value": "12 Đường Hoa, Bến Nghé, HCM"},
                    ],
                })
            patient = cls.client.json(
                "/openmrs/ws/rest/v1/patient", method="POST", statuses=(201,),
                payload={"person": person, "identifiers": identifiers},
            )
            patients.append({"patientUuid": patient["uuid"], "internalId": internal_id,
                             "cccd": cccd})
        fixture = {"createdAt": datetime.now(timezone.utc).isoformat(), "patients": patients}
        cls.fixture_path.parent.mkdir(parents=True, exist_ok=True)
        cls.fixture_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n",
                                    encoding="utf-8")
        return fixture

    def record(self, name, **details):
        self.evidence["checks"].append({"name": name, "passed": True, **details})

    def test_01_identifier_metadata_and_postgresql_idgen(self):
        expected = {
            "identifier.internal": ("REQUIRED", "LOCATION"),
            "identifier.cccd": ("NOT_USED", "NON_UNIQUE"),
            "identifier.bhxh": ("NOT_USED", "NON_UNIQUE"),
            "identifier.bhyt": ("NOT_USED", "NON_UNIQUE"),
        }
        for key, (location_behavior, uniqueness_behavior) in expected.items():
            value = self.client.json(
                f"/openmrs/ws/rest/v1/patientidentifiertype/{self.entities[key]}?v=full")
            self.assertEqual(value["locationBehavior"], location_behavior)
            self.assertEqual(value["uniquenessBehavior"], uniqueness_behavior)
            self.assertFalse(value["retired"])
        source = self.client.json(
            f"/openmrs/ws/rest/v1/idgen/identifiersource/{IDGEN_SOURCE_UUID}?v=full")
        option = self.client.json(
            f"/openmrs/ws/rest/v1/idgen/autogenerationoption/{IDGEN_OPTION_UUID}?v=full")
        self.assertEqual(source["identifierType"]["uuid"], self.entities["identifier.internal"])
        self.assertEqual(option["location"]["uuid"], self.entities["location.development.clinic"])
        self.assertIs(option["manualEntryEnabled"], False)
        self.assertIs(option["automaticGenerationEnabled"], True)
        generated = self._generate_identifier("B2 integration verification")
        self.assertRegex(generated, r"^VSHC-[0-9]{8}$")
        self.record("identifier types and PostgreSQL IDGen", generatedPattern="VSHC-########")

    def test_02_crud_search_same_name_and_pagination(self):
        first, second = self.fixture["patients"]
        patient = self.client.json(f"/openmrs/ws/rest/v1/patient/{first['patientUuid']}?v=full")
        identifiers = _identifiers(patient)
        self.assertEqual(identifiers[self.entities["identifier.internal"]], first["internalId"])
        self.assertEqual(identifiers[self.entities["identifier.cccd"]], first["cccd"])
        updated = self.client.json(
            f"/openmrs/ws/rest/v1/person/{first['patientUuid']}", method="POST",
            payload={"birthdateEstimated": True},
        )
        self.assertIs(updated["person"]["birthdateEstimated"], True)
        for query in (first["internalId"], first["cccd"], "Bình An Nguyễn"):
            result = self.client.json(
                "/openmrs/ws/rest/v1/patient?q=" + urllib.parse.quote(query) + "&v=full")
            self.assertIn(first["patientUuid"], [item["uuid"] for item in result["results"]])
        name_query = urllib.parse.quote("Bình An Nguyễn")
        page_one = self.client.json(
            f"/openmrs/ws/rest/v1/patient?q={name_query}&limit=1&startIndex=0&v=full")
        page_two = self.client.json(
            f"/openmrs/ws/rest/v1/patient?q={name_query}&limit=1&startIndex=1&v=full")
        paged = {page_one["results"][0]["uuid"], page_two["results"][0]["uuid"]}
        self.assertEqual(paged, {first["patientUuid"], second["patientUuid"]})
        self.assertNotEqual(first["patientUuid"], second["patientUuid"])
        self.record("REST create/read/update/search/pagination and same-name isolation")

    def test_03_fhir_patient_mapping(self):
        first = self.fixture["patients"][0]
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Patient/{first['patientUuid']}")
        self.assertEqual(fhir["resourceType"], "Patient")
        self.assertEqual(fhir["id"], first["patientUuid"])
        mapped = {item["type"]["coding"][0]["code"]: item["value"]
                  for item in fhir["identifier"]}
        self.assertEqual(mapped[self.entities["identifier.internal"]], first["internalId"])
        self.assertEqual(mapped[self.entities["identifier.cccd"]], first["cccd"])
        self.assertEqual(fhir["name"][0]["family"], "Nguyễn")
        self.assertEqual(fhir["name"][0]["given"], ["Bình", "An"])
        self.record("FHIR Patient UUID, identifier type/value and Vietnamese name")

    def test_04_invalid_duplicate_and_forbidden_requests(self):
        first = self.fixture["patients"][0]
        duplicate_payload = {
            "person": {"names": [{"givenName": "Duplicate", "familyName": "B2"}],
                       "gender": "U", "birthdate": "2000-01-01"},
            "identifiers": [{"identifier": first["internalId"],
                             "identifierType": self.entities["identifier.internal"],
                             "location": self.entities["location.development.clinic"],
                             "preferred": True}],
        }
        invalid_payload = {
            "person": {"names": [{"givenName": "Invalid", "familyName": "B2"}],
                       "gender": "U", "birthdate": "2000-01-01"},
            "identifiers": [{"identifier": "ABC",
                             "identifierType": self.entities["identifier.cccd"],
                             "preferred": True}],
        }
        duplicate, _, duplicate_body = self.client.request(
            "/openmrs/ws/rest/v1/patient", method="POST", payload=duplicate_payload)
        invalid, _, invalid_body = self.client.request(
            "/openmrs/ws/rest/v1/patient", method="POST", payload=invalid_payload)
        self.assertEqual(duplicate, 400)
        self.assertEqual(invalid, 400)
        self.assertIn("already in use", json.loads(duplicate_body)["error"]["globalErrors"][0]["message"])
        self.assertIn("does not match", json.loads(invalid_body)["error"]["globalErrors"][0]["message"])

        person = self.client.json(
            "/openmrs/ws/rest/v1/person", method="POST", statuses=(200, 201),
            payload={"names": [{"givenName": "Restricted", "familyName": "B2"}],
                     "gender": "U", "birthdate": "2000-01-01"},
        )
        username = "b2-restricted-" + uuid.uuid4().hex[:12]
        password = "B2-local-" + uuid.uuid4().hex
        user = self.client.json(
            "/openmrs/ws/rest/v1/user", method="POST", statuses=(200, 201),
            payload={"username": username, "password": password,
                     "person": person["uuid"], "roles": []},
        )
        restricted = Client(self.client.base_url, username, password)
        try:
            rest_status, _, _ = restricted.request(
                f"/openmrs/ws/rest/v1/patient/{first['patientUuid']}")
            fhir_status, _, fhir_body = restricted.request(
                f"/openmrs/ws/fhir2/R4/Patient/{first['patientUuid']}")
            self.assertEqual(rest_status, 403)
            # FHIR2 4.2.0 denies access, but incorrectly translates the same
            # missing privilege to HTTP 500. Preserve the observed contract
            # until the upstream module is upgraded/fixed.
            self.assertEqual(fhir_status, 500)
            outcome = json.loads(fhir_body)
            self.assertEqual(outcome["resourceType"], "OperationOutcome")
            self.assertIn("Privileges required: Get Patients", outcome["issue"][0]["diagnostics"])
        finally:
            self.client.request(
                f"/openmrs/ws/rest/v1/user/{user['uuid']}?reason=B2%20test%20complete",
                method="DELETE")
            self.client.request(
                f"/openmrs/ws/rest/v1/person/{person['uuid']}?reason=B2%20test%20complete",
                method="DELETE")
        self.record("invalid format, duplicate identifier and REST/FHIR permission rejection",
                    restForbiddenStatus=403, fhirDeniedStatus=500)

    def test_05_phone_attributes_and_address_round_trip(self):
        first = self.fixture["patients"][0]
        patient = self.client.json(f"/openmrs/ws/rest/v1/patient/{first['patientUuid']}?v=full")
        attributes = {item["attributeType"]["uuid"]: item["value"]
                      for item in patient["person"]["attributes"] if not item.get("voided")}
        self.assertEqual(attributes[self.entities["attribute.phone"]], "0901234567")
        self.assertEqual(attributes[self.entities["attribute.occupation"]], "Kỹ sư")
        address = patient["person"]["preferredAddress"]
        self.assertEqual(address["address1"], "12 Đường Hoa")
        self.assertEqual(address["cityVillage"], "Bến Nghé")
        self.assertEqual(address["stateProvince"], "Hồ Chí Minh")
        fhir = self.client.json(f"/openmrs/ws/fhir2/R4/Patient/{first['patientUuid']}")
        extension_values = {
            child["valueString"]
            for item in fhir.get("extension", [])
            if item.get("url") == "http://fhir.openmrs.org/ext/person-attribute"
            for child in item.get("extension", [])
            if child.get("url") == "http://fhir.openmrs.org/ext/person-attribute-value"
        }
        self.assertIn("0901234567", extension_values)
        self.record("phone/person attributes and Core address round trip")


if __name__ == "__main__":
    unittest.main()
