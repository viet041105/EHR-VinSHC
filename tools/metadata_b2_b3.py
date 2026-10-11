"""Pure structural checks for the B2/B3 handoff; no database or network writes."""

from collections import Counter
import copy
from datetime import date, datetime
import hashlib
import json
import math
from pathlib import Path
import re
import uuid


def read_json(root, relative):
    path = (Path(root) / relative).resolve()
    if not path.is_relative_to(Path(root).resolve()):
        raise ValueError("Metadata path outside root")
    return json.loads(path.read_text(encoding="utf-8"))


def valid_uuid(value):
    try:
        return isinstance(value, str) and str(uuid.UUID(value)) == value
    except ValueError:
        return False


def valid_time(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})", value):
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False


def calendar_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Date must be YYYY-MM-DD")
    return date.fromisoformat(value)


def source_errors(source):
    errors = []
    if not isinstance(source, dict):
        return ["source must be an object"]
    kind = source.get("kind")
    if not isinstance(kind, str) or kind not in {"manual", "paper", "legacy_import", "migration", "api"}:
        errors.append("source kind invalid")
    if not valid_time(source.get("recordedAt")):
        errors.append("source recordedAt requires offset")
    if source.get("kind") == "paper" and (not valid_uuid(source.get("documentUuid")) or type(source.get("page")) is not int or source["page"] < 1):
        errors.append("paper source requires document UUID and positive page")
    if isinstance(kind, str) and kind in {"legacy_import", "migration"} and not source.get("sourceReference"):
        errors.append("legacy source requires reference")
    return errors


def normalize_phone(raw):
    """Preserve exact raw input; syntax only, never patient identity verification."""
    result = {"raw": raw, "normalized": None, "status": "needs_review"}
    if raw is None:
        result["status"] = "missing"
        return result
    if not isinstance(raw, str) or not 0 < len(raw) <= 64:
        return result
    digits = re.sub(r"[ .()\-]", "", raw)
    if digits.startswith("0084"):
        digits = "+84" + digits[4:]
    elif re.fullmatch(r"0[1-9][0-9]{8,9}", digits):
        digits = "+84" + digits[1:]
    pattern = r"\+84[1-9][0-9]{8,9}" if digits.startswith("+84") else r"\+[1-9][0-9]{7,14}"
    if re.fullmatch(pattern, digits):
        result.update(normalized=digits, status="normalized")
    return result


def validate_field_states(values, states, pack, context="patient", row_key=None):
    """Validate one row's field-code/value map against actual fieldStates entries.

    This is an adapter-neutral contract, not an OpenMRS REST payload. Partial
    values are PATCH-like: absent keys are not interpreted as cleared values.
    """
    if not isinstance(values, dict) or not isinstance(states, list):
        return ["values must be an object and fieldStates an array"]
    fields = {f["code"]: f for f in pack["fields"] if "b2Missing" in f}
    errors, matched = [], {}
    for state in states:
        if not isinstance(state, dict) or not isinstance(state.get("fieldCode"), str):
            errors.append("fieldState malformed")
            continue
        code = state["fieldCode"]
        policy = fields.get(code, {}).get("b2Missing")
        if not policy:
            errors.append(code + ": unknown B2 field")
            continue
        if code in matched:
            errors.append(code + ": duplicate fieldState")
        matched[code] = state
        if "rowKey" not in state or state.get("context") != context or state.get("rowKey") != row_key or context != policy["context"]:
            errors.append(code + ": fieldState context/rowKey mismatch")
        if policy["rowKeyRequired"] and not valid_uuid(row_key):
            errors.append(code + ": stable row UUID required")
        if not policy["rowKeyRequired"] and row_key is not None:
            errors.append(code + ": singleton rowKey must be null")
        reason = state.get("dataStatus")
        if policy["mode"] != "field_states" or not isinstance(reason, str) or reason not in policy["allowedStates"]:
            errors.append(code + ": missing status not allowed")
        errors.extend(code + ": " + e for e in source_errors(state.get("source")))
        if not valid_time(state.get("recordedAt")):
            errors.append(code + ": fieldState recordedAt invalid")
        if isinstance(reason, str) and reason in {"masked", "unreadable"} and isinstance(state.get("source"), dict) and state["source"].get("kind") not in ["paper", "legacy_import", "migration"]:
            errors.append(code + ": source-only state requires source evidence")
        if code not in values or values.get(code) is not None:
            errors.append(code + ": missing status requires explicit null value")
        if "value" in state:
            errors.append(code + ": fieldState must not carry value")
    for code, value in values.items():
        policy = fields.get(code, {}).get("b2Missing")
        if not policy or policy["context"] != context:
            errors.append(code + ": field does not belong to context")
            continue
        if value is None:
            if policy["mode"] == "forbidden":
                errors.append(code + ": null forbidden")
            elif policy["mode"] == "field_states" and code not in matched:
                errors.append(code + ": explicit missing reason required")
        elif code in matched:
            errors.append(code + ": value and missing status conflict")
    return errors


