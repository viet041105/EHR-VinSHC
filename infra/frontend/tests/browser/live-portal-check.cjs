const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const required = ['P4_PORTAL_A_USER','P4_PORTAL_A_PASSWORD','P4_PORTAL_B_USER','P4_PORTAL_B_PASSWORD','P4_PORTAL_VISIT'];
for (const name of required) if (!process.env[name]) throw new Error('Missing ' + name);
const base = 'http://127.0.0.1:' + (process.env.VINSHC_APP_PORT || '5184');

async function login(page, username, password) {
  await page.goto(base + '/portal.html', { waitUntil: 'domcontentloaded' });
  await page.locator('[name="username"]').fill(username);
  await page.locator('[name="password"]').fill(password);
  await page.locator('#portalLogin button').click();
  await page.locator('#patientChat').waitFor({ timeout: 20000 });
  const state = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    patientInputs: document.querySelectorAll('[name="patientUuid"],[name="encounterUuid"]').length
  }));
  assert.deepEqual(state.local, []);
  assert.deepEqual(state.session, []);
  assert.equal(state.patientInputs, 0);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // Two simultaneous tabs of one browser origin must never share auth/records.
    const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const a = await context.newPage(), b = await context.newPage();
    await login(a, process.env.P4_PORTAL_A_USER, process.env.P4_PORTAL_A_PASSWORD);
    await a.locator('#portalVisit').waitFor();
    assert.equal(await a.locator('#portalVisit').inputValue(), process.env.P4_PORTAL_VISIT);
    await a.locator('#portalRead').click();
    await a.getByText('Lời dặn', { exact: true }).first().waitFor();
    await login(b, process.env.P4_PORTAL_B_USER, process.env.P4_PORTAL_B_PASSWORD);
    assert.equal(await b.locator('#portalVisit').count(), 0);
    assert.equal(await a.locator('#portalVisit').inputValue(), process.env.P4_PORTAL_VISIT);
    await a.locator('#portalLogout').click();
    await a.locator('#portalLogin').waitFor();
    assert.equal(await a.locator('#portalVisit').count(), 0);
    assert.equal(await a.locator('#patientChat').count(), 0);
    assert.equal(await b.locator('#patientChat').count(), 1);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await login(mobile, process.env.P4_PORTAL_A_USER, process.env.P4_PORTAL_A_PASSWORD);
    await mobile.locator('#portalVisit').waitFor();
    const metrics = await mobile.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }));
    assert.ok(metrics.content <= metrics.viewport + 3, 'mobile horizontal overflow: ' + JSON.stringify(metrics));
    await mobile.locator('#portalRead').click();
    await mobile.getByText('Lời dặn', { exact: true }).first().waitFor();
    console.log('PASS: real OpenMRS desktop/mobile portal, 2 accounts/tabs isolated, logout, no browser storage');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
