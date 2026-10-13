// Worklist and context UI contracts with isolated route mocks; no calls reach the clinical database.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const permissions = require("./metadata/permissions.json");
const map = require("./metadata/frontend-map.json");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const patient = "11111111-1111-4111-8111-111111111111",
  visit = "22222222-2222-4222-8222-222222222222";
const encounter = "33333333-3333-4333-8333-333333333333",
  bill = "44444444-4444-4444-8444-444444444444";
const payment = "55555555-5555-4555-8555-555555555555",
  other = "66666666-6666-4666-8666-666666666666";
const provider = "77777777-7777-4777-8777-777777777777",
  order = "88888888-8888-4888-8888-888888888888";
const location = map.entities["location.development.clinic"];
const person = {
  uuid: patient,
  patientUuid: patient,
  identifier: "VSHC-00000042",
  fullName: "Nguyễn Thị Bình",
  gender: "F",
  birthdate: "1990-01-01",
  birthdateEstimated: true,
  age: 36,
  projection: "administrative",
  openVisit: null,
};
const visitRow = {
  uuid: visit,
  visitUuid: visit,
  patientUuid: patient,
  patient: person,
  visitType: { key: "outpatient", name: "VinSHC Outpatient" },
  startDatetime: "2026-10-13T08:00:00+07:00",
  status: "open",
  encounters: [],
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
          viewport: { width, height: 960 },
          timezoneId: "Asia/Ho_Chi_Minh",
        }),
        page = await context.newPage();
      const requests = [],
        errors = [];
      let role = "reception";
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/openmrs/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          p = url.pathname,
          method = request.method();
        requests.push({
          path: p,
          method,
          query: url.search,
          body:
            method === "POST" && request.postData()
              ? request.postDataJSON()
              : null,
        });
        const send = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (p.endsWith("/session"))
          return send({
            authenticated: true,
            user: {
              uuid: other,
              display: "QA workspace",
              roles: Object.keys(permissions.roles).map((key) => ({
                name: "VinSHC App: " + key,
              })),
            },
          });
        assert.equal(request.headers()["x-vinshc-workspace-role"], role);
        assert.equal(
          request.headers()["x-vinshc-workspace-facility"],
          location,
        );
        if (p.endsWith("/authorization/workspace"))
          return send({ role, facilityUuid: location });
        if (p.endsWith("/providers/me"))
          return send({
            userUuid: other,
            providers:
              role === "reception" ? [] : [{ uuid: provider, name: "QA" }],
          });
        if (p.endsWith("/vinshc/patients") && method === "GET")
          return send({
            results: [person],
            limit: 25,
            offset: 0,
            hasMore: false,
          });
        if (p.endsWith("/vinshc/patients") && method === "POST")
          return send(
            {
              error: "possible duplicate patient in this facility",
              matches: [person],
            },
            409,
          );
        if (p.endsWith("/vinshc/visits") && method === "GET")
          return send({
            results: [visitRow],
            limit: 25,
            offset: 0,
            hasMore: false,
          });
        if (p.endsWith("/vinshc/visits") && method === "POST")
          return send(visitRow, 201);
        if (p.endsWith("/visits/" + visit + "/encounters"))
          return send(
            {
              uuid: encounter,
              encounterUuid: encounter,
              visitUuid: visit,
              patientUuid: patient,
              encounterType: { key: "vitals" },
              providers: [{ uuid: provider }],
              created: true,
            },
            201,
          );
        if (p.endsWith("/vinshc/vitals") && method === "GET")
          return send({ patientUuid: patient, results: [] });
        if (p.endsWith("/vinshc/vitals") && method === "POST")
          return send(
            {
              uuid: other,
              patient,
              encounter,
              needsVerification: false,
              members: [],
            },
            201,
          );
        if (p.endsWith("/operations/bills") && method === "GET")
          return send({
            results: [
              {
                uuid: bill,
                patientUuid: patient,
                visitUuid: visit,
                patientName: person.fullName,
                patientIdentifier: person.identifier,
                totalVnd: 150000,
                outstandingVnd: 150000,
                status: "unpaid",
                lines: [{ serviceName: "Khám" }],
                payments: [],
              },
            ],
            hasMore: false,
          });
        if (p.endsWith("/operations/payments") && method === "GET")
          return send({ results: [], hasMore: false });
        if (p.endsWith("/bills/" + bill + "/receipts"))
          return send(
            {
              uuid: payment,
              billUuid: bill,
              status: "settled",
              amountVnd: 150000,
            },
            201,
          );
        if (p.endsWith("/pharmacy/prescriptions"))
          return send({
            results: [
              {
                uuid: order,
                orderUuid: order,
                patientUuid: patient,
                visitUuid: visit,
                patientName: person.fullName,
                drugName: "Thuốc kiểm thử",
                drug: { strength: "10 mg" },
                dose: 1,
                doseUnits: "viên",
                route: "uống",
                frequency: "2 lần/ngày",
                quantity: 10,
                quantityUnits: "viên",
                remainingQuantity: 6,
                status: "active",
                dispenseStatus: "partial",
                visitCancelled: false,
              },
            ],
            hasMore: false,
          });
        if (p.endsWith("/pharmacy/dispenses"))
          return send(
            {
              uuid: other,
              quantity: 6,
              prescription: {
                uuid: order,
                patientUuid: patient,
                dispenseStatus: "complete",
              },
            },
            201,
          );
        if (p.includes("/identity/"))
          return send({
            patientUuid: p.split("/").at(-1),
            contacts: [],
            addresses: [],
            fieldStates: [],
          });
        throw new Error("Unexpected API call: " + method + " " + p);
      });
      await page.goto(base + "/connected.html", {
        waitUntil: "domcontentloaded",
      });
      await page.locator("[name=username]").fill("qa");
      await page.locator("[name=password]").fill("qa-only");
      await page.locator("#loginForm button").click();
      async function workspace(next) {
        role = next;
        await page.locator("[name=role]").selectOption(next);
        await page.locator("#workspaceForm button").click();
        await page.locator("[data-section=overview]").waitFor();
      }
      async function section(id) {
        await page.locator("[data-section=" + id + "]").click();
      }
      const lastPost = (suffix) =>
        requests
          .filter((r) => r.method === "POST" && r.path.endsWith(suffix))
          .at(-1);
      const row = (key) =>
        page.locator('[data-worklist-row="' + key + '"]').first();
      const noOverflow = async () =>
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );

      await workspace("reception");
      await page
        .getByRole("heading", { name: "Quy trình phòng khám" })
        .waitFor();
      assert.equal(await page.locator("[data-pending-form]").count(), 0);
      await section("patients");
      await row("patients").waitFor();
      assert.match(await row("patients").innerText(), /Nguyễn Thị Bình/);
      await page.locator("[name=wl_q]").fill("nguyen binh");
      await page.locator("form[data-worklist=patients] button").click();
      await page.waitForFunction(() => true);
      await row("patients").waitFor();
      assert.ok(
        requests.some(
          (r) =>
            r.path.endsWith("/vinshc/patients") &&
            r.query.includes("q=nguyen+binh"),
        ),
      );
      await row("patients")
        .getByRole("button", { name: "Mở lượt khám" })
        .click();
      await page.locator("#actionForm [name=visitType]").waitFor();
      assert.equal(
        await page.locator("#actionForm [name=patient]").inputValue(),
        patient,
      );
      assert.match(
        await page.locator(".context-panel summary").innerText(),
        /Nguyễn Thị Bình/,
      );
      await page
        .locator("#actionForm [name=visitType]")
        .selectOption("outpatient");
      await page.locator("#actionForm button").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "đã xác nhận" })
        .waitFor();
      assert.deepEqual(lastPost("/vinshc/visits").body, {
        patient,
        visitType: "outpatient",
      });
      await section("patients");
      await page.locator("#actionPicker").selectOption("registerPatient");
      await page.locator("#actionForm [name=familyName]").fill("Nguyễn");
      await page.locator("#actionForm [name=givenName]").fill("Bình");
      await page.locator("#actionForm [name=gender]").selectOption("F");
      await page
        .locator("#actionForm [name=birthPrecision]")
        .selectOption("year");
      await page.locator("#actionForm [name=birthYear]").fill("1990");
      await page.locator("#actionForm button").click();
      await page.locator("[data-match-index]").waitFor();
      const registration = lastPost("/vinshc/patients").body;
      assert.equal(registration.birthYear, 1990);
      assert.ok(registration.idempotencyKey);
      assert.equal(registration.allowPossibleDuplicate, undefined);
      assert.equal(
        await page.locator("#actionForm [name=familyName]").inputValue(),
        "Nguyễn",
      );
      await page.locator("[data-match-index]").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "Đã chọn bản ghi có sẵn" })
        .waitFor();
      await noOverflow();
      await page.evaluate(() => {
        document.activeElement.blur();
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page.screenshot({
        path: path.join(os.tmpdir(), `vinshc-workspace-patients-${width}.png`),
        fullPage: true,
      });

      await page.locator("#switchWorkspace").click();
      await workspace("nurse");
      await section("visits");
      await row("visits").waitFor();
      await row("visits")
        .getByRole("button", { name: "Ghi sinh hiệu" })
        .click();
      assert.equal(
        await page.locator("#actionForm [name=visit]").inputValue(),
        visit,
      );
      await page.locator("#actionForm button").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "đã xác nhận" })
        .waitFor();
      assert.deepEqual(lastPost("/encounters").body, {
        encounterType: "vitals",
      });
      assert.equal(
        await page.locator("#vitalsForm [name=encounter]").inputValue(),
        encounter,
      );
      assert.equal(
        await page.locator("#vitalsForm [name=patient]").inputValue(),
        patient,
      );
      await page.locator("#vitalsForm [name=pulse]").fill("82");
      await page.locator("#vitalsForm button").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "sinh hiệu" })
        .waitFor();
      assert.deepEqual(lastPost("/vinshc/vitals").body.values, {
        "vitals.mach": 82,
      });
      assert.ok(
        requests.some(
          (r) =>
            r.path.endsWith("/vinshc/vitals") &&
            r.method === "GET" &&
            r.query.includes(patient),
        ),
      );

      await page.locator("#switchWorkspace").click();
      await workspace("cashier");
      await section("billing");
      await row("bills").waitFor();
      await row("bills").getByRole("button", { name: "Thu tiền" }).click();
      assert.equal(
        await page.locator("#actionForm [name=record]").inputValue(),
        bill,
      );
      assert.equal(
        await page.locator("#actionForm [name=amountVnd]").inputValue(),
        "150000",
      );
      await page.locator("#actionForm [name=method]").selectOption("cash");
      await page.locator("#actionForm button").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "đã xác nhận" })
        .waitFor();
      assert.equal(lastPost("/receipts").body.amountVnd, 150000);
      await page.emulateMedia({ media: "print" });
      assert.equal(
        await page
          .locator(".worklist")
          .first()
          .evaluate((el) => getComputedStyle(el).display),
        "none",
      );
      await page.emulateMedia({ media: "screen" });
      await noOverflow();

      await page.locator("#switchWorkspace").click();
      await workspace("pharmacy");
      await section("pharmacy");
      await row("prescriptions").waitFor();
      await row("prescriptions")
        .getByRole("button", { name: "Cấp thuốc" })
        .click();
      assert.equal(
        await page.locator("#actionForm [name=record]").inputValue(),
        order,
      );
      assert.equal(
        await page.locator("#actionForm [name=quantity]").inputValue(),
        "6",
      );
      await page.locator("#actionForm [name=batchNumber]").fill("LOT-1");
      await page.locator("#actionForm button").click();
      await page
        .locator("#connectionMessage")
        .filter({ hasText: "đã xác nhận" })
        .waitFor();
      const dispense = lastPost("/pharmacy/dispenses").body;
      assert.equal(dispense.order, order);
      assert.equal(dispense.quantity, 6);
      assert.ok(dispense.idempotencyKey);
      await noOverflow();

      await page.locator("#switchWorkspace").click();
      await workspace("doctor");
      await section("clinical");
      await page.waitForFunction(() =>
        performance
          .getEntriesByType("resource")
          .some((e) => e.name.includes("/providers/me")),
      );
      await page.locator("#actionPicker").selectOption("prescription");
      await page.waitForFunction(
        (value) =>
          document.querySelector("#actionForm [name=orderer]")?.value === value,
        provider,
      );
      await page.locator("#switchWorkspace").click();
      await workspace("admin");
      assert.equal(await page.locator("[data-section=patients]").count(), 0);
      assert.equal(await page.locator("[data-section=visits]").count(), 0);
      await page.locator("#logout").click();
      await page.locator("#loginForm").waitFor();
      assert.equal(
        (
          await page.evaluate(() =>
            JSON.stringify({ ...localStorage, ...sessionStorage }),
          )
        ).includes(patient),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: live worklists (patients, visits, bills, prescriptions), row actions prefill context and forms, duplicate 409 matches, vitals encounter → vitals form, own provider prefill, print CSS, mobile overflow and no persistence. Mocked only; no DB writes.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
