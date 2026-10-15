"""Nguồn hồ sơ synthetic độc lập; quyền và bản công bố được kiểm tra ở mỗi lần đọc.

Các Bearer demo-* là tên tình huống công khai, không phải cơ chế đăng nhập production.
Đầu ra giữ dạng nội bộ mà records.py hiểu. BE mới có thể dùng schema khác qua adapter.
"""
from __future__ import annotations

import copy
import csv
import hashlib
import hmac
import math
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .backend import BackendError, Credentials, require_uuid
from .config import ConfigError
from .portal import PatientSession


class FixtureModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Identity(FixtureModel):
    role: Literal["doctor", "nurse", "patient"]
    userUuid: str
    facilityUuids: list[str] = Field(default_factory=list)
    patientUuids: list[str] = Field(default_factory=list)
    patientUuid: str | None = None


class Publication(FixtureModel):
    visitUuid: str
    status: Literal["published", "draft", "revoked", "stale"]
    sourceVersion: int = Field(ge=1)
    currentSourceVersion: int = Field(ge=1)
    publishedAt: str | None = None
    items: list[dict[str, Any]] = Field(default_factory=list)
    prescriptions: list[dict[str, Any]] = Field(default_factory=list)


class PatientRecord(FixtureModel):
    scenario: str
    facilityUuid: str
    administrative: dict[str, Any]
    visits: list[dict[str, Any]]
    summaries: dict[str, dict[str, Any]]
    vitals: list[dict[str, Any]] = Field(default_factory=list)
    allergies: list[dict[str, Any]] = Field(default_factory=list)
    serviceOrders: list[dict[str, Any]] = Field(default_factory=list)
    results: dict[str, dict[str, Any]] = Field(default_factory=dict)
    appointments: list[dict[str, Any]] = Field(default_factory=list)
    publications: list[Publication] = Field(default_factory=list)


class Provenance(FixtureModel):
    path: str
    version: str
    fieldsSha256: str


