// Fixture-only form setup for low-level payload tests. Normal UI paths are covered separately.
exports.fillReference = async (page, selector, value) => {
  let input = page.locator(selector);
  if (!await input.count()) {
    const name = selector.match(/name=["']?([^\]"']+)/)?.[1];
    if (!name) throw new Error('Missing fixture reference: ' + selector);
    await page.locator('#actionForm, #vitalsForm').first().evaluate((form, pair) => {
      const input = document.createElement('input');input.type='hidden';input.name=pair.name;input.value=pair.value;form.append(input);
    }, {name,value});
    return;
  }
  if (await input.getAttribute('type') === 'hidden') return input.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  for (const parent of await input.locator('xpath=ancestor::details').all()) await parent.evaluate(el=>el.open=true);
  await input.fill(value);
};
exports.chooseAction = async (page, key) => {
  const button = page.locator(`[data-task-action="${key}"]`).first();
  for (const parent of await button.locator('xpath=ancestor::details').all()) await parent.evaluate(el=>el.open=true);
  await button.click();
};
exports.mockSelectCare = async (page, {patient,visit,encounter,role='doctor',provider=patient}) => {
  visit = visit || patient;
  const row={uuid:visit,patientUuid:patient,visitCode:'VSHC-QA',status:'open',startDatetime:'2026-10-15T09:00:00Z',patient:{uuid:patient,fullName:'Người bệnh kiểm thử',identifier:'VSHC-QA'},encounters:encounter?[{uuid:encounter,encounterType:{key:role==='nurse'?'vitals':'consultation'},providers:[{uuid:provider}]}]:[]};
  await page.route('**/api/vinshc/visits**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname.endsWith('/visits')?{results:[row],hasMore:false}:row)}));
  if (await page.locator('#assistantPanel').isVisible().catch(()=>false)) await page.locator('[data-assistant-close]').click();
  await page.locator('[data-section=visits]').click();
  if (await page.locator('[data-doctor-clear]').count()) await page.locator('[data-doctor-clear]').click();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/vinshc/visits'));
  await page.locator('[data-worklist-reload=visits]').click();await response;
  await page.getByRole('button',{name:'Người bệnh kiểm thử',exact:true}).click();
  if (role==='doctor') await page.locator(encounter?'[data-doctor-action=consultation]':'[data-doctor-start]').waitFor();
};
