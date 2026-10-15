// Doctor assistant chatbot against a mocked backend and agent: launcher on every doctor screen,
// guided "missing context" states, suggestions, Enter-to-send, history, sources, persistence across
// re-renders, Escape/close, mobile full-screen without page overflow. No DB writes.
const { fillReference } = require("./reference-helper.cjs");
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
const patient = "11111111-1111-4111-8111-111111111111",
  visit = "33333333-3333-4333-8333-333333333333",
  encounter = "22222222-2222-4222-8222-222222222222";
const location = "feae71be-957c-4f94-b100-d84bc6915574";
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const mobile = viewport.width < 600;
      const openPanel = async () => { if (!(await page.locator("#assistantPanel").isVisible())) await page.click("[data-assistant-toggle]"); };
      const errors = [], asked = [], partialAsked = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const send = (route, data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      await page.route("**/api/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/session"))
          return send(route, { authenticated: true, user: { uuid: "44444444-4444-4444-8444-444444444444", display: "BS. Minh", roles: [{ name: "VinSHC App: doctor" }] } });
        if (path.endsWith("/authorization/workspaces")) return send(route, [{ role: "doctor", facilityUuid: location, facilityName: "VinSHC Development Clinic" }]);
        if (path.endsWith("/authorization/workspace")) return send(route, { role: "doctor", facilityUuid: location });
        if (path.endsWith("/clinical-summary")) return send(route, { encounterUuid: encounter, reason: "Đau thượng vị 3 ngày" });
        return send(route, { results: [], hasMore: false });
      });
      await page.route("**/agent/v1/doctor/chat", (route) => {
        const body = route.request().postDataJSON();
        if (!body.encounterUuid) {
          partialAsked.push(body);
          return send(route, {
            persona: "doctor", status: "ok", message: null,
            answer: [{ text: "Phiếu đã có: đau thượng vị 3 ngày.", sources: [
              { factId: "f1", section: "visits", label: "Phiếu khám gần nhất", kind: "encounter", uuid: encounter },
            ] }],
            missing: [], notes: ["Đang đọc phiếu khám bệnh gần nhất trong lượt đã chọn."], toolsUsed: ["get_encounter_summary"],
            context: { patientUuid: body.patientUuid, encounterUuid: null, visitUuid: body.visitUuid, role: "doctor", facilityUuid: location },
            disclaimer: "Tham khảo", generatedAt: new Date().toISOString(), model: { provider: "fake", name: "fake" },
          });
        }
        asked.push(body);
        return send(route, {
          requestId: "r" + asked.length, persona: "doctor", status: "ok", message: null,
          answer: [{ text: asked.length === 1 ? "Lý do khám: đau thượng vị 3 ngày." : "Mạch 82, HA 125/80.", sources: [{ factId: "f1", section: "encounter", label: "Phiếu khám", kind: "encounter", uuid: encounter }] }],
          missing: asked.length === 1 ? [{ label: "Kết quả CLS", detail: "Chưa có kết quả" }] : [], notes: [], toolsUsed: [],
          context: { patientUuid: patient, encounterUuid: encounter, visitUuid: visit, role: "doctor", facilityUuid: location },
          disclaimer: "Tham khảo", generatedAt: new Date().toISOString(), model: { provider: "fake", name: "fake" },
        });
      });
      await page.goto(base + "/connected.html");
      await page.fill("[name=username]", "bs.minh");
      await page.fill("#loginForm [name=password]", "demo123");
      await page.click("#loginForm button.primary");
      // Available from the first doctor screen, closed by default.
      await page.locator("[data-assistant-toggle]").waitFor();
      assert.equal(await page.locator("#assistantPanel").isVisible(), false);
      await page.click("[data-assistant-toggle]");
      assert.match(await page.locator(".assistant-context").innerText(), /Chưa chọn bệnh nhân/);
      // General questions are allowed before a chart is open (reference documents only).
      assert.equal(await page.locator(".assistant-input textarea").isDisabled(), false);
      assert.match(await page.locator(".assistant-suggestions").innerText(), /Đơn vị sinh hiệu/);
      // The guided step opens the visit list. Wide screens keep the panel docked beside the page;
      // phones minimise the full-screen panel so the list can be used.
      await page.click("[data-assistant-go]");
      await page.locator("#careContextForm").waitFor({ state: "attached" });
      assert.equal(await page.locator("#assistantPanel").isVisible(), !mobile);
      if (!mobile) {
        const panel = await page.locator("#assistantPanel").boundingBox();
        const content = await page.locator(".care-summary").boundingBox();
        assert.ok(content.x + content.width <= panel.x, "docked panel must not cover the page");
      }
      await fillReference(page, "[name=care_patient]", patient);
      await fillReference(page, "[name=care_visit]", visit);
      await page.locator("#careContextForm button[type=submit]").click();
      await openPanel();
      assert.match(await page.locator(".assistant-context").innerText(), /phiếu khám bệnh gần nhất trong lượt đã chọn/);
      assert.match(await page.locator(".assistant-suggestions").innerText(), /Tóm tắt lần khám gần nhất/);
      assert.equal(await page.locator("[data-assistant-go]").getAttribute("data-assistant-action"), "");
      // An existing consultation can be read without replacing the FE's partial context.
      await page.locator(".assistant-suggestions [data-ask]").first().click();
      await page.locator(".assistant-msg.bot", { hasText: "Phiếu đã có:" }).waitFor();
      assert.deepEqual([partialAsked[0].patientUuid, partialAsked[0].encounterUuid, partialAsked[0].visitUuid], [patient, null, visit]);
      await page.locator("[data-source]").first().click();
      await page.locator(".assistant-source", { hasText: "Đau thượng vị 3 ngày" }).waitFor();
      await page.click("[data-source-close]");
      if (mobile) await page.click("[data-assistant-close]");
      await fillReference(page, "[name=care_encounter]", encounter);
      await page.locator("#careContextForm button[type=submit]").click();
      await openPanel();
      // Ready: suggestions send a question with the selected record.
      await page.locator(".assistant-suggestions [data-ask]").first().click();
      await page.locator(".assistant-msg.bot", { hasText: "Lý do khám: đau thượng vị" }).waitFor();
      assert.deepEqual([asked[0].patientUuid, asked[0].encounterUuid, asked[0].visitUuid], [patient, encounter, visit]);
      assert.deepEqual(asked[0].history, []);
      assert.match(await page.locator(".assistant-missing summary").innerText(), /Thông tin thiếu/);
      // Enter sends, Shift+Enter keeps a newline; history carries the previous turn.
      const input = page.locator(".assistant-input textarea");
      await input.fill("Sinh hiệu?");
      await input.press("Shift+Enter");
      assert.equal(await input.inputValue(), "Sinh hiệu?\n");
      await input.press("Enter");
      await page.locator(".assistant-msg.bot", { hasText: "Mạch 82" }).waitFor();
      assert.equal(asked[1].message, "Sinh hiệu?");
      assert.deepEqual(asked[1].history.map((h) => h.role), ["user", "assistant"]);
      // Sources open inside the panel.
      await page.locator("[data-source]").first().click();
      await page.locator(".assistant-source", { hasText: "Đau thượng vị 3 ngày" }).waitFor();
      await page.click("[data-source-close]");
      // Turns survive navigation to another doctor screen; Escape closes and the launcher shows activity.
      if (mobile) await page.click("[data-assistant-close]");
      await page.locator("[data-section=visits]").click();
      await openPanel();
      assert.equal(await page.locator(".assistant-msg.user").count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await input.press("Escape");
      assert.equal(await page.locator("#assistantPanel").isVisible(), false);
      assert.equal(await page.locator(".assistant-dot").count(), 1);
      if (viewport.width === 1400) {
        await page.click("[data-assistant-toggle]");
        await page.screenshot({ path: require("node:path").join(require("node:os").tmpdir(), "vinshc-doctor-assistant.png") });
      }
      // New conversation clears the turns.
      await openPanel();
      await page.click("[data-clear]");
      assert.equal(await page.locator(".assistant-msg.user").count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS: doctor assistant launcher on doctor screens, guided context, suggestions, Enter/Shift+Enter, history, sources, persistence, Escape, mobile. Mocked only.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
