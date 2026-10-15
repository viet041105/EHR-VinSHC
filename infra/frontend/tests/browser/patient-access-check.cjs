// All writes below are intercepted fixtures. Never seed accounts, requests or notices in the real DB.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const map=require('../../packages/core/metadata/frontend-map.json');
const path=require('node:path'),os=require('node:os');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const facility=map.entities['location.development.clinic'];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);
  let role='doctor',available=false,capable=true,read=false,held=null,hold=false,created=false;
  const writes=[],errors=[];
  const visit={uuid:id(1),patientUuid:id(2),visitCode:'LK-QA',status:'open',patient:{fullName:'Người bệnh kiểm thử',identifier:'QA-1'},encounters:[{uuid:id(3),encounterType:{key:'consultation'},providers:[{uuid:id(5)}]}]};
  let request={uuid:id(20),type:'patient_account_create',status:'pending',patientUuid:id(2),patientName:'Người bệnh kiểm thử',visitUuid:id(1),requesterName:'Bác sĩ kiểm thử',createdAt:'2026-10-16T02:00:00Z'};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname.replace('/api/',''),method=req.method();
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   const list=results=>send({results,hasMore:false});
   if(method!=='GET')writes.push({p,body:req.postDataJSON()});
   if(p==='session')return send({authenticated:true,user:{uuid:id(10),display:'Tài khoản '+role,roles:[{name:role==='patient'?'VinSHC Portal: patient':'VinSHC App: '+role},...(role==='admin'?[{name:'System Developer'}]:[])]}});
   if(p==='vinshc/authorization/workspaces')return send([{role,facilityUuid:facility,facilityName:'Phòng khám kiểm thử'}]);
   if(p==='vinshc/authorization/workspace')return send({role,facilityUuid:facility});
   if(p==='vinshc/providers/me')return send({providers:[{uuid:id(5)}]});
   if(p==='vinshc/visits')return list([visit]);
   if(p==='vinshc/visits/'+id(1))return send(visit);
   if(p.endsWith('/clinical-summary'))return send({status:'draft',patientUuid:id(2),visitUuid:id(1),encounterUuid:id(3),diagnoses:[],drugOrders:[]});
   if(p.startsWith('vinshc/patient-access/requests')){
    if(!available)return send({error:'missing'},404);
    if(method==='GET'&&p.endsWith('/requests'))return send({results:(role==='admin'||created)&&(!u.searchParams.get('status')||u.searchParams.get('status')===request.status)?[request]:[],hasMore:false,capabilities:{request:capable,fulfill:capable,reject:capable}});
    if(method==='GET')return send(request);
    const d=req.postDataJSON();
    if(p.endsWith('/requests')){
     assert.equal(d.patientUuid,visit.patientUuid);assert.equal(d.visitUuid,visit.uuid);assert.ok(d.idempotencyKey);
     created=true;request={...request,type:d.type,note:d.note};return send(request,201);
    }
    if(p.endsWith('/fulfill')){assert.equal(d.verificationMethod,'verified_clinic_record');assert.ok(d.idempotencyKey);request={...request,status:'fulfilled',username:d.username||'qa.patient'};return send(request);}
    if(p.endsWith('/reject')){request={...request,status:'rejected',reason:d.reason};return send(request);}
   }
   if(p.startsWith('vinshc/notifications')){
    if(!available)return send({error:'missing'},role==='patient'?403:404);
    if(method==='POST'){read=true;return send({read:true});}
    const persona=role;
    const body={results:[{uuid:id(30),title:persona==='admin'?'Yêu cầu cấp tài khoản':'Thông báo '+persona,message:'Có công việc mới',createdAt:'2026-10-16T02:00:00Z',readAt:read?'2026-10-16T02:01:00Z':null,target:persona==='admin'?{kind:'patient_access_request',requestUuid:id(20)}:{kind:persona==='patient'?'portal_visit':'visit',visitUuid:id(1)}},{uuid:id(31),title:'Liên kết không hợp lệ',readAt:'2026-10-16T02:01:00Z',target:{kind:'url',href:'https://example.com'}}],unreadCount:read?0:1,hasMore:false};
    if(hold&&persona==='doctor'){held=()=>send(body);return;}
    return send(body);
   }
   if(p==='vinshc/portal/me')return send({persona:'patient',patientUuid:id(2),linkStatus:'active'});
   if(p==='vinshc/portal/visits')return list([{uuid:id(1),facilityName:'Phòng khám kiểm thử'}]);
   if(p==='vinshc/portal/visits/'+id(1))return send({uuid:id(1),facilityName:'Phòng khám kiểm thử'});
   if(p.endsWith('/instructions'))return send({items:[{text:'Lời dặn đã công bố'}]});
   if(p==='vinshc/staff/users')return list([]);
   return list([]);
  });
  const login=async persona=>{
   role=persona;
   await page.locator('#loginForm [name=username]').fill('qa');await page.locator('#loginForm [name=password]').fill('fixture-only');await page.locator('#loginForm button').click();await page.locator('.session-identity').waitFor();
  };
  await page.goto(base+'/connected.html');
  assert.equal(await page.locator('.login-personas a').getAttribute('href'),'/portal.html');
  await login('doctor');await page.getByRole('button',{name:'Người bệnh kiểm thử',exact:true}).click();
  await page.locator('[data-doctor-patient-access]').click();
  await page.getByText(/Chờ kết nối máy chủ.*Backend chưa hỗ trợ/).waitFor();
  assert.equal(await page.locator('#patientAccessRequest button[type=submit]').isDisabled(),true);
  await page.locator('[data-access-type]').click();assert.equal(await page.locator('#patientAccessRequest [name=type]').inputValue(),'patient_password_reset');await page.locator('#patientAccessRequest [name=note]').fill('Cần hỗ trợ đăng nhập');
  assert.equal(writes.length,0);
  await page.locator('[data-access-close]').click();await page.locator('[data-bell-toggle]').click();
  await page.getByText(/Chờ kết nối máy chủ.*thông báo/).waitFor();assert.equal(await page.locator('.bell-badge').count(),0);await page.keyboard.press('Escape');
  assert.equal(await page.locator('.notification-popover').count(),0);
  available=true;
  await page.locator('[data-doctor-patient-access]').click();await page.locator('[data-access-retry]').click();
  await page.waitForFunction(()=>!document.querySelector('#patientAccessRequest button[type=submit]').disabled);
  await page.locator('#patientAccessRequest [name=note]').fill('Nhờ tạo tài khoản cho hồ sơ đã tiếp nhận');await page.locator('#patientAccessRequest button[type=submit]').click();
  await page.getByText(/Đã gửi yêu cầu đến quản trị/).waitFor();assert.equal(writes.length,1);
  await page.locator('[data-access-close]').click();await page.locator('[data-doctor-patient-access]').click();await page.getByText('Đã có yêu cầu đang chờ quản trị xử lý.',{exact:true}).waitFor();assert.equal(await page.locator('#patientAccessRequest button[type=submit]').count(),0);assert.equal(writes.length,1);
  await page.locator('[data-access-close]').click();
  await page.locator('[data-bell-toggle]').click();await page.getByText('Thông báo doctor',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-bell-open]').count(),1,'Arbitrary target URL never creates a link');
  assert.equal(await page.locator('.bell-badge').innerText(),'1');assert.equal(writes.length,1);
  await page.locator('[data-bell-read]').click();await page.waitForFunction(()=>!document.querySelector('.bell-badge'));assert.equal(writes.length,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(os.tmpdir(),`vinshc-notifications-${width}.png`),fullPage:true});
  await page.keyboard.press('Escape');await page.locator('#logout').click();await login('admin');
  await page.locator('[data-admin-tab=patientAccess]').click();await page.locator('[data-access-select]').click();
  await page.locator('#accessFulfill [name=username]').fill('qa.patient');await page.locator('#accessFulfill [name=password]').fill('Private-fixture-42');await page.locator('#accessFulfill [name=confirmation]').fill('Private-fixture-42');
  assert.equal(await page.locator('#accessFulfill button').isEnabled(),true);
  // Confirmation stays inside the create form, without a separate identity-verification page.
  assert.equal(await page.locator('#accessFulfill [name=verificationMethod]').count(),0);await page.locator('#accessFulfill button').click();assert.equal(writes.length,2);
  await page.locator('#accessFulfill [name=patientConfirmed]').check();await page.locator('#accessFulfill button').click();
  await page.getByText(/Đã tạo tài khoản qa.patient/).waitFor();assert.equal(writes.length,3);
  assert.equal(await page.locator('body').innerText().then(t=>t.includes('Private-fixture-42')),false);
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('Private-fixture-42')),false);
  // Explicit capability refusal must keep writes unavailable even when GET works.
  request={...request,status:'pending'};capable=false;await page.locator('[data-access-refresh]').click();await page.locator('[data-access-select]').click();assert.equal(await page.locator('#accessFulfill button').isDisabled(),true);
  available=false;await page.locator('[data-access-refresh]').click();await page.getByText(/Chờ kết nối máy chủ.*Backend chưa hỗ trợ/).waitFor();
  assert.equal(await page.locator('#accessFulfill').count(),0);
  await page.screenshot({path:path.join(os.tmpdir(),`vinshc-access-inbox-${width}.png`),fullPage:true});
  await page.locator('#logout').click();available=true;hold=true;await login('doctor');
  for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,10));assert.ok(held);
  await page.locator('#logout').click();hold=false;await login('admin');await held();
  await page.locator('[data-bell-toggle]').click();await page.getByText('Yêu cầu cấp tài khoản',{exact:true}).waitFor();
  assert.equal(await page.getByText('Thông báo doctor',{exact:true}).count(),0,'Late response from another login must be discarded');
  await page.locator('[data-bell-open]').click();await page.locator('[data-admin-tab=patientAccess][aria-selected=true]').waitFor();await page.locator('.access-request-detail').waitFor();
  assert.equal(writes.length,3,'Opening a notification never submits a business action');
  await page.goto(base+'/portal.html');role='patient';await page.locator('#portalLogin [name=username]').fill('qa.patient');await page.locator('#portalLogin [name=password]').fill('fixture-only');await page.locator('#portalLogin button').click();
  await page.locator('#portalNotifications [data-bell-toggle]').click();await page.getByText('Thông báo patient',{exact:true}).waitFor();
  await page.locator('[data-bell-open]').click();await page.getByText('Lời dặn đã công bố',{exact:true}).waitFor();
  available=false;await page.locator('[data-bell-toggle]').click();await page.locator('#portalLogin').waitFor();
  assert.equal(await page.locator('#portalLogout,.notification-bell').count(),0,'A previously working notification API denying portal access must clear the patient session');
  assert.equal(writes.length,3);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: patient entry, missing API locks, doctor request, admin verified fulfillment, capabilities, bell/read/targets, account isolation, patient portal. All API writes mocked.`);
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
