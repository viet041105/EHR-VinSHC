import test from "node:test";
import assert from "node:assert/strict";
import {
  BackendClient,
  BackendError,
  uuid,
  money,
  vitalsPayload,
  metadata,
  assignedRoles,
  permitted,
  facilityForLocation,
  VITAL_FIELD_MAP,
  clearLegacyDemo,
} from "@vinshc/core";
import { consultationValues } from "@vinshc/clinical";
import { contactPatch, missingContext } from "@vinshc/patients";
import { registry } from "../registry.mjs";
const { actions } = registry;
const policies = metadata.fieldPolicies;
const patient = "11111111-1111-4111-8111-111111111111",
  encounter = "22222222-2222-4222-8222-222222222222";
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
test("session and workspace use role/location headers, credentials stay private", async () => {
  const calls = [],
    client = new BackendClient(async (path, init) => {
      calls.push({ path, init });
      return response(
        path.includes("session")
          ? {
              authenticated: true,
              user: { uuid: patient, roles: [{ name: "VinSHC App: doctor" }] },
            }
          : { role: "doctor", facilityUuid: encounter },
      );
    });
  const session = await client.login("bác sĩ", "test");
  assert.deepEqual(assignedRoles(session.user), ["doctor"]);
  await client.selectWorkspace("doctor", encounter);
  await client.request("vinshc/clinical-configuration");
  assert.equal(calls[0].path, "/openmrs/ws/rest/v1/session?v=full");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[2].init.headers["X-VinSHC-Workspace-Role"], "doctor");
  assert.equal(calls[2].init.headers["X-VinSHC-Workspace-Facility"], encounter);
  assert.equal(JSON.stringify(client).includes("Basic"), false);
  client.clear();
  assert.equal(client.user, null);
  assert.equal(client.workspace, null);
});
test("errors fail without demo fallback and unsupported Core paths are blocked", async () => {
  for (const status of [400, 401, 403, 409, 503]) {
    const client = new BackendClient(async () =>
      response({ error: "rejected" }, status),
    );
    await assert.rejects(
      client.login("test", "test"),
      (e) => e instanceof BackendError && e.status === status,
    );
    assert.equal(client.user, null);
  }
  const client = new BackendClient(
    async () =>
      new Response("<html/>", { headers: { "content-type": "text/html" } }),
  );
  await assert.rejects(client.request("vinshc/configuration-status"), /JSON/);
  await assert.rejects(client.request("patient/" + patient));
});
test("responses from an old workspace are discarded", async () => {
  let resolve;
  const client = new BackendClient(() => new Promise((r) => (resolve = r)));
  const pending = client.request("vinshc/clinical-configuration");
  client.clear();
  resolve(response({ secret: "old workspace" }));
  await assert.rejects(pending, /Phiên đã thay đổi/);
});
test("vitals use official codes and explicit missing-state; reversed BP is sent for server verification", () => {
  const data = {
    measuredAt: "2026-10-12T09:00:00+07:00",
    systolic: "70",
    diastolic: "80",
    pulse: "72",
  };
  const payload = vitalsPayload(patient, encounter, data, VITAL_FIELD_MAP);
  assert.equal(payload.values["vitals.ha_tam_thu"], 70);
  assert.equal(payload.patient, patient);
  assert.equal(payload.measuredAt, "2026-10-12T02:00:00.000Z");
  assert.throws(
    () =>
      vitalsPayload(
        patient,
        encounter,
        { ...data, diastolic: "" },
        VITAL_FIELD_MAP,
      ),
    /thiếu một vế/,
  );
  const missing = vitalsPayload(
    patient,
    encounter,
    { ...data, diastolic: "", diastolicState: "unknown" },
    VITAL_FIELD_MAP,
  );
  assert.equal(missing.states["vitals.ha_tam_truong"], "unknown");
  assert.equal(missing.values["vitals.ha_tam_truong"], undefined);
  assert.equal(
    vitalsPayload(patient, encounter, { ...data, spo2: 0 }, VITAL_FIELD_MAP)
      .values["vitals.spo2"],
    0,
  );
  assert.throws(() =>
    vitalsPayload(patient, encounter, { ...data, spo2: 101 }, VITAL_FIELD_MAP),
  );
  assert.throws(() =>
    vitalsPayload(
      patient,
      encounter,
      { ...data, pulseState: "unknown" },
      VITAL_FIELD_MAP,
    ),
  );
});
test("facility identities, ICD selectability and scoped role matrix match metadata", () => {
  const f = metadata.facilities.records[0];
  assert.notEqual(f.uuid, f.locationUuid);
  assert.equal(facilityForLocation(f.locationUuid).uuid, f.uuid);
  const diagnoses = actions.diagnosis.fields.find(
    (f) => f.name === "concept",
  ).options;
  assert.equal(
    diagnoses.length,
    metadata.diagnoses.records.filter(
      (r) => r.selectable && r.active && !r.retired,
    ).length,
  );
  for (const row of metadata.diagnoses.records.filter((r) => !r.selectable))
    assert.equal(
      diagnoses.some(([v]) => v === row.conceptUuid),
      false,
    );
  assert.equal(permitted("nurse", "vitals", "create"), true);
  assert.equal(permitted("doctor", "vitals", "create"), false);
  assert.equal(permitted("admin", "clinical_chart", "read"), false);
  assert.equal(permitted("manager", "patient_identity", "read"), false);
});
test("history states and OrderFrequency identities match clinical contracts", () => {
  assert.throws(() =>
    consultationValues({ "history.tien_su_ban_than_trang_thai": "present" }),
  );
  assert.throws(() =>
    consultationValues({
      "history.tien_su_ban_than": "test",
      "history.tien_su_ban_than_trang_thai": "unknown",
    }),
  );
  const valid = consultationValues({
    "visit.ly_do_kham": "Test",
    "history.tien_su_ban_than_trang_thai": "unknown",
    "history.tien_su_ban_than": "",
  });
  assert.equal("history.tien_su_ban_than" in valid, false);
  assert.equal(
    actions.prescription.fields.find((f) => f.name === "frequency")
      .options[0][0],
    metadata.map.entities["frequency.qd"],
  );
});
test("money, result revisions, price snapshots and state payloads follow backend rules", () => {
  for (const value of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => money(value));
  assert.equal(money("100000"), 100000);
  assert.throws(() => uuid("BN-DEMO"));
  const bill = actions.bill.build({
    patient,
    visit: encounter,
    facility: "f",
    paymentTiming: "prepay",
    service: "s",
    quantity: "2",
    discountVnd: "0",
    idempotencyKey: "key",
  });
  assert.deepEqual(bill.lines, [{ service: "s", quantity: 2, discountVnd: 0 }]);
  assert.equal(bill.facility, "f");
  assert.equal("unitPriceVnd" in bill.lines[0], false);
  assert.throws(
    () =>
      actions.saveResult.build({
        state: "final",
        textValue: "Test",
        recordedAt: "2026-10-12T09:00:00+07:00",
      }),
    /người duyệt/,
  );
  assert.throws(
    () =>
      actions.saveResult.build({
        state: "draft",
        textValue: "Test",
        numericValue: 1,
        recordedAt: "2026-10-12T09:00:00+07:00",
      }),
    /đúng một/,
  );
  assert.throws(
    () => actions.orderTransition.build({ state: "cancelled" }),
    /lý do/,
  );
  assert.throws(
    () => actions.orderTransition.build({ state: "assigned" }),
    /phân công/,
  );
  assert.deepEqual(
    actions.queueTransition.build({ state: "called", exitReason: "other" }),
    { state: "called" },
  );
});