def validate_contacts(rows, pack, root):
    """Validate a submission containing contacts; ownership/privileges are BE checks."""
    if not isinstance(rows, list) or len(rows) > 100:
        return ["contacts must be an array of at most 100 rows per request"]
    contract = read_json(root, pack["contracts"]["b2"])["contacts"]
    relations = read_json(root, pack["catalogues"]["relationships"])
    allowed = {c["code"] for c in relations["items"] if not c["retired"] and c["effectiveTo"] is None}
    relation_rows = {c["code"]: c for c in relations["items"]}
    errors, keys, priorities, primary = [], set(), set(), 0
    for row in rows:
        if not isinstance(row, dict):
            errors.append("contact must be an object")
            continue
        if set(row) - set(contract["propertyToFieldCode"]) - {"fieldStates"}:
            errors.append("unknown contact property")
        key = row.get("rowKey")
        if not valid_uuid(key) or key in keys:
            errors.append("contact rowKey invalid/duplicate")
        if isinstance(key, str):
            keys.add(key)
        for prop in contract["requiredOnActive"]:
            if row.get(prop) is None:
                errors.append("contact requires " + prop)
        name = row.get("fullName")
        if not isinstance(name, str) or not 0 < len(name.strip()) <= 255:
            errors.append("contact fullName invalid")
        if not isinstance(row.get("status"), str) or row.get("status") not in {"active", "void"}:
            errors.append("contact status invalid")
        for prop in ["isPrimary", "emergencyContact"]:
            if type(row.get(prop)) is not bool:
                errors.append("contact " + prop + " must be boolean")
        priority = row.get("priority")
        if type(priority) is not int or not 1 <= priority <= 9999:
            errors.append("contact priority invalid")
        elif row.get("status") == "active":
            if priority in priorities:
                errors.append("duplicate active priority")
            priorities.add(priority)
        if row.get("status") == "active" and row.get("isPrimary") is True:
            primary += 1
        if row.get("status") == "void" and (not isinstance(row.get("voidReason"), str) or not row["voidReason"].strip()):
            errors.append("void requires reason")
        if row.get("status") == "active" and row.get("voidReason") is not None:
            errors.append("active contact cannot have void reason")
        relationship = row.get("relationshipCode")
        if relationship is not None and (not isinstance(relationship, str) or relationship not in allowed):
            errors.append("relationshipCode must use catalogue")
        if isinstance(relationship, str) and relationship in allowed:
            expected_relation = relation_rows[relationship]
            if row.get("relationshipVersion") != expected_relation["version"] or row.get("relationshipName") != expected_relation["nameVi"]:
                errors.append("relationship snapshot/version mismatch")
        elif relationship is None and (row.get("relationshipVersion") is not None or row.get("relationshipName") is not None):
            errors.append("missing relationship cannot have catalogue snapshot")
        for prop, limit in contract["fieldLimits"].items():
            value = row.get(prop)
            length = len(value.strip()) if isinstance(value, str) and prop == "fullName" else len(value) if isinstance(value, str) else 0
            if value is not None and (not isinstance(value, str) or not value.strip() or length > limit):
                errors.append("contact " + prop + " length/type invalid")
        if row.get("linkedPersonUuid") is not None and not valid_uuid(row["linkedPersonUuid"]):
            errors.append("linkedPersonUuid invalid")
        if not valid_time(row.get("recordedAt")):
            errors.append("contact recordedAt requires offset")
        errors.extend(source_errors(row.get("source")))
        phone = normalize_phone(row.get("phone"))
        if row.get("phoneNormalized") != phone["normalized"] or row.get("phoneNormalizationStatus") != phone["status"]:
            errors.append("contact phone normalization mismatch")
        if phone["status"] == "needs_review" and isinstance(row.get("source"), dict) and row["source"].get("kind") == "manual":
            errors.append("manual phone requires valid syntax")
        values = {code: row.get(prop) for prop, code in contract["propertyToFieldCode"].items()}
        errors.extend(validate_field_states(values, row.get("fieldStates", []), pack, "contact", key))
    if primary > 1:
        errors.append("at most one active primary contact")
    return errors


