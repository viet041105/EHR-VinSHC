const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const root=path.resolve(__dirname,'../..'),base=process.env.QA_BASE_URL||'http://127.0.0.1:5198';
const visit1='b1000000-0000-4000-8000-000000000001',visit2='b1000000-0000-4000-8000-000000000002';
const patient='a1000000-0000-4000-8000-000000000001';
const json=(route,data)=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  let server,browser,startupError="";
  try{
    if(!process.env.QA_BASE_URL){server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,windowsHide:true,stdio:['ignore','ignore','pipe']});server.stderr.on('data',chunk=>startupError+=chunk);}
    for(let i=0;i<100;i++){try{if((await fetch(base+'/portal.html')).ok)break;}catch{} if(i===99)throw new Error('FE server did not start: '+startupError);await sleep(100);}
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    const page=await browser.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/session')&&!url.pathname.includes('/portal/')) return json(route,{authenticated:true,user:{uuid:patient,display:'Bệnh nhân mẫu',roles:[{name:'VinSHC Portal: patient'}]}});
      if(url.pathname.endsWith('/portal/session')||url.pathname.endsWith('/portal/me'))return json(route,{persona:'patient',patientUuid:patient,userUuid:patient,linkStatus:'active'});
      if(url.pathname.endsWith('/portal/visits'))return json(route,{patientUuid:patient,results:[visit1,visit2].map((uuid,i)=>({uuid,startDatetime:`2026-10-${13-i}T09:00:00+07:00`,facilityName:'Phòng khám mẫu'}))});
      if(url.pathname.endsWith('/instructions'))return json(route,{patientUuid:patient,visitUuid:url.pathname.includes(visit2)?visit2:visit1,items:[{label:'Lời dặn',text:'Lời dặn đã công bố từ hồ sơ.'}]});
      if(url.pathname.endsWith('/prescriptions')||url.pathname.endsWith('/results'))return json(route,{patientUuid:patient,results:[]});
      return json(route,{patientUuid:patient,results:[]});
    });
    const calls=[];
    let release;
    await page.route('**/agent/v1/patient/chat',async route=>{
      const body=route.request().postDataJSON();calls.push(body);
      if(body.message==='Chậm'){await new Promise(resolve=>release=resolve);}
      const result={persona:'patient',status:'ok',message:null,answer:[{text:'Lời dặn '+(body.visitUuid===visit2?'lần hai':'lần đầu'),sources:[{label:'Lời dặn',kind:'published_instruction',uuid:body.visitUuid,field:'exam.loi_dan'}]}],missing:[],notes:[],disclaimer:'Thông tin từ hồ sơ đã công bố.',generatedAt:new Date().toISOString()};
      try{await json(route,result);}catch(error){if(!/closed|abort|cancel|Invalid Interception/.test(error.message))throw error;}
    });
    await page.goto(base+'/portal.html');
    await page.locator('[name=username]').fill('synthetic');await page.locator('[name=password]').fill('synthetic');await page.locator('#portalLogin button').click();
    await page.locator('#patientChat').waitFor();
    await page.locator('[data-chat] textarea').fill('Lời dặn?');await page.locator('[data-chat] button.primary').click();
    await page.getByText('Lời dặn lần đầu',{exact:true}).waitFor();
    assert.equal(calls[0].visitUuid,visit1);assert.deepEqual(calls[0].history,[]);
    await page.locator('[data-source]').first().click();await page.getByText('Lời dặn đã công bố từ hồ sơ.',{exact:false}).last().waitFor();
    await page.locator('[data-chat] textarea').fill('Chậm');await page.locator('[data-chat] button.primary').click();
    for(let i=0;!release&&i<50;i++)await sleep(20);assert.ok(release);
    await page.locator('#portalVisit').selectOption(visit2);release();await sleep(150);
    assert.equal(await page.getByText('Lời dặn lần đầu',{exact:true}).count(),0);
    await page.locator('[data-chat] textarea').fill('Lời dặn lần này?');await page.locator('[data-chat] button.primary').click();
    await page.getByText('Lời dặn lần hai',{exact:true}).waitFor();assert.deepEqual(calls.at(-1).history,[]);
    await page.locator('[data-clear]').click();assert.equal(await page.getByText('Lời dặn lần hai',{exact:true}).count(),0);
    await page.locator('#portalLogout').click();await page.locator('#portalLogin').waitFor();
    assert.equal(await page.locator('#patientChat').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS: portal login, source opening, selected visit, history reset, late response discard, clear and logout');
  }finally{await browser?.close();server?.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
