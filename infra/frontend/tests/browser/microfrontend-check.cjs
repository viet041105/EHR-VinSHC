// Microfrontend guarantees, on the dev server or a built dist/ (vite preview):
// every module listed in the import map is fetched as its own file, a module that fails to load is
// reported and only its sections disappear, and the other workspaces keep working. Mocked API only.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const location = "feae71be-957c-4f94-b100-d84bc6915574";
const user = "11111111-1111-4111-8111-111111111111";
async function session(browser, { breakModule } = {}) {
  const context = await browser.newContext({ timezoneId: "Asia/Ho_Chi_Minh" }),
    page = await context.newPage(),
    errors = [],
    moduleRequests = [];
  let role = "reception";
  let loggedIn = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const path = new URL(r.url()).pathname;
    if (/^\/modules\/[a-z-]+\//.test(path)) moduleRequests.push(path);
  });
  if (breakModule)
    await page.route(`**/modules/${breakModule}/**`, (route) =>
      route.fulfill({ status: 404, body: "not deployed" }),
    );
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const respond = (data) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname.endsWith("/session"))
      return respond({
        authenticated: true,
        user: { uuid: user, display: "QA", roles: [{ name: "VinSHC App: " + role }] },
      });
    if (url.pathname.endsWith("/authorization/workspaces"))
      return respond([{ role, facilityUuid: location, facilityName: "QA Clinic" }]);
    if (url.pathname.endsWith("/authorization/workspace"))
      return respond({ role, facilityUuid: location });
    return respond({ results: [], hasMore: false });
  });
  await page.goto(base + "/connected.html");
  await page.locator("[name=username]").fill("qa");
  await page.locator("[name=password]").fill("qa");
  await page.locator("#loginForm button").click();
  await page.locator("[data-section=overview]").waitFor();
  loggedIn = true;
  const open = async (next) => {
    if (loggedIn && role !== next) {
      await page.locator("#logout").click();
      await page.locator("#loginForm").waitFor();
      loggedIn = false;
    }
    role = next;
    if (!loggedIn) {
      await page.locator("[name=username]").fill("qa");
      await page.locator("[name=password]").fill("qa");
      await page.locator("#loginForm button").click();
      await page.locator("[data-section=overview]").waitFor();
      loggedIn = true;
    }
    return page.locator("[data-section]").evaluateAll((els) => els.map((e) => e.dataset.section));
  };
  return { context, page, errors, moduleRequests, open };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const healthy = await session(browser);
    const importMap = JSON.parse(
      await healthy.page.locator('script[type="importmap"]').first().textContent(),
    ).imports;
    const listed = Object.keys(importMap).filter((k) => k !== "@vinshc/core");
    const pharmacySections = await healthy.open("pharmacy");
    assert.ok(pharmacySections.includes("pharmacy"), pharmacySections.join());
    for (const name of listed)
      assert.ok(
        healthy.moduleRequests.some((p) => p.startsWith(new URL(importMap[name], base).pathname.replace(/[^/]+$/, ""))),
        "module not fetched separately: " + name,
      );
    assert.deepEqual(healthy.errors, []);
    await healthy.context.close();

    const broken = await session(browser, { breakModule: "pharmacy" });
    const withoutPharmacy = await broken.open("pharmacy");
    assert.ok(!withoutPharmacy.includes("pharmacy"), withoutPharmacy.join());
    await broken.page.getByText(/Một số chức năng tạm thời chưa mở được: Quầy thuốc/).waitFor();
    const cashier = await broken.open("cashier");
    assert.ok(cashier.includes("billing"), cashier.join());
    await broken.page.locator("[data-section=billing]").click();
    await broken.page.locator("#actionPicker").waitFor();
    const reception = await broken.open("reception");
    assert.ok(reception.includes("patients") && reception.includes("visits"), reception.join());
    assert.deepEqual(broken.errors, []);
    await broken.context.close();
    console.log(
      `PASS: ${listed.length} modules fetched separately from the import map; a failing @vinshc/pharmacy is reported, its section hidden, cashier/reception workspaces unaffected. Mocked API only.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
