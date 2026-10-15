"""Seed a few synthetic patients (visits, vitals, allergies) for manual testing of the doctor assistant.

Data goes through the VinSHC module API, the same path the clinic UI uses. Development database only.
Usage: python scripts/seed_demo_patients.py [--base-url http://127.0.0.1:8080]
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import sys

from api_client import ApiError, Client
from common import ROOT
from mvp import dotenv

API = "/openmrs/ws/rest/v1/vinshc"
ICT = timezone(timedelta(hours=7))
VITALS_ENCOUNTER = "8368ff74-1b50-592b-8e78-2f0f2ddc1e06"

# family, given, gender, birthdate, CCCD, visits (days ago, vitals), allergies (allergen code, severity, reaction, note)
PATIENTS = [
    ("Nguyễn Thị", "Hồng", "F", "1968-03-14", "001168000101",
     [(30, {"vitals.mach": 82, "vitals.ha_tam_thu": 150, "vitals.ha_tam_truong": 95, "vitals.nhiet_do": 36.8,
            "vitals.spo2": 97, "vitals.can_nang": 64, "vitals.chieu_cao": 156}),
      (0, {"vitals.mach": 78, "vitals.ha_tam_thu": 138, "vitals.ha_tam_truong": 88, "vitals.nhiet_do": 36.6,
           "vitals.nhip_tho": 18, "vitals.spo2": 98, "vitals.can_nang": 63})],
     [("MED-TEST", "severe", "RASH", "Penicillin: phát ban toàn thân")]),
    ("Trần Văn", "Bình", "M", "1955-11-02", "001155000202",
     [(60, {"vitals.mach": 96, "vitals.ha_tam_thu": 132, "vitals.ha_tam_truong": 80, "vitals.nhiet_do": 37.9,
            "vitals.nhip_tho": 24, "vitals.spo2": 92, "vitals.can_nang": 58}),
      (14, {"vitals.mach": 88, "vitals.ha_tam_thu": 128, "vitals.ha_tam_truong": 78, "vitals.nhiet_do": 37.2,
            "vitals.nhip_tho": 20, "vitals.spo2": 94}),
      (0, {"vitals.mach": 84, "vitals.ha_tam_thu": 126, "vitals.ha_tam_truong": 76, "vitals.nhiet_do": 36.9,
           "vitals.nhip_tho": 19, "vitals.spo2": 95, "vitals.can_nang": 59, "vitals.chieu_cao": 165})],
     [("MED-TEST", "moderate", "RASH", "Aspirin: nổi mẩn"), ("FOOD-TEST", "mild", "ITCH", "Tôm: ngứa")]),
    ("Lê Minh", "Anh", "M", "2016-07-20", "001216000303",
     [(0, {"vitals.mach": 110, "vitals.nhiet_do": 38.6, "vitals.nhip_tho": 26, "vitals.spo2": 97,
           "vitals.can_nang": 27, "vitals.chieu_cao": 128})],
     []),
    ("Phạm Thu", "Trang", "F", "1992-05-09", "001192000404",
     [(0, {"vitals.mach": 72, "vitals.ha_tam_thu": 112, "vitals.ha_tam_truong": 70, "vitals.nhiet_do": 36.5,
           "vitals.spo2": 99, "vitals.can_nang": 52, "vitals.chieu_cao": 160})],
     [("FOOD-TEST", "mild", "ITCH", "Sữa bò: ngứa nhẹ")]),
]


def at(days_ago, hour=8):
    day = datetime.now(ICT) - timedelta(days=days_ago)
    stamp = day.replace(hour=hour, minute=0, second=0, microsecond=0)
    return min(stamp, datetime.now(ICT) - timedelta(minutes=5)).isoformat(timespec="seconds")


def pick(items, code):
    for item in items:
        if item.get("code") == code:
            return item
    raise ApiError(f"Không tìm thấy mã '{code}' trong danh mục dị ứng.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    env = dotenv(ROOT / ".env")
    probe = Client(args.base_url, env["EHR_ADMIN_USERNAME"], env["EHR_ADMIN_PASSWORD"])
    workspaces = probe.json(API + "/authorization/workspaces")
    rows = workspaces.get("results", workspaces) if isinstance(workspaces, dict) else workspaces
    ws = next(w for w in rows if w.get("role") == "admin")
    client = Client(args.base_url, env["EHR_ADMIN_USERNAME"], env["EHR_ADMIN_PASSWORD"], default_headers={
        "X-VinSHC-Workspace-Role": "admin", "X-VinSHC-Workspace-Facility": ws["facilityUuid"]})
    catalogue = json.loads((ROOT / "metadata/vinshc/catalogues/allergies.json").read_text(encoding="utf-8"))
    category_type = {"medication": "DRUG", "food": "FOOD", "environment": "ENVIRONMENT"}

    def post(path, payload, statuses=(200, 201)):
        status, _, body = client.request(API + path, method="POST", payload=payload)
        if status not in statuses:
            raise ApiError(f"POST {path}: HTTP {status} {body.decode('utf-8', 'replace')[:400]}")
        return json.loads(body)

    created = []
    for family, given, gender, birthdate, cccd, visits, allergies in PATIENTS:
        try:
            patient = post("/patients", {
                "idempotencyKey": "seed-demo-" + cccd, "familyName": family, "givenName": given,
                "gender": gender, "birthPrecision": "day", "birthdate": birthdate,
                "identifiers": [{"type": "cccd", "identifier": cccd}], "allowPossibleDuplicate": True})
        except ApiError as error:
            print(f"BỎ QUA {family} {given}: {error}")
            continue
        uuid_ = patient["uuid"]
        existing = client.json(f"{API}/visits?patient={uuid_}&status=all&limit=1").get("results") or []
        if existing:
            print(f"ĐÃ CÓ {family} {given}, bỏ qua")
            continue
        for i, (days_ago, values) in enumerate(visits):
            visit = post("/visits", {"patient": uuid_, "visitType": "outpatient" if i == 0 else "followup",
                                     "startDatetime": at(days_ago)})
            encounter = client.json("/openmrs/ws/rest/v1/encounter", method="POST", statuses=(200, 201), payload={
                "patient": uuid_, "visit": visit["uuid"], "encounterType": VITALS_ENCOUNTER,
                "location": ws["facilityUuid"], "encounterDatetime": at(days_ago, 9)})
            post("/vitals", {"patient": uuid_, "encounter": encounter["uuid"], "measuredAt": at(days_ago, 9),
                             "values": values, "states": {}})
            if days_ago > 0:
                post(f"/visits/{visit['uuid']}/close", {"closeReason": "completed", "stopDatetime": at(days_ago, 11)})
        recorded = 0
        for code, severity, reaction, note in allergies:
            record = pick(catalogue["records"], code)
            try:
                post("/allergy", {
                    "patient": uuid_, "allergenType": category_type[record["category"]],
                    "allergen": {"concept": record["conceptUuid"]},
                    "severity": pick(catalogue["severities"], severity)["conceptUuid"],
                    "reactions": [{"concept": pick(catalogue["reactions"], reaction)["conceptUuid"]}],
                    "comment": note + " (dữ liệu thử nghiệm)"})
                recorded += 1
            except ApiError as error:
                print(f"  CẢNH BÁO: không ghi được dị ứng ({note}): {error}")
        ident = next((i.get("identifier") for i in patient.get("identifiers", []) if str(i.get("identifier", "")).startswith("VSHC")), "")
        created.append(f"{family} {given} · {ident} · {len(visits)} lượt khám · {recorded} dị ứng")
        print("ĐÃ TẠO", created[-1])
    return 0 if created else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as error:
        print("LỖI:", error)
        sys.exit(1)