class MockDataset(FixtureModel):
    version: Literal["0.1.0"]
    synthetic: Literal[True]
    description: str
    metadata: Provenance
    facilities: dict[str, str]
    identities: dict[str, Identity]
    patients: dict[str, PatientRecord]

    @classmethod
    def load(cls, path: Path, fields_csv: Path) -> "MockDataset":
        try:
            data = cls.model_validate_json(path.read_text(encoding="utf-8"))
            data.check(fields_csv)
            return data
        except (OSError, ValidationError, ValueError, BackendError, KeyError, TypeError) as ex:
            # Do not print the input payload if somebody selects a malformed local file.
            raise ConfigError(f"Bộ hồ sơ giả không hợp lệ ({type(ex).__name__}); kiểm tra schema, liên kết và metadata.") from ex

    def check(self, fields_csv: Path) -> None:
        if hashlib.sha256(fields_csv.read_bytes()).hexdigest() != self.metadata.fieldsSha256:
            raise ValueError("metadata hash mismatch")
        with fields_csv.open(encoding="utf-8-sig", newline="") as handle:
            fields = {row["field_code"] for row in csv.DictReader(handle)}
        for facility in self.facilities:
            require_uuid(facility, "facility")
        seen_records: set[str] = set()
        for patient, record in self.patients.items():
            require_uuid(patient, "patient")
            if not record.visits or not record.summaries:
                raise ValueError("a development case needs a visit and encounter")
            if record.facilityUuid not in self.facilities or record.administrative.get("uuid") != patient or record.administrative.get("patientUuid") != patient:
                raise ValueError("patient identity mismatch")
            visits = {item["uuid"]: item for item in record.visits}
            if len(visits) != len(record.visits):
                raise ValueError("duplicate visit")
            encounters = {item["uuid"]: item for visit in record.visits for item in visit.get("encounters", [])}
            if len(encounters) != sum(len(visit.get("encounters", [])) for visit in record.visits):
                raise ValueError("duplicate encounter")
            for key in (*visits, *encounters, *record.results):
                require_uuid(key, "record")
                if key in seen_records:
                    raise ValueError("record shared between patients")
                seen_records.add(key)

            def owned(item: dict[str, Any]) -> None:
                if item.get("patientUuid") != patient:
                    raise ValueError("record belongs to another patient")
                if item.get("visitUuid") and item["visitUuid"] not in visits:
                    raise ValueError("record belongs to another visit")
                if item.get("encounterUuid") and item["encounterUuid"] not in encounters:
                    raise ValueError("record belongs to another encounter")
                if item.get("encounterUuid") and item.get("visitUuid") and encounters[item["encounterUuid"]].get("visitUuid") != item["visitUuid"]:
                    raise ValueError("encounter/visit mismatch")
                if item.get("uuid"):
                    require_uuid(item["uuid"], "source")

            for visit in record.visits:
                owned(visit)
                if visit.get("visitUuid") != visit["uuid"]:
                    raise ValueError("visit key mismatch")
                for encounter in visit.get("encounters", []):
                    owned(encounter)
                    if encounter.get("visitUuid") != visit["uuid"]:
                        raise ValueError("encounter/visit mismatch")
            for encounter, summary in record.summaries.items():
                owned(summary)
                if summary.get("encounterUuid") != encounter or encounter not in encounters:
                    raise ValueError("summary key mismatch")
                consultation = summary.get("consultation")
                if consultation:
                    owned(consultation)
                    if consultation["encounterUuid"] != encounter or not set(consultation.get("values", {})) <= fields:
                        raise ValueError("invalid consultation fields")
                    for code in consultation.get("values", {}):
                        require_uuid(consultation["memberUuids"][code], "consultation source")
                for item in summary.get("diagnoses", []) + summary.get("drugOrders", []):
                    owned(item)
                    if item.get("encounterUuid") != encounter:
                        raise ValueError("summary member encounter mismatch")
                if summary.get("vitals") != [item for item in record.vitals if item["visitUuid"] == summary["visitUuid"] and not item.get("voided")]:
                    raise ValueError("summary vitals inconsistent")
                if summary.get("allergies", {}).get("allergies") != [item for item in record.allergies if not item.get("voided")]:
                    raise ValueError("summary allergies inconsistent")
            for item in record.vitals + record.allergies + record.serviceOrders + list(record.results.values()) + record.appointments:
                owned(item)
            for group in record.vitals:
                values, states = group.get("values", {}), group.get("states", {})
                if set(values) & set(states) or not (set(values) | set(states)) <= {code for code in fields if code.startswith("vitals.")}:
                    raise ValueError("invalid vital fields or value/state conflict")
                if not set(states.values()) <= {"not_recorded", "not_asked", "unknown", "refused", "not_applicable", "masked", "unreadable"}:
                    raise ValueError("invalid missing state")
                for code, value in values.items():
                    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
                        raise ValueError("vital must be finite and positive")
                    if code == "vitals.spo2" and value > 100:
                        raise ValueError("invalid percent")
                systolic, diastolic = values.get("vitals.ha_tam_thu"), values.get("vitals.ha_tam_truong")
                if (systolic is None) != (diastolic is None) or systolic is not None and systolic <= diastolic and not group.get("needsVerification"):
                    raise ValueError("invalid BP group")
            for order in record.serviceOrders:
                for result in order.get("results", []):
                    payload = record.results[result["result_uuid"]]
                    if payload["orderUuid"] != order["uuid"] or payload["version"] != result["version_number"]:
                        raise ValueError("diagnostic result mismatch")
            for publication in record.publications:
                if publication.visitUuid not in visits:
                    raise ValueError("publication belongs to another visit")
                summaries = [item for item in record.summaries.values() if item["visitUuid"] == publication.visitUuid]
                values = {key: value for item in summaries for key, value in (item.get("consultation") or {}).get("values", {}).items()}
                for item in publication.items:
                    if item["field"] not in {"exam.loi_dan", "followup.ngay_tai_kham", "followup.loi_dan"} or item["field"] not in fields:
                        raise ValueError("portal field not allowed")
                    if publication.status == "published" and item["text"] != values.get(item["field"]):
                        raise ValueError("published instructions differ from source")
                for prescription in publication.prescriptions:
                    if prescription["visitUuid"] != publication.visitUuid or not any(prescription["uuid"] == order["uuid"] for summary in summaries for order in summary.get("drugOrders", [])):
                        raise ValueError("published prescription source mismatch")
        for name, identity in self.identities.items():
            if not name or not name.isascii() or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in name):
                raise ValueError("invalid demo identity name")
            require_uuid(identity.userUuid, "user")
            if not set(identity.facilityUuids) <= self.facilities.keys() or not set(identity.patientUuids) <= self.patients.keys():
                raise ValueError("unknown identity scope")
            if identity.role == "patient" and identity.patientUuid not in self.patients:
                raise ValueError("unknown linked patient")

    def identity(self, authorization: str) -> Identity:
        for name, identity in self.identities.items():
            if hmac.compare_digest(f"Bearer demo-{name}".encode(), (authorization or "").encode()):
                return identity
        raise BackendError(401, "unauthenticated", "Danh tính giả lập không hợp lệ; dùng tình huống trong /dev/cases.")

    def cases(self) -> dict[str, Any]:
        return {"synthetic": True, "fixtureVersion": self.version, "metadataVersion": self.metadata.version,
                "cases": [{"name": record.scenario, "patientUuid": patient, "visitUuid": record.visits[0]["uuid"],
                           "encounterUuid": next(iter(record.summaries)), "facilityUuid": record.facilityUuid,
                           "doctorIdentity": next((key for key, identity in self.identities.items() if identity.role == "doctor" and patient in identity.patientUuids), None),
                           "patientIdentity": next((key for key, identity in self.identities.items() if identity.role == "patient" and identity.patientUuid == patient), None)}
                          for patient, record in self.patients.items()]}


