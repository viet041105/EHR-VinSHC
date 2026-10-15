import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceMemory } from '@vinshc/core';
import { registry } from '../registry.mjs';
import { actionGroups, reportPreset, userError } from '../../shell/src/page-design.js';
import { validateReportRange } from '../../modules/reports/src/index.js';
import { displayResult } from '../../shell/src/result-view.js';
import { mergeFacilities } from '../../modules/admin/src/console.js';

test('task groups retain every registered page action once and cannot introduce a disallowed action', () => {
  for (const section of registry.sections) {
    const grouped = actionGroups(section.id, section.actions).flatMap(g => g.actions);
    assert.deepEqual([...grouped].sort(), [...section.actions].sort(), section.id);
    assert.equal(new Set(grouped).size, grouped.length);
    const readOnly = section.actions.filter(key => registry.actions[key].method === 'GET');
    assert.deepEqual(actionGroups(section.id, readOnly).flatMap(g => g.actions).sort(), readOnly.sort());
  }
  assert.deepEqual(actionGroups('future-page', ['future-action']).flatMap(g => g.actions), ['future-action']);
});
test('report shortcuts handle leap days and range validation includes both endpoints', () => {
  assert.deepEqual(reportPreset('2024-03-01', 1, true), { from:'2024-02-29', to:'2024-02-29' });
  assert.deepEqual(reportPreset('2026-01-02', 7), { from:'2025-12-27', to:'2026-01-02' });
  assert.doesNotThrow(() => validateReportRange({ from:'2026-01-01', to:'2026-01-31' }));
  assert.throws(() => validateReportRange({ from:'2026-01-01', to:'2026-02-01' }), /31 ngày/);
  assert.throws(() => validateReportRange({ from:'2026-02-03', to:'2026-02-02' }), /sau ngày/);
  assert.throws(() => validateReportRange({ from:'2026-02-30', to:'2026-03-03' }), /hợp lệ/);
});
test('selected saved patients and visits use actual adapter IDs and clear the prior patient context', () => {
  const patient='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', visit='33333333-3333-4333-8333-333333333333';
  const memory = new WorkspaceMemory(registry);
  memory.setContext({ patient:other, encounter:visit });
  memory.remember('patient', { uuid:patient, fullName:'QA' });
  memory.select('patient', patient);
  assert.deepEqual(memory.context, { patient });
  memory.remember('visit', { uuid:visit, patientUuid:patient });
  memory.select('visit', visit);
  assert.deepEqual(memory.context, { patient, visit });
});
test('result display omits internal IDs and escapes content; UI errors explain the recovery step', () => {
  const output = displayResult({ patient:'11111111-1111-4111-8111-111111111111', text:'<img src=x onerror=alert(1)>', count:0 }, {});
  assert.doesNotMatch(output, /11111111|<img/);
  assert.match(output, /&lt;img/);
  assert.match(output, />0</);
  assert.match(userError({ message:'Request failed', details:{ reason:'invalid queue transition' } }), /Gọi bệnh nhân/);
});
test('server facility updates override the catalogue and a stopped facility is not revived by seeded metadata', () => {
  const seed={locationUuid:'same-location',name:'Tên cũ',active:true,retired:false};
  assert.equal(mergeFacilities([seed],[{...seed,name:'Tên đã cập nhật'}])[0].name,'Tên đã cập nhật');
  assert.deepEqual(mergeFacilities([seed],[{...seed,active:false}]),[]);
});
