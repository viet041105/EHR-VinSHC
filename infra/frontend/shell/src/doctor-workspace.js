import { esc, formatTime, patientIdentity, stateText, VITAL_FIELD_MAP } from '@vinshc/core';

// A facility visit is not an assignment. Only an explicit provider link identifies our encounter.
export function ownConsultation(visit, provider) {
  if (!provider) return null;
  return (visit?.encounters || []).find(e => e.encounterType?.key === 'consultation' &&
    (e.providers || []).some(p => p.uuid === provider)) || null;
}
const rows = value => Array.isArray(value) ? value : value?.results || [];
const text = value => typeof value === 'object' ? value?.name || value?.display || '' : value ?? '';
const absent = message => `<p class="record-empty">${esc(message)}</p>`;
const date = value => value ? formatTime(value) : 'Chưa ghi nhận';
const VITALS = Object.fromEntries(VITAL_FIELD_MAP.map(f => [f.code, [f.label, f.unit]]));
const STATUS = { final: 'Đã chốt', draft: 'Đang ghi', unknown: 'Không rõ', not_asked: 'Chưa hỏi',
  no_known_allergy: 'Không ghi nhận dị ứng', present: 'Có ghi nhận', none_reported: 'Không ghi nhận',
  primary: 'Chính', secondary: 'Kèm theo', provisional: 'Sơ bộ', confirmed: 'Xác định' };
const label = value => STATUS[value] || stateText(value);
// Patient banner badges. Allergy is always shown, "Chưa ghi nhận" when the consultation has no status.
function allergyBadge(status) {
  if (!status) return '<span class="badge badge-neutral">Dị ứng: Chưa ghi nhận</span>';
  const tone = status === 'present' ? 'badge-danger' : status === 'no_known_allergy' ? 'badge-success' : 'badge-warning';
  return `<span class="badge ${tone}">${status === 'no_known_allergy' ? esc(label(status)) : 'Dị ứng: ' + esc(label(status))}</span>`;
}
function visitBadge(visit, summary) {
  if (summary?.status === 'final') return '<span class="badge badge-success">Phiếu đã chốt</span>';
  return visit.status === 'closed' ? '<span class="badge badge-neutral">Lượt đã kết thúc</span>' : '<span class="badge">Lượt đang mở</span>';
}

