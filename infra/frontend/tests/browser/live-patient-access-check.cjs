// Forward API calls to the isolated Docker test backend. No mock response and no writes to port 8080.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
const backend=process.env.VINSHC_PATIENT_ACCESS_TEST_BASE;
assert.equal(backend,'http://127.0.0.1:17888','Refuse non-test backend');
const fixtures=JSON.parse(process.env.PA_TEST_FIXTURES||'[]');
const passwords=[process.env.PA_TEST_DOCTOR_PASSWORD,process.env.PA_TEST_ADMIN_PASSWORD,...fixtures.map(f=>f.password)].filter(Boolean);
(async()=>{
 const browser=await chromium.launch({headless:true});let debugPage,trace=[];
 try{for(const fixture of fixtures){
  const page=await browser.newPage({viewport:{width:fixture.width,height:1000},timezoneId:'Asia/Ho_Chi_Minh'});
  debugPage=page;trace=[];page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()),headers={...request.headers()};
   delete headers.cookie;delete headers.host;delete headers['content-length'];
   // A stateless proxy matches BackendClient's credentials:omit. Playwright route.fetch shares
   // a cookie jar that would otherwise keep the doctor's OpenMRS session during admin login.
   const response=await fetch(backend+path.pathname.replace(/^\/api(?=\/|$)/,'/openmrs/ws/rest/v1')+path.search,
    {method:request.method(),headers,body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer(),redirect:'manual'});
   const outputHeaders=Object.fromEntries(response.headers);delete outputHeaders['set-cookie'];delete outputHeaders['content-encoding'];delete outputHeaders['content-length'];
   trace.push(path.pathname+' '+response.status);await route.fulfill({status:response.status,headers:outputHeaders,body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(base+'/connected.html');
  const login=async(user,password)=>{await page.locator('#loginForm [name=username]').fill(user);await page.locator('#loginForm [name=password]').fill(password);await page.locator('#loginForm button').click();await page.locator('.session-identity').waitFor();await page.locator(`[data-section=${user===process.env.PA_TEST_ADMIN_USER?'admin':'visits'}][aria-current=page]`).waitFor();};
  await login(process.env.PA_TEST_DOCTOR_USER,process.env.PA_TEST_DOCTOR_PASSWORD);
  await page.getByRole('button',{name:fixture.patient.fullName,exact:true}).click();
  await page.locator('[data-doctor-patient-access]').click();
  await page.waitForFunction(()=>document.querySelector('#patientAccessRequest button[type=submit]')?.disabled===false);
  await page.locator('#patientAccessRequest button[type=submit]').click();
  await page.getByText(/Đã gửi yêu cầu đến quản trị/).waitFor();
  await page.locator('[data-access-close]').click();await page.locator('#logout').click();
  await login(process.env.PA_TEST_ADMIN_USER,process.env.PA_TEST_ADMIN_PASSWORD);
  await page.locator('[data-bell-toggle]').click();await page.locator('.notification-popover [data-bell-open]').first().click();
  await page.locator('.access-request-detail h3').waitFor();
  const title=await page.locator('.access-request-detail h3').innerText();
  for(const part of fixture.patient.fullName.split(/\s+/))assert.ok(title.includes(part),'Notification must open the correct patient request');
  await page.locator('#accessFulfill [name=username]').fill(fixture.username);
  await page.locator('#accessFulfill [name=password]').fill(fixture.password);await page.locator('#accessFulfill [name=confirmation]').fill(fixture.password);
  await page.locator('#accessFulfill [name=patientConfirmed]').check();await page.locator('#accessFulfill button').click();
  await page.getByText('Đã tạo tài khoản '+fixture.username+'. Bàn giao thông tin đăng nhập riêng cho người bệnh.',{exact:true}).waitFor();
  await page.locator('#logout').click();await page.goto(base+'/portal.html');
  await page.locator('#portalLogin [name=username]').fill(fixture.username);await page.locator('#portalLogin [name=password]').fill(fixture.password);await page.locator('#portalLogin button').click();
  await page.locator('#portalLogout').waitFor();await page.locator('[data-bell-toggle]').click();await page.getByText('Tài khoản đã được cấp',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('Browser-only-')),false);
  await page.locator('[data-bell-read]').click();await page.waitForFunction(()=>!document.querySelector('.bell-badge'));
  await page.keyboard.press('Escape');await page.locator('#portalLogout').click();assert.deepEqual(errors,[]);
  await page.close();console.log(`PASS real backend ${fixture.width}px: reception handoff fixture -> doctor request -> admin bell and account creation -> verified patient login and notification read.`);
 }}catch(error){error.message+='\nConsole: '+await debugPage?.locator('#adminConsole').innerText().catch(()=>'')+'\nError: '+await debugPage?.locator('#connectionError').innerText().catch(()=>'')+'\nAPI: '+trace.slice(-16).join(' | ');throw error;}finally{await browser.close();}
})().catch(error=>{let message=error.message;for(const password of passwords)message=message.replaceAll(password,'[redacted]');console.error(message);process.exit(1);});
