// Read-only audit against the running app. Supply a known synthetic patient and real model.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fillReference } = require('./reference-helper.cjs');
for (const key of ['P5_DOCTOR_USER', 'P5_DOCTOR_PASSWORD', 'P5_PATIENT_UUID', 'P5_VISIT_UUID', 'P5_ENCOUNTER_UUID'])
  if (!process.env[key]) throw Error('Missing ' + key);
if (process.env.P5_SYNTHETIC_PATIENT !== 'true') throw Error('Audit requires an explicitly known synthetic patient.');
const base = 'http://127.0.0.1:' + (process.env.VINSHC_APP_PORT || '5173');
const context = { patient: process.env.P5_PATIENT_UUID, visit: process.env.P5_VISIT_UUID, encounter: process.env.P5_ENCOUNTER_UUID };
const report = { synthetic: true, routeMocks: false, cases: [], errors: [], startedAt: new Date().toISOString() };
const output = path.resolve(__dirname, '../../../..', '.runtime/current-database/full-agent-audit.json');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    report.health = await (await page.request.get(base + '/agent/healthz')).json();
    assert.equal(report.health.dataProvider, 'http'); assert.equal(report.health.modelProvider, 'gemini');
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base + '/connected.html');
    await page.fill('[name=username]', process.env.P5_DOCTOR_USER);
    await page.fill('#loginForm [name=password]', process.env.P5_DOCTOR_PASSWORD);
    await page.click('#loginForm button.primary');
    await page.locator('[data-section=visits]').click();
    for (const [name, value] of Object.entries(context)) await fillReference(page, '[name=care_' + name + ']', value);
    await page.click('#careContextForm button[type=submit]');
    await page.click('[data-assistant-toggle]');
    const ask = async (label, message) => {
      const started = Date.now();
      const response = page.waitForResponse(r => r.url().endsWith('/agent/v1/doctor/chat') && r.request().postDataJSON()?.message === message, { timeout: 110000 });
      await page.fill('[data-chat] textarea', message);
      await page.locator('[data-chat] textarea').press('Enter');
      const http = await response, result = await http.json();
      await page.waitForFunction(() => !document.querySelector('[data-stop]'));
      report.cases.push({ label, http: http.status(), status: result.status, tools: result.toolsUsed,
        message: result.message,
        model: result.model, answerCount: result.answer?.length || 0,
        sourceCount: (result.answer || []).reduce((n, a) => n + a.sources.length, 0),
        missingReasons: (result.missing || []).map(m => m.reason),
        diagnostics: result.diagnostics, seconds: (Date.now() - started) / 1000 });
      console.log(label + ': ' + result.status + ' [' + (result.toolsUsed || []).join(', ') + ']');
      return result;
    };
    const greeting = await ask('greeting', 'Bạn là ai');
    assert.equal(greeting.status, 'ok'); assert.equal(greeting.diagnostics.modelCalls, 0);
    const vitals = await ask('vitals', 'Sinh hiệu gần nhất của bệnh nhân là bao nhiêu?');
    assert.equal(vitals.status, 'ok'); assert.ok(vitals.answer.length && vitals.answer.every(a => a.sources.length));
    const recap = await ask('history', 'tôi đã hỏi những gì');
    assert.equal(recap.status, 'ok'); assert.ok(recap.message.includes('Bạn là ai') && recap.message.includes('Sinh hiệu gần nhất'));
    assert.ok([2, 3].includes(recap.diagnostics.modelCalls)); assert.deepEqual(recap.toolsUsed, ['recall_conversation']); assert.deepEqual(recap.notes, []);
    assert.equal(recap.conversationId, greeting.conversationId);
    await page.locator('[data-source]').first().click();
    await page.waitForFunction(() => document.querySelector('.assistant-source-body')?.textContent.trim() && !document.querySelector('.assistant-source-body').textContent.includes('Đang mở bản ghi'));
    assert.equal(await page.locator('.assistant-source-body [role=alert]').count(), 0);
    report.clinicalSourceOpened = true;
    await page.click('[data-source-close]');
    const rag = await ask('rag', 'Theo tài liệu, unknown khác not_asked như thế nào?');
    assert.equal(rag.status, 'ok'); assert.ok(rag.answer.some(a => a.sources.some(s => s.kind === 'document')));
    await page.locator('.assistant-msg.bot').last().locator('[data-source]').first().click();
    await page.waitForFunction(() => document.querySelector('.assistant-source-body')?.textContent.includes('unknown'));
    assert.equal(await page.locator('.assistant-source-body [role=alert]').count(), 0);
    report.documentSourceOpened = true;
    await page.click('[data-source-close]');
    const timeline = await ask('timeline', 'Timeline các lần khám của bệnh nhân');
    assert.ok(timeline.toolsUsed.includes('get_patient_timeline') && timeline.answer.length);
    const comparison = await ask('comparison', 'So sánh sinh hiệu với lần khám trước');
    assert.ok(comparison.toolsUsed.includes('compare_previous_visit'));
    assert.ok(comparison.missing.some(m => m.reason === 'no_previous_visit'));
    assert.equal(comparison.status, 'not_found');
    const summary = await ask('summary', 'Tóm tắt lần khám này');
    assert.ok(['ok', 'limited'].includes(summary.status) && summary.answer.length);
    assert.ok(summary.answer.every(a => a.sources.length));
    const headers = { Authorization: 'Basic ' + Buffer.from(process.env.P5_DOCTOR_USER + ':' + process.env.P5_DOCTOR_PASSWORD).toString('base64'),
      'X-VinSHC-Workspace-Role': 'doctor', 'X-VinSHC-Workspace-Facility': greeting.context.facilityUuid };
    const body = { message: 'hello', patientUuid: context.patient, encounterUuid: context.encounter, visitUuid: context.visit };
    report.permissionChecks = [];
    for (const test of [
      { name: 'unauthenticated', persona: 'doctor', headers: {}, body, expected: [401] },
      { name: 'wrong-role', persona: 'doctor', headers: { ...headers, 'X-VinSHC-Workspace-Role': 'nurse' }, body, expected: [403] },
      { name: 'mismatched-patient', persona: 'doctor', headers, body: { ...body, patientUuid: 'f0000000-0000-4000-8000-000000000099' }, expected: [400] },
      { name: 'no-portal-link', persona: 'patient', headers: { Authorization: headers.Authorization }, body: { message: 'hello' }, expected: [401, 403] },
    ]) {
      const response = await page.request.post(base + '/agent/v1/' + test.persona + '/chat', { headers: test.headers, data: test.body });
      report.permissionChecks.push({ name: test.name, status: response.status() });
      assert.ok(test.expected.includes(response.status()), test.name + ': ' + response.status());
    }
    await page.setViewportSize({ width: 390, height: 940 });
    await page.click('[data-clear]');
    const empty = await ask('new-conversation-mobile', 'tôi đã hỏi những gì');
    assert.ok(empty.message.includes('Chưa có tin nhắn trước đó'));
    assert.notEqual(empty.conversationId, greeting.conversationId);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
