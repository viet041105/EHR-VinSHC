"""Build/check VinSHC metadata and verify its identities on a loopback OpenMRS.

Standard library only. This is a metadata tool, not a patient API adapter.
The default command is read-only. --write regenerates checked-in outputs.
"""

import argparse
import base64
import csv
from datetime import date, datetime
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[1]
PACK_PATH = ROOT / "metadata/vinshc/pack.json"
CONFIG = "infra/backend/configuration"


def load_pack(path=PACK_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def source_rows(root=ROOT):
    rows = {}
    for path in (root / "docs/data").glob("*.md"):
        if path.name == "MVP_METADATA_FIELDS.md":
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            cells = [s.strip() for s in line.split("|")[1:-1]]
            if len(cells) >= 6 and re.fullmatch(r"[A-Z]+[0-9]+", cells[0]):
                if cells[0] in rows:
                    raise ValueError("Duplicate sample row: " + cells[0])
                rows[cells[0]] = {"label": cells[1], "pages": cells[3],
                                  "file": path.relative_to(root).as_posix()}
    return rows


def validate_pack(pack, root=ROOT):
    errors = []
    entities = pack["entities"]
    refs = {e["key"]: e for e in entities}
    fields = pack["fields"]
    if len(refs) != len(entities):
        errors.append("Duplicate entity key")
    if len({e["uuid"] for e in entities}) != len(entities):
        errors.append("Duplicate entity UUID")
    if len({f["code"] for f in fields}) != len(fields):
        errors.append("Duplicate field code")
    ns = uuid.UUID(pack["namespaceUuid"])
    if ns != uuid.uuid5(uuid.NAMESPACE_URL, pack["namespaceSeed"]):
        errors.append("Namespace changed")
    sample = source_rows(root)
    for name, choices in pack["codeLists"].items():
        if len({c["code"] for c in choices}) != len(choices):
            errors.append("Duplicate choice: " + name)
        for c in choices:
            if c.get("conceptRef") and c["conceptRef"] not in refs:
                errors.append("Missing answer: " + c["conceptRef"])
    for e in entities:
        try:
            uuid.UUID(e["uuid"])
        except (ValueError, TypeError):
            errors.append("Invalid UUID: " + e["key"])
        if e.get("managed", True) and e["uuid"] != str(uuid.uuid5(ns, e["domain"] + ":" + e["key"])):
            errors.append("UUID changed: " + e["key"])
        if e.get("codeList") and e["codeList"] not in pack["codeLists"]:
            errors.append("Unknown code list: " + e["key"])
        for member in e.get("members", []):
            if member not in refs or refs[member]["domain"] != "concepts":
                errors.append("Missing group member: " + member)
    for f in fields:
        storage = f["storage"]
        if f["dataType"] not in {"text", "coded", "number", "integer", "boolean", "uuid", "date", "datetime", "object", "array"}:
            errors.append("Unknown data type: " + f["code"])
        if f["required"] not in pack["requiredConditions"]:
            errors.append("Unknown required condition: " + f["code"])
        if not re.fullmatch(r"[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*", f["code"]):
            errors.append("Invalid field code: " + f["code"])
        for rule in f["rules"]:
            if rule not in pack["rules"]:
                errors.append("Unknown rule: " + rule)
        for source in f["sourceRows"]:
            if source not in sample:
                errors.append("Unknown source row: " + source)
        if f.get("codeList") and f["codeList"] not in pack["codeLists"]:
            errors.append("Unknown field code list: " + f["code"])
        for ref in f.get("metadataRefs", []) + ([storage["ref"]] if storage.get("ref") else []):
            if ref not in refs:
                errors.append("Dangling metadata reference: " + ref)
        missing_ref = storage.get("missingState", {}).get("ref")
        if missing_ref and (missing_ref not in refs or storage["missingState"].get("uuid") != refs[missing_ref]["uuid"]):
            errors.append("Missing-state reference mismatch: " + f["code"])
        if storage.get("ref") in refs:
            e = refs[storage["ref"]]
            if storage.get("uuid") != e["uuid"]:
                errors.append("Field UUID mismatch: " + f["code"])
            if storage["kind"] == "obs":
                if e.get("unit") != f.get("unit"):
                    errors.append("Unit mismatch: " + f["code"])
                group = refs.get(storage.get("group"), {})
                if f["code"] not in group.get("members", []):
                    errors.append("Observation missing from group: " + f["code"])
                if f["dataType"] == "coded" and e.get("codeList") != f.get("codeList"):
                    errors.append("Answer list mismatch: " + f["code"])
    for name, op in pack["operations"].items():
        for code in op["required"]:
            if code not in {f["code"] for f in fields}:
                errors.append("Unknown operation field: " + name + ":" + code)
    form_file = root / "metadata/vinshc/forms.json"
    if form_file.exists():
        forms = json.loads(form_file.read_text(encoding="utf-8"))
        if forms["version"] != pack["version"]:
            errors.append("Form spec version mismatch")
        for form in forms["forms"]:
            for code in form["fields"]:
                if code not in {f["code"] for f in fields}:
                    errors.append("Unknown form field: " + code)
    permissions_file = root / "metadata/vinshc/permissions.json"
    if permissions_file.exists():
        permissions = json.loads(permissions_file.read_text(encoding="utf-8"))
        if permissions.get("default") != "deny" or len(permissions["roles"]) != 8:
            errors.append("Access contract must contain 8 roles with default deny")
        if permissions["version"] != pack["version"]:
            errors.append("Access contract version mismatch")
        for role in permissions["roles"].values():
            for group in role["grants"]:
                if group not in permissions["fieldGroups"]:
                    errors.append("Unknown access group: " + group)
    frontend = root / "infra/frontend/backend-mapping.js"
    if frontend.exists():
        by_code = {f["code"]: f for f in fields}
        for code, unit in re.findall(r"code:'(vitals\.[^']+)'.*?unit:'([^']+)'", frontend.read_text(encoding="utf-8")):
            if code not in by_code or by_code[code].get("unit") != unit:
                errors.append("Existing FE mapping incompatible: " + code)
    return errors


def csv_text(headers, rows):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({h: row.get(h, "") for h in headers})
    return out.getvalue()


def compile_outputs(pack, root=ROOT):
    refs = {e["key"]: e for e in pack["entities"]}
    sample = source_rows(root)
    outputs = {}
    domains = {}
    for e in pack["entities"]:
        if e.get("managed", True):
            domains.setdefault(e["domain"], []).append(e)
    for domain, entities in domains.items():
        if domain == "concepts":
            headers = ["Uuid", "Void/Retire", "Fully specified name:en", "Fully specified name:vi", "Short name:vi",
                       "Description:en", "Data class", "Data type", "Units", "Allow decimals", "Display precision", "Answers", "Members", "_version:1"]
            buckets = {"010-answers": [], "020-observations": [], "030-groups": []}
            for e in entities:
                row = {"Uuid": e["uuid"], "Void/Retire": "false", "Fully specified name:en": "VinSHC " + e["key"],
                       "Fully specified name:vi": "VinSHC " + (e.get("answerList", "") + " " if e.get("answerList") else "") + e["label"],
                       "Short name:vi": e["label"], "Description:en": "VinSHC metadata v" + pack["version"] + "; key=" + e["key"],
                       "Data class": e["class"], "Data type": e["dataType"], "Units": e.get("unit") or ""}
                if e["dataType"] == "Numeric":
                    row["Allow decimals"] = str(e.get("allowDecimals", True)).lower()
                    row["Display precision"] = "2" if e.get("allowDecimals", True) else "0"
                if e.get("codeList"):
                    row["Answers"] = ";".join(refs[c["conceptRef"]]["uuid"] for c in pack["codeLists"][e["codeList"]])
                if e.get("members"):
                    row["Members"] = ";".join(refs[k]["uuid"] for k in e["members"])
                bucket = "010-answers" if e.get("answerList") else "030-groups" if e.get("members") else "020-observations"
                buckets[bucket].append(row)
            for n, (name, rows) in enumerate(buckets.items(), 1):
                ordered = headers + ["_order:" + str(8000 + n * 100)]
                outputs[f"{CONFIG}/concepts/vinshc/{name}.csv"] = csv_text(ordered, rows)
            continue
        headers = ["Uuid", "Void/Retire", "Name", "Description"]
        if domain == "patientidentifiertypes":
            headers += ["Required", "Format", "Format description", "Location behavior", "Uniqueness behavior"]
        elif domain == "personattributetypes":
            headers += ["Format", "Searchable"]
        elif domain not in {"visittypes", "encountertypes", "encounterroles"}:
            raise ValueError("Unsupported generated domain: " + domain)
        headers += ["_order:8100"]
        rows = []
        for e in entities:
            row = {"Uuid": e["uuid"], "Void/Retire": "false", "Name": e["label"], "Description": e.get("note", "VinSHC key=" + e["key"])}
            if domain == "patientidentifiertypes":
                row.update({"Required": str(e["required"]).lower(), "Format": e["format"], "Format description": "See metadata/vinshc/pack.json",
                            "Location behavior": e["locationBehavior"], "Uniqueness behavior": e["uniquenessBehavior"]})
            elif domain == "personattributetypes":
                row.update({"Format": e["format"], "Searchable": str(e.get("searchable", False)).lower()})
            rows.append(row)
        outputs[f"{CONFIG}/{domain}/vinshc/metadata.csv"] = csv_text(headers, rows)
    field_rows = []
    lines = ["# Metadata chi tiết cho MVP ngoại trú", "", "File sinh từ [pack.json](../../metadata/vinshc/pack.json); sửa nguồn rồi chạy `python tools/metadata.py --write`.", "",
             "Nguồn S01 là nhãn/cấu trúc liên quan, không chứng minh field hệ thống tồn tại nguyên dạng trên PDF. `adapter_contract` là DTO bàn giao, chưa phải schema REST đã chạy.", "",
             "Đọc cùng [hướng dẫn metadata](../METADATA.md) để hiểu required, trạng thái thiếu, validation, quan hệ và các phụ thuộc danh mục.", ""]
    group = None
    for f in pack["fields"]:
        s = f["storage"]
        source = "; ".join(r + " (tr. " + sample[r]["pages"] + ")" for r in f["sourceRows"]) or "MVP / hệ thống bổ sung"
        row = {"field_code": f["code"], "label_vi": f["label"], "type": f["dataType"], "mvp": f["mvp"], "cardinality": f["cardinality"],
               "required_when": f["required"], "storage_kind": s["kind"], "storage_path": s["path"], "metadata_ref": s.get("ref", ""),
               "metadata_uuid": s.get("uuid", ""), "obs_group": s.get("group", ""), "unit_ucum": f.get("unit") or "",
               "missing_state_storage": s.get("missingState", {}).get("ref") or s.get("missingState", {}).get("kind", ""),
               "code_list": f.get("codeList") or "", "rules": ";".join(f["rules"]), "source_rows_pages": source, "note": f["description"]}
        field_rows.append(row)
        prefix = f["code"].split(".")[0]
        if prefix != group:
            group = prefix
            lines += ["## " + prefix, "", "| Mã / nhãn | Kiểu / đơn vị | Bắt buộc / số phần tử | Nơi lưu / UUID | Danh mục / kiểm tra | Nguồn liên quan |", "| --- | --- | --- | --- | --- | --- |"]
        storage = s["kind"] + ": " + s["path"]
        if s.get("uuid"):
            storage += "<br>`" + s["uuid"] + "`"
        vals = ["`" + f["code"] + "`<br>" + f["label"], f["dataType"] + (" / " + f["unit"] if f.get("unit") else ""), f["required"] + " / " + f["cardinality"],
                storage, (f.get("codeList") or "—") + "<br>" + ", ".join(f["rules"]), source]
        lines.append("| " + " | ".join(v.replace("|", "\\|") for v in vals) + " |")
        if f["description"]:
            lines.append("| Ghi chú | " + f["description"].replace("|", "\\|") + " | | | | |")
    outputs["metadata/vinshc/fields.csv"] = csv_text(list(field_rows[0]), field_rows)
    outputs["docs/data/MVP_METADATA_FIELDS.md"] = "\n".join(lines) + "\n"
    fe = {"version": pack["version"], "packSha256": hashlib.sha256(json.dumps(pack, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
          "concepts": {f["code"]: f["storage"]["uuid"] for f in pack["fields"] if f.get("frontendKey")},
          "entities": {e["key"]: e["uuid"] for e in pack["entities"]},
          "status": "Expected identities. Backend must verify imported metadata before exposing this map to FE."}
    outputs["metadata/vinshc/frontend-map.json"] = json.dumps(fe, ensure_ascii=False, indent=2) + "\n"
    return outputs


def validate_values(values, pack):
    """Structural validation of canonical test DTOs; does not authorize or query DB."""
    if not isinstance(values, dict):
        return ["Values must be a field-code map"]
    errors = []
    fields = {f["code"]: f for f in pack["fields"]}
    refs = {e["key"]: e for e in pack["entities"]}
    statuses = {c["code"] for c in pack["codeLists"]["data_status"]}
    for code, cell in values.items():
        if code not in fields:
            errors.append(code + ": unknown field")
            continue
        f = fields[code]
        if not isinstance(cell, dict) or not isinstance(cell.get("state"), str) or cell["state"] not in statuses:
            errors.append(code + ": missing/invalid state")
            continue
        if cell["state"] != "recorded":
            if "value" in cell:
                errors.append(code + ": missing state must not contain value")
            continue
        if "value" not in cell or cell["value"] is None:
            errors.append(code + ": recorded requires value")
            continue
        value, kind = cell["value"], f["dataType"]
        valid = True
        if kind in {"number", "integer"}:
            valid = False
            if type(value) in {int, float}:
                try:
                    valid = math.isfinite(value)
                except OverflowError:
                    pass
            if valid and kind == "integer":
                valid = type(value) is int
            if valid and "R_POS" in f["rules"]:
                valid = value > 0
            if valid and "R_PERCENT" in f["rules"]:
                valid = 0 <= value <= 100
            if valid and "R_MONEY" in f["rules"]:
                valid = 0 <= value <= 9007199254740991
        elif kind == "boolean":
            valid = type(value) is bool
        elif kind in {"text", "coded", "uuid", "date", "datetime"}:
            valid = isinstance(value, str) and 0 < len(value.strip()) <= 10000
            try:
                if valid and kind == "uuid":
                    uuid.UUID(value)
                elif valid and kind == "date":
                    valid = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))
                    if valid:
                        date.fromisoformat(value)
                elif valid and kind == "datetime":
                    valid = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", value))
                    if valid:
                        valid = datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
            except ValueError:
                valid = False
            if valid and f.get("codeList"):
                valid = value in {c["code"] for c in pack["codeLists"][f["codeList"]]}
            if valid and f.get("metadataRefs"):
                valid = value in {refs[k]["uuid"] for k in f["metadataRefs"]}
            if valid and f["storage"]["kind"] == "identifier":
                valid = re.fullmatch(refs[f["storage"]["ref"]]["format"], value) is not None
        elif kind == "object":
            valid = isinstance(value, dict) and bool(value)
        elif kind == "array":
            valid = isinstance(value, list)
        if not valid:
            errors.append(code + ": invalid " + kind + " value")
        if cell.get("unit") and cell["unit"] != f.get("unit"):
            errors.append(code + ": unit mismatch")
    def val(code):
        c = values.get(code, {})
        if not isinstance(c, dict):
            return None
        return c.get("value") if c.get("state") == "recorded" else None
    precision = val("patient.do_chinh_xac_ngay_sinh")
    if not isinstance(precision, str):
        precision = None
    if precision in {"year", "month"} and val("patient.ngay_sinh") is not None:
        errors.append("patient.ngay_sinh: cannot invent full date for partial birth date")
    if precision in {"year", "month"} and val("patient.nam_sinh") is None:
        errors.append("patient.nam_sinh: required for partial birth date")
    if val("patient.nam_sinh") is not None and (type(val("patient.nam_sinh")) is not int or not 1 <= val("patient.nam_sinh") <= 9999):
        errors.append("patient.nam_sinh: invalid calendar year")
    if precision == "month" and (type(val("patient.thang_sinh")) is not int or not 1 <= val("patient.thang_sinh") <= 12):
        errors.append("patient.thang_sinh: missing/invalid birth month")
    if precision == "day" and val("patient.ngay_sinh") is None:
        errors.append("patient.ngay_sinh: required for day precision")
    for status_code, text_code in [("history.tien_su_ban_than_trang_thai", "history.tien_su_ban_than"), ("history.tien_su_gia_dinh_trang_thai", "history.tien_su_gia_dinh")]:
        if val(status_code) == "present" and val(text_code) is None:
            errors.append(text_code + ": present history requires text")
    if val("allergy.trang_thai") == "present" and val("allergy.tac_nhan") is None:
        errors.append("allergy.tac_nhan: present allergy requires allergen")
    return errors


def validate_operation(operation, values, pack):
    errors = validate_values(values, pack)
    if errors:
        return errors
    if operation not in pack["operations"]:
        return errors + ["Unknown operation: " + operation]
    for code in pack["operations"][operation]["required"]:
        cell = values.get(code, {})
        if not isinstance(cell, dict):
            cell = {}
        if cell.get("state") != "recorded" or cell.get("value") is None:
            errors.append(code + ": required for " + operation)
    if operation == "vitals.save" and not any(code.startswith("vitals.") and code != "vitals.thoi_diem_do" for code in values):
        errors.append("At least one vital assessment is required")
    if operation == "visit.close":
        reason = values.get("visit.ly_do_ket_thuc", {}).get("value")
        if reason and reason != "completed" and not values.get("visit.ghi_chu_ket_thuc", {}).get("value"):
            errors.append("Close reason requires explanatory note")
    return errors


def verify_remote(pack, base_url, settings_file):
    parsed = urlparse(base_url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Verification URL must be an HTTP loopback URL without credentials/query")
    settings = {}
    for line in Path(settings_file).read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            settings[k.strip()] = v.strip().strip('"\'')
    auth = base64.b64encode((settings["EHR_ADMIN_USERNAME"] + ":" + settings["EHR_ADMIN_PASSWORD"]).encode()).decode()
    endpoints = {"concepts": "concept", "visittypes": "visittype", "encountertypes": "encountertype", "encounterroles": "encounterrole", "personattributetypes": "personattributetype", "patientidentifiertypes": "patientidentifiertype", "locations": "location"}
    refs = {e["key"]: e for e in pack["entities"]}
    checked = []
    for e in pack["entities"]:
        if e["domain"] not in endpoints:
            continue
        url = base_url.rstrip("/") + "/ws/rest/v1/" + endpoints[e["domain"]] + "/" + e["uuid"] + "?v=full"
        request = Request(url, headers={"Authorization": "Basic " + auth, "Accept": "application/json"})
        # Do not follow redirects: credentials must remain on the explicit local instance.
        from urllib.request import HTTPRedirectHandler, build_opener
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        with build_opener(NoRedirect).open(request, timeout=12) as response:
            data = json.load(response)
        if data.get("uuid") != e["uuid"] or data.get("retired"):
            raise ValueError("Missing/retired metadata: " + e["key"])
        if e["domain"] == "concepts":
            if data.get("datatype", {}).get("display") != e["dataType"]:
                raise ValueError("Wrong concept datatype: " + e["key"])
            if e["dataType"] == "Numeric" and data.get("units") != e.get("unit"):
                raise ValueError("Wrong numeric units: " + e["key"])
            if e.get("codeList"):
                actual = {a.get("answerConcept", a).get("uuid") for a in data.get("answers", [])}
                expected = {refs[c["conceptRef"]]["uuid"] for c in pack["codeLists"][e["codeList"]]}
                if actual != expected:
                    raise ValueError("Wrong concept answers: " + e["key"])
            if e.get("members"):
                actual = {m.get("uuid") for m in data.get("setMembers", [])}
                if actual != {refs[k]["uuid"] for k in e["members"]}:
                    raise ValueError("Wrong group members: " + e["key"])
        checked.append(e["key"])
    return {"version": pack["version"], "checked": len(checked), "identities": checked, "scope": "read-only imported metadata; no clinical workflow/security certification"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--verify-url")
    parser.add_argument("--settings-file", default=str(ROOT / ".env"))
    parser.add_argument("--report")
    args = parser.parse_args()
    pack = load_pack()
    errors = validate_pack(pack)
    if errors:
        raise ValueError("\n".join(errors))
    outputs = compile_outputs(pack)
    for relative, content in outputs.items():
        path = ROOT / relative
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="")
        elif not path.is_file() or path.read_text(encoding="utf-8") != content:
            raise ValueError("Generated output stale/missing: " + relative + "; run --write")
    fixture_path = ROOT / "metadata/vinshc/fixtures/cases.json"
    cases = json.loads(fixture_path.read_text(encoding="utf-8"))["cases"]
    for case in cases:
        actual = validate_values(case["values"], pack)
        if bool(actual) == case["valid"]:
            raise ValueError("Unexpected fixture validation: " + case["id"])
    result = {"version": pack["version"], "fields": len(pack["fields"]), "entities": len(pack["entities"]), "outputs": len(outputs), "fixtures": len(cases), "status": "PASS (structural)"}
    if args.verify_url:
        result["runtime"] = verify_remote(pack, args.verify_url, args.settings_file)
    if args.report:
        path = Path(args.report)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, HTTPError, URLError) as error:
        print("Metadata check failed: " + str(error), file=sys.stderr)
        sys.exit(1)