class MockBackend:
    """Implements ClinicalDataProvider; returns a copy so one request cannot mutate another."""
    def __init__(self, dataset: MockDataset):
        self.dataset = dataset

    async def workspace(self, credentials: Credentials) -> dict[str, Any]:
        identity = self.dataset.identity(credentials.authorization)
        if identity.role != credentials.role or credentials.facility not in identity.facilityUuids:
            raise BackendError(403, "forbidden", "Danh tính không có vai trò/cơ sở được yêu cầu.")
        return {"userUuid": identity.userUuid, "role": identity.role, "facilityUuid": credentials.facility}

    async def _record(self, credentials: Credentials, patient: str) -> PatientRecord:
        await self.workspace(credentials)
        identity = self.dataset.identity(credentials.authorization)
        patient = require_uuid(patient, "patientUuid")
        if identity.role != "doctor" or patient not in identity.patientUuids:
            raise BackendError(403, "forbidden", "Bác sĩ không được phân công đọc hồ sơ này.")
        record = self.dataset.patients[patient]
        if record.facilityUuid != credentials.facility:
            raise BackendError(403, "forbidden", "Hồ sơ không thuộc cơ sở đang chọn.")
        return record

    async def validate_doctor_context(self, credentials: Credentials, patient: str, encounter: str | None, visit: str | None) -> None:
        record = await self._record(credentials, patient)
        if not encounter:
            if visit and not any((v.get("uuid") or v.get("visitUuid")) == visit for v in getattr(record, "visits", None) or []):
                raise BackendError(400, "invalid_context", "Lượt khám không thuộc bệnh nhân đang chọn.")
            return
        summary = record.summaries.get(encounter)
        if summary is None or visit and summary["visitUuid"] != visit:
            raise BackendError(400, "invalid_context", "Bệnh nhân, lượt khám và phiếu khám không khớp nhau.")

    async def clinical_summary(self, credentials: Credentials, encounter: str) -> dict[str, Any]:
        await self.workspace(credentials)
        encounter = require_uuid(encounter, "encounterUuid")
        for patient, record in self.dataset.patients.items():
            if encounter in record.summaries:
                await self._record(credentials, patient)
                return copy.deepcopy(record.summaries[encounter])
        raise BackendError(404, "not_found", "Không tìm thấy phiếu khám giả lập.")

    async def patient(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        return copy.deepcopy((await self._record(credentials, patient)).administrative)

    async def visits(self, credentials: Credentials, patient: str, limit: int) -> dict[str, Any]:
        items = sorted((await self._record(credentials, patient)).visits, key=lambda item: item["startDatetime"], reverse=True)
        return copy.deepcopy({"results": items[:limit], "limit": limit, "offset": 0, "hasMore": len(items) > limit})

    async def _visit_record(self, credentials: Credentials, patient: str, visit: str | None) -> PatientRecord:
        record = await self._record(credentials, patient)
        if visit and require_uuid(visit, "visitUuid") not in {item["uuid"] for item in record.visits}:
            raise BackendError(404, "not_found", "Lượt khám không thuộc hồ sơ đang đọc.")
        return record

    async def vitals(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]:
        record = await self._visit_record(credentials, patient, visit)
        return copy.deepcopy({"patientUuid": patient, "results": [item for item in record.vitals if not item.get("voided") and (not visit or item["visitUuid"] == visit)]})

    async def allergies(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        record = await self._record(credentials, patient)
        return copy.deepcopy({"patientUuid": patient, "allergies": [item for item in record.allergies if not item.get("voided")]})

    async def service_orders(self, credentials: Credentials, patient: str, visit: str | None) -> dict[str, Any]:
        record = await self._visit_record(credentials, patient, visit)
        return copy.deepcopy({"results": [item for item in record.serviceOrders if not visit or item["visitUuid"] == visit], "hasMore": False})

    async def result(self, credentials: Credentials, result: str) -> dict[str, Any]:
        await self.workspace(credentials)
        result = require_uuid(result, "resultUuid")
        for patient, record in self.dataset.patients.items():
            if result in record.results:
                await self._record(credentials, patient)
                return copy.deepcopy(record.results[result])
        raise BackendError(404, "not_found", "Không tìm thấy kết quả giả lập.")

    async def appointments(self, credentials: Credentials, patient: str) -> dict[str, Any]:
        return copy.deepcopy({"results": (await self._record(credentials, patient)).appointments, "hasMore": False})


class MockPortal:
    mode = "mock"

    def __init__(self, dataset: MockDataset):
        self.dataset = dataset

    async def authenticate(self, authorization: str) -> PatientSession:
        identity = self.dataset.identity(authorization)
        if identity.role != "patient":
            raise BackendError(403, "role_not_supported", "Danh tính này không phải bệnh nhân.")
        return PatientSession(str(identity.patientUuid), authorization)

    async def _record(self, session: PatientSession) -> PatientRecord:
        checked = await self.authenticate(session.authorization)
        if checked.patient_uuid != session.patient_uuid:
            raise BackendError(403, "forbidden", "Phiên không thuộc bệnh nhân đang đọc.")
        return self.dataset.patients[checked.patient_uuid]

    @staticmethod
    def _visible(record: PatientRecord) -> list[Publication]:
        return [publication for publication in record.publications
                if publication.status == "published" and publication.publishedAt
                and publication.sourceVersion == publication.currentSourceVersion
                and any(summary["visitUuid"] == publication.visitUuid and summary["status"] == "final" for summary in record.summaries.values())]

    async def visits(self, session: PatientSession) -> dict[str, Any]:
        record = await self._record(session)
        visible = {publication.visitUuid for publication in self._visible(record)}
        return copy.deepcopy({"patientUuid": session.patient_uuid, "results": [
            {"uuid": item["uuid"], "startDatetime": item["startDatetime"], "facilityName": self.dataset.facilities[record.facilityUuid], "serviceName": item["visitType"]["name"]}
            for item in record.visits if item["uuid"] in visible]})

    async def visit_instructions(self, session: PatientSession, visit: str) -> dict[str, Any]:
        record = await self._record(session)
        visit = require_uuid(visit, "visitUuid")
        publication = next((item for item in self._visible(record) if item.visitUuid == visit), None)
        if publication is None:
            raise BackendError(404, "not_found", "Không tìm thấy hồ sơ đã công bố cho bạn.")
        return copy.deepcopy({"patientUuid": session.patient_uuid, "visitUuid": visit, "publishedAt": publication.publishedAt,
                              "version": publication.sourceVersion, "items": publication.items})

    async def prescriptions(self, session: PatientSession, visit: str | None) -> dict[str, Any]:
        record = await self._record(session)
        if visit:
            await self.visit_instructions(session, visit)
        return copy.deepcopy({"patientUuid": session.patient_uuid, "results": [prescription
                              for publication in self._visible(record) if not visit or publication.visitUuid == visit
                              for prescription in publication.prescriptions]})

    async def appointments(self, session: PatientSession) -> dict[str, Any]:
        return copy.deepcopy({"patientUuid": session.patient_uuid, "results": (await self._record(session)).appointments})