test("legacy demo cleanup removes only its own stores", () => {
  const values = new Map([
    ["vinshc-demo-v1", "old"],
    ["vinshc-demo-v2", "old"],
    ["other-project", "keep"],
  ]);
  clearLegacyDemo({ removeItem: (key) => values.delete(key) });
  assert.deepEqual([...values], [["other-project", "keep"]]);
  assert.doesNotThrow(() =>
    clearLegacyDemo({
      removeItem() {
        throw Error("denied");
      },
    }),
  );
});

test("Core account access requires system admin and cannot mutate passwords or arbitrary Core resources", async () => {
  const calls = [],
    client = new BackendClient(async (path, init) => {
      calls.push({ path, init });
      return response({ results: [] });
    });
  client.user = { roles: [{ name: "VinSHC App: admin" }] };
  await assert.rejects(
    client.request("user", { adminCore: true }),
    (e) => e.status === 403,
  );
  assert.equal(calls.length, 0);
  client.user = { roles: [{ name: "System Developer" }] };
  client.workspace = { role: "admin", facility: encounter };
  await client.request("user?q=admin", { adminCore: true });
  assert.equal(calls[0].init.headers["X-VinSHC-Workspace-Role"], undefined);
  await assert.rejects(client.request("patient", { adminCore: true }));
  await assert.rejects(
    client.request("user/" + patient, {
      method: "POST",
      body: { password: "unexpected" },
      adminCore: true,
    }),
  );
  await client.request("user/" + patient, {
    method: "POST",
    body: { roles: [encounter] },
    adminCore: true,
  });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { roles: [encounter] });
  await assert.rejects(
    client.request("user", {
      method: "POST",
      body: { roles: [] },
      adminCore: true,
    }),
  );
});
test("PATCH keeps omitted contact fields, explicit clearing is null, field-state validates context and 204 clears successfully", async () => {
  assert.deepEqual(
    contactPatch({ record: patient, phone: "0901234567", isPrimary: "false" }),
    { phone: "0901234567", isPrimary: false },
  );
  assert.deepEqual(contactPatch({ record: patient, clearPhone: "true" }), {
    phone: null,
  });
  assert.throws(() =>
    contactPatch({ record: patient, clearPhone: "true", phone: "123" }),
  );
  assert.throws(() => contactPatch({ record: patient }));
  const field = policies.fields.find((f) => f.rowKeyRequired),
    data = {
      patient,
      fieldCode: field.code,
      rowKey: encounter,
      dataStatus: field.allowedStates[0],
    };
  assert.equal(missingContext(data).context, field.context);
  assert.throws(() => missingContext({ ...data, rowKey: "" }));
  const payload = actions.fieldState.build(data);
  assert.equal(payload.context, field.context);
  assert.throws(() =>
    actions.fieldState.build({ ...data, dataStatus: "invalid" }),
  );
  assert.match(actions.clearFieldState.path(data), /context=/);
  assert.equal(actions.clearFieldState.method, "DELETE");
  const client = new BackendClient(
    async () => new Response(null, { status: 204 }),
  );
  assert.equal(
    await client.request("vinshc/" + actions.clearFieldState.path(data), {
      method: "DELETE",
    }),
    null,
  );
});
test("workspace assignment uses chosen location and does not confuse it with business facility UUID", () => {
  const facility = metadata.facilities.records[0],
    data = { user: patient, role: "nurse", facility: facility.locationUuid };
  assert.deepEqual(actions.assignWorkspace.build(data), data);
  assert.equal(actions.revokeWorkspace.method, "DELETE");
  assert.equal(actions.assignWorkspace.facility, undefined);
  assert.equal(
    actions.replaceDiagnosis.build({
      record: patient,
      concept: encounter,
      reason: "Correction",
    }).record,
    undefined,
  );
  assert.match(
    actions.identity.path({ patient, includeHistory: "true" }),
    /includeHistory=true/,
  );
});
