const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
const output=process.env.QA_OUTPUT_DIR||os.tmpdir();fs.mkdirSync(output,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:true});
 const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
 const animated=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 const animation=await animated.newPage();
 await animation.goto(base);await animation.waitForSelector('.health-services-grid');
 const reveal=animation.locator('.health-service').first();
 assert.equal(await reveal.evaluate(e=>e.classList.contains('scroll-reveal')),true);
 assert.equal(await reveal.evaluate(e=>e.classList.contains('is-revealed')),false);
 assert.deepEqual(await animation.locator('.health-service').evaluateAll(list=>list.map(e=>e.style.getPropertyValue('--reveal-delay'))),['0ms','80ms','160ms','240ms','320ms']);
 await reveal.scrollIntoViewIfNeeded();
 await animation.waitForFunction(()=>getComputedStyle(document.querySelector('.health-service')).opacity==='1');
 assert.equal(await reveal.evaluate(e=>e.classList.contains('is-revealed')),true);
 await animation.evaluate(()=>scrollTo(0,0));
 assert.equal(await reveal.evaluate(e=>e.classList.contains('is-revealed')),true);
 await animation.locator('.care-band button').focus();
 assert.equal(await animation.locator('.care-band').evaluate(e=>e.classList.contains('is-revealed')),true);
 await animated.close();

 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Ho_Chi_Minh',reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const screenshot=async name=>page.screenshot({path:path.join(output,`vinshc-${name}.png`),fullPage:true});
 const account=async role=>{
  if(await page.locator('#sessionDemo').count())await page.locator('#sessionDemo').click();else await page.locator('#headerPatients').click();
  await page.locator(`[data-session="demo-${role}"]`).click();
 };
 const navigate=async name=>page.locator(`.workspace-nav [data-page="${name}"]`).click();
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vinshc-demo-v2')));
 await page.goto(base);await page.waitForSelector('.health-hero');
 assert.equal(await page.locator('.scroll-reveal').count(),0);
 await page.evaluate(async()=>{await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
 assert.equal(await page.locator('.landing-content img').evaluateAll(images=>images.every(img=>img.naturalWidth>0&&new URL(img.src).pathname.startsWith('/assets/'))),true);
 await screenshot('landing-redesign');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await screenshot('landing-redesign-mobile');
 await page.setViewportSize({width:1440,height:1000});
 // Every role's published page renders and every mobile route remains reachable through the menu.
 for(const role of ['reception','nurse','doctor','cashier','lab','pharmacy','manager','admin']){
  await account(role);
  const pages=await page.locator('.workspace-nav [data-page]').evaluateAll(buttons=>buttons.map(b=>b.dataset.page));
  for(const route of pages){await navigate(route);assert.equal(await page.locator('.content').getAttribute('data-role'),role);assert.ok(await page.locator('.content h1').count());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,role+'/'+route);}
  await page.setViewportSize({width:390,height:844});
  for(const route of pages){await page.locator('#toggleMenu').click();assert.equal(await page.locator('#toggleMenu').getAttribute('aria-expanded'),'true');await navigate(route);assert.equal(await page.locator('#toggleMenu').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile '+role+'/'+route);}
  await page.setViewportSize({width:1440,height:1000});
 }
 await account('admin');await navigate('integration');assert.match(await page.locator('.content').innerText(),/Chờ DATA-02|Chờ metadata/);await screenshot('integration-redesign');
 // Store a follow-up date and print only after the doctor's saved exam is available.
 await account('doctor');await navigate('patients');await page.locator('[data-open="BN-000128"]').click();
 for(const [key,value] of Object.entries({history:'Bệnh sử giả',clinical:'Khám mô phỏng',diagnosis:'Chẩn đoán giả',plan:'Lời dặn mô phỏng',followupDate:'2030-10-09'}))await page.locator(`#examForm [name=${key}]`).fill(value);
 await page.locator('#addMed').click();
 for(const [key,value] of Object.entries({name:'Thuốc giả để kiểm thử',directions:'Hướng dẫn giả',unit:'Đơn vị giả',doseUnit:'Đơn vị giả',route:'Đường dùng giả',frequency:'Tần suất giả',dose:'1',quantity:'1',durationDays:'1'}))await page.locator(`[data-med=${key}]`).fill(value);
 await page.locator('[name=certainty]').selectOption('confirmed');await page.locator('#examForm [type=submit]').click();
 assert.equal((await data()).patients[0].visit.exam.certainty,'confirmed');
 await page.locator('#printFollowup').click();assert.match(await page.locator('#printBody').innerText(),/09\/10\/2030/);await page.locator('[data-cancel]').click();
 await page.locator('#printVisitSummary').click();assert.match(await page.locator('#printBody').innerText(),/Chẩn đoán giả/);await page.locator('[data-cancel]').click();
 await page.locator('[data-tab=meds]').click();await page.locator('#confirmPrescription').click();await page.locator('[name=confirmed]').check();await page.locator('#moduleForm [type=submit]').click();
 await page.locator('[data-tab=exam]').click();await page.locator('[name=plan]').fill('Lời dặn mới trên phiếu khám');await page.locator('#examForm [type=submit]').click();
 await page.locator('[data-tab=meds]').click();await page.locator('#printPrescription').click();assert.match(await page.locator('#printBody').innerText(),/Lời dặn mô phỏng/);assert.doesNotMatch(await page.locator('#printBody').innerText(),/Lời dặn mới/);assert.match(await page.locator('#printBody').innerText(),/Liều mỗi lần: 1/);await page.locator('[data-cancel]').click();
 // Cancellation records provenance, leaves clinical data intact and is counted separately.
 await account('reception');await navigate('patients');await page.locator('[data-open="BN-000128"]').click();assert.equal(await page.locator('#printVisitSummary,#printFollowup').count(),0);
 await page.locator('#cancelVisit').click();await page.locator('#cancelVisitForm [type=submit]').click();assert.equal(await page.locator('#modal').evaluate(e=>e.open),true);
 await page.locator('#cancelVisitForm [name=reason]').fill('Người bệnh hủy lượt — dữ liệu kiểm thử');await page.locator('#cancelVisitForm [type=submit]').click();
 const cancelled=(await data()).patients[0].visit;assert.equal(cancelled.status,'closed');assert.match(cancelled.closure.reason,/Người bệnh hủy lượt/);assert.equal(cancelled.exam.diagnosis,'Chẩn đoán giả');assert.match(await page.locator('.content .badge').innerText(),/Hủy \/ bỏ về/);
 await account('doctor');await navigate('patients');await page.locator('[data-open="BN-000128"]').click();assert.equal(await page.locator('#examForm [type=submit]').count(),0);
 await page.locator('[data-tab=meds]').click();await page.locator('#printPrescription').click();assert.match(await page.locator('#printBody').innerText(),/Thuốc giả/);await page.locator('[data-cancel]').click();
 await account('pharmacy');await navigate('dispensing');assert.match(await page.locator('.content tbody').innerText(),/Lượt hủy/);assert.equal(await page.locator('[data-dispense]').count(),0);
 await page.locator('[data-view-rx]').evaluate(b=>{b.dataset.dispense=b.dataset.viewRx;delete b.dataset.viewRx;});await page.locator('[data-dispense]').click();assert.equal(await page.locator('#modal').evaluate(e=>e.open),false);assert.equal((await data()).patients[0].visit.prescriptions[0].status,'ready');
 await account('manager');await navigate('reports');await page.locator('#reportDate').fill(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(cancelled.started)));await page.locator('#reportDate').dispatchEvent('change');assert.match(await page.locator('.content tbody').innerText(),/Hủy \/ bỏ về\s+1/);assert.doesNotMatch(await page.locator('.content').innerText(),/Nguyễn Minh Anh|Chẩn đoán giả/);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: staggered one-time reveal, reduced motion/focus, real local photos, every page for eight roles on desktop/mobile, integration handoff, diagnosis certainty, follow-up/visit-summary printing, cancellation provenance and separate aggregate reporting.');
})().catch(error=>{console.error(error);process.exit(1);});
