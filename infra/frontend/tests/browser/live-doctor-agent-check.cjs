// Real clinic/agent HTTP calls on synthetic data; no Playwright route mocks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { fillReference } = require('./reference-helper.cjs');
const names=['P5_DOCTOR_USER','P5_DOCTOR_PASSWORD','P5_PATIENT_UUID','P5_VISIT_UUID','P5_ENCOUNTER_UUID'];
for(const name of names) if(!process.env[name]) throw Error('Missing '+name);
const base='http://127.0.0.1:'+(process.env.VINSHC_APP_PORT||'5184');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [1400,390]){
      const page=await browser.newPage({viewport:{width,height:940}}),errors=[],responses=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(response.url().endsWith('/agent/v1/doctor/chat'))responses.push(response);});
      await page.goto(base+'/connected.html');
      await page.fill('[name=username]',process.env.P5_DOCTOR_USER);
      await page.fill('#loginForm [name=password]',process.env.P5_DOCTOR_PASSWORD);
      await page.click('#loginForm button.primary');
      await page.locator('[data-section=visits]').click();
      const context={patient:process.env.P5_PATIENT_UUID,visit:process.env.P5_VISIT_UUID,encounter:process.env.P5_ENCOUNTER_UUID};
      for(const [name,value] of Object.entries(context))await fillReference(page,'[name=care_'+name+']',value);
      await page.click('#careContextForm button[type=submit]');
      await page.click('[data-assistant-toggle]');
      await page.fill('[data-chat] textarea','Tóm tắt lần khám');
      await page.locator('[data-chat] textarea').press('Enter');
      await page.locator('[data-source]').first().waitFor({timeout:90000});
      const reply=await responses[0].json();
      assert.equal(reply.status,'ok');assert.equal(reply.context.patientUuid,context.patient);
      assert.equal(reply.context.encounterUuid,context.encounter);
      assert.ok(reply.answer.length&&reply.answer.every(answer=>answer.sources.length));
      await page.locator('[data-source]').first().click();
      await page.waitForFunction(()=>{
        const source=document.querySelector('.assistant-source-body');
        return source && !source.textContent.includes('Đang mở bản ghi') && source.textContent.trim().length>0;
      });
      assert.equal(await page.locator('.assistant-source-body [role=alert]').count(),0);
      assert.ok(!(await page.locator('.assistant-source-body').innerText()).includes(context.encounter));
      await page.click('[data-source-close]');
      await page.fill('[data-chat] textarea','Sinh hiệu đã ghi');
      await page.locator('[data-chat] textarea').press('Enter');
      await page.waitForFunction(()=>document.querySelectorAll('.assistant-msg.user').length===2&&!document.querySelector('[data-stop]'));
      assert.equal((await responses[1].json()).status,'ok');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.click('[data-assistant-close]');await page.click('#logout');
      await page.locator('#loginForm').waitFor();
      assert.equal(await page.locator('[data-assistant-toggle]').count(),0);assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: real doctor desktop/mobile login, patient context, chat, citations and source HTTP reads; synthetic clinic, model fake.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
