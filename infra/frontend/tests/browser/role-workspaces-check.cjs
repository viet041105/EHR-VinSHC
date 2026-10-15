// UI-only fixtures. No request reaches the real backend or writes to the local database.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const os = require('node:os'), path = require('node:path');
const map = require('../../packages/core/metadata/frontend-map.json');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const facility = map.entities['location.development.clinic'];
(async()=>{
 const browser = await chromium.launch({headless:true});
 try {
  for (const width of [1440,390]) {
   const page = await browser.newPage({viewport:{width,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
   page.setDefaultTimeout(12000);
   let role='doctor', saved=null, held=null, delay=false, expired=false;
   const writes=[], errors=[], reads=[];
   const a={uuid:id(1),patientUuid:id(2),visitCode:'VSHC-LK-1',status:'open',startDatetime:'2026-10-15T08:00:00Z',patient:{fullName:'Nguyễn An',identifier:'VSHC-1',gender:'M',birthdate:'1990-01-01'},encounters:[{uuid:id(3),encounterType:{key:'consultation'},providers:[{uuid:id(99)}]},{uuid:id(4),encounterType:{key:'consultation'},providers:[{uuid:id(5)}]}]};
   const b={...a,uuid:id(6),patientUuid:id(7),visitCode:'VSHC-LK-2',patient:{...a.patient,fullName:'Nguyễn Bình',identifier:'VSHC-2'},encounters:[{uuid:id(8),encounterType:{key:'consultation'},providers:[{uuid:id(5)}]}]};
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),p=url.pathname.replace('/api/',''),method=req.method();
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    const list=(results,hasMore=false)=>send({results,hasMore});
    if(method!=='GET')writes.push({p,body:req.postDataJSON()});else reads.push(p);
    if(p==='session')return send({authenticated:true,user:{uuid:id(10),display:'Nhân viên QA',roles:[{name:'VinSHC App: '+role},...(role==='admin'?[{name:'System Developer'}]:[])]}});
    if(p==='vinshc/authorization/workspaces')return send([{role,facilityUuid:facility,facilityName:'VinSHC Development Clinic'}]);
    if(p==='vinshc/authorization/workspace')return send({role,facilityUuid:facility});
    if(p==='vinshc/providers/me')return send({providers:[{uuid:id(5)}]});
    if(p==='vinshc/visits')return list(url.searchParams.get('patient')?[a,b].filter(v=>v.patientUuid===url.searchParams.get('patient')):[a,b]);
    if(p==='vinshc/visits/'+a.uuid)return send(expired?{error:'unauthorized'}:a,expired?401:200);
    if(p==='vinshc/visits/'+b.uuid)return send(b);
    if(p==='vinshc/vitals')return list([{measuredAt:'2026-10-15T08:30:00Z',values:{'vitals.mach':url.searchParams.get('patient')===a.patientUuid?82:96}}]);
    if(p.endsWith('/clinical-summary')) {
     assert.ok(p.includes(id(4))||p.includes(id(8)),'Never read another doctor encounter');
     const person=p.includes(id(4))?a:b;
     const summary={patientUuid:person.patientUuid,visitUuid:person.uuid,encounterUuid:person.encounters.at(-1).uuid,status:'draft',consultation:saved&&person===a?{groupUuid:id(11),values:saved}:null,diagnoses:[],drugOrders:[{uuid:id(14),drug:{name:'Thuốc kiểm thử'},quantity:14}]};
     if(delay&&person===a){held=()=>send(summary);return;}
     return send(summary);
    }
    if(p.includes('/documents/prescription/'))return send({documentType:'Đơn thuốc kiểm thử',quantity:14});
    if(p==='vinshc/consultation') {
     const body=req.postDataJSON();assert.equal(body.patient,a.patientUuid);assert.equal(body.encounter,id(4));
     saved=body.values;return send({groupUuid:id(11),values:saved,patientUuid:a.patientUuid,encounterUuid:id(4),visitUuid:a.uuid});
    }
    if(p==='vinshc/operations/service-orders')return list([{uuid:id(12),patientUuid:a.patientUuid,visitUuid:a.uuid,serviceName:'Siêu âm',state:'completed',results:[{result_uuid:id(13),state:'final'}]}]);
    if(p==='vinshc/operations/results/'+id(13))return send({textValue:'Nội dung kết quả đã xác nhận',state:'final'});
    if(p==='vinshc/staff/users')return list([{uuid:id(10),username:'qa',display:'Nhân viên QA',roles:['admin']}]);
    if(p.includes('/reports/'))return send({grossVnd:100000,netVnd:100000,openedVisits:2});
    if(p==='vinshc/address-catalogue')return send([{code:'01',name:'Hà Nội'}]);
    if(p==='vinshc/configuration-status')return send({catalogueVersion:'QA'});
    return list([]);
   });
   const login=async next=>{
    if(await page.locator('#logout').count())await page.locator('#logout').click();
    role=next;
    await page.locator('#loginForm [name=username]').fill('qa');
    await page.locator('#loginForm [name=password]').fill('test-only');
    await page.locator('#loginForm button').click();
    try { await page.locator('.session-identity').waitFor(); } catch(e) { throw new Error(e.message + '\nBrowser errors: ' + errors.join(' | ') + '\n' + await page.locator('body').innerText()); }
   };
   const pick=async name=>{
    if(width===390&&await page.locator('[data-doctor-clear]').count())await page.locator('[data-doctor-clear]').click();
    await page.getByRole('button',{name,exact:true}).click();
   };
   const tab=key=>page.locator(`[data-doctor-tab=${key}]`).click();
   await page.goto(base+'/connected.html');await login('doctor');
   await page.getByRole('button',{name:'Nguyễn An',exact:true}).waitFor();
   assert.equal(writes.length,0);assert.equal(await page.locator('#actionPicker,.role-guide,.page-help,#careContextForm').count(),0);
   await pick('Nguyễn An');await page.locator('[data-doctor-action=consultation]').waitFor();
   await page.locator('[data-doctor-action=consultation]').click();
   assert.equal(await page.locator('[name=patient]').inputValue(),a.patientUuid);
   assert.equal(await page.locator('[name=encounter]').inputValue(),id(4));
   assert.equal(await page.locator('.doctor-profile-column #actionForm').count(),1);
   await page.locator('[name="visit.ly_do_kham"]').fill('Bản nháp của An');
   await tab('vitals');assert.match(await page.locator('#doctorTabContent').innerText(),/82/);
   assert.doesNotMatch(await page.locator('#doctorTabContent').innerText(),/vitals\.|\[object Object\]/);
   await tab('consultation');await page.locator('[data-doctor-action=consultation]').click();
   assert.equal(await page.locator('[name="visit.ly_do_kham"]').inputValue(),'Bản nháp của An');
   await page.locator('[name="history.tien_su_ban_than_trang_thai"]').selectOption('not_asked');
   await page.locator('[name="history.tien_su_gia_dinh_trang_thai"]').selectOption('not_asked');
   await page.locator('[name="allergy.trang_thai"]').selectOption('unknown');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Doctor form overflows');
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(os.tmpdir(),`vinshc-role-home-doctor-${width}.png`),fullPage:true});
   await page.locator('#actionForm button.primary').click();
   await page.getByText('Bản nháp của An',{exact:true}).waitFor();assert.equal(writes.length,1);
   await page.locator('.doctor-visit-actions > summary').click();
   await page.locator('[data-task-action=closeVisit]').click();
   assert.equal(await page.locator('.doctor-profile-column #actionForm [name=visit]').inputValue(),a.uuid);
   await page.locator('#closeTaskForm').click();
   await tab('orders');await page.locator('[data-doctor-result]').click();
   await page.getByText('Nội dung kết quả đã xác nhận',{exact:false}).waitFor();
   await tab('clinical');await page.locator('[data-doctor-print]').click();
   await page.locator('#backendResult').filter({hasText:'Đơn thuốc kiểm thử'}).waitFor();
   assert.equal(await page.locator('#printDocument').count(),1);
   await page.locator('[data-section=visits]').click();
   await pick('Nguyễn Bình');await page.locator('[data-doctor-action=consultation]').waitFor();
   await page.locator('[data-doctor-action=consultation]').click();
   assert.equal(await page.locator('[name="visit.ly_do_kham"]').inputValue(),'');
   assert.equal(await page.locator('[name=encounter]').inputValue(),id(8));
   // A delayed read must not repopulate a different patient's chart.
   delay=true;await pick('Nguyễn An');
   for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,10));
   assert.ok(held);await pick('Nguyễn Bình');await page.locator('[data-doctor-action=consultation]').waitFor();
   await held();delay=false;
   await tab('vitals');assert.match(await page.locator('#doctorTabContent').innerText(),/96/);
   assert.doesNotMatch(await page.locator('#doctorTabContent').innerText(),/Bản nháp của An/);
   const homes={reception:'patients',nurse:'visits',lab:'orders',cashier:'billing',pharmacy:'pharmacy',manager:'reports',admin:'admin'};
   for(const [next,home]of Object.entries(homes)) {
    await login(next);await page.locator(`[data-section=${home}][aria-current=page]`).waitFor();
    assert.equal(await page.locator('.role-guide,.page-help,#actionPicker,#careContextForm').count(),0,next);
    if(next==='manager'){await page.getByText('Thu ròng',{exact:true}).waitFor();assert.equal(await page.locator('.selected-patient').count(),0);}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,next+' overflow');
    await page.screenshot({path:path.join(os.tmpdir(),`vinshc-role-home-${next}-${width}.png`),fullPage:true});
   }
   await login('doctor');expired=true;await pick('Nguyễn An');await page.locator('#loginForm').waitFor();
   assert.equal(await page.locator('.session-identity,.doctor-workspace').count(),0,'401 clears the chart and session immediately');
   assert.equal(writes.length,1,'Only the explicitly submitted consultation writes data');
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: 8 role homes, doctor inline form, provider ownership, draft isolation, vitals, real-shaped results, stale-read isolation; no navigation writes.`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
