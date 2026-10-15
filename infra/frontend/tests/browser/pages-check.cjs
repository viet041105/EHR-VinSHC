// Walk every permitted staff page and form. All requests are intercepted; no real DB is used.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path'), os = require('node:os');
const permissions = require('../../packages/core/metadata/permissions.json');
const map = require('../../packages/core/metadata/frontend-map.json');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const id='11111111-1111-4111-8111-111111111111', location=map.entities['location.development.clinic'];
const first={reception:'patients',nurse:'visits',doctor:'visits',lab:'orders',cashier:'billing',pharmacy:'pharmacy',manager:'reports',admin:'admin'};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:960},timezoneId:'Asia/Ho_Chi_Minh'});
   page.setDefaultTimeout(12000);
   let role='reception', writes=0, forms=0, pages=0;
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',route=>{
    const req=route.request(),url=new URL(req.url());
    const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(req.method()!=='GET')writes++;
    if(url.pathname.endsWith('/session'))return send({authenticated:true,user:{uuid:id,display:'Nhân viên kiểm thử',roles:[{name:'VinSHC App: '+role},...(role==='admin'?[{name:'System Developer'}]:[])]}});
    if(url.pathname.endsWith('/authorization/workspaces'))return send([{role,facilityUuid:location,facilityName:'VinSHC Development Clinic'}]);
    assert.equal(req.headers()['x-vinshc-workspace-role'],role);
    if(url.pathname.endsWith('/authorization/workspace'))return send({role,facilityUuid:location});
    if(url.pathname.endsWith('/providers/me'))return send({providers:[{uuid:id}]});
    if(url.pathname.endsWith('/address-catalogue'))return send([{code:'01',name:'Hà Nội'}]);
    if(url.pathname.endsWith('/configuration-status'))return send({catalogueVersion:'QA'});
    if(url.pathname.endsWith('/staff/users'))return send({results:[{uuid:id,username:'qa',display:'Nhân viên kiểm thử',roles:['admin'],workspace:{facilityUuid:location,facilityName:'VinSHC Development Clinic'}}],hasMore:false});
    return send({results:[],hasMore:false});
   });
   await page.goto(base+'/connected.html');
   const login=async next=>{
    if(await page.locator('#logout').count())await page.locator('#logout').click();
    role=next;await page.locator('#loginForm [name=username]').fill('qa');await page.locator('#loginForm [name=password]').fill('qa-only');
    await page.locator('#loginForm button').click();await page.locator('[data-section=overview]').waitFor();
   };
   for(const next of Object.keys(permissions.roles)) {
    await login(next);
    const nav=await page.locator('[data-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.section));
    for(const section of nav) {
     await page.locator(`[data-section=${section}]`).click();pages++;
     assert.equal(await page.locator('.page-help,.role-guide,#actionPicker,#careContextForm').count(),0);
     if(section==='overview')continue;
     const options=await page.locator('[data-task-action]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.taskAction))]);
     for(const action of options) {
      const button=page.locator(`[data-task-action=${action}]`).first();
      for(const detail of await button.locator('xpath=ancestor::details').all())await detail.evaluate(n=>n.open=true);
      await button.click();forms++;
      await page.locator('#actionForm').waitFor();
      assert.equal(await page.locator('#actionForm input:not([type=hidden])[pattern]').count(),0,'No UUID entry field in the normal form');
      assert.equal(await page.locator('#actionForm button.primary').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${role}/${section}/${action} overflows`);
      assert.doesNotMatch(await page.locator('#main-content').innerText(),new RegExp(id));
     }
     if(options.length)await page.locator('#closeTaskForm').click();
    }
    await page.locator(`[data-section=${first[role]}]`).click();
    await page.screenshot({path:path.join(os.tmpdir(),`vinshc-pages-${role}-${width}.png`),fullPage:true});
   }
   // A staff creation draft (including the temporary password) must not survive a new session.
   await page.locator('[data-section=admin]').click();
   await page.locator('[data-admin=create]').click();
   await page.locator('#adminCreateForm [name=familyName]').fill('Dữ liệu riêng của phiên trước');
   await login('admin');await page.locator('[data-section=admin]').click();
   await page.locator('[data-admin=create]').waitFor();
   assert.equal(await page.locator('#adminCreateForm').count(),0);
   assert.doesNotMatch(await page.locator('#adminConsole').innerText(),/Dữ liệu riêng của phiên trước/);
   assert.equal(writes,0,'Browsing pages must never write business data');
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px — all 8 roles, ${pages} permitted pages, ${forms} forms; task groups, mobile layout, no navigation writes, admin session reset.`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
