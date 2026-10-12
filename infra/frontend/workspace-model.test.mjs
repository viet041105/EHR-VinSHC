import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceMemory} from './workspace-model.js';
const patient='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const visit='33333333-3333-4333-8333-333333333333',encounter='44444444-4444-4444-8444-444444444444';
const bill='55555555-5555-4555-8555-555555555555',payment='66666666-6666-4666-8666-666666666666';
test('changing patient clears previous visit, encounter and selected business records',()=>{
 const memory=new WorkspaceMemory();
 memory.capture('bill',{uuid:bill,patientUuid:patient,visitUuid:visit});
 memory.setContext({patient,visit,encounter});
 memory.capture('identity',{patientUuid:other,contacts:[]});
 assert.deepEqual(memory.context,{patient:other});
 assert.equal(memory.defaults('receipt').record,undefined);
 assert.equal(memory.list(['bill']).length,1);
 memory.clear();assert.equal(memory.records.size,0);assert.deepEqual(memory.context,{});
});
test('bill and payment identifiers cannot be interchanged by context prefilling; stale bill requires a fresh read',()=>{
 const memory=new WorkspaceMemory();
 memory.capture('bill',{uuid:bill,patientUuid:patient,visitUuid:visit,status:'unpaid'});
 memory.capture('receipt',{uuid:payment,billUuid:bill,status:'settled',amountVnd:10000});
 assert.equal(memory.defaults('receipt').record,bill);
 assert.equal(memory.defaults('refund').record,payment);
 assert.equal(memory.records.get('bill:'+bill).stale,true);
 memory.capture('bills',{uuid:bill,patientUuid:patient,visitUuid:visit,status:'paid'});
 assert.equal(memory.records.get('bill:'+bill).stale,undefined);
});
test('embedded SQL projection identifiers are mapped explicitly and unsuccessful/non-record responses add no rows',()=>{
 const memory=new WorkspaceMemory();
 memory.capture('bills',{uuid:bill,patientUuid:patient,payments:[{payment_uuid:payment,amount_vnd:10000,status:'settled'}]});
 assert.equal(memory.list(['payment'])[0].data.amountVnd,10000);
 assert.equal(memory.list(['payment'])[0].data.billUuid,bill);
 memory.capture('identity',null);memory.capture('identity',{contacts:[]});
 assert.equal(memory.records.size,2);
 assert.throws(()=>memory.setContext({patient:'invalid'}));
 assert.equal(memory.select('bill',other),null);
});
test('payment selection resolves its patient from the known bill, otherwise removes unrelated patient context',()=>{
 const memory=new WorkspaceMemory();
 memory.capture('bill',{uuid:bill,patientUuid:patient,visitUuid:visit});
 memory.capture('receipt',{uuid:payment,billUuid:bill});
 memory.setContext({patient:other,encounter});
 memory.select('payment',payment);
 assert.deepEqual(memory.context,{patient,visit});
 memory.clear();memory.capture('payment',{uuid:payment,billUuid:bill});
 memory.setContext({patient:other,encounter});memory.select('payment',payment);
 assert.deepEqual(memory.context,{});
 memory.setContext({patient:other,encounter});memory.capture('payment',{uuid:payment,billUuid:bill});
 assert.deepEqual(memory.context,{});
});
test('a new visit for the same patient does not inherit the old encounter or payment selection',()=>{
 const memory=new WorkspaceMemory();
 memory.capture('bill',{uuid:bill,patientUuid:patient,visitUuid:visit});
 memory.capture('receipt',{uuid:payment,billUuid:bill});
 memory.setContext({patient,visit,encounter});
 memory.capture('bill',{uuid:bill,patientUuid:patient,visitUuid:other});
 assert.deepEqual(memory.context,{patient,visit:other});
 assert.equal(memory.defaults('refund').record,undefined);
});
