// Product-level navigation and terminology checks. All service requests are intercepted.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const permissions = require('../../packages/core/metadata/permissions.json');
const map = require('../../packages/core/metadata/frontend-map.json');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const patient = '11111111-1111-4111-8111-111111111111';
const location = map.entities['location.development.clinic'];
const firstSection = {reception:'patients', nurse:'visits', doctor:'visits', lab:'orders', cashier:'billing', pharmacy:'pharmacy', manager:'reports', admin:'admin'};

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport:{width,height:960},timezoneId:'Asia/Ho_Chi_Minh'});
      const errors=[],requests=[];
      let role='reception';
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/**', async route => {
        const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
        const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
        if(url.pathname.endsWith('/session'))return send({authenticated:true,user:{uuid:patient,display:'Nhân viên kiểm thử',roles:[{name:'VinSHC App: '+role},...(role==='admin'?[{name:'System Developer'}]:[])]}});
        if(url.pathname.endsWith('/authorization/workspaces'))return send([{role,facilityUuid:location,facilityName:'VinSHC Development Clinic'}]);
        assert.equal(request.headers()['x-vinshc-workspace-role'],role);
        assert.equal(request.headers()['x-vinshc-workspace-facility'],location);
        if(url.pathname.endsWith('/authorization/workspace'))return send({role,facilityUuid:location});
        if(url.pathname.endsWith('/providers/me'))return send({providers:[{uuid:patient,name:'Nhân viên kiểm thử'}]});
        if(url.pathname.endsWith('/vinshc/patients'))return send({results:[{uuid:patient,fullName:'Nguyễn Thị Bình',identifier:'VSHC-00000042',gender:'F',birthdate:'1990-01-01'}],hasMore:false});
        return send({results:[],hasMore:false});
      });
      await page.goto(base+'/connected.html');
      assert.doesNotMatch(await page.locator('body').innerText(), /OpenMRS|UUID|backend|metadata|API/);
      await page.screenshot({path:path.join(os.tmpdir(),`vinshc-redesign-login-${width}.png`),fullPage:true});
      let loggedIn=false;
      const loginAs=async next=>{
        if(loggedIn){await page.locator('#logout').click();await page.locator('#loginForm').waitFor();}
        role=next;
        await page.locator('[name=username]').fill('qa');
        await page.locator('[name=password]').fill('qa-only');
        await page.locator('#loginForm button').click();
        await page.locator('[data-section=overview]').waitFor();
        loggedIn=true;
      };
      for (const next of Object.keys(permissions.roles)) {
        await loginAs(next);
        assert.match(await page.locator('.session-identity').innerText(),new RegExp(permissions.roles[role].label));
        assert.equal(await page.locator('.clinic-sidebar .sidebar-label').count(),0);
        assert.doesNotMatch(await page.locator('body').innerText(),/OpenMRS|UUID|Đã nối API|backend|workspace/);
        if(role==='admin'||role==='reception')await page.screenshot({path:path.join(os.tmpdir(),`vinshc-redesign-${role}-${width}.png`),fullPage:true});
        await page.locator(`[data-section=${firstSection[role]}]`).click();
        await page.locator('#actionPicker').waitFor({state:'attached'});
        assert.equal(await page.locator('#actionForm').count(),0,'Selecting a menu opens a list, not an arbitrary form');
        if(role==='reception') {
          await page.locator('[data-worklist-row=patients]').waitFor();
          assert.doesNotMatch(await page.locator('[data-worklist-row=patients]').innerText(),/11111111-1111|UUID/);
          await page.screenshot({path:path.join(os.tmpdir(),`vinshc-redesign-patients-${width}.png`),fullPage:true});
          await page.locator('[data-go-action=registerPatient]').click();
          await page.locator('#actionForm').waitFor();
          await page.locator('#closeTaskForm').click();
          assert.equal(await page.locator('#actionForm').count(),0);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No page overflow');
      }
      assert.deepEqual(errors,[]);
      assert.ok(requests.length>0 && requests.every(p=>p.startsWith('/api/')));
      await page.locator('#logout').click();
      loggedIn=false;
      await page.locator('#loginForm').waitFor();
      // An unavailable service must leave the user on the real login form, with a clear message.
      await page.unroute('**/api/**');
      await page.route('**/api/**',route=>route.abort('failed'));
      await page.locator('[name=username]').fill('qa');
      await page.locator('[name=password]').fill('qa-only');
      await page.locator('#loginForm button').click();
      await page.getByRole('alert').filter({hasText:'Chưa kết nối được dịch vụ phòng khám'}).waitFor();
      assert.equal(await page.locator('#workspaceForm').count(),0);
      await page.close();
    }
    console.log('PASS: 8 roles on desktop/mobile, service-neutral login and navigation, list before task, close form, hidden internal row IDs, unavailable service has no fake login. Mocked only.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