def validate_address_catalogue(catalogue):
    errors, codes, parents, counts = [], set(), set(), Counter()
    digest = hashlib.sha256(json.dumps(catalogue["records"], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if digest != catalogue.get("recordsSha256"):
        errors.append("Pinned address content checksum mismatch")
    for row in catalogue["records"]:
        code, level = row["code"], row["level"]
        if not isinstance(code, str) or not re.fullmatch(r"\d{2}" if level == "province" else r"\d{5}", code) or code in codes:
            errors.append("invalid/duplicate address code")
        codes.add(code)
        if level not in {"province", "commune"} or not row.get("name") or row.get("version") != catalogue["version"]:
            errors.append("address record type/name/version invalid")
        try:
            start = calendar_date(row["effectiveFrom"])
            if row["effectiveTo"] is not None and calendar_date(row["effectiveTo"]) <= start:
                errors.append("address effective interval invalid")
        except (ValueError, TypeError):
            errors.append("address dates invalid")
        if level == "province":
            parents.add(code)
            if row["parentCode"] is not None:
                errors.append("province parent must be null")
        else:
            counts[row["parentCode"]] += 1
        if not isinstance(row.get("legacyMappings"), list) or not isinstance(row.get("source"), dict):
            errors.append("address legacy/source required")
    if set(counts) != parents or len(parents) != 34 or sum(counts.values()) != 3321:
        errors.append("address province/commune counts or parents mismatch")
    if dict(counts) != catalogue["declaredCommuneCounts"]:
        errors.append("address counts differ from official provincial totals")
    return errors


def validate_address_selection(selection, catalogue):
    if not isinstance(selection, dict):
        return ["address selection must be an object"]
    by_code = {r["code"]: r for r in catalogue["records"]}
    try:
        as_of = calendar_date(selection["addressAsOfDate"])
    except (KeyError, ValueError, TypeError):
        return ["address date required"]
    errors = []
    if selection.get("catalogueVersion") != catalogue["version"]:
        errors.append("address catalogue version mismatch")
    for prop, level in [("provinceCode", "province"), ("communeCode", "commune")]:
        code = selection.get(prop)
        if code is None and level == "commune":
            continue
        row = by_code.get(code) if isinstance(code, str) else None
        if not row or row["level"] != level:
            errors.append(prop + ": unknown/wrong-level code")
            continue
        if as_of < calendar_date(row["effectiveFrom"]) or (row["effectiveTo"] and as_of >= calendar_date(row["effectiveTo"])):
            errors.append(prop + ": outside effective interval")
        if level == "commune" and row["parentCode"] != selection.get("provinceCode"):
            errors.append("commune belongs to another province")
    return errors


def validate_bp_measurement(measurement):
    """Return hard structural errors and a separate non-blocking comparison flag."""
    if not isinstance(measurement, dict):
        return ["BP measurement must be an object"], []
    errors, warnings, components = [], [], {}
    for name in ["patientUuid", "visitUuid", "encounterUuid", "groupUuid"]:
        if not valid_uuid(measurement.get(name)):
            errors.append("BP " + name + " required")
    if not valid_time(measurement.get("measuredAt")):
        errors.append("BP measuredAt requires offset")
    rows = measurement.get("components")
    if not isinstance(rows, list):
        return errors + ["BP components must be an array"], warnings
    codes = {"vitals.ha_tam_thu", "vitals.ha_tam_truong"}
    statuses = {"not_recorded", "not_asked", "unknown", "refused", "not_applicable", "masked", "unreadable"}
    for component in rows:
        if not isinstance(component, dict) or not isinstance(component.get("fieldCode"), str) or component["fieldCode"] not in codes:
            errors.append("BP component code invalid")
            continue
        code = component["fieldCode"]
        if code in components:
            errors.append("duplicate BP component")
        components[code] = component
        for prop in ["patientUuid", "visitUuid", "encounterUuid", "groupUuid", "measuredAt"]:
            if prop in component and component[prop] != measurement.get(prop):
                errors.append("BP component " + prop + " mismatch")
        state, value = component.get("state"), component.get("value")
        if state == "recorded":
            finite = False
            if type(value) in {int, float}:
                try:
                    finite = math.isfinite(value) and value > 0
                except OverflowError:
                    pass
            if not finite or component.get("unit") != "mm[Hg]":
                errors.append("BP positive finite number and mm[Hg] required")
        elif not isinstance(state, str) or state not in statuses or "value" in component:
            errors.append("BP missing state invalid/conflicts with value")
    if set(components) != codes:
        errors.append("Both BP components or their explicit missing states required")
    if not errors:
        sys = components["vitals.ha_tam_thu"]
        dia = components["vitals.ha_tam_truong"]
        if sys["state"] == dia["state"] == "recorded" and sys["value"] <= dia["value"]:
            warnings.append("BP comparison requires verification; original values retained")
    return errors, warnings


def prepare_update_pack(pack, recipe):
    digest = hashlib.sha256(json.dumps(pack, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if recipe["fromVersion"] != pack["version"] or recipe["basePackSha256"] != digest:
        raise ValueError("Update recipe does not match exact base pack")
    if recipe["toVersion"] != "0.2.1" or pack["version"] != "0.2.0":
        raise ValueError("Only the controlled 0.2.0 -> 0.2.1 test update is supported")
    updated = copy.deepcopy(pack)
    entity = next(e for e in updated["entities"] if e["key"] == recipe["entityKey"])
    if entity["uuid"] != recipe["entityUuid"] or entity["label"] != recipe["beforeLabel"]:
        raise ValueError("Update entity identity/base label mismatch")
    entity["label"] = recipe["afterLabel"]
    entity["note"] = recipe["afterNote"]
    updated["version"] = recipe["toVersion"]
    return updated


def check_contracts(pack, root):
    errors = []
    b2 = read_json(root, pack["contracts"]["b2"])
    b3 = read_json(root, pack["contracts"]["b3"])
    refs = {e["key"]: e for e in pack["entities"]}
    fields = {f["code"]: f for f in pack["fields"]}
    if b2["version"] != pack["version"] or b3["version"] != pack["version"]:
        errors.append("B2/B3 contract version mismatch")
    required_modes = {"forbidden", "null_only", "field_states"}
    missing = {c["code"] for c in pack["codeLists"]["data_status"]} - {"recorded"}
    for code, f in fields.items():
        if code.split(".")[0] not in {"patient", "contact"}:
            continue
        policy = f.get("b2Missing", {})
        if policy.get("mode") not in required_modes or policy.get("context") not in b2["fieldStates"]["contextValues"]:
            errors.append(code + ": B2 missing policy incomplete")
        if not set(policy.get("allowedStates", [])).issubset(missing) or policy.get("mode") != "field_states" and policy.get("allowedStates"):
            errors.append(code + ": B2 allowed states invalid")
    contact_fields = {c for c in fields if c.startswith("contact.")}
    if set(b2["contacts"]["propertyToFieldCode"].values()) != contact_fields:
        errors.append("Contact properties do not match dictionary")
    rel = read_json(root, pack["catalogues"]["relationships"])
    if {c["code"] for c in rel["items"]} != {c["code"] for c in pack["codeLists"]["contact_relationship"]}:
        errors.append("Relationship catalogue/codeList mismatch")
    for item in rel["items"]:
        if item["version"] != rel["version"] or not item.get("source") or not item.get("nameVi"):
            errors.append("Relationship provenance/version missing")
    for key in ["identifier.internal", "identifier.cccd", "identifier.bhxh", "identifier.bhyt"]:
        expected = "urn:uuid:" + refs[key]["uuid"]
        if pack["identifierSystems"][key]["system"] != expected or b2["identifierSystems"][key]["system"] != expected:
            errors.append("Stable identifier system mismatch: " + key)
    catalogue = read_json(root, pack["catalogues"]["address"])
    errors.extend(validate_address_catalogue(catalogue))
    mappings = b3["terminology"]["mappings"]
    expected_codes = {c for c, f in fields.items() if f.get("frontendKey")}
    if {m["fieldCode"] for m in mappings} != expected_codes or len(mappings) != 8:
        errors.append("8 vital terminology mappings required")
    for m in mappings:
        if m["openmrsUuid"] != refs[m["fieldCode"]]["uuid"] or m["unit"] != fields[m["fieldCode"]]["unit"]:
            errors.append("Vital identity/unit mismatch")
        if m["codingSystem"] != "http://loinc.org" or m["terminologyVersion"] != "2.83" or m["candidateMappingType"] not in {"SAME-AS", "NARROWER-THAN"}:
            errors.append("Vital terminology target/type invalid")
        if m.get("enabledForImport") and (m["approval"].get("status") != "approved" or not m["approval"].get("approvedBy") or not m["approval"].get("approvedAt") or not m["approval"].get("evidenceReference")):
            errors.append("Terminology enabled without clinical approval")
        if m.get("enabledForImport") and m["methodStatus"] not in {"confirmed_by_project_user", "confirmed_by_clinical_approver"}:
            errors.append("Terminology enabled without method confirmation")
    bp = b3["bloodPressure"]
    if bp["nativeGroupUuid"] != refs["group.vitals"]["uuid"] or bp["panel"]["code"] != "85354-9" or {c["code"] for c in bp["components"]} != {"8480-6", "8462-4"}:
        errors.append("BP panel/group mapping mismatch")
    providers = read_json(root, pack["catalogues"]["syntheticProviders"])
    if len(providers["records"]) != 2 or len({v["providerCode"] for v in providers["records"]}) != 2 or {v["roleCode"] for v in providers["records"]} != {"nurse", "doctor"}:
        errors.append("Two distinct synthetic provider codes required")
    for provider in providers["records"]:
        ref = "encounter_role.nurse" if provider["roleCode"] == "nurse" else "encounter_role.clinician"
        expected = str(uuid.uuid5(uuid.UUID(pack["namespaceUuid"]), "providers:synthetic." + provider["roleCode"]))
        if provider["providerUuid"] != expected or provider["encounterRoleUuid"] != refs[ref]["uuid"] or provider["locationUuid"] != refs["location.development.clinic"]["uuid"] or provider.get("synthetic") is not True:
            errors.append("Synthetic provider identity/role/location mismatch")
        try:
            start = calendar_date(provider["effectiveFrom"])
            if provider["effectiveTo"] is not None and calendar_date(provider["effectiveTo"]) <= start:
                errors.append("Provider effective interval invalid")
        except (ValueError, TypeError):
            errors.append("Provider effective dates invalid")
        if type(provider["active"]) is not bool:
            errors.append("Provider active must be boolean")
    recipe = read_json(root, "metadata/vinshc/fixtures/update-label.json")
    if recipe["entityUuid"] != refs.get(recipe["entityKey"], {}).get("uuid"):
        errors.append("Update fixture UUID/key mismatch")
    return errors


def contract_tables(pack, root):
    """Generated review tables; authoritative definitions remain JSON sources."""
    lines = ["# B2: trạng thái thiếu theo từng trường", "", "Sinh từ pack.json/b2Missing. `forbidden`: không được thiếu khi điều kiện bắt buộc áp dụng. `null_only`: null được phép, cấm fieldStates. `field_states`: null phải có lý do được phép.", "", "Mỗi fieldState có fieldCode, rowKey, context, dataStatus, source và recordedAt. rowKey=null chỉ cho patient singleton; các dòng contact/identifier/address dùng UUID ổn định. PATCH bỏ trường là giữ nguyên.", "", "| Trường | Chế độ | Trạng thái được phép | Context / rowKey | Bắt buộc |", "| --- | --- | --- | --- | --- |"]
    for f in pack["fields"]:
        if "b2Missing" not in f:
            continue
        policy = f["b2Missing"]
        lines.append("| `" + f["code"] + "` | " + policy["mode"] + " | " + ", ".join(policy["allowedStates"]) + " | " + policy["context"] + "/" + ("UUID" if policy["rowKeyRequired"] else "null") + " | " + f["required"] + " |")
    outputs = {"docs/data/B2_FIELD_STATES.md": "\n".join(lines) + "\n"}
    b3 = read_json(root, pack["contracts"]["b3"])
    terms = ["# B3: mapping thuật ngữ sinh hiệu", "", "Mapping dự kiến, chưa nạp SAME-AS. Mỗi dòng cần xác nhận phương pháp và người chuyên môn duyệt; `enabledForImport=false` trong contract.", "", "| Trường | OpenMRS UUID | LOINC dự kiến | Phiên bản / quan hệ dự kiến | UCUM | Phương pháp | Phê duyệt | Nguồn |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for m in b3["terminology"]["mappings"]:
        terms.append("| `" + m["fieldCode"] + "` | `" + m["openmrsUuid"] + "` | " + m["candidateCode"] + " | " + m["terminologyVersion"] + " / " + m["candidateMappingType"] + " | " + m["unit"] + " | " + m["methodStatus"] + ": " + m["measurementRequirement"] + " | " + m["approval"]["status"] + " | [LOINC](" + m["sources"][0] + ") |")
    terms += ["", "Coding system: `http://loinc.org`. Đây là release đích 2.83; cần lookup theo release trước khi nạp. SpO2 đã được người dùng xác nhận pulse oximetry ngày 11/10/2026, vẫn chờ người duyệt. FHIR R4 dùng oxygen saturation 2708-6 và có thể thêm 59408-5 khi xác nhận phương pháp.", "", "BP: xuất panel 85354-9 với hai component 8480-6 và 8462-4; component thiếu dùng dataAbsentReason, giữ source state nội bộ. Native group.vitals hiện tại được giữ, BE/B7 cần triển khai và kiểm thử projection.", "", "[Contract B3](../../metadata/vinshc/contracts/b3.json) · [FHIR R4 BP](https://hl7.org/fhir/R4/bp.html) · [FHIR R4 Vital Signs](https://hl7.org/fhir/R4/observation-vitalsigns.html)"]
    outputs["docs/data/B3_TERMINOLOGY.md"] = "\n".join(terms) + "\n"
    return outputs


def check_handoff_cases(pack, root):
    fixture = read_json(root, "metadata/vinshc/fixtures/b2-b3.json")
    catalogue = read_json(root, pack["catalogues"]["address"])
    errors, ids = [], set()
    for case in fixture["cases"]:
        if case["id"] in ids:
            errors.append("Duplicate B2/B3 fixture id")
        ids.add(case["id"])
        kind, value = case["kind"], case["input"]
        if kind == "contacts":
            valid = not validate_contacts(value, pack, root)
        elif kind == "field_states":
            valid = not validate_field_states(value["values"], value["states"], pack)
        elif kind == "phone":
            valid = normalize_phone(value) == case["expected"]
        elif kind == "address":
            valid = not validate_address_selection(value, catalogue)
        elif kind == "bp":
            failures, warnings = validate_bp_measurement(value)
            valid = not failures
            if bool(warnings) != case.get("warning", False):
                errors.append("Unexpected BP warning in " + case["id"])
        else:
            errors.append("Unknown B2/B3 fixture kind")
            continue
        if valid != case["valid"]:
            errors.append("Unexpected handoff fixture outcome: " + case["id"])
    return errors, len(ids)
