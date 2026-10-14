import test from "node:test";
import assert from "node:assert/strict";
import { BackendClient } from "../../packages/core/src/backend-client.js";
const patient="a1000000-0000-4000-8000-000000000001", encounter="c1000000-0000-4000-8000-000000000001",facility="f1000000-0000-4000-8000-000000000001";
const response=data=>new Response(JSON.stringify(data),{headers:{"content-type":"application/json"}});
test("agent forwards the signed-in credential and doctor workspace to a fixed same-origin URL",async()=>{
  const seen=[];
  const client=new BackendClient(async(path,options)=>{seen.push({path,options});
    if(path.includes('session'))return response({authenticated:true,user:{uuid:patient}});
    if(path.includes('workspace'))return response({role:'doctor',facilityUuid:facility});
    return response({status:'ok'});
  });
  await client.login('synthetic','synthetic');await client.selectWorkspace('doctor',facility);
  await client.chat('doctor',{patientUuid:patient,encounterUuid:encounter,message:'Tóm tắt'});
  const request=seen.at(-1);assert.equal(request.path,'/agent/v1/doctor/chat');
  assert.equal(request.options.headers['X-VinSHC-Workspace-Role'],'doctor');
  assert.equal(request.options.headers.Authorization,seen[0].options.headers.Authorization);
  assert.equal(request.options.credentials,'omit');assert.equal(request.options.cache,'no-store');
  await assert.rejects(client.chat('admin',{}));
});
test("late agent response is discarded when the login session changes",async()=>{
  let finish;
  const client=new BackendClient(async(path)=>path.includes('session') ? response({authenticated:true,user:{uuid:patient}}) : new Promise(resolve=>finish=resolve));
  await client.login('synthetic','synthetic');
  const pending=client.chat('patient',{message:'Lời dặn?'});client.clear();finish(response({status:'ok'}));
  await assert.rejects(pending,/Phiên đã thay đổi/);
});
