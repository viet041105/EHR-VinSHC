const { mockSelectCare } = require("./reference-helper.cjs");
// Integration regressions for the merged floating doctor chat. Synthetic API responses only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { fillReference } = require('./reference-helper.cjs');
const root = path.resolve(__dirname, '../..'), base = process.env.QA_BASE_URL || 'http://127.0.0.1:5198';
const patient='a1000000-0000-4000-8000-000000000001', other='a2000000-0000-4000-8000-000000000002';
const encounter='c1000000-0000-4000-8000-000000000001', visit='b1000000-0000-4000-8000-000000000001';
const session='d1000000-0000-4000-8000-000000000001';
const facility=require('../../packages/core/metadata/frontend-map.json').entities['location.development.clinic'];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const send=async(route,data)=>{try{await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});}catch(e){if(!/closed|abort|cancel|Invalid Interception/i.test(e.message))throw e;}};
(async()=>{
  let server,browser;
  try{
    if(!process.env.QA_BASE_URL) server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,windowsHide:true,stdio:'ignore'});
    for(let i=0;i<100;i++){try{if((await fetch(base+'/connected.html')).ok)break;}catch{} if(i===99)throw Error('FE failed to start');await delay(100);}
    browser=await chromium.launch({headless:true});
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:960}}),calls=[],errors=[];
      let chatRelease,sourceRelease,delaySource=false,documentVersion='0.1.0';
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/**',async route=>{
        const p=new URL(route.request().url()).pathname;
        if(p.endsWith('/providers/me'))return send(route,{providers:[{uuid:patient}]});
        if(p.endsWith('/session'))return send(route,{authenticated:true,user:{uuid:patient,display:'Bác sĩ mẫu',roles:[{name:'VinSHC App: doctor'}]}});
        if(p.endsWith('/authorization/workspaces'))return send(route,[{role:'doctor',facilityUuid:facility,facilityName:'Cơ sở thử'}]);
        if(p.endsWith('/authorization/workspace'))return send(route,{role:'doctor',facilityUuid:facility});
        if(p.endsWith('/clinical-summary')){if(delaySource){delaySource=false;await new Promise(r=>sourceRelease=r);}return send(route,{encounterUuid:encounter,reason:'Bệnh sử nguồn thứ nhất'});}
        if(p.endsWith('/vitals'))return send(route,{results:[{uuid:encounter,values:{'vitals.mach':82}}]});
        return send(route,{results:[],hasMore:false});
      });
      await page.route('**/agent/v1/doctor/chat',async route=>{
        const body=route.request().postDataJSON();calls.push(body);
        assert.equal(route.request().headers()['x-vinshc-workspace-facility'],facility);
        if(body.message==='Phiên hết hạn'&&body.conversationId)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'conversation_not_found',detail:'Phiên đã hết hạn.'})});
        if(body.message==='Không có phiên nâng cao'&&body.remember)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'advanced_disabled',detail:'Chưa bật phiên nhớ.'})});
        if(body.message==='Chậm')await new Promise(r=>chatRelease=r);
        const source=kind=>({kind,uuid:encounter,label:kind,encounterUuid:encounter});
        const result={persona:'doctor',status:'ok',context:{patientUuid:body.patientUuid,encounterUuid:encounter,facilityUuid:facility},answer:[
          {text:'Nội dung trong hồ sơ',sources:[source('encounter')]},{text:'Mạch đã ghi: 82',sources:[source('vitals')]}
        ],missing:[],notes:[],disclaimer:'Chỉ đọc',generatedAt:new Date().toISOString()};
        if(body.message==='Giới hạn')Object.assign(result,{status:'limited',message:'Model đang bận.',answer:[]});
        if(body.message==='Text')result.answer=[{text:'<img src=x onerror="window.unsafe=true">',sources:[]}];
        if(body.message==='Sai hồ sơ')result.context.patientUuid=other;
        if(body.message==='Tài liệu')result.answer=[{text:'Tài liệu SpO2',sources:[{...source('document'),documentId:'vitals',documentVersion:'0.1.0'}]}];
        if(body.message==='Bạn là ai')Object.assign(result,{answer:[],message:'Chào bác sĩ. Tôi là trợ lý hồ sơ VinSHC.',conversationId:session});
        if(body.message==='Thiếu dữ liệu')Object.assign(result,{answer:[],status:'not_found',message:'Chưa có dữ liệu trong nguồn đang đọc.',missing:[{section:'exam',label:'Hướng điều trị',detail:'Phiếu khám chưa ghi mục này.'}],notes:['Nguồn đang đọc là bản nháp.']});
        if(body.message==='tôi đã hỏi những gì')Object.assign(result,{answer:[],message:body.conversationId?'1. Bạn là ai\n2. Tóm tắt':'Chưa có câu hỏi trước đó.',conversationId:session});
        await send(route,result);
      });
      await page.route('**/agent/v1/doctor/knowledge/chunks/*',route=>send(route,{kind:'document',uuid:encounter,documentId:'vitals',documentVersion,documentTitle:'Sinh hiệu',documentSection:'Đơn vị',text:'SpO2 dùng phần trăm; tài liệu mẫu.'}));
      await page.goto(base+'/connected.html');
      await page.fill('[name=username]','synthetic');await page.fill('#loginForm [name=password]','synthetic');await page.click('#loginForm button');
      await page.locator('[data-section=visits]').click();
      await mockSelectCare(page,{patient,visit,encounter});
      await page.click('[data-assistant-toggle]');
      const ask=async message=>{await page.fill('[data-chat] textarea',message);await page.locator('[data-chat] textarea').press('Enter');};
      await ask('Tóm tắt');await page.locator('.assistant-msg.bot',{hasText:'Nội dung trong hồ sơ'}).waitFor();
      await page.fill('[data-chat] textarea','Bản nháp giữ lại');
      delaySource=true;await page.click('[data-source="0,0,0"]');
      for(let i=0;!sourceRelease&&i<100;i++)await delay(20);assert.ok(sourceRelease);
      await page.click('[data-source="0,1,0"]');await page.locator('.assistant-source-body').getByText('82',{exact:true}).waitFor({state:'attached'});
      sourceRelease();await delay(100);assert.equal(await page.locator('.assistant-source-body').getByText('Bệnh sử nguồn thứ nhất',{exact:true}).count(),0);
      assert.equal(await page.inputValue('[data-chat] textarea'),'Bản nháp giữ lại');
      assert.ok(!(await page.locator('.assistant-source-body').innerText()).includes(encounter));
      await page.click('[data-source-close]');await ask('Chậm');
      for(let i=0;!chatRelease&&i<100;i++)await delay(20);assert.ok(chatRelease);
      await page.click('[data-stop]');chatRelease();await page.getByText('Đã dừng chờ phản hồi.',{exact:false}).waitFor();
      await page.click('[data-clear]');await ask('Giới hạn');await page.locator('[data-retry]').waitFor();
      await page.click('[data-retry]');await page.locator('[data-retry]:not([disabled])').waitFor();assert.deepEqual(calls.at(-1).history,[]);
      await page.click('[data-clear]');await ask('Text');await page.getByText('<img src=x onerror="window.unsafe=true">',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.unsafe),undefined);
      await ask('Sai hồ sơ');await page.getByText('Phản hồi không khớp hồ sơ đang mở.',{exact:true}).waitFor();
      await page.click('[data-clear]');await ask('Tài liệu');await page.click('[data-source="0,0,0"]');
      await page.getByText('SpO2 dùng phần trăm; tài liệu mẫu.',{exact:true}).waitFor();
      await page.click('[data-source-close]');documentVersion='0.1.1';await page.click('[data-source="0,0,0"]');
      await page.getByText('Nguồn tài liệu đã thay đổi; hãy hỏi lại để đọc phiên bản hiện tại.',{exact:true}).waitFor();
      await page.click('[data-clear]');await ask('Bạn là ai');await page.getByText('Chào bác sĩ. Tôi là trợ lý hồ sơ VinSHC.',{exact:true}).waitFor();
      await ask('Tóm tắt');await page.locator('.assistant-msg.bot',{hasText:'Nội dung trong hồ sơ'}).waitFor();
      await ask('tôi đã hỏi những gì');await page.getByText('1. Bạn là ai\n2. Tóm tắt',{exact:true}).waitFor();
      assert.equal(calls.at(-1).conversationId,session);assert.equal(calls.at(-1).remember,true);assert.equal(calls.at(-1).history,undefined);
      await ask('Phiên hết hạn');await page.waitForFunction(()=>!document.querySelector('[data-stop]'));
      assert.equal(calls.at(-2).conversationId,session);assert.equal(calls.at(-1).conversationId,undefined);assert.ok(calls.at(-1).history.some(t=>t.text==='Bạn là ai'));
      await page.click('[data-clear]');await ask('Không có phiên nâng cao');await page.waitForFunction(()=>!document.querySelector('[data-stop]'));
      assert.equal(calls.at(-2).remember,true);assert.equal(calls.at(-1).remember,undefined);assert.deepEqual(calls.at(-1).history,[]);
      await page.click('[data-clear]');await ask('Thiếu dữ liệu');
      const missing=page.locator('.assistant-msg.bot').last().locator('.assistant-missing');
      await missing.locator('li').waitFor({state:'visible'});
      assert.ok((await missing.locator('li').innerText()).includes('Hướng điều trị: Phiếu khám chưa ghi mục này.'));
      assert.equal(await page.locator('.assistant-msg.bot').last().locator('.assistant-note').getAttribute('open'),null);
      await page.locator('.assistant-msg.bot').last().locator('.assistant-note summary').click();
      await page.getByText('Nguồn đang đọc là bản nháp.',{exact:true}).waitFor();
      await page.click('[data-clear]');chatRelease=null;await ask('Chậm');
      for(let i=0;!chatRelease&&i<100;i++)await delay(20);assert.ok(chatRelease);
      if(width<600)await page.click('[data-assistant-close]');
      await mockSelectCare(page,{patient:other,visit:other,encounter,provider:patient});
      chatRelease();await delay(100);if(width<600)await page.click('[data-assistant-toggle]');
      assert.equal(await page.locator('.assistant-msg.user').count(),0);assert.equal(await page.inputValue('[data-chat] textarea'),'');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(width<600)await page.click('[data-assistant-close]');
      await page.click('#logout');await page.locator('#loginForm').waitFor();
      assert.equal(await page.locator('[data-assistant-toggle]').count(),0);assert.deepEqual(errors,[]);
      await page.close();console.log(`PASS: floating agent ${width}px — source races, draft, stop/retry, escaping, wrong context, document version and context reset (mocked APIs).`);
    }
  }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
