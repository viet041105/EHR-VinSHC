"""Versioned B4-B9 contract checks; pure synthetic simulation, no database writes."""
import copy
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import hashlib
import io
import json
from pathlib import Path
import re
import uuid

from metadata_b2_b3 import calendar_date, read_json, valid_time, valid_uuid

ACTIONS = ("read", "create", "update", "void", "cancel", "print", "download")
ROLES = {"reception", "cashier", "nurse", "doctor", "lab", "pharmacy", "manager", "admin"}


def decimal_value(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9][0-9]*)(?:\.[0-9]+)?", value):
        raise ValueError("Exact nonnegative decimal string required")
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError("Invalid decimal") from error
    if not number.is_finite():
        raise ValueError("Finite decimal required")
    return number


def money(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def at_date(record, as_of):
    day = calendar_date(as_of)
    return (record["active"] and not record["retired"] and calendar_date(record["effectiveFrom"]) <= day
            and (record["effectiveTo"] is None or day < calendar_date(record["effectiveTo"])))


def load_bundle(pack, root):
    return {name: read_json(root, pack["catalogues"][name]) for name in
            ("icd10", "allergies", "medications", "medicationUnits", "facilities", "services", "prices", "diagnostics", "workflow")}


def validate_diagnoses(rows, catalogue, finalize=False):
    if not isinstance(rows, list):
        return ["diagnoses must be an array"]
    errors, ranks, primaries, keys = [], {}, {}, set()
    codes = {r["code"]: r for r in catalogue["records"]}
    for row in rows:
        if not isinstance(row, dict):
            errors.append("diagnosis must be object")
            continue
        key = row.get("uuid")
        if not valid_uuid(key) or key in keys:
            errors.append("diagnosis UUID invalid/duplicate")
        if isinstance(key, str):
            keys.add(key)
        for prop in ("patientUuid", "visitUuid", "encounterUuid"):
            if not valid_uuid(row.get(prop)):
                errors.append("diagnosis " + prop + " invalid")
        if not valid_time(row.get("recordedAt")):
            errors.append("diagnosis timestamp invalid")
        if row.get("certainty") not in ("provisional", "confirmed"):
            errors.append("diagnosis certainty invalid")
        if row.get("status") not in ("active", "void"):
            errors.append("diagnosis status invalid")
        if row.get("status") == "void" and not row.get("reason"):
            errors.append("void diagnosis requires reason")
        code, text = row.get("code"), row.get("nonCodedText")
        if bool(code) == bool(text) or (text is not None and (not isinstance(text, str) or not text.strip())):
            errors.append("exactly one coded diagnosis or non-coded text")
        if code:
            record = codes.get(code) if isinstance(code, str) else None
            try:
                valid = record and at_date(record, row["recordedAt"][:10]) and record["selectable"]
            except (ValueError, KeyError, TypeError):
                valid = False
            if not valid or row.get("catalogueVersion") != catalogue["version"]:
                errors.append("diagnosis code/version/effectivity outside allowlist")
            if record and row.get("rank") == 1 and record["restrictions"]["notPrimary"]:
                errors.append("code not allowed as primary")
        rank = row.get("rank")
        if type(rank) is not int or rank < 1:
            errors.append("diagnosis rank invalid")
        elif row.get("status") == "active":
            encounter = row.get("encounterUuid")
            identity = (row.get("patientUuid"), row.get("visitUuid"))
            if not isinstance(encounter, str):
                continue
            if encounter in ranks and ranks[encounter]["identity"] != identity:
                errors.append("same encounter cannot belong to different patient/visit")
            entry = ranks.setdefault(encounter, {"identity": identity, "ranks": set()})
            if rank in entry["ranks"]:
                errors.append("duplicate active diagnosis rank within encounter")
            entry["ranks"].add(rank)
            primaries[encounter] = primaries.get(encounter, 0) + (rank == 1)
    if any(n > 1 for n in primaries.values()) or finalize and (not ranks or any(primaries.get(e, 0) != 1 for e in ranks)):
        errors.append("clinical finalize requires exactly one primary per encounter")
    return errors


def validate_allergy(row, catalogue):
    if not isinstance(row, dict):
        return ["allergy must be object"]
    errors = []
    if not valid_uuid(row.get("uuid")) or not valid_uuid(row.get("patientUuid")):
        errors.append("allergy identity invalid")
    status = row.get("status")
    if status not in ("active", "inactive", "resolved", "entered-in-error"):
        errors.append("allergy status invalid")
    if status == "entered-in-error":
        if not row.get("reason") or row.get("clinicalStatus") is not None or row.get("verificationStatus") != "entered-in-error":
            errors.append("entered-in-error requires reason, verification and no clinicalStatus")
    elif row.get("clinicalStatus") != status or row.get("verificationStatus") not in ("unconfirmed", "confirmed", "refuted"):
        errors.append("allergy clinical/verification statuses mismatch")
    code, text = row.get("allergenCode"), row.get("allergenText")
    codes = {r["code"]: r for r in catalogue["records"]}
    if code is None:
        if not isinstance(text, str) or not text.strip() or row.get("category") not in ("medication", "food", "environment", "biologic", "other"):
            errors.append("uncoded allergen needs text/category")
    elif not isinstance(code, str) or code not in codes:
        errors.append("unknown allergen code")
    elif row.get("category") != codes[code]["category"] or code == "OTHER" and not text:
        errors.append("allergen category/OTHER text invalid")
    if row.get("severity") not in (None, "mild", "moderate", "severe"):
        errors.append("severity invalid")
    if row.get("severity") is None and row.get("severityMissing") not in ("unknown", "not_recorded", "not_asked"):
        errors.append("missing severity requires explicit state")
    if row.get("severity") is not None and row.get("severityMissing") is not None:
        errors.append("severity cannot have value and missing state together")
    if row.get("criticality") not in catalogue["criticalities"]:
        errors.append("criticality independent of severity is required")
    reactions = row.get("reactions")
    if not isinstance(reactions, list):
        return errors + ["reactions must be an array"]
    allowed = {r["code"] for r in catalogue["reactions"]}
    for reaction in reactions:
        if not isinstance(reaction, dict) or not isinstance(reaction.get("code"), str) or reaction["code"] not in allowed or reaction.get("code") == "OTHER" and not reaction.get("text"):
            errors.append("reaction code/text invalid")
    return errors


def reconcile_screening(screening, previous):
    if screening not in ("not_asked", "unknown", "no_known_allergy", "present"):
        raise ValueError("Unknown screening state")
    if screening == "present" and not previous:
        raise ValueError("present screening requires detailed or linked allergy entries")
    # Screening never mutates a patient-level allergy list.
    return copy.deepcopy(previous), screening == "no_known_allergy" and any(r["status"] == "active" for r in previous)


def validate_prescription(row, bundle):
    if not isinstance(row, dict) or not isinstance(row.get("lines"), list) or not row["lines"]:
        return ["prescription requires line array"]
    errors, keys = [], set()
    for prop in ("uuid", "patientUuid", "encounterUuid", "facilityUuid", "ordererUuid"):
        if not valid_uuid(row.get(prop)):
            errors.append("prescription " + prop + " invalid")
    if row.get("status") not in ("draft", "confirmed", "cancelled", "discontinued"):
        errors.append("prescription status invalid")
    if not valid_time(row.get("recordedAt")):
        errors.append("prescription timestamp required")
    meds = {r["code"]:r for r in bundle["medications"]["records"]}
    unit_lists = bundle["medicationUnits"]["catalogues"]
    for line in row["lines"]:
        if not isinstance(line, dict):
            errors.append("drug line malformed")
            continue
        key = line.get("rowKey")
        if not valid_uuid(key) or key in keys:
            errors.append("duplicate/invalid prescription row")
        if isinstance(key, str):
            keys.add(key)
        drug = meds.get(line.get("drugCode")) if isinstance(line.get("drugCode"), str) else None
        if not drug or drug["facilityUuid"] != row.get("facilityUuid") or not drug["active"] or drug["retired"]:
            errors.append("unavailable drug/facility")
            continue
        if line.get("catalogueVersion") != bundle["medications"]["version"]:
            errors.append("drug catalogue version mismatch")
        if valid_time(row.get("recordedAt")) and not at_date(drug, row["recordedAt"][:10]):
            errors.append("drug not effective at prescription time")
        try:
            dose, quantity, step = decimal_value(line["dose"]), decimal_value(line["quantity"]), decimal_value(drug["quantityStep"])
            if dose <= 0 or quantity <= 0 or quantity % step:
                errors.append("dose/quantity positive and quantity aligned to package step")
            if line.get("doseUnitCode") in ("TABLET", "CAPSULE") and dose % 1 and not drug["splitAllowed"]:
                errors.append("fractional solid dose unapproved")
        except (ValueError, KeyError, InvalidOperation):
            errors.append("exact dose/quantity decimal required")
        if line.get("doseUnitCode") not in drug["doseUnitCodes"] or line.get("quantityUnitCode") != drug["quantityUnitCode"] or line.get("routeCode") not in drug["routeCodes"]:
            errors.append("dose/quantity unit or route mismatch")
        if type(line.get("duration")) is not int or line["duration"] <= 0 or line.get("durationUnitCode") not in [r["code"] for r in unit_lists["duration"]]:
            errors.append("duration invalid")
        if line.get("frequencyCode") not in [r["code"] for r in unit_lists["frequencies"]]:
            errors.append("frequency invalid")
        if line.get("frequencyCode") == "PRN":
            try:
                if decimal_value(line["maxPerDay"]) <= 0:
                    errors.append("PRN maximum/day invalid")
            except (KeyError, ValueError):
                errors.append("PRN needs explicit maximum/day and quantity")
    return errors


def rounded_quantity(requested, step):
    number, quantum = decimal_value(requested), decimal_value(step)
    if number <= 0 or quantum <= 0:
        raise ValueError("Positive quantity and step required")
    return str((number / quantum).to_integral_value(rounding=ROUND_CEILING) * quantum)


def validate_transition(machine, before, after, contract, reason=None, new_revision=False):
    machines = {"prescription":contract["prescription"]["transitions"],
                "order":contract["orderResult"]["orderTransitions"], "result":contract["orderResult"]["resultTransitions"]}
    transitions = machines[machine]
    if not isinstance(before, str) or not isinstance(after, str) or after not in transitions.get(before, []):
        return ["invalid state transition"]
    if after in ("cancelled", "discontinued", "entered-in-error", "corrected") and not reason:
        return ["transition requires reason"]
    if machine == "result" and before in ("final", "corrected") and not new_revision:
        return ["final result requires a new immutable revision"]
    return []


def authorize(request, permissions):
    """Evaluate expected outcome on a server-verified context, never client claims."""
    actor, context = request.get("actor"), request.get("context")
    if not isinstance(actor, dict) or not actor.get("authenticated") or not actor.get("active"):
        return 401
    if not isinstance(context, dict):
        return 403
    role = actor.get("activeRole")
    if not valid_uuid(actor.get("uuid")) or not isinstance(role, str) or not isinstance(actor.get("roles"), list) or role not in actor["roles"] or role not in ROLES:
        return 403
    policy = next((r for r in permissions["matrix"] if r["role"] == role and r["resource"] == request.get("resource")), None)
    action = request.get("action")
    if action not in ACTIONS or not policy or not policy["actions"][action]:
        return 403
    cell = policy["actions"][action]
    if context.get("projection") != cell["projection"]:
        return 403
    for condition in cell["conditions"]:
        if condition == "same_facility":
            if not valid_uuid(context.get("facilityUuid")) or context["facilityUuid"] not in actor.get("facilityUuids", []):
                return 403
        elif condition == "assigned_patient" and context.get("patientAssigned") is not True:
            return 403
        elif condition == "assigned_encounter" and context.get("encounterAssigned") is not True:
            return 403
        elif condition == "assigned_order" and (not valid_uuid(context.get("orderAssigneeUuid")) or context["orderAssigneeUuid"] != actor["uuid"]):
            return 403
        elif condition == "cancellable_prescription" and context.get("prescriptionStatus") not in ("draft", "confirmed"):
            return 403
        elif condition == "result_reviewer" and context.get("authorizedResultReviewer") is not True:
            return 403
        elif condition == "confirmed_prescription" and context.get("prescriptionStatus") != "confirmed":
            return 403
        elif condition == "aggregate_only" and context.get("aggregateOnly") is not True:
            return 403
        elif condition == "mutable_record" and context.get("mutable") is not True:
            return 403
        elif condition == "open_visit" and context.get("visitStatus") != "open":
            return 403
        elif condition not in {"same_facility", "assigned_patient", "assigned_encounter", "assigned_order", "confirmed_prescription", "aggregate_only", "mutable_record", "open_visit", "cancellable_prescription", "result_reviewer"}:
            return 403
    return 200


class TestLedger:
    """Replay model only. Backend must use transactions, locks and unique keys."""
    def __init__(self):
        self.requests, self.dispensed, self.receipts, self.refunds, self.events = {}, {}, {}, {}, []
        self.prescribed = {}

    def apply(self, event):
        if not isinstance(event, dict) or not isinstance(event.get("idempotencyKey"), str) or not event["idempotencyKey"]:
            return 400
        if not valid_uuid(event.get("facilityUuid")):
            return 400
        scope = (event["facilityUuid"], event.get("kind"), event.get("targetUuid"), event["idempotencyKey"])
        fingerprint = digest(event)
        if scope in self.requests:
            return 200 if self.requests[scope] == fingerprint else 409
        kind = event.get("kind")
        if kind == "dispense":
            if event.get("prescriptionStatus") != "confirmed" or event.get("visitStatus") in ("cancelled", "left") or not valid_uuid(event.get("targetUuid")):
                return 400
            try:
                amount, total, step = (decimal_value(event[k]) for k in ("quantity", "prescribedQuantity", "quantityStep"))
            except (KeyError, ValueError):
                return 400
            target = (event["facilityUuid"], event["targetUuid"])
            if target in self.prescribed and self.prescribed[target] != (total, step):
                return 409
            previous = self.dispensed.get(target, Decimal(0))
            if amount <= 0 or step <= 0 or amount % step or previous + amount > total:
                return 400
            self.dispensed[target] = previous + amount
            self.prescribed[target] = (total, step)
        elif kind == "receipt":
            if not valid_uuid(event.get("targetUuid")) or not money(event.get("amountVnd")) or event["amountVnd"] <= 0 or event.get("status") != "settled" or event.get("method") not in ("cash", "bank_transfer") or not valid_time(event.get("settledAt")):
                return 400
            if event["targetUuid"] in self.receipts:
                return 409
            self.receipts[event["targetUuid"]] = copy.deepcopy(event)
        elif kind == "refund":
            receipt = self.receipts.get(event.get("originalReceiptUuid"))
            if not valid_uuid(event.get("targetUuid")) or not receipt or receipt["facilityUuid"] != event["facilityUuid"] or not money(event.get("amountVnd")) or event["amountVnd"] <= 0 or not event.get("reason") or not valid_time(event.get("settledAt")) or event.get("status") != "settled" or event.get("method") not in ("cash", "bank_transfer"):
                return 400
            if event["targetUuid"] in self.refunds:
                return 409
            previous = sum(r["amountVnd"] for r in self.refunds.values() if r["originalReceiptUuid"] == event["originalReceiptUuid"])
            if previous + event["amountVnd"] > receipt["amountVnd"]:
                return 400
            self.refunds[event["targetUuid"]] = copy.deepcopy(event)
        else:
            return 400
        self.requests[scope] = fingerprint
        self.events.append(copy.deepcopy(event))
        return 200


def bill_total(lines, facility_uuid, prices):
    if not isinstance(lines, list) or not lines:
        raise ValueError("Bill needs lines")
    records = {r["uuid"]:r for r in prices["records"]}
    total = 0
    for line in lines:
        if not isinstance(line, dict):
            raise ValueError("Bill line malformed")
        price = records.get(line.get("priceUuid"))
        if not price or price["facilityUuid"] != facility_uuid or not at_date(price, line["recordedAt"][:10]) or line.get("priceVersion") != price["version"]:
            raise ValueError("Price/facility/version/effectivity mismatch")
        amount, count, discount = line.get("unitPriceVnd"), line.get("quantity"), line.get("discountVnd")
        if not money(amount) or amount != price["amountVnd"] or type(count) is not int or count <= 0 or not money(discount):
            raise ValueError("Bill money/quantity/snapshot invalid")
        gross = amount * count
        if not money(gross) or discount > gross or line.get("netVnd") != gross - discount:
            raise ValueError("Bill discount/net mismatch")
        if line.get("serviceUuid") != price["serviceUuid"] or not line.get("serviceName"):
            raise ValueError("Bill service snapshot mismatch")
        total += gross - discount
        if not money(total):
            raise ValueError("Bill total outside exact integer range")
    return total


def daily_report(day, facility_uuid, receipts, refunds, visits):
    # Vietnam uses UTC+07:00 without DST; avoid platform tzdata dependency.
    start = datetime.combine(calendar_date(day), datetime.min.time(), timezone(timedelta(hours=7)))
    end = start + timedelta(days=1)
    def in_day(value):
        if not valid_time(value):
            return False
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return start <= timestamp < end
    settled = [r for r in receipts if r.get("facilityUuid") == facility_uuid and r.get("status") == "settled" and in_day(r.get("settledAt"))]
    returned = [r for r in refunds if r.get("facilityUuid") == facility_uuid and r.get("status") == "settled" and in_day(r.get("settledAt"))]
    for row in settled + returned:
        if not money(row.get("amountVnd")):
            raise ValueError("Report received invalid integer money")
    if len({r["targetUuid"] for r in settled}) != len(settled) or len({r["targetUuid"] for r in returned}) != len(returned):
        raise ValueError("Report requires deduplicated transaction ledger")
    gross, refund = sum(r["amountVnd"] for r in settled), sum(r["amountVnd"] for r in returned)
    same_facility = [v for v in visits if v.get("facilityUuid") == facility_uuid]
    return {"date":day,"facilityUuid":facility_uuid,"grossVnd":gross,"refundVnd":refund,"netVnd":gross-refund,
            "openedVisits":len({v["uuid"] for v in same_facility if in_day(v.get("startAt"))}),
            "completedVisits":len({v["uuid"] for v in same_facility if v.get("status") == "completed" and in_day(v.get("completedAt"))})}


def validate_workflow_event(value, workflow):
    if not isinstance(value, dict):
        return ["workflow event malformed"]
    kind = value.get("kind")
    if kind not in ("appointment", "queue"):
        return ["workflow kind invalid"]
    transitions = workflow[kind + "Transitions"]
    if value.get("after") not in transitions.get(value.get("before"), []):
        return ["invalid workflow transition"]
    if value.get("after") in ("cancelled", "left") and (value.get("reason") not in workflow["exitReasons"] or value.get("reason") == "other" and not value.get("reasonText")):
        return ["queue/appointment exit requires known reason"]
    if kind == "appointment":
        if not valid_time(value.get("startAt")) or not valid_time(value.get("endAt")):
            return ["appointment explicit start/end offsets required"]
        start, end = (datetime.fromisoformat(value[k].replace("Z", "+00:00")) for k in ("startAt", "endAt"))
        if end <= start:
            return ["appointment start must precede end"]
        if value.get("after") == "no_show" and (not valid_time(value.get("eventAt")) or datetime.fromisoformat(value["eventAt"].replace("Z", "+00:00")) < start):
            return ["no_show cannot be recorded before slot start"]
    return []


def validate_slots(rows):
    intervals = []
    for row in rows:
        if not all(valid_uuid(row.get(k)) for k in ("uuid", "facilityUuid", "providerUuid")) or not all(valid_time(row.get(k)) for k in ("startAt", "endAt")):
            return ["slot identity/timestamp invalid"]
        start, end = (datetime.fromisoformat(row[k].replace("Z", "+00:00")) for k in ("startAt", "endAt"))
        if end <= start:
            return ["slot interval invalid"]
        if row.get("status") in ("cancelled", "no_show"):
            continue
        for facility, provider, earlier_start, earlier_end in intervals:
            if facility == row["facilityUuid"] and provider == row["providerUuid"] and start < earlier_end and earlier_start < end:
                return ["provider has overlapping appointments"]
        intervals.append((row["facilityUuid"], row["providerUuid"], start, end))
    return []


def service_may_start(value):
    if value.get("paymentMode") not in ("prepay", "postpay") or value.get("visitStatus") != "open":
        return False
    if value.get("stage") in ("registration", "vitals"):
        return True
    return value.get("paymentMode") == "postpay" or value.get("billStatus") == "paid" and value.get("billMatchesService") is True


def validate_result(value, bundle):
    if not isinstance(value, dict) or not all(valid_uuid(value.get(k)) for k in ("uuid", "orderUuid", "patientUuid", "facilityUuid")) or value.get("orderPatientUuid") != value.get("patientUuid"):
        return ["result order/patient linkage invalid"]
    if value.get("status") not in ("draft", "preliminary", "final", "corrected", "entered-in-error"):
        return ["result status invalid"]
    records = {r["code"]:r for r in bundle["diagnostics"]["records"]}
    record = records.get(value.get("indicatorCode"))
    if not record or value.get("valueType") != record["valueType"] or value.get("unit") != record["unit"]:
        return ["result indicator/type/unit mismatch"]
    try:
        decimal_value(value["value"])
    except (ValueError, KeyError):
        return ["synthetic numeric result needs exact decimal value"]
    if value.get("referenceRange") is not None and record["referenceRange"] is None:
        return ["reference range has no approved source"]
    if value.get("method") is not None and record["method"] is None:
        return ["measurement method has no approved source"]
    if value.get("status") in ("final", "corrected") and (not valid_uuid(value.get("reviewerUuid")) or not valid_time(value.get("verifiedAt"))):
        return ["final result requires reviewer/time"]
    if value.get("status") == "corrected" and (not value.get("correctionReason") or not valid_uuid(value.get("previousRevisionUuid"))):
        return ["correction needs previous revision/reason"]
    if value.get("status") == "entered-in-error" and not value.get("reason"):
        return ["entered-in-error result requires reason"]
    if value.get("previousRevisionUuid") == value["uuid"]:
        return ["correction must create a new revision UUID"]
    return []


def validate_attachment(value, contract, production=False):
    proposal = contract["attachments"]["proposal"]
    if production and not contract["attachments"]["productionUploadEnabled"]:
        return ["attachment technical approval pending"]
    if not isinstance(value, dict) or value.get("mime") not in proposal["mimeTypes"] or value.get("sniffedMime") != value.get("mime"):
        return ["attachment MIME/sniff mismatch"]
    if type(value.get("size")) is not int or not 0 < value["size"] <= proposal["maxBytes"]:
        return ["attachment size invalid"]
    return []


def path_value(value, dotted):
    for segment in dotted.split("."):
        if not isinstance(value, dict) or segment not in value:
            raise ValueError("Missing " + dotted)
        value = value[segment]
    return value


def validate_print(value, printing):
    if not isinstance(value, dict):
        return ["print data malformed"]
    template = next((t for t in printing["templates"] if t["code"] == value.get("templateCode")), None)
    if not template or value.get("templateVersion") != template["version"] or value.get("status") not in template["allowedStatus"]:
        return ["print template/version/status mismatch"]
    errors = []
    for field in template["required"]:
        try:
            cell = path_value(value, field)
            if cell is None and field not in template["nullable"]:
                errors.append("print required field null: " + field)
        except ValueError as error:
            errors.append(str(error))
    if not valid_time(value.get("issuedAt")) or not value.get("documentNumber"):
        errors.append("document number/time invalid")
    if not isinstance(value.get("lines"), list) or not value["lines"]:
        return errors + ["print requires repeated lines"]
    for line in value["lines"]:
        if not isinstance(line, dict) or not set(template["requiredLineFields"]) <= set(line):
            errors.append("print required line field missing")
            continue
        if any(line[k] is None and k not in template.get("nullableLineFields", []) for k in template["requiredLineFields"]):
            errors.append("print nonnullable line field null")
        if template["code"] in ("receipt", "refund") and any(not money(line[k]) for k in line if k.endswith("Vnd")):
            errors.append("print money must be integer VND")
        if template["code"] == "prescription":
            try:
                if decimal_value(line["dose"]) <= 0 or decimal_value(line["quantity"]) <= 0 or not isinstance(line["ingredients"], list):
                    errors.append("print dose/quantity/ingredients invalid")
            except ValueError:
                errors.append("print exact dose/quantity required")
    if not isinstance(value.get("signatures"), list) or {s.get("role") for s in value["signatures"] if isinstance(s, dict)} != {s["role"] for s in template["signatures"]}:
        errors.append("print signature roles missing")
    else:
        if len(value["signatures"]) != len(template["signatures"]):
            errors.append("duplicate signature role")
        for signature in value["signatures"]:
            if not {"signerUuid", "signerName", "signedAt", "signatureReference"} <= set(signature) or not signature.get("signerName"):
                errors.append("signature identity fields missing")
            if signature.get("signerUuid") is not None and not valid_uuid(signature["signerUuid"]):
                errors.append("signature UUID invalid")
            if signature.get("signerUuid") is None and signature["role"] not in ("payer", "recipient"):
                errors.append("clinical/staff signer UUID required")
            if signature.get("signedAt") is not None and not valid_time(signature["signedAt"]):
                errors.append("signature timestamp invalid")
            if bool(signature.get("signedAt")) != bool(signature.get("signatureReference")):
                errors.append("signature time/reference must be present together")
    if value.get("synthetic") is not True:
        errors.append("test print must be marked synthetic")
    return errors


def csv_text(headers, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue()


def compile_test_outputs(pack, root):
    """CSV outside live config; provisioning always an explicit isolated test step."""
    bundle = load_bundle(pack, root)
    refs = {e["key"]:e for e in pack["entities"]}
    entities = [e for e in pack["entities"] if e.get("importPolicy") == "isolated_test_manifest_only"]
    prefix = "metadata/vinshc/initializer-test/"
    outputs = {}
    concepts = [e for e in entities if e["domain"] == "concepts"]
    headers = ["Uuid","Void/Retire","Fully specified name:en","Fully specified name:vi","Description:en","Data class","Data type","Units","Allow decimals"]
    outputs[prefix+"concepts/vinshc/040-test-catalogues.csv"] = csv_text(headers, [
        dict(zip(headers,[e["uuid"],"false","VinSHC "+e["key"],"VinSHC test "+e["label"]+" ("+e["key"]+")",
            "Test only; key="+e["key"]+"; v"+pack["version"],e["class"],e["dataType"],e.get("unit",""),"true" if e["dataType"]=="Numeric" else ""])) for e in concepts])
    privileges = [e for e in entities if e["domain"] == "privileges"]
    outputs[prefix+"privileges/vinshc/metadata.csv"] = csv_text(["Uuid","Privilege name","Description"], [
        {"Uuid":e["uuid"],"Privilege name":e["label"],"Description":"VinSHC scoped adapter only; "+e["key"]} for e in privileges])
    permissions = read_json(root, "metadata/vinshc/permissions.json")
    roles = []
    for code, role in permissions["roles"].items():
        names = sorted({p["privilegeName"] for r in permissions["matrix"] if r["role"] == code for p in r["actions"].values() if p})
        roles.append({"Uuid":role["openmrs"]["uuid"],"Role name":role["openmrs"]["name"],
                      "Description":"VinSHC scoped application role "+code,"Inherited roles":"","Privileges":";".join(names)})
    outputs[prefix+"roles/vinshc/metadata.csv"] = csv_text(list(roles[0]), roles)
    locations = [{"Uuid":r["uuid"],"Void/Retire":"false","Name":r["name"],"Description":"Synthetic test room","Parent":r["parentUuid"]} for r in bundle["facilities"]["locations"]]
    outputs[prefix+"locations/vinshc/test-rooms.csv"] = csv_text(list(locations[0]), locations)
    encounter_roles = [{"Uuid":e["uuid"],"Void/Retire":"false","Name":e["label"],"Description":"Test result reviewer"} for e in entities if e["domain"] == "encounterroles"]
    outputs[prefix+"encounterroles/vinshc/result-reviewer.csv"] = csv_text(list(encounter_roles[0]), encounter_roles)
    medunits = bundle["medicationUnits"]["catalogues"]
    dosage = {r["code"]:r["conceptUuid"] for r in medunits["dosageForms"]}
    drug_rows = [{"Uuid":r["uuid"],"Void/Retire":"false","Name":r["name"],"Description":"Test only; "+r["code"],
                 "Concept Drug":r["conceptUuid"],"Concept Dosage Form":dosage[r["dosageFormCode"]],
                 "Strength":r["strength"]["value"]+r["strength"]["unit"]} for r in bundle["medications"]["records"]]
    outputs[prefix+"drugs/vinshc/medications.csv"] = csv_text(list(drug_rows[0]), drug_rows)
    freq = [{"Uuid":r["uuid"],"Void/Retire":"false","Frequency per day":r["frequencyPerDay"],
             "Concept frequency":r["conceptUuid"]} for r in medunits["frequencies"] if r["frequencyPerDay"] is not None]
    outputs[prefix+"orderfrequencies/vinshc/frequencies.csv"] = csv_text(list(freq[0]), freq)
    manifest = {"version":pack["version"],"environment":"isolated_test_only","autoInstalled":False,
        "prerequisites":["Base managed Initializer entities imported first, including existing development location",
                         "Explicit test instance/volume; never copy test catalogue into production"],
        "initializerVersion":"2.12.0","csvFiles":sorted(outputs),
        "order":["privileges","encounterroles","roles","locations","concepts","drugs","orderfrequencies"],
        "entities":[{"key":e["key"],"uuid":e["uuid"],"domain":e["domain"]} for e in entities],
        "backendProvisioning":[{"domain":"providers","source":pack["catalogues"]["facilities"],"identity":"providerCode/providerUuid","method":"Core service/REST upsert by UUID; never create accounts from metadata"},
            {"domain":"provider-person-practitioner-binding","source":pack["catalogues"]["facilities"],"method":"Upsert synthetic Person by personUuid and bind Provider.person; provision Provider by providerUuid. FHIR2 4.2.0 exposes Provider.uuid as Practitioner.id; keep personUuid independent"},
            {"domain":"drug-ingredients","source":pack["catalogues"]["medications"],"method":"Drug CSV provisions drug/concept/form/display strength; separately upsert ingredient concept/strength/unit relations through verified Core service/API. No unverified mass-volume conversion"},
            {"domain":"drug-order-allowed-concept-sets","source":pack["catalogues"]["medicationUnits"],"method":"Verify Core dosing/dispensing/duration unit and route/frequency concept-set/global-property constraints on 2.8.8; merge required members idempotently without overwriting upstream members. Unit existence alone does not prove DrugOrder acceptance"},
            {"domain":"clinical-coding","source":pack["contracts"]["fhir"],"method":"Keep ICD/local coding system/version in adapter projection; ConceptMap/source provisioning requires reviewed terminology acceptance. Never auto-import pending LOINC mappings"},
            {"domain":"allergyLifecycle/diagnosisRevision/prescriptionSnapshot/billing/dispensing","source":pack["contracts"]["b4b9"],"method":"Adapter storage/migrations/API, not unsupported Initializer domain"},
            {"domain":"services/prices/specimens/panels","source":pack["catalogues"]["services"],"method":"Explicit adapter import keyed UUID; stable business code/version; immutable old snapshots"},
            {"domain":"appointments/queues","source":pack["catalogues"]["workflow"],"method":"Module-specific adapter schema/API to verify on pinned runtime"},
            {"domain":"PRN orderFrequency","source":pack["catalogues"]["medicationUnits"],"method":"Provision null-frequency PRN through tested Core service/REST; no invented per-day rate"}],
        "clinicalMappingsImported":False,"accountsOrCredentialsIncluded":False,
        "idempotency":"Upsert by UUID/stable name for role/privilege; never match mutable labels. Second import no extra rows; update version/label preserves UUID. Runtime proof required from BE"}
    manifest["fileSha256"]={p:hashlib.sha256(c.encode()).hexdigest() for p,c in outputs.items()}
    outputs["metadata/vinshc/import-manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2)+"\n"
    rows = []
    for row in permissions["matrix"]:
        for action, policy in row["actions"].items():
            rows.append({"role":row["role"],"resource":row["resource"],"action":action,"allowed":bool(policy),
                         "projection":policy["projection"] if policy else "",
                         "conditions":";".join(policy["conditions"]) if policy else "",
                         "privilege":policy["privilegeName"] if policy else ""})
    outputs["metadata/vinshc/permission-matrix.csv"] = csv_text(list(rows[0]), rows)
    return outputs


def simulate_catalogue_import(records, existing=None):
    database = copy.deepcopy(existing or {})
    codes = {r["code"]:k for k,r in database.items()}
    for row in records:
        if row["code"] in codes and codes[row["code"]] != row["uuid"]:
            raise ValueError("Stable code unexpectedly changed UUID")
        if row["uuid"] in database and database[row["uuid"]]["code"] != row["code"]:
            raise ValueError("UUID repurposed for another code")
        database[row["uuid"]] = copy.deepcopy(row)
        codes[row["code"]] = row["uuid"]
    return database


def check_b4_b9(pack, root):
    if "b4b9" not in pack.get("contracts", {}):
        return []
    errors = []
    bundle = load_bundle(pack, root)
    if pack["releasePolicy"]["productionEnabled"] is not False:
        errors.append("Unapproved production package enabled")
    contract = read_json(root, pack["contracts"]["b4b9"])
    states = {"prescription_status": contract["prescription"]["states"],
              "order_status": contract["orderResult"]["orderStates"],
              "result_status": contract["orderResult"]["resultStates"],
              "appointment_status": bundle["workflow"]["appointmentStates"],
              "diagnosis_certainty": contract["diagnosis"]["certaintyValues"]}
    if any({r["code"] for r in pack["codeLists"][key]} != set(expected) for key, expected in states.items()):
        errors.append("Dictionary enums diverge from B4-B9 contract")
    refs = {e["key"]:e for e in pack["entities"]}
    identities = {e["uuid"] for e in pack["entities"]}
    for entity in pack["entities"]:
        if entity.get("importPolicy") == "isolated_test_manifest_only" and entity["uuid"] != str(uuid.uuid5(uuid.UUID(pack["namespaceUuid"]),entity["domain"]+":"+entity["key"])):
            errors.append("Test entity UUID changed: "+entity["key"])
    for name in ("b4b9","fhir","printing"):
        if read_json(root, pack["contracts"][name])["version"] != pack["version"]:
            errors.append("Contract version mismatch "+name)
    for name, catalogue in bundle.items():
        if name == "workflow":
            continue
        if catalogue["version"] != pack["catalogueVersions"][name]:
            errors.append("Catalogue version mismatch "+name)
        if catalogue.get("productionEnabled") is not False:
            errors.append("Unapproved production catalogue enabled "+name)
        records = catalogue["records"]
        if len({r["uuid"] for r in records}) != len(records) or len({r["code"] for r in records}) != len(records):
            errors.append("Catalogue duplicate identity "+name)
        for row in records:
            if not valid_uuid(row["uuid"]) or not row.get("source") or not row.get("version"):
                errors.append("Catalogue identity/provenance missing "+name)
            if type(row["active"]) is not bool or type(row["retired"]) is not bool:
                errors.append("Catalogue active/retired invalid")
            start = calendar_date(row["effectiveFrom"])
            if row["effectiveTo"] is not None and calendar_date(row["effectiveTo"]) <= start:
                errors.append("Catalogue effective interval invalid")
            for key in ("conceptUuid","orderConceptUuid"):
                if row.get(key) and row[key] not in identities:
                    errors.append("Unknown catalogue concept reference "+name)
    for med in bundle["medications"]["records"]:
        if med["uuid"] not in identities or not med["ingredients"] or med["clinicalUseApproved"] is not False or decimal_value(med["quantityStep"]) <= 0:
            errors.append("Drug identity/ingredient/test gate invalid")
        units = bundle["medicationUnits"]["catalogues"]
        for group, codes in (("dose", med["doseUnitCodes"]), ("quantity", [med["quantityUnitCode"]]), ("routes", med["routeCodes"]), ("dosageForms", [med["dosageFormCode"]])):
            if not set(codes) <= {r["code"] for r in units[group]}:
                errors.append("Drug references unknown unit/route/form")
        if any(i["conceptUuid"] not in identities for i in med["ingredients"]):
            errors.append("Drug references unknown ingredient")
    for group, rows in bundle["medicationUnits"]["catalogues"].items():
        if len({r["code"] for r in rows}) != len(rows) or any(r["conceptUuid"] not in identities for r in rows):
            errors.append("Unit catalogue reference/duplicate " + group)
    service_ids = {r["uuid"] for r in bundle["services"]["records"]}
    facility_ids = {r["uuid"] for r in bundle["facilities"]["records"]}
    for price in bundle["prices"]["records"]:
        if price["serviceUuid"] not in service_ids or price["facilityUuid"] not in facility_ids or not money(price["amountVnd"]) or price["currency"] != "VND":
            errors.append("Price reference/integer/currency invalid")
    indicator_codes = {r["code"] for r in bundle["diagnostics"]["records"]}
    for panel in bundle["diagnostics"]["panels"]:
        if not set(panel["members"]) <= indicator_codes:
            errors.append("Panel references unknown indicator")
    for code in bundle["icd10"]["records"]:
        if not code["nameVi"] or not code["nameOriginal"] or code["system"] != "http://hl7.org/fhir/sid/icd-10" or code["terminologyVersion"] != "2019":
            errors.append("ICD labels/system/release missing")
        if (code["restrictions"]["moreSpecificRequired"] or code["restrictions"]["mortalityOnly"]) and code["selectable"]:
            errors.append("Restricted ICD category selectable")
    permissions = read_json(root,"metadata/vinshc/permissions.json")
    expected={(r,s) for r in ROLES for s in permissions["resources"]}
    matrix=permissions["matrix"]
    if {(r["role"],r["resource"]) for r in matrix} != expected or len(matrix)!=len(expected) or set(permissions["actions"])!=set(ACTIONS):
        errors.append("Permission matrix incomplete/duplicate")
    for row in matrix:
        if set(row["actions"]) != set(ACTIONS):
            errors.append("Permission row missing action")
        for action, policy in row["actions"].items():
            if policy:
                key="privilege."+row["resource"]+"."+action
                if policy["privilegeUuid"]!=refs[key]["uuid"] or policy["privilegeName"]!=refs[key]["label"] or "same_facility" not in policy["conditions"]:
                    errors.append("Privilege identity/scope mismatch")
                if row["role"] in {"cashier","manager","admin"} and row["resource"] in {"clinical_chart","vitals","diagnosis","allergy","prescription","diagnostic_order","diagnostic_result"}:
                    errors.append("Administrative role granted clinical access")
    if permissions["nativeAccess"]["broadCorePrivilegesGranted"] or permissions["appAdminReadsChart"]:
        errors.append("Broad Core/native access is not approved")
    for provider in bundle["facilities"]["providers"]:
        if not provider["synthetic"] or provider["licenceVerified"] or provider["encounterRoleUuid"] not in identities or provider["personUuid"] != provider["practitionerUuid"] or provider["uuid"] == provider["personUuid"]:
            errors.append("Provider provenance/licence/role invalid")
    if bundle["workflow"]["version"] != pack["catalogueVersions"]["workflow"] or {r["code"] for r in pack["codeLists"]["queue_exit_reason"]} != set(bundle["workflow"]["exitReasons"]):
        errors.append("Workflow version/exit-reason vocabulary mismatch")
    printing=read_json(root,pack["contracts"]["printing"])
    if {t["code"] for t in printing["templates"]}!={"prescription","receipt","refund","order","result","appointment"} or printing["dailyReports"]["timezone"]!="Asia/Ho_Chi_Minh":
        errors.append("Printing/reporting contract incomplete")
    fhir=read_json(root,pack["contracts"]["fhir"])
    expected={"Patient","Encounter","Observation","Condition","AllergyIntolerance","MedicationRequest","ServiceRequest","Location","Practitioner","PractitionerRole"}
    if {m["fhirResource"] for m in fhir["mappings"]}!=expected or len(fhir["mappings"])!=len(expected):
        errors.append("FHIR resource mapping incomplete")
    provider_ids={p["practitionerUuid"] for p in bundle["facilities"]["providers"]}|{p["practitionerRoleUuid"] for p in bundle["facilities"]["providers"]}
    for mapping in fhir["mappings"]:
        if mapping["openmrsSourceUuid"] not in identities|provider_ids or mapping["enabledForProduction"]:
            errors.append("FHIR source/gate invalid")
    if any(not x["url"].startswith("urn:uuid:") or x["version"]!=fhir["extensionVersion"] for x in fhir["extensions"]):
        errors.append("FHIR extension namespace/version invalid")
    return errors


def run_fixtures(pack, root):
    cases=read_json(root,"metadata/vinshc/fixtures/b4-b9.json")["cases"]
    bundle=load_bundle(pack,root)
    contract=read_json(root,pack["contracts"]["b4b9"])
    permissions=read_json(root,"metadata/vinshc/permissions.json")
    printing=read_json(root,pack["contracts"]["printing"])
    errors,ids=[],set()
    for case in cases:
        if case["id"] in ids:errors.append("Duplicate B4-B9 fixture id")
        ids.add(case["id"])
        kind,value=case["kind"],case["input"]
        if kind not in {"diagnosis", "allergy", "screening", "prescription", "transition", "permission", "ledger", "bill", "workflow", "slots", "service_gate", "result", "attachment", "print", "report"}:
            errors.append("Unknown B4-B9 fixture kind " + case["id"])
            continue
        try:
            if kind=="diagnosis":valid=not validate_diagnoses(value,bundle["icd10"],case.get("finalize",False))
            elif kind=="allergy":valid=not validate_allergy(value,bundle["allergies"])
            elif kind=="screening":
                after,conflict=reconcile_screening(value["screening"],value["previous"])
                valid=after==value["previous"] and conflict==case["conflict"]
            elif kind=="prescription":valid=not validate_prescription(value,bundle)
            elif kind=="transition":valid=not validate_transition(value["machine"],value["before"],value["after"],contract,value.get("reason"),value.get("newRevision",False))
            elif kind=="permission":valid=authorize(value,permissions)==case["expectedHttp"]
            elif kind=="ledger":
                ledger=TestLedger()
                statuses=[ledger.apply(event) for event in value]
                valid=statuses==case["expectedHttp"] and len(ledger.events)==case["expectedEvents"]
            elif kind=="bill":valid=bill_total(value["lines"],value["facilityUuid"],bundle["prices"])==case["expectedTotal"]
            elif kind=="workflow":valid=not validate_workflow_event(value,bundle["workflow"])
            elif kind=="slots":valid=not validate_slots(value)
            elif kind=="service_gate":valid=service_may_start(value)==case["expected"]
            elif kind=="result":valid=not validate_result(value,bundle)
            elif kind=="attachment":valid=not validate_attachment(value,contract,case.get("production",False))
            elif kind=="print":valid=not validate_print(value,printing)
            elif kind=="report":valid=daily_report(value["date"],value["facilityUuid"],value["receipts"],value["refunds"],value["visits"])==case["expected"]
            else:raise ValueError("Unknown fixture kind")
        except (ValueError,KeyError,TypeError,InvalidOperation):
            valid=False
        if valid!=case["valid"]:errors.append("Unexpected B4-B9 fixture outcome "+case["id"])
    return errors,len(ids)
