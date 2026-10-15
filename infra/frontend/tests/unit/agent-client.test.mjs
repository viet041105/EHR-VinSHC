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

test("agent errors keep their code so expired sessions can resume without retrying model failures", async () => {
  const client = new BackendClient(async path => path.includes('session')
    ? response({authenticated:true,user:{uuid:patient}})
    : new Response(JSON.stringify({code:'conversation_not_found',detail:'Phiên đã hết hạn.'}), {status:404}));
  await client.login('synthetic','synthetic');
  await assert.rejects(client.chat('patient',{message:'Tôi đã hỏi những gì?'}),
    error => error.status === 404 && error.details.code === 'conversation_not_found');
});
test("closing a source cancels its HTTP read while keeping the timeout and scope", async () => {
  const controller = new AbortController();
  let signal;
  const client = new BackendClient(async (_path, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  client.workspace = { role: 'doctor', facility };
  const pending = client.request('vinshc/encounter/' + encounter + '/clinical-summary', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.equal(signal.aborted, true);
  assert.equal(client.workspace.role, 'doctor');
});

test("document citations use the agent endpoint and cannot select arbitrary source URLs", async () => {
  const seen = [];
  const client = new BackendClient(async (path, options) => {
    seen.push({path, options});
    return response(path.includes('session') ? {authenticated:true,user:{uuid:patient}} : {uuid:encounter,kind:'document'});
  });
  await client.login('synthetic','synthetic');
  await client.readKnowledgeChunk('patient', encounter);
  assert.equal(seen.at(-1).path, '/agent/v1/patient/knowledge/chunks/' + encounter);
  assert.equal(seen.at(-1).options.method, 'GET');
  assert.equal(seen.at(-1).options.cache, 'no-store');
  assert.equal(seen.at(-1).options.headers['X-VinSHC-Workspace-Facility'], undefined);
  const previousCalls = seen.length;
  await assert.rejects(client.readKnowledgeChunk('patient', 'https://example.com'));
  assert.equal(seen.length, previousCalls, 'invalid document identifiers must be rejected before HTTP');
  await assert.rejects(client.readKnowledgeChunk('doctor', encounter), error => error.status === 403);
  assert.equal(seen.length, previousCalls, 'a missing doctor workspace must not reach HTTP');
});
