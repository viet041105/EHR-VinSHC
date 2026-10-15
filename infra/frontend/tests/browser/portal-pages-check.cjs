// Published-record UI and stale-response isolation, using independent account fixtures only.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path'), os = require('node:os');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
const ids={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222'};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:960},timezoneId:'Asia/Ho_Chi_Minh'});
   page.setDefaultTimeout(10000);
   let account='A',hold=false,release,deny=false,reads=0,passwordWrites=0;
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',async route=>{
    const p=new URL(route.request().url()).pathname,owner=account;
    const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(p.endsWith('/session'))return send({authenticated:true,user:{uuid:ids[owner],display:'Người bệnh '+owner,roles:[{name:'VinSHC Portal: patient'}]}});
    if(p.endsWith('/portal/me'))return send({persona:'patient',patientUuid:ids[owner],linkStatus:'active'});
    if(p.endsWith('/portal/visits'))return send({results:[{uuid:ids[owner],startDatetime:'2026-10-15T09:00:00+07:00',facilityName:'Phòng khám kiểm thử',version:1,publishedAt:'2026-10-15T10:00:00+07:00'}],hasMore:false});
    if(p.endsWith('/instructions')) {
     reads++;if(hold&&owner==='A')await new Promise(resolve=>release=resolve);
     if(deny)return send({error:'forbidden'},403);
     return send({items:[{label:'Lời dặn',text:'Nội dung riêng của '+owner}]});
    }
    if(p.endsWith('/prescriptions'))return send({results:[{drugName:'Thuốc trong hồ sơ '+owner,dose:1,doseUnits:'viên',frequency:'Một lần/ngày',instructions:'Hướng dẫn đã công bố',status:'active'}]});
    if(p.endsWith('/results'))return send({results:[{serviceName:'Kết quả đã duyệt '+owner,textValue:'Nội dung kết quả đã công bố',state:'final',version:1}]});
    if(p.endsWith('/portal/password')){passwordWrites++;const body=route.request().postDataJSON();assert.equal(body.newPassword,'New-qa-password-42');assert.equal(Object.hasOwn(body,'confirmPassword'),false);return send({changed:true});}
    return send({results:[]});
   });
   const login=async who=>{
    account=who;await page.locator('#portalLogin [name=username]').fill('qa-'+who);await page.locator('#portalLogin [name=password]').fill('qa-only');await page.locator('#portalLogin button').click();await page.locator('#portalVisit').waitFor();
   };
   await page.goto(base+'/portal.html');
   await page.locator('#portalShowPassword').check();assert.equal(await page.locator('[name=password]').getAttribute('type'),'text');
   await login('A');await page.locator('#portalRead').click();await page.getByText('Nội dung riêng của A',{exact:true}).waitFor();
   await page.locator('[data-portal-tab=prescriptions]').click();await page.getByText('Thuốc trong hồ sơ A',{exact:true}).waitFor();
   await page.locator('[data-portal-tab=results]').click();await page.getByText('Kết quả đã duyệt A',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(os.tmpdir(),`vinshc-portal-pages-${width}.png`),fullPage:true});
   // An older read must never repaint the new account, even after logout and another login.
   hold=true;await page.locator('#portalRead').click();
   await page.waitForFunction(()=>document.querySelector('#portalRead')?.disabled===true);
   for(let retry=0;!release&&retry<100;retry++)await new Promise(resolve=>setTimeout(resolve,10));
   assert.ok(release);
   await page.locator('#portalLogout').click();await login('B');hold=false;release();
   await page.locator('#portalRead').click();await page.getByText('Nội dung riêng của B',{exact:true}).waitFor();
   assert.equal(await page.getByText('Nội dung riêng của A',{exact:true}).count(),0);
   assert.equal(await page.locator('#portalVisit').inputValue(),ids.B);
   await page.locator('.portal-password > summary').click();
   await page.locator('[name=currentPassword]').fill('qa-old-password');await page.locator('[name=newPassword]').fill('New-qa-password-42');await page.locator('[name=confirmPassword]').fill('Different-password-42');
   await page.locator('#portalPassword button').click();await page.getByRole('alert').filter({hasText:'chưa khớp'}).waitFor();assert.equal(passwordWrites,0);
   await page.locator('[name=confirmPassword]').fill('New-qa-password-42');await page.locator('#portalPassword button').click();await page.locator('#portalLogin').waitFor();await page.getByRole('status').filter({hasText:'Đã đổi mật khẩu'}).waitFor();assert.equal(passwordWrites,1);
   await login('B');deny=true;await page.locator('#portalRead').click();await page.locator('#portalLogin').waitFor();
   assert.equal(await page.locator('#patientChat').count(),0);assert.equal(await page.getByText('Nội dung riêng của B',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('Nội dung riêng')),false);
   assert.ok(reads>=4);assert.deepEqual(errors,[]);
   await page.close();console.log(`PASS: ${width}px patient portal — published tabs, password confirmation, account isolation during delayed reads, revoked access, no persistence.`);
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
