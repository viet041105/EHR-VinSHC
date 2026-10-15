// Read-only regression on the running FE/BE and real Gemini, with a known synthetic record.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fillReference } = require('./reference-helper.cjs');
for (const key of ['P5_DOCTOR_USER', 'P5_DOCTOR_PASSWORD', 'P5_PATIENT_UUID', 'P5_VISIT_UUID', 'P5_ENCOUNTER_UUID'])
  if (!process.env[key]) throw Error('Missing ' + key);
if (process.env.P5_SYNTHETIC_PATIENT !== 'true') throw Error('Requires an explicitly known synthetic patient.');
const base = 'http://127.0.0.1:' + (process.env.VINSHC_APP_PORT || '5173');
const output = path.resolve(__dirname, '../../../..', '.runtime/current-database/conversation-context-check.json');
const report = { synthetic: true, routeMocks: false, startedAt: new Date().toISOString(), cases: [], errors: [] };

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    report.health = await (await page.request.get(base + '/agent/healthz')).json();
    assert.equal(report.health.modelProvider, 'gemini');
    assert.equal(report.health.dataProvider, 'http');
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(base + '/connected.html');
    await page.fill('[name=username]', process.env.P5_DOCTOR_USER);
    await page.fill('#loginForm [name=password]', process.env.P5_DOCTOR_PASSWORD);
    await page.click('#loginForm button.primary');
    await page.locator('[data-section=visits]').click();
    for (const name of ['patient', 'visit', 'encounter'])
      await fillReference(page, '[name=care_' + name + ']', process.env['P5_' + name.toUpperCase() + '_UUID']);
    await page.click('#careContextForm button[type=submit]');
    await page.click('[data-assistant-toggle]');
    const ask = async (label, message) => {
      const started = Date.now();
      const pending = page.waitForResponse(r => r.url().endsWith('/agent/v1/doctor/chat') &&
        r.request().postDataJSON()?.message === message, { timeout: 110000 });
      await page.fill('[data-chat] textarea', message);
      await page.locator('[data-chat] textarea').press('Enter');
      const http = await pending, result = await http.json();
      await page.waitForFunction(() => !document.querySelector('[data-stop]'));
      const bubble = await page.locator('.assistant-msg.bot').last().innerText();
      report.cases.push({ label, question: message, http: http.status(), status: result.status,
        tools: result.toolsUsed, modelCalls: result.diagnostics?.modelCalls,
        responseMode: result.diagnostics?.responseMode, modelError: result.diagnostics?.modelError,
        sourceRepairs: result.diagnostics?.sourceRepairs,
        answerCount: result.answer?.length || 0,
        sourceCount: (result.answer || []).reduce((n, a) => n + a.sources.length, 0),
        message: result.message, seconds: (Date.now() - started) / 1000 });
      console.log(label + ': ' + result.status + ' [' + (result.toolsUsed || []).join(', ') + ']');
      assert.equal(http.status(), 200);
      if (result.message) assert.ok(bubble.includes(result.message), 'Response must be visible in the chat');
      return result;
    };
    // These formulations exercise semantic selection; production has no phrase whitelist for recall.
    const questions = ['tôi mới nói gì', 'Nãy tôi nhắn câu nào nhỉ?', 'Bạn nhắc lại tin nhắn vừa rồi của tôi với.'];
    let previousId;
    for (let i = 0; i < questions.length; i++) {
      if (i) await page.click('[data-clear]');
      const first = await ask('hello-' + i, 'hello');
      assert.notEqual(first.conversationId, previousId);
      await ask('greeting-' + i, 'chào');
      const result = await ask('recall-paraphrase-' + i, questions[i]);
      assert.equal(result.status, 'ok');
      assert.ok(result.message.endsWith('Bạn: “chào”'));
      assert.deepEqual(result.toolsUsed, ['recall_conversation']);
      assert.ok([2, 3].includes(result.diagnostics.modelCalls));
      assert.equal(result.diagnostics.responseMode, 'conversation');
      assert.deepEqual(result.answer, []);
      assert.equal(result.conversationId, first.conversationId);
      previousId = first.conversationId;
    }
    const assistant = await ask('assistant-recall', 'Bạn vừa trả lời tôi thế nào?');
    assert.equal(assistant.status, 'ok');
    assert.deepEqual(assistant.toolsUsed, ['recall_conversation']);
    assert.ok(assistant.message.includes('Trợ lý: “') && assistant.message.includes('không phải kết quả đọc lại hồ sơ hiện tại'));
    const all = await ask('all-user-messages', 'Tóm tắt các câu tôi đã nhắn từ đầu cuộc trò chuyện');
    assert.equal(all.status, 'ok');
    assert.deepEqual(all.toolsUsed, ['recall_conversation']);
    assert.ok(all.message.includes('Bạn: “hello”') && all.message.includes('Bạn: “chào”'));
    const pulse = await ask('clinical-topic', 'Mạch lần khám này bao nhiêu?');
    assert.equal(pulse.status, 'ok');
    assert.ok(pulse.answer.length && pulse.answer.every(a => a.sources.length));
    const followup = await ask('clinical-followup', 'Thế còn huyết áp?');
    assert.equal(followup.status, 'ok');
    assert.ok(followup.answer.length && followup.answer.every(a => a.sources.length));
    assert.ok(followup.toolsUsed.length && !followup.toolsUsed.includes('recall_conversation') &&
      !followup.toolsUsed.includes('search_documents'));
    assert.ok(followup.answer.some(a => /huyết áp/i.test(a.text)));
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
