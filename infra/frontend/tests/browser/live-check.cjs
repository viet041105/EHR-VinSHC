// Read-only runtime checks. This script never creates users, patients or transactions.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const settings = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "../../../../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
(async () => {
  const authorization =
    "Basic " +
    Buffer.from(
      settings.EHR_ADMIN_USERNAME + ":" + settings.EHR_ADMIN_PASSWORD,
    ).toString("base64");
  async function get(endpoint) {
    const response = await fetch(base + "/openmrs/ws/rest/v1/" + endpoint, {
      headers: { Accept: "application/json", Authorization: authorization },
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, endpoint + " HTTP " + response.status);
    assert.match(response.headers.get("content-type"), /json/);
    return response.json();
  }
  const session = await get("session?v=full");
  assert.equal(session.authenticated, true);
  assert.ok(session.user.uuid);
  const configuration = await get("vinshc/operations/configuration");
  assert.equal(configuration.currency, "VND");
  assert.equal(configuration.timezone, "Asia/Ho_Chi_Minh");
  assert.equal(configuration.workflowConfigs.length, 2);
  const clinical = await get("vinshc/clinical-configuration");
  assert.equal(clinical.diagnosis.ready, true);
  const identity = await get("vinshc/configuration-status");
  assert.ok(identity.catalogueVersion);
  const provinces = await get("vinshc/address-catalogue");
  assert.equal(provinces.length, 34);
  const forbidden = await fetch(
    base +
      "/@fs/" +
      path.resolve(__dirname, "../../../../.env").split(path.sep).join("/"),
  );
  // Dev denies the file (403); a built dist/ has no such route and answers with the HTML fallback.
  // Either way the runtime secret must never be in the response.
  assert.ok(
    forbidden.status === 403 ||
      forbidden.headers.get("content-type")?.includes("text/html"),
    "runtime .env must not be served",
  );
  assert.equal(
    (await forbidden.text()).includes(settings.EHR_ADMIN_PASSWORD),
    false,
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
        timezoneId: "Asia/Ho_Chi_Minh",
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.evaluate(() => {
      localStorage.setItem("vinshc-demo-v1", "legacy");
      localStorage.setItem("vinshc-demo-v2", "legacy");
      localStorage.setItem("vinshc-unrelated", "keep");
    });
    await page.reload();
    const stores = await page.evaluate(() => ({
      old: localStorage.getItem("vinshc-demo-v2"),
      other: localStorage.getItem("vinshc-unrelated"),
    }));
    assert.equal(stores.old, null);
    assert.equal(stores.other, "keep");
    assert.equal(
      await page.getByText("Dùng bản demo", { exact: true }).count(),
      0,
    );
    await page.getByRole("link", { name: /Đăng nhập phòng khám/ }).click();
    await page.locator("#loginForm").waitFor();
    await page.locator("[name=username]").fill(settings.EHR_ADMIN_USERNAME);
    await page.locator("[name=password]").fill(settings.EHR_ADMIN_PASSWORD);
    await page.locator("#loginForm button").click();
    await page.locator("#systemSetup").waitFor();
    await page.locator("#systemSetup").click();
    await page.locator("#setupResult").filter({ hasText: "VND" }).waitFor();
    await page.locator("[name=role]").selectOption("admin");
    await page.locator("#workspaceForm button").click();
    await page.locator("[data-section=admin]").click();
    await page.locator("#actionPicker").selectOption("workspace");
    await page.locator("#actionForm button").click();
    await page
      .locator("#backendResult")
      .filter({ hasText: "VinSHC App: admin" })
      .waitFor();
    await page.locator("#actionPicker").selectOption("systemUsers");
    await page.locator("[name=query]").fill(settings.EHR_ADMIN_USERNAME);
    await page.locator("#actionForm button").click();
    await page
      .locator("#backendResult")
      .filter({ hasText: "System Developer" })
      .waitFor();
    await page.locator("#actionPicker").selectOption("audit");
    await page.locator("#actionForm button").click();
    await page
      .locator("#connectionMessage")
      .filter({ hasText: "Đã đọc" })
      .waitFor();
    await page.locator("[data-section=reports]").click();
    await page.locator("#actionForm button").click();
    await page
      .locator("#backendResult")
      .filter({ hasText: "Thu ròng" })
      .waitFor();
    await page.locator("#logout").click();
    await page.locator("#loginForm").waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(
    "PASS: real Vite → OpenMRS → PostgreSQL configuration, authenticated admin workspace + account lookup + audit + report in browser, runtime metadata, 34 provinces, no demo stores, blocked runtime files. Read-only: no patient/user/transaction fixtures created.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