export function vitalsContent(value) {
  const groups = rows(value);
  if (!groups.length) return absent('Chưa có sinh hiệu trong lượt này.');
  return groups.map(group => `<article class="clinical-reading"><h3>${esc(date(group.measuredAt))}${group.voided ? ' · Đã hủy' : ''}</h3><dl class="vital-grid">${Object.entries(VITALS).map(([key, [name, unit]]) => {
    const n = group.values?.[key], state = group.states?.[key];
    return `<div><dt>${name}</dt><dd>${n !== undefined && n !== null ? `${esc(n)} <small>${unit}</small>` : esc(state?.reason || label(text(state?.state || state)) || 'Chưa đo')}</dd></div>`;
  }).join('')}</dl>${group.needsVerification ? '<p class="error">Số đo cần được đối chiếu lại.</p>' : ''}</article>`).join('');
}
function clinicalButtons(ctx, actions) {
  return actions.filter(([key]) => ctx.canAction(key)).map(([key, name]) =>
    `<button type="button" data-doctor-action="${key}">${name}</button>`).join('');
}
function ordersContent(data, ctx) {
  const items = rows(data.orders);
  return clinicalButtons(ctx, ctx.encounter && ctx.doctorVisit?.status === 'open' ? [['createOrder', 'Thêm chỉ định']] : []) +
    (items.length ? items.map(order => `<article class="clinical-reading"><h3>${esc(order.serviceName || 'Chỉ định')}</h3><p>${esc(stateText(order.state))} · ${esc(date(order.createdAt))}</p>${(order.results || []).map(r => {
      const id = r.result_uuid || r.uuid, detail = data.results?.[id];
      return `<div class="clinical-result"><button type="button" data-doctor-result="${esc(id)}">Xem kết quả · ${esc(stateText(r.state))}</button>${detail ? `<p>${esc(detail.textValue ?? detail.text_value ?? detail.numericValue ?? detail.numeric_value ?? 'Chưa có nội dung')} ${esc(detail.unit || '')}</p>` : ''}</div>`;
    }).join('') || '<small>Chưa có kết quả</small>'}</article>`).join('') : absent('Chưa có chỉ định trong lượt này.')) +
    (data.orders?.hasMore ? '<button type="button" data-doctor-more="orders">Tải thêm chỉ định</button>' : '');
}
function medicationContent(data, ctx) {
  const summary = data.summary || {}, diagnoses = rows(summary.diagnoses), drugs = rows(summary.drugOrders);
  return `<section class="clinical-reading"><h3>Chẩn đoán</h3>${ctx.encounter && ctx.doctorVisit?.status === 'open' ? clinicalButtons(ctx, [['diagnosis', 'Thêm chẩn đoán']]) : ''}${diagnoses.length ? diagnoses.map(d => `<p><strong>${esc(text(d.conceptName || d.name || d.diagnosis || d.concept) || 'Chẩn đoán')}</strong> · ${esc(label(d.rank === 1 ? 'primary' : d.rank === 2 ? 'secondary' : d.rank))} · ${esc(label(d.certainty))}</p>`).join('') : absent('Chưa có chẩn đoán.')}</section>
    <section class="clinical-reading"><h3>Đơn thuốc</h3>${ctx.encounter && ctx.doctorVisit?.status === 'open' ? clinicalButtons(ctx, [['prescription', 'Thêm thuốc']]) : ''}${drugs.length ? drugs.map(d => `<article class="medication-line"><strong>${esc(text(d.drugName || d.drug || d.name) || 'Thuốc')}</strong><p>${esc([d.dose, text(d.doseUnits), text(d.route), text(d.frequency), d.duration, text(d.durationUnits)].filter(x => x !== undefined && x !== null && x !== '').join(' · '))}</p><p>Số lượng: ${esc(d.quantity ?? 'Chưa ghi nhận')} ${esc(text(d.quantityUnits))}</p><p>${esc(d.dosingInstructions || '')}</p>${ctx.canAction('printPrescription') && d.uuid ? `<button type="button" data-doctor-print="${esc(d.uuid)}">Xem bản in đơn thuốc</button>` : ''}</article>`).join('') : absent('Chưa kê thuốc.')}</section>`;
}
function noteContent(data, ctx) {
  if (data.errors?.visit) return absent('Cần tải lại lượt khám trước khi ghi thông tin.');
  if (!ctx.encounter) return `<div class="doctor-empty"><strong>Chưa mở phiếu khám của bạn</strong>${ctx.doctorVisit?.status === 'open' && ctx.canAction('startConsultation') ? '<button type="button" class="primary" data-doctor-start>Bắt đầu khám</button>' : '<p>Lượt đã đóng hoặc tài khoản chưa thể bắt đầu khám.</p>'}</div>`;
  const values = data.summary?.consultation?.values || {};
  const fields = [['Lý do khám', 'visit.ly_do_kham'], ['Bệnh sử', 'history.benh_su'],
    ['Tiền sử bản thân', 'history.tien_su_ban_than'], ['Tiền sử gia đình', 'history.tien_su_gia_dinh'],
    ['Khám bộ phận', 'exam.bo_phan'], ['Hướng điều trị', 'exam.huong_dieu_tri'], ['Lời dặn', 'exam.loi_dan']];
  return `<div class="doctor-inline-actions">${clinicalButtons(ctx, ctx.doctorVisit?.status !== 'open' ? [] : data.summary?.status === 'final' ? [['correction', 'Đính chính phiếu khám']] : [['consultation', 'Ghi phiếu khám'], ['finalize', 'Kiểm tra và chốt phiếu']])}</div><dl class="doctor-summary-grid">${fields.map(([name, key]) => `<div><dt>${name}</dt><dd>${esc(values[key] || 'Chưa ghi nhận')}</dd></div>`).join('')}</dl>`;
}
function historyContent(data) {
  return rows(data.history).map(v => `<article class="clinical-reading"><h3>${esc(v.visitCode || 'Lượt khám')}</h3><p>${esc(date(v.startDatetime))} · ${v.status === 'open' ? 'Đang mở' : 'Đã kết thúc'}</p>${(v.encounters || []).map(e => `<p>${esc(e.encounterType?.name || 'Lần khám')} · ${esc((e.providers || []).map(p => p.name).filter(Boolean).join(', '))}</p>`).join('')}</article>`).join('') +
    (data.history?.hasMore ? '<button type="button" data-doctor-more="history">Tải thêm lượt khám</button>' : '') || absent('Chưa có lượt khám khác.');
}
export function doctorWorkspaceScreen(section, ctx) {
  const visit = ctx.doctorVisit, data = ctx.doctorData || {};
  const tabs = [['consultation', 'Phiếu khám'], ['vitals', 'Sinh hiệu'], ['orders', 'Chỉ định & kết quả'], ['clinical', 'Chẩn đoán & thuốc'], ['history', 'Lịch sử']];
  const values = data.summary?.consultation?.values || {};
  const allergy = values['allergy.trang_thai'];
  let content = !visit ? absent('Chọn tên người bệnh để mở hồ sơ.') : data.loading ? '<div class="list-loading" role="status" aria-busy="true"><span>Đang tải hồ sơ…</span><span class="skeleton" aria-hidden="true"></span><span class="skeleton" aria-hidden="true"></span></div>' :
    ctx.doctorTab === 'vitals' ? vitalsContent(data.vitals) : ctx.doctorTab === 'orders' ? ordersContent(data, ctx) :
      ctx.doctorTab === 'clinical' ? medicationContent(data, ctx) : ctx.doctorTab === 'history' ? historyContent(data) : noteContent(data, ctx);
  if (visit && ctx.taskForm) content = ctx.taskForm;
  const errors = Object.values(data.errors || {}).filter(Boolean);
  const visitActions = [['visitDetail','Xem lượt khám'], ['closeVisit','Kết thúc lượt khám']].filter(([key]) => ctx.canAction(key) && (key !== 'closeVisit' || visit?.status === 'open')).map(([key, title]) => `<button type="button" data-task-action="${key}">${title}</button>`).join('');
  return `<section class="doctor-workspace ${visit ? 'has-patient' : ''}"><div class="doctor-worklist-column">${ctx.worklist('visits')}</div><section class="panel doctor-profile-column" aria-label="Hồ sơ khám"><div class="doctor-profile-header patient-banner"><div><h2>${esc(visit?.patient?.fullName || 'Hồ sơ khám')}</h2>${visit ? `<p class="patient-meta">${esc(patientIdentity(visit.patient || {}))} · ${esc(visit.visitCode || '')}</p><div class="patient-flags">${visitBadge(visit, data.summary)}${allergyBadge(allergy)}</div>` : ''}</div>${visit ? `<div class="doctor-header-actions"><button type="button" data-doctor-patient-access>Yêu cầu tài khoản</button><button type="button" class="ghost" data-doctor-clear>Đóng hồ sơ</button>${visitActions ? `<details class="doctor-visit-actions"><summary>Thao tác lượt khám</summary><div>${visitActions}</div></details>` : ''}</div>` : ''}</div>${visit ? `<nav class="doctor-tabs" role="tablist" aria-label="Nội dung hồ sơ">${tabs.map(([key, title]) => `<button type="button" role="tab" data-doctor-tab="${key}" aria-selected="${ctx.doctorTab === key}" aria-controls="doctorTabContent">${title}</button>`).join('')}</nav>` : ''}${errors.length ? `<div class="record-errors" role="status">${errors.map(e => `<p>${esc(e)}</p>`).join('')}<button type="button" data-doctor-reload>Thử lại</button></div>` : ''}<div class="doctor-profile-body" id="doctorTabContent" role="tabpanel">${content}${ctx.resultContent || ''}</div></section></section>`;
}
