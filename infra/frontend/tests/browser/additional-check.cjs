const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const metadata = require("../../packages/core/metadata/permissions.json");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const user = "11111111-1111-4111-8111-111111111111",
  record = "22222222-2222-4222-8222-222222222222",
  location = "feae71be-957c-4f94-b100-d84bc6915574";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const kind of ["system", "admin", "reception"]) {
      const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        }),
        page = await context.newPage(),
        writes = [],
        errors = [];
      const role = kind === "system" ? "admin" : kind;
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/openmrs/**", async (route) => {
        const r = route.request(),
          url = new URL(r.url()),
          path = url.pathname,
          headers = r.headers();
        const send = (data, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        if (path.endsWith("/session"))
          return send({
            authenticated: true,
            user: {
              uuid: user,
              display: kind,
              roles: [
                { name: "VinSHC App: " + role },
                ...(kind === "system" ? [{ name: "System Developer" }] : []),
              ],
            },
          });
        if (path.includes("/user/")) {
          assert.equal(kind, "system");
          assert.equal(headers["x-vinshc-workspace-role"], undefined);
          if (r.method() === "GET")
            return send({
              uuid: record,
              roles: [
                {
                  uuid: metadata.roles.reception.openmrs.uuid,
                  name: "VinSHC App: reception",
                },
              ],
              retired: false,
            });
          writes.push({ path, method: r.method(), body: r.postDataJSON() });
          return send({ uuid: record, roles: r.postDataJSON().roles });
        }
        assert.equal(headers["x-vinshc-workspace-role"], role);
        assert.equal(headers["x-vinshc-workspace-facility"], location);
        if (path.endsWith("/authorization/workspace"))
          return send({ role, facilityUuid: location });
        if (r.method() !== "GET")
          writes.push({
            path,
            method: r.method(),
            body: r.postData() ? r.postDataJSON() : null,
            query: url.search,
          });
        if (path.endsWith("/field-state") && r.method() === "DELETE")
          return route.fulfill({ status: 204, body: "" });
        if (path.endsWith("/contact/" + record))
          return send({ row_key: record, phone_raw: null, version_number: 2 });
        return send({
          uuid: record,
          roleName: "VinSHC App: nurse",
          active: r.method() !== "DELETE",
        });
      });
      await page.goto(base + "/connected.html", {
        waitUntil: "domcontentloaded",
      });
      await page.locator("[name=username]").fill("qa");
      await page.locator("[name=password]").fill("qa");
      await page.locator("#loginForm button").click();
      await page.locator("[name=role]").selectOption(role);
      await page.locator("#workspaceForm button").click();
      await page.locator("#switchWorkspace").waitFor();
      if (role === "admin") {
        await page.locator("[data-section=admin]").click();
        const option = page.locator("#actionPicker option[value=systemUsers]");
        assert.equal(await option.count(), kind === "system" ? 1 : 0);
        if (kind === "system") {
          await page.locator("#actionPicker").selectOption("grantAppRole");
          await page.locator("[name=user]").fill(record);
          await page.locator("[name=role]").selectOption("nurse");
          await page.locator("#actionForm button").click();
          await page
            .locator("#connectionMessage")
            .filter({ hasText: "đã xác nhận" })
            .waitFor();
          assert.deepEqual(writes.at(-1).body.roles, [
            metadata.roles.reception.openmrs.uuid,
            metadata.roles.nurse.openmrs.uuid,
          ]);
        }
        await page.locator("#actionPicker").selectOption("assignWorkspace");
        await page.locator("[name=user]").fill(record);
        await page.locator("[name=role]").selectOption("nurse");
        await page.locator("[name=facility]").selectOption(location);
        await page.locator("#actionForm button").click();
        await page
          .locator("#connectionMessage")
          .filter({ hasText: "đã xác nhận" })
          .waitFor();
        assert.deepEqual(writes.at(-1).body, {
          user: record,
          role: "nurse",
          facility: location,
        });
        await page.locator("#actionPicker").selectOption("revokeWorkspace");
        await page.locator("[name=user]").fill(record);
        await page.locator("[name=role]").selectOption("nurse");
        await page.locator("[name=facility]").selectOption(location);
        await page.locator("#actionForm button").click();
        await page
          .locator("#connectionMessage")
          .filter({ hasText: "đã xác nhận" })
          .waitFor();
        assert.equal(writes.at(-1).method, "DELETE");
      } else {
        await page.locator("[data-section=identity]").click();
        await page.locator("#actionPicker").selectOption("updateContact");
        await page.locator("[name=record]").fill(record);
        await page.locator("[name=clearPhone]").selectOption("true");
        await page.locator("#actionForm button").click();
        await page
          .locator("#connectionMessage")
          .filter({ hasText: "đã xác nhận" })
          .waitFor();
        assert.deepEqual(writes.at(-1).body, { phone: null });
        await page.locator("#actionPicker").selectOption("updateAddress");
        assert.equal(
          await page.locator("[name=addressAsOfDate]").inputValue(),
          "",
        );
        await page.locator("#actionPicker").selectOption("clearFieldState");
        await page.locator("[name=patient]").fill(user);
        await page
          .locator("[name=fieldCode]")
          .selectOption("contact.dien_thoai");
        await page.locator("[name=rowKey]").fill(record);
        await page.locator("#actionForm button").click();
        await page
          .locator("#connectionMessage")
          .filter({ hasText: "đã xác nhận" })
          .waitFor();
        assert.match(writes.at(-1).query, /context=contact/);
        assert.equal(await page.locator("#connectionError").innerText(), "");
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: mocked system-admin role preservation, app-admin restrictions, workspace grant/revoke, contact explicit clearing and field-state 204 on mobile. No DB writes.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
