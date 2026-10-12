// UI contracts use isolated route mocks; no calls reach the clinical database.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const permissions=require('./metadata/permissions.json');
const map=require('./metadata/frontend-map.json');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
const patient='11111111-1111-4111-8111-111111111111',visit='22222222-2222-4222-8222-222222222222';
const encounter='33333333-3333-4333-8333-333333333333',bill='44444444-4444-4444-8444-444444444444';
const payment='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
const location=map.entities['location.development.clinic'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:960},timezoneId:'Asia/Ho_Chi_Minh'}),page=await context.newPage();
   const requests=[],errors=[];let role='reception',failRead=false;
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/openmrs/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    requests.push({path,method:request.method(),body:request.method()==='POST'?request.postDataJSON():null});
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path.endsWith('/session'))return send({authenticated:true,user:{uuid:other,display:'QA workspace',roles:Object.keys(permissions.roles).map(key=>({name:'VinSHC App: '+key}))}});
    assert.equal(request.headers()['x-vinshc-workspace-role'],role);
    assert.equal(request.headers()['x-vinshc-workspace-facility'],location);
    if(path.endsWith('/authorization/workspace'))return send({role,facilityUuid:location});
    if(path.includes('/identity/'))return send({patientUuid:path.split('/').at(-1),contacts:[],addresses:[],fieldStates:[]});
    if(path.endsWith('/operations/bills')&&request.method()==='POST')return send({uuid:bill,patientUuid:patient,visitUuid:visit,totalVnd:100000,status:'unpaid',payments:[]},201);
    if(path.endsWith('/operations/bills/'+bill+'/receipts'))return send({uuid:payment,billUuid:bill,status:'settled',amountVnd:100000},201);
    if(path.endsWith('/operations/bills/'+bill))return failRead?send({detail:'Record is unavailable'},403):send({uuid:bill,patientUuid:patient,visitUuid:visit,totalVnd:100000,status:'paid',payments:[{payment_uuid:payment,amount_vnd:100000,status:'settled'}]});
    throw new Error('Unexpected or speculative API call: '+request.method()+' '+path);
   });
   await page.goto(base+'/connected.html',{waitUntil:'domcontentloaded'});
   await page.locator('[name=username]').fill('qa');await page.locator('[name=password]').fill('qa-only');await page.locator('#loginForm button').click();
   async function workspace(next){role=next;await page.locator('[name=role]').selectOption(next);await page.locator('#workspaceForm button').click();await page.locator('[data-section=overview]').waitFor();}
   async function section(id){await page.locator('[data-section='+id+']').click();}
   async function applyContext(p,v='',e=''){
    const details=page.locator('.context-panel');if(await details.getAttribute('open')===null)await details.locator('summary').click();
    await page.locator('[name=care_patient]').fill(p);
    if(await page.locator('[name=care_visit]').count())await page.locator('[name=care_visit]').fill(v);
    if(await page.locator('[name=care_encounter]').count())await page.locator('[name=care_encounter]').fill(e);
    await page.locator('#careContextForm button[type=submit]').click();
   }
   await workspace('reception');await page.getByRole('heading',{name:'Quy trình phòng khám'}).waitFor();
   await section('patients');await page.getByRole('heading',{name:'Tìm bệnh nhân',exact:true}).waitFor();
   const requestCount=requests.length;
   await page.locator('[name=preview_query]').fill('QA draft only');
   const registration=page.locator('details').filter({has:page.locator('summary', {hasText:'Tiếp nhận bệnh nhân mới'})});
   await registration.locator('summary').click();await page.locator('[name=preview_familyName]').fill('QA');
   assert.equal(await page.locator('[data-pending-form] button:enabled').count(),0);
   await page.locator('[name=preview_familyName]').press('Enter');assert.equal(requests.length,requestCount);
   await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`/private/tmp/vinshc-workspace-patients-${width}.png`,fullPage:true});
   await applyContext(patient,visit,encounter);await section('identity');
   assert.equal(await page.locator('#actionForm [name=patient]').inputValue(),patient);
   await page.locator('#actionForm button').click();await page.locator('[data-session-record]').waitFor();
   assert.equal(await page.locator('[data-session-record]').count(),1);
   await page.locator('#sessionRecordFilter').fill('no match');assert.equal(await page.locator('[data-session-record]:visible').count(),0);
   await section('visits');const preview=page.locator('[name=preview_visitType]');
   assert.equal(await preview.locator('option').nth(1).getAttribute('value'),map.entities['visit.outpatient']);
   await applyContext(other);assert.equal(await page.locator('[name=care_visit]').inputValue(),'');assert.equal(await page.locator('[name=care_encounter]').inputValue(),'');
   await page.locator('#switchWorkspace').click();await workspace('cashier');await section('billing');
   assert.equal(await page.locator('[data-session-record]').count(),0);
   await applyContext(patient,visit);await page.locator('#actionPicker').selectOption('bill');
   assert.equal(await page.locator('#actionForm [name=patient]').inputValue(),patient);
   assert.equal(await page.locator('#actionForm [name=visit]').inputValue(),visit);
   await page.locator('[name=service]').selectOption({index:1});await page.locator('[name=quantity]').fill('1');await page.locator('[name=paymentTiming]').selectOption('postpay');
   await page.locator('#actionForm button').click();await page.locator('[data-select-id="'+bill+'"]').waitFor();
   assert.equal(await page.locator('[data-pending-form] button:enabled').count(),0);
   await page.locator('#actionPicker').selectOption('receipt');assert.equal(await page.locator('#actionForm [name=record]').inputValue(),bill);
   await page.locator('[name=amountVnd]').fill('100000');await page.locator('[name=method]').selectOption('cash');await page.locator('#actionForm button').click();
   await page.locator('[data-select-id="'+payment+'"]').waitFor();await page.locator('.capability-badge').filter({hasText:'Cần đọc lại'}).waitFor();
   assert.equal(requests.find(r=>r.path.endsWith('/receipts')).body.amountVnd,100000);
   await page.locator('#actionPicker').selectOption('refund');assert.equal(await page.locator('#actionForm [name=record]').inputValue(),payment);
   await page.locator('[data-read-id="'+bill+'"]').click();await page.locator('#connectionMessage').filter({hasText:'Đã đọc lại'}).waitFor();
   assert.equal(await page.locator('.capability-badge').filter({hasText:'Cần đọc lại'}).count(),0);
   failRead=true;await page.locator('[data-read-id="'+bill+'"]').click();await page.locator('#connectionError').filter({hasText:'không có quyền'}).waitFor();
   assert.equal(await page.locator('[data-pending-form] button:enabled').count(),0);
   failRead=false;await page.locator('[data-read-id="'+bill+'"]').click();await page.locator('#connectionMessage').filter({hasText:'Đã đọc lại'}).waitFor();
   await page.emulateMedia({media:'print'});
   assert.notEqual(await page.locator('#app').evaluate(el=>getComputedStyle(el).display),'none');
   assert.equal(await page.locator('.preparation-panel').evaluate(el=>getComputedStyle(el).display),'none');
   await page.emulateMedia({media:'screen'});
   await page.evaluate(()=>{document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'});});await page.screenshot({path:`/private/tmp/vinshc-workspace-billing-${width}.png`,fullPage:true});
   await page.locator('#switchWorkspace').click();await workspace('admin');
   assert.equal(await page.locator('[data-section=patients]').count(),0);assert.equal(await page.locator('[data-section=visits]').count(),0);
   await page.screenshot({path:`/private/tmp/vinshc-workspace-admin-${width}.png`,fullPage:true});
   await page.locator('#switchWorkspace').click();await workspace('pharmacy');await section('pharmacy');
   await page.getByText('Xác nhận cấp thuốc',{exact:true}).waitFor();assert.equal(await page.locator('[data-pending-form] button:enabled').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#logout').click();await page.locator('#loginForm').waitFor();
   assert.equal((await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).includes(patient),false);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: role dashboards, pending forms never call missing APIs, patient context resets, metadata visit types, successful-response tables, bill/payment UUID mapping, stale refresh, errors keep unavailable controls disabled, mobile and workspace isolation. Mocked only; no DB writes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
