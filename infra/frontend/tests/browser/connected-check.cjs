const { chooseAction, mockSelectCare } = require("./reference-helper.cjs");
const { fillReference } = require("./reference-helper.cjs");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const patient = "11111111-1111-4111-8111-111111111111",
  encounter = "22222222-2222-4222-8222-222222222222";
const location = "feae71be-957c-4f94-b100-d84bc6915574",
  facility = "06ba3ea8-cbb2-5166-ad59-29cac41ec6ab";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
          viewport,
          timezoneId: "Asia/Ho_Chi_Minh",
        }),
        page = await context.newPage();
      const errors = [],
        writes = [];
      let role = "doctor",
        denyWorkspace = false,
        failReceipt = false;
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("requestfailed", (r) =>
        console.log("FAILED", r.url(), r.failure()),
      );
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          headers = request.headers();
        if (!headers.authorization?.startsWith("Basic "))
          throw new Error("Missing Basic header on " + url.pathname);

        const respond = (data, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        if (url.pathname.endsWith("/providers/me")) return respond({providers:[{uuid:patient}]});
        if (url.pathname.endsWith("/session"))
          return respond({
            authenticated: true,
            user: {
              uuid: patient,
              display: "Nhân viên kiểm thử",
              roles: [{ name: "VinSHC App: " + role }],
            },
          });
        if (url.pathname.endsWith("/authorization/workspaces"))
          return respond([
            {
              role,
              facilityUuid: location,
              facilityName: "VinSHC Development Clinic",
            },
          ]);
        assert.equal(headers["x-vinshc-workspace-role"], role);
        assert.equal(headers["x-vinshc-workspace-facility"], location);
        if (url.pathname.endsWith("/authorization/workspace"))
          return respond(
            denyWorkspace
              ? { error: "forbidden" }
              : { role, facilityUuid: location },
            denyWorkspace ? 403 : 200,
          );
        if (request.method() === "POST")
          writes.push({ url: url.pathname, body: request.postDataJSON() });
        if (url.pathname.endsWith("/clinical-summary"))
          return respond({
            patientUuid: patient,
            encounterUuid: encounter,
            consultation: {
              groupUuid: patient,
              values: {
                "visit.ly_do_kham": "Phiếu kiểm thử",
                "allergy.trang_thai": "unknown",
              },
            },
            status: "draft",
            diagnoses: [],
            drugOrders: [],
          });
        if (url.pathname.endsWith("/vitals"))
          return respond({
            uuid: patient,
            patient,
            encounter,
            needsVerification: true,
          });
        if (url.pathname.endsWith("/receipts"))
          return failReceipt
            ? respond({ error: "conflict" }, 409)
            : respond({ uuid: patient, amountVnd: 10000, status: "settled" });
        if (url.pathname.endsWith("/bills"))
          return respond({
            uuid: patient,
            totalVnd: 100000,
            status: "unpaid",
            lines: [],
          });
        if (url.pathname.includes("/reports/daily")) {
          assert.equal(url.searchParams.get("facility"), facility);
          return respond({
            date: "2026-10-12",
            grossVnd: 100000,
            refundVnd: 0,
            netVnd: 100000,
            aggregateOnly: true,
          });
        }
        if (url.pathname.endsWith("/address-catalogue"))
          return respond([{ code: "01", name: "Hà Nội" }]);
        if (url.pathname.endsWith("/configuration-status"))
          return respond({ catalogueVersion: "VN-19-2025-2025-07-01" });
        return respond({ uuid: patient, status: "draft" });
      });
      await page.goto(base + "/connected.html");
      let loggedIn = false;
      async function workspace(next) {
        if (loggedIn && role === next) return;
        if (loggedIn) {
          await page.locator("#logout").click();
          await page.locator("#loginForm").waitFor();
          loggedIn = false;
        }
        role = next;
        await page.locator("[name=username]").fill("qa-user");
        await page.locator("[name=password]").fill("qa-password");
        await page.locator("#loginForm button").click();
        if (denyWorkspace) {
          await page.getByText(/Tài khoản không có quyền/).waitFor();
        } else {
          await page.locator("[data-section=overview]").waitFor();
        }
        loggedIn = true;
      }
      await workspace("doctor");
      await page.locator("[data-section=clinical]").click();
      await chooseAction(page, "summary");
      await fillReference(page, "[name=encounter]", encounter);
      await page.locator("#actionForm button").click();
      await page.getByText("Phiếu kiểm thử", { exact: true }).waitFor();
      await chooseAction(page, "correction");
      assert.equal(
        await page.locator('[name="visit.ly_do_kham"]').inputValue(),
        "Phiếu kiểm thử",
      );
      await chooseAction(page, "diagnosis");
      assert.equal(
        await page.locator("[name=concept] option").count(),
        1 +
          JSON.parse(
            fs.readFileSync(
              path.join(
                __dirname,
                "../../packages/core/metadata/catalogues/icd10-mvp.json",
              ),
            ),
          ).records.filter((r) => r.selectable && r.active && !r.retired)
            .length,
      );
      assert.equal(await page.locator("[data-section=billing]").count(), 0);
      await workspace("nurse");
      await page.locator("[data-section=vitals]").click();
      assert.equal(await page.locator('#vitalsForm').count(), 0);
      await mockSelectCare(page,{patient,encounter,role:'nurse'});
      await fillReference(page, "[name=patient]", patient);
      await fillReference(page, "[name=encounter]", encounter);
      await page.locator("[name=systolic]").fill("70");
      await page.locator("[name=diastolic]").fill("80");
      await page.locator("#vitalsForm button").click();
      await page.getByText(/Cần đối chiếu huyết áp/).waitFor();
      assert.equal(writes.at(-1).body.values["vitals.ha_tam_thu"], 70);
      await workspace("cashier");
      await page.locator("[data-section=billing]").click();
      await chooseAction(page, "bill");
      await fillReference(page, "[name=patient]", patient);
      await fillReference(page, "[name=visit]", encounter);
      await page.locator("[name=service]").selectOption({ index: 1 });
      await page.locator("[name=quantity]").fill("1");
      await page.locator("[name=paymentTiming]").selectOption("postpay");
      await page.locator("#actionForm button").click();
      await page.getByText("100.000", { exact: true }).waitFor();
      assert.equal(writes.at(-1).body.facility, facility);
      assert.ok(writes.at(-1).body.idempotencyKey);
      assert.equal(writes.at(-1).body.lines[0].unitPriceVnd, undefined);
      await chooseAction(page, "receipt");
      await fillReference(page, "[name=record]", patient);
      await page.locator("[name=amountVnd]").fill("10000");
      await page.locator("[name=method]").selectOption("cash");
      failReceipt = true;
      await page.locator("#actionForm button").click();
      await page
        .locator("#connectionError")
        .filter({ hasText: /Dữ liệu đã thay đổi/ })
        .waitFor();
      assert.equal(
        await page.locator("[name=amountVnd]").inputValue(),
        "10000",
      );
      const key = writes.at(-1).body.idempotencyKey;
      failReceipt = false;
      await page.locator("#actionForm button").click();
      await page
        .locator("#backendResult")
        .getByText("Đã thanh toán", { exact: true })
        .waitFor();
      assert.equal(writes.at(-1).body.idempotencyKey, key);
      await workspace("manager");
      assert.equal(await page.locator("[data-section=identity]").count(), 0);
      await page.locator("[data-section=reports]").click();
      await chooseAction(page, "report");
      await page.locator("#actionForm button").click();
      await page.getByText("Thu ròng (VND)", { exact: true }).waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      assert.equal(overflow, false);
      await page.screenshot({
        path: path.join(
          require("node:os").tmpdir(),
          `vinshc-connected-${viewport.width}.png`,
        ),
        fullPage: true,
      });
      for (const next of ["reception", "lab", "pharmacy", "admin"]) {
        await workspace(next);
        const sections = await page
          .locator("[data-section]")
          .evaluateAll((els) => els.map((el) => el.dataset.section));
        for (const section of sections) {
          await page.locator("[data-section=" + section + "]").click();
          const advanced = page.locator("details.advanced-tools:not([open]) > summary");
          if (await advanced.count()) await advanced.click();
          if (await page.locator("[data-task-action]").count()) {
            const choices = await page
              .locator("[data-task-action]")
              .evaluateAll((els) => [...new Set(els.map((el) => el.dataset.taskAction))]);
            for (const value of choices) {
              await chooseAction(page, value);
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth > innerWidth,
                ),
                false,
              );
            }
          }
        }
      }
      await page.locator("#logout").click();
      await page.locator("#loginForm").waitFor();
      loggedIn = false;
      denyWorkspace = true;
      await workspace("admin");
      await page.getByText(/Tài khoản không có quyền/).waitFor();
      assert.equal(await page.locator("[data-section]").count(), 0);
      await page.locator("#logout").click();
      await page.locator("#loginForm").waitFor();
      assert.equal(await page.locator("[name=password]").inputValue(), "");
      const stored = await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      );
      assert.equal(stored.includes("qa-password"), false);
      assert.equal(stored.includes(patient), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: connected FE desktop/mobile, role scope, metadata, clinical read/correction, vitals, billing, retry idempotency, report, denied workspace, no credential/patient persistence. All API responses are mocked.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
