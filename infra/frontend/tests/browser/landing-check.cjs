// Public page boot regression: real scripts, no service needed, recoverable module failure.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5173';
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [1440,390]) {
      const page=await browser.newPage({viewport:{width,height:960}}),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/');
      await page.locator('.landing-header').waitFor();
      await page.locator('.landing-content').waitFor();
      assert.ok(await page.locator('#app').evaluate(n=>n.childElementCount>1));
      assert.equal(await page.locator('#retryStartup').count(),0);
      assert.deepEqual(errors,[]);
      await page.getByRole('link',{name:/Đăng nhập phòng khám/}).first().click();
      await page.locator('#loginForm').waitFor();
      await page.close();
    }
    const failed=await browser.newPage();
    await failed.route(/\/landing\/app\.js(?:\?.*)?$/,route=>route.abort('failed'));
    await failed.goto(base+'/');
    await failed.getByRole('alert').filter({hasText:'Chưa tải được trang'}).waitFor();
    await failed.unroute(/\/landing\/app\.js(?:\?.*)?$/);
    await failed.locator('#retryStartup').click();
    await failed.locator('.landing-header').waitFor();
    assert.equal(await failed.locator('#retryStartup').count(),0);
    await failed.close();
    console.log('PASS: landing renders on desktop/mobile without backend, login link opens, failed entry import has retry and recovers.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
