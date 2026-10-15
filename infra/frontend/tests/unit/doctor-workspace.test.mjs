import test from 'node:test';
import assert from 'node:assert/strict';
import { ownConsultation, vitalsContent, doctorWorkspaceScreen } from '../../shell/src/doctor-workspace.js';

test('our consultation requires an explicit provider link, never the first consultation or a user ID', () => {
  const visit = { encounters: [
    { uuid: 'nurse', encounterType: {key:'vitals'}, providers:[{uuid:'me'}] },
    { uuid: 'other', encounterType: {key:'consultation'}, providers:[{uuid:'other-doctor'}] },
    { uuid: 'ours', encounterType: {key:'consultation'}, providers:[{uuid:'me'}] },
  ] };
  assert.equal(ownConsultation(visit, 'me').uuid, 'ours');
  assert.equal(ownConsultation(visit, 'user-id'), null);
  assert.equal(ownConsultation(visit, null), null);
  assert.equal(ownConsultation({encounters:[{encounterType:{key:'consultation'}}]}, 'me'), null);
});
test('each vital measurement retains its own values and uses readable catalogue labels', () => {
  const html = vitalsContent({results:[
    {measuredAt:'2026-10-15T10:00:00Z', values:{'vitals.mach':82,'vitals.nhiet_do':0}},
    {measuredAt:'2026-10-15T11:00:00Z', values:{'vitals.mach':110},states:{'vitals.nhiet_do':{reason:'<img src=x>'}}},
  ]});
  assert.match(html, /Mạch/); assert.match(html, />82 /); assert.match(html, />110 /); assert.match(html, />0 /);
  assert.doesNotMatch(html, /vitals\.|\[object Object\]|<img/);
  assert.match(html, /&lt;img/);
});
test('doctor chart renders nested backend diagnosis and drug names; partial failures stay visible', () => {
  const html = doctorWorkspaceScreen({}, {worklist:()=>'',canAction:()=>true,doctorVisit:{status:'open',patient:{fullName:'Test'}},encounter:'ours',doctorTab:'clinical',doctorData:{errors:{orders:'Không tải được chỉ định'},summary:{diagnoses:[{concept:{name:'Tên chẩn đoán'},rank:'primary'}],drugOrders:[{drug:{name:'Tên thuốc'},frequency:{display:'Một lần mỗi ngày'},quantity:14}]}}});
  assert.match(html,/Tên chẩn đoán/);assert.match(html,/Tên thuốc/);assert.match(html,/Một lần mỗi ngày/);
  assert.match(html,/Không tải được chỉ định/);assert.doesNotMatch(html,/\[object Object\]/);
});
