// Reception tasks use real contract shapes (including SQL projections), with isolated API mocks.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const map=require('../../packages/core/metadata/frontend-map.json');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const patient=uuid(1),contact=uuid(2),address=uuid(3),provider=uuid(4),appointment=uuid(5),location=map.entities['location.development.clinic'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:960},timezoneId:'Asia/Ho_Chi_Minh'});
   const person={uuid:patient,fullName:'Người bệnh kiểm thử',identifier:'VSHC-QA-42'};
   const data={patientUuid:patient,contacts:[{row_key:contact,full_name:'Người thân kiểm thử',relationship_name:'Cha',phone_raw:'0900000000',version_number:1,is_current:true}],addresses:[{row_key:address,address_text:'Địa chỉ kiểm thử',province_name:'Hà Nội',version_number:1,is_current:true}],fieldStates:[]};
   const scheduled={uuid:appointment,patientUuid:patient,patientName:person.fullName,providerUuid:provider,providerName:'Bác sĩ kiểm thử',status:'booked',startAt:new Date(Date.now()+86400000).toISOString(),endAt:new Date(Date.now()+87600000).toISOString()};
   let edited=false,booked=false,confirmed=false;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',route=>{
    const req=route.request(),p=new URL(req.url()).pathname,body=req.method()==='POST'?req.postDataJSON():null;
    const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(p.endsWith('/session'))return send({authenticated:true,user:{uuid:uuid(9),display:'Tiếp đón kiểm thử',roles:[{name:'VinSHC App: reception'}]}});
    if(p.endsWith('/authorization/workspaces'))return send([{role:'reception',facilityUuid:location,facilityName:'VinSHC Development Clinic'}]);
    if(p.endsWith('/authorization/workspace'))return send({role:'reception',facilityUuid:location});
    if(p.endsWith('/vinshc/patients'))return send({results:[person],hasMore:false});
    if(p.endsWith('/identity/'+patient))return send(data);
    if(p.endsWith('/contact/'+contact)) {assert.equal(body.phone,'0900000001');assert.equal(body.fullName,undefined,'An omitted field must stay omitted');edited=true;data.contacts[0].phone_raw=body.phone;data.contacts[0].version_number=2;return send(data.contacts[0]);}
    if(p.endsWith('/operations/appointments')) {
     if(body){assert.equal(body.patient,patient);assert.equal(body.provider,provider);assert.equal(Date.parse(body.endAt)-Date.parse(body.startAt),20*60000);assert.ok(body.idempotencyKey);booked=true;return send({...scheduled,uuid:uuid(6)});}
     return send({results:[scheduled],hasMore:false});
    }
    if(p.endsWith('/appointments/'+appointment+'/transition')) {assert.equal(body.status,'confirmed');scheduled.status='confirmed';confirmed=true;return send(scheduled);}
    return send({results:[],hasMore:false});
   });
   await page.goto(base+'/connected.html');await page.locator('[name=username]').fill('qa');await page.locator('[name=password]').fill('qa-only');await page.locator('#loginForm button').click();
   await page.locator('[data-section=patients]').click();await page.locator('[data-worklist-row=patients]').locator('.worklist-record-link').click();
   await page.locator('[data-section=identity]').click();await page.locator('[data-task-action=identity]').click();await page.locator('#actionForm button.primary').click();
   await page.getByText('Người thân kiểm thử',{exact:true}).first().waitFor();
   await page.locator('[data-identity-action=updateContact]').click();
   assert.equal(await page.locator('#actionForm [name=record]').inputValue(),contact);
   await page.locator('#actionForm [name=phone]').fill('0900000001');await page.locator('#actionForm button.primary').click();
   await page.locator('[data-next-step]').filter({hasText:'thông tin hành chính'}).click();await page.locator('#actionForm button.primary').click();
   await page.locator('.identity-card').filter({hasText:'0900000001'}).waitFor();assert.ok(edited);
   await page.locator('[data-section=patients]').click();await page.locator('[data-worklist-row=patients] .row-more > summary').click();await page.locator('[data-worklist-row=patients]').getByRole('button',{name:'Sửa hành chính',exact:true}).click();
   assert.equal(await page.locator('#actionForm [name=cccd]').getAttribute('required'),null,'Updating a profile must not require entering the ID document again');
   await page.locator('[data-section=appointments]').click();await page.locator('[data-worklist-row=appointments]').getByRole('button',{name:'Xác nhận lịch',exact:true}).click();await page.locator('#actionForm button.primary').click();await page.locator('#connectionMessage').filter({hasText:'lưu'}).waitFor();assert.ok(confirmed);
   await page.locator('[data-task-action=book]').click();
   const picker=page.locator('#actionForm select[name=provider]');await picker.selectOption(provider);
   await page.locator('#actionForm [name=service]').selectOption({index:1});await page.locator('#actionForm [name=appointmentType]').selectOption({index:1});
   const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
   await page.locator('#actionForm [name=startAt]').fill(tomorrow+'T14:00');await page.locator('#actionForm [name=startAt]').dispatchEvent('change');
   await page.locator('#actionForm button.primary').click();await page.locator('#connectionMessage').filter({hasText:'lưu'}).waitFor();assert.ok(booked);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   await page.close();console.log(`PASS: ${width}px reception administration — named contact editing, PATCH omission, optional ID on update, appointment confirmation, known provider selection and 20-minute slot.`);
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
