const { chooseAction } = require('./reference-helper.cjs');
// A stateful, isolated rehearsal of DEMO_FLOW_THUC_TE.md. No request reaches the real DB.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const map = require('../../packages/core/metadata/frontend-map.json');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const patient = uuid(1), visit = uuid(2), nurseEncounter = uuid(3), encounter = uuid(4), provider = uuid(5), order = uuid(6), drug = uuid(7);
const location = map.entities['location.development.clinic'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, timezoneId: 'Asia/Ho_Chi_Minh' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [], writes = [], bills = [];
      let role = 'reception', created = false, opened = false, closed = false, queue, clinical, prescription, measurement, result, issued = false;
      let serviceOrder, encounters = [], ticketNumber = 20;
      const person = { uuid: patient, fullName: 'Trần Văn Kiểm Thử', identifier: 'VSHC-QA-42', gender: 'M', birthdate: '1990-03-15' };
      const visitRow = () => ({ uuid: visit, patientUuid: patient, patient: person, visitCode: 'VSHC-LK-QA-42', visitType: { key: 'outpatient', name: 'Khám ngoại trú' }, status: closed ? 'closed' : 'open', startDatetime: new Date().toISOString(), encounters });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), p = url.pathname.replace('/api/', ''), method = request.method();
        const body = method === 'POST' ? request.postDataJSON() : null;
        const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        const list = results => send({ results, hasMore: false });
        if (p === 'session') return send({ authenticated: true, user: { uuid: uuid(8), display: 'Nhân viên kiểm thử', roles: [{ name: 'VinSHC App: ' + role }] } });
        if (p === 'vinshc/authorization/workspaces') return send([{ role, facilityUuid: location, facilityName: 'VinSHC Development Clinic' }]);
        assert.equal(request.headers()['x-vinshc-workspace-role'], role);
        assert.equal(request.headers()['x-vinshc-workspace-facility'], location);
        if (p === 'vinshc/authorization/workspace') return send({ role, facilityUuid: location });
        if (p === 'vinshc/providers/me') return send({ providers: [{ uuid: provider }] });
        if (method === 'POST') writes.push({ p, body });
        if (p === 'vinshc/patients') {
          if (method === 'GET') return list(created ? [person] : []);
          assert.equal(body.identifiers[0].identifier.length, 12);
          created = true; return send(person, 201);
        }
        if (p === 'vinshc/visits') {
          if (method === 'GET') return list(opened && !closed ? [visitRow()] : []);
          assert.equal(body.patient, patient); opened = true; return send(visitRow(), 201);
        }
        if (method === 'GET' && p === `vinshc/visits/${visit}`) return send(visitRow());
        if (p === `vinshc/visits/${visit}/encounters`) {
          const key = body.encounterType;
          assert.ok(key === 'vitals' && role === 'nurse' || key === 'consultation' && role === 'doctor');
          const e = { uuid: key === 'vitals' ? nurseEncounter : encounter, encounterUuid: key === 'vitals' ? nurseEncounter : encounter, patientUuid: patient, visitUuid: visit, encounterType: { key }, providers: [{ uuid: provider }] };
          encounters.push(e); return send(e, 201);
        }
        if (p === `vinshc/visits/${visit}/close`) { assert.equal(body.closeReason, 'completed'); assert.ok(issued && bills.every(b => b.status === 'paid')); closed = true; return send({ ...visitRow(), visitUuid: visit }); }
        if (p === 'vinshc/operations/queue') {
          if (method === 'GET') return list(queue ? [queue] : []);
          assert.equal(body.patient, patient); assert.equal(body.visit, visit);
          queue = { uuid: uuid(ticketNumber++), patientUuid: patient, visitUuid: visit, patientName: person.fullName, queueNumber: ticketNumber, point: body.point, pointName: 'Điều dưỡng', state: 'waiting' };
          return send(queue, 201);
        }
        if (/vinshc\/operations\/queue\/.+\/transition/.test(p)) {
          const valid = { waiting: ['called'], called: ['in_service'], in_service: ['completed'] };
          assert.ok(valid[queue.state]?.includes(body.state), 'cannot skip queue states');
          queue.state = body.state; return send(queue);
        }
        if (/vinshc\/operations\/queue\/.+\/advance/.test(p)) {
          assert.equal(queue.state, 'in_service');
          queue = { ...queue, uuid: uuid(ticketNumber++), state: 'waiting', point: body.nextPoint, pointName: 'Bác sĩ' }; return send(queue);
        }
        if (p === 'vinshc/vitals') {
          if (method === 'GET') return list(measurement ? [measurement] : []);
          assert.equal(body.patient, patient); assert.equal(body.encounter, nurseEncounter);
          assert.equal(body.values['vitals.ha_tam_thu'], 125);
          measurement = { uuid: uuid(30), patientUuid: patient, encounterUuid: nurseEncounter, visitUuid: visit, values: body.values, measuredAt: body.measuredAt };
          return send(measurement, 201);
        }
        if (p.endsWith('/clinical-summary')) return send({ encounterUuid: encounter, patientUuid: patient, visitUuid: visit, encounterType: { key: 'consultation' }, consultation: clinical, diagnoses: [], drugOrders: prescription ? [prescription] : [], status: 'draft' });
        if (p === 'vinshc/consultation') {
          assert.equal(body.encounter, encounter); assert.equal(body.values['allergy.trang_thai'], 'no_known_allergy');
          clinical = { groupUuid: uuid(31), values: body.values }; return send({ ...clinical, patientUuid: patient, encounterUuid: encounter, visitUuid: visit });
        }
        if (p === 'vinshc/diagnosis') { assert.equal(body.patient, patient); assert.equal(body.rank, 'primary'); return send({ uuid: uuid(32), patientUuid: patient, encounterUuid: encounter }); }
        if (p === 'vinshc/drug-order') { assert.equal(body.orderer, provider); assert.equal(body.quantity, 14); prescription = { uuid: drug, patientUuid: patient, encounterUuid: encounter, visitUuid: visit }; return send(prescription, 201); }
        if (p.endsWith('/finalize')) return send({ encounterUuid: encounter, patientUuid: patient, visitUuid: visit, status: 'finalized' });
        if (p === 'vinshc/operations/service-orders') {
          if (method === 'GET') return list(serviceOrder ? [serviceOrder] : []);
          assert.equal(body.encounter, encounter); assert.equal(body.orderer, provider); assert.ok(body.idempotencyKey);
          serviceOrder = { uuid: order, patientUuid: patient, visitUuid: visit, encounterUuid: encounter, patientName: person.fullName, serviceName: 'Siêu âm ổ bụng', state: 'requested', results: [], createdAt: new Date().toISOString() }; return send(serviceOrder, 201);
        }
        if (p === `vinshc/operations/service-orders/${order}/transition`) {
          const next = { requested: 'assigned', assigned: 'in_progress', in_progress: 'completed' };
          assert.equal(body.state, next[serviceOrder.state]);
          if (body.state === 'assigned') assert.equal(body.assignedProvider, provider);
          if (body.state === 'completed') assert.equal(result.state, 'final');
          serviceOrder.state = body.state; return send(serviceOrder);
        }
        if (p === `vinshc/operations/service-orders/${order}/results`) {
          assert.equal(body.authorProvider, provider); assert.equal(body.reviewerProvider, provider); assert.ok(body.reviewedAt); assert.equal(body.state, 'final');
          result = { uuid: uuid(33), orderUuid: order, patientUuid: patient, visitUuid: visit, encounterUuid: encounter, ...body };
          serviceOrder.results = [{ result_uuid: result.uuid, state: 'final' }]; return send(result, 201);
        }
        if (p === `vinshc/operations/results/${uuid(33)}`) return send(result);
        if (p === 'vinshc/operations/bills') {
          if (method === 'GET') return list(bills.filter(b => b.status === 'unpaid'));
          assert.equal(body.patient, patient); assert.equal(body.visit, visit); assert.equal(body.lines[0].quantity, 1);
          const total = 100000 + 50000 * bills.length;
          const b = { uuid: uuid(40 + bills.length), patientUuid: patient, visitUuid: visit, patientName: person.fullName, totalVnd: total, outstandingVnd: total, status: 'unpaid', lines: [{ serviceName: 'Dịch vụ kiểm thử' }] }; bills.push(b); return send(b, 201);
        }
        if (/vinshc\/operations\/bills\/.+\/receipts/.test(p)) {
          const b = bills.find(b => p.includes(b.uuid)); assert.equal(body.amountVnd, b.outstandingVnd); assert.equal(body.method, 'cash'); assert.ok(body.idempotencyKey);
          b.status = 'paid'; b.outstandingVnd = 0; return send({ uuid: uuid(60 + bills.indexOf(b)), billUuid: b.uuid, patientUuid: patient, visitUuid: visit, status: 'settled', amountVnd: body.amountVnd });
        }
        if (p === 'vinshc/operations/payments') return list([]);
        if (p.includes('/operations/documents/receipt/')) return send({ documentType: 'Phiếu thu', patientName: person.fullName, amountVnd: 100000 });
        if (p === 'vinshc/pharmacy/prescriptions') return list(prescription && !issued ? [{ ...prescription, patientName: person.fullName, drugName: 'Thuốc kiểm thử', dose: 1, quantity: 14, remainingQuantity: 14, status: 'active', dispenseStatus: 'pending' }] : []);
        if (p === 'vinshc/pharmacy/dispenses') { assert.equal(body.order, drug); assert.equal(body.quantity, 14); issued = true; return send({ uuid: uuid(70), quantity: 14, prescription }); }
        if (p.includes('/reports/daily')) return send({ openedVisits: 1, completedVisits: 1, grossVnd: 250000, netVnd: 250000 });
        return send({ results: [], hasMore: false });
      });
      const signIn = async next => {
        if (await page.locator('#logout').count()) await page.locator('#logout').click();
        role = next;
        await page.locator('#loginForm [name=username]').fill('qa');
        await page.locator('#loginForm [name=password]').fill('qa-only');
        await page.locator('#loginForm button').click();
        await page.locator('.session-identity').waitFor();
      };
      const section = async id => page.locator(`[data-section=${id}]`).click();
      const select = async (name, value) => page.locator(`#actionForm [name="${name}"]`).selectOption(value);
      const fill = async (name, value) => page.locator(`#actionForm [name="${name}"]`).fill(String(value));
      const choose = async name => { const s = page.locator(`#actionForm select[name="${name}"]`); const v = await s.locator('option').evaluateAll(opts => opts.find(o => o.value && !o.hidden)?.value); await s.selectOption(v); };
      const submit = async () => {
        const invalid = await page.locator('#actionForm').evaluate(form => [...form.elements].filter(el => el.willValidate && !el.checkValidity()).map(el => el.name));
        assert.deepEqual(invalid, [], 'The guided form should be ready: ' + invalid.join(', '));
        await page.locator('#actionForm button.primary').click();
        try { await page.locator('#connectionMessage').filter({ hasText: 'lưu' }).waitFor(); }
        catch (error) { throw new Error(`${error.message}; screen error: ${await page.locator('#connectionError').innerText()}; last write: ${JSON.stringify(writes.at(-1))}`); }
        assert.equal(await page.locator('#connectionError').innerText(), '');
      };
      const row = key => page.locator(`[data-worklist-row=${key}]`).first();
      const rowClick = async (key, name) => row(key).getByRole('button', { name, exact: true }).click();
      const next = async text => page.locator('[data-next-step]').filter({ hasText: text }).click();
      const snapshot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(os.tmpdir(), `vinshc-guided-${name}-${width}.png`), fullPage: true });
      };
      await page.goto(base + '/connected.html');
      await signIn('reception'); await section('patients');
      await page.locator('[data-task-action=registerPatient]').click();
      await fill('familyName', 'Trần'); await fill('middleName', 'Văn'); await fill('givenName', 'Kiểm Thử'); await select('gender', 'M');
      await select('birthPrecision', 'year'); await fill('birthYear', '1990'); await fill('cccd', '079090001234'); await submit();
      assert.equal(await page.locator('#actionForm').count(), 0, 'A successful registration must not leave another blank registration form');
      await next('mở lượt khám'); await select('visitType', 'outpatient'); await submit();
      await next('xếp hàng'); await choose('config'); await select('point', 'NURSE'); await submit();
      await section('queue'); await rowClick('queue', 'Gọi bệnh nhân');
      assert.equal(await page.locator('#actionForm [name=state] option[value=in_service]').count(), 0);
      await submit(); await section('queue'); await rowClick('queue', 'Bắt đầu phục vụ'); await submit();

      await signIn('nurse'); await section('vitals');
      assert.equal(await page.locator('#vitalsForm').count(), 0, 'No unusable measurement form before selecting a visit');
      await page.locator('.measurement-start button').click(); await rowClick('visits', 'Ghi sinh hiệu'); await submit();
      await page.locator('#vitalsForm').waitFor(); assert.equal(await page.locator('#actionForm').count(), 0);
      await page.locator('#vitalsForm [name=systolic]').fill('125'); await page.locator('#vitalsForm [name=diastolic]').fill('80');
      await snapshot('nurse'); await page.locator('#vitalsForm button.primary').click();
      await next('chuyển sang bác sĩ'); await rowClick('queue', 'Chuyển điểm tiếp theo'); await select('nextPoint', 'DOCTOR'); await submit();

      await signIn('doctor'); await section('visits'); await row('visits').locator('.worklist-record-link').click(); await page.locator('[data-doctor-start]').click();
      await page.locator('#actionForm [name="visit.ly_do_kham"]').waitFor();
      assert.equal(await page.locator('#actionForm [name="allergy.trang_thai"]').inputValue(), '', 'Never assume no allergy');
      await fill('visit.ly_do_kham', 'Đau thượng vị 3 ngày'); await fill('history.benh_su', 'Đau tăng sau ăn');
      await select('history.tien_su_ban_than_trang_thai', 'none_reported'); await select('history.tien_su_gia_dinh_trang_thai', 'none_reported'); await select('allergy.trang_thai', 'no_known_allergy');
      await snapshot('doctor'); await submit(); await page.locator('[data-doctor-tab=orders]').click(); await page.locator('[data-doctor-action=createOrder]').click(); await choose('service'); await choose('config'); await submit();

      await signIn('lab'); await section('orders'); await rowClick('orders', 'Nhận chỉ định'); await submit();
      await section('orders'); await rowClick('orders', 'Bắt đầu thực hiện'); await submit();
      await section('orders'); await rowClick('orders', 'Ghi kết quả'); await select('state', 'final'); await fill('textValue', 'Chưa ghi nhận bất thường');
      assert.equal(await page.locator('#reviewSelf').isChecked(), false, 'Review requires an explicit choice');
      await page.locator('#reviewSelf').check(); await snapshot('lab'); await submit();
      await next('hoàn tất'); await rowClick('orders', 'Hoàn tất chỉ định'); await submit();

      await signIn('doctor'); await row('visits').locator('.worklist-record-link').click();
      await page.locator('[data-doctor-action=consultation]').waitFor();
      await page.locator('[data-doctor-tab=orders]').click(); await page.locator('[data-doctor-result]').click();
      await page.locator('#doctorTabContent').filter({hasText:'Chưa ghi nhận bất thường'}).waitFor();
      await page.locator('[data-doctor-tab=clinical]').click(); await page.locator('[data-doctor-action=diagnosis]').click();
      await page.locator('[data-catalogue-search=concept]').fill('K29'); await choose('concept');
      assert.match(await page.locator('#actionForm [name=concept] option:checked').innerText(), /K29/);
      await select('rank', 'primary'); await select('certainty', 'confirmed'); await submit();
      await page.locator('[data-doctor-action=prescription]').click(); await choose('drug'); await fill('dose', 1); await choose('doseUnits'); await choose('route'); await choose('frequency'); await fill('duration', 14); await choose('durationUnits'); await fill('quantity', 14); await choose('quantityUnits'); await submit();
      await page.locator('[data-doctor-tab=consultation]').click(); await page.locator('[data-doctor-action=finalize]').click(); await submit();

      await signIn('cashier'); await section('visits'); await rowClick('visits', 'Lập phiếu phí');
      for (let i = 0; i < 2; i++) {
        await choose('service'); await fill('quantity', 1); await select('paymentTiming', 'postpay'); await submit();
        if (!i) await next('Lập thêm phiếu');
      }
      await next('Thu tiền');
      assert.equal(await page.locator('#actionForm [name=record]').inputValue(), bills[1].uuid);
      assert.equal(await page.locator('#actionForm [name=amountVnd]').inputValue(), '150000');
      // Changing the selected bill must replace the earlier row's record and amount defaults.
      await page.locator('#knownRecordPicker').selectOption(bills[0].uuid);
      assert.equal(await page.locator('#actionForm [name=record]').inputValue(), bills[0].uuid);
      assert.equal(await page.locator('#actionForm [name=amountVnd]').inputValue(), '100000');
      for (let i = 0; i < 2; i++) {
        if (i) { await section('billing'); await rowClick('bills', 'Thu tiền'); assert.equal(await page.locator('#actionForm [name=amountVnd]').inputValue(), '150000'); }
        await select('method', 'cash'); await snapshot('cashier'); await submit();
        await next('In phiếu thu'); await page.locator('#actionForm button.primary').click(); await page.locator('#printDocument').waitFor();
      }
      await signIn('pharmacy'); await section('pharmacy'); await rowClick('prescriptions', 'Cấp thuốc');
      assert.equal(await page.locator('#actionForm [name=quantity]').inputValue(), '14'); await fill('batchNumber', 'QA-ONLY'); await snapshot('pharmacy'); await submit();
      await signIn('reception'); await section('visits'); await row('visits').locator('.row-more summary').click(); await rowClick('visits', 'Kết thúc lượt'); await select('closeReason', 'completed'); await submit();
      await signIn('manager'); await section('reports'); await chooseAction(page,'report'); await page.locator('#actionForm button.primary').click(); await page.locator('#backendResult').filter({ hasText: '250.000' }).waitFor();
      assert.equal(closed, true); assert.equal(writes.filter(w => w.p.endsWith('/receipts')).length, 2);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('VSHC-QA-42')), false);
      await context.close();
      console.log(`PASS: guided clinic demo at ${width}px — registration through close/report, explicit review, ordered queue transitions, no manual record IDs, no real DB writes.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
