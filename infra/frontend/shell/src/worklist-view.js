// Rendering of the server worklists contributed by modules. Rows come from the backend with paging;
// selecting a row only fills the working context and form defaults, every write is still confirmed
// and checked by the server.
import { esc, formatTime } from "@vinshc/core";

const EMPTY = {
  patients: ['Chưa tìm thấy hồ sơ phù hợp', 'Thử tên không dấu, CCCD hoặc số điện thoại. Kiểm tra lại trước khi đăng ký mới.', 'patients', 'registerPatient', 'Đăng ký bệnh nhân mới'],
  visits: ['Chưa có lượt khám phù hợp', 'Kiểm tra ngày và trạng thái đang lọc, hoặc tìm hồ sơ người bệnh để tiếp nhận.', 'patients', null, 'Tìm người bệnh'],
  appointments: ['Chưa có lịch hẹn phù hợp', 'Đổi ngày hoặc trạng thái để xem các lịch đã đặt.', 'appointments', 'book', 'Đặt lịch hẹn'],
  queue: ['Chưa có người bệnh trong bộ lọc này', 'Kiểm tra điểm phục vụ hoặc trạng thái đang lọc.', 'queue', 'enqueue', 'Thêm vào hàng đợi'],
  vitals: ['Chưa có lần đo trong bộ lọc này', 'Chọn đúng người bệnh và lượt khám. Bắt đầu lần đo khi cần ghi mới.', 'vitals', 'startVitalsEncounter', 'Bắt đầu lần đo'],
  bills: ['Chưa có phiếu phí phù hợp', 'Kiểm tra trạng thái phiếu và ngày lập. Để lập phí, chọn lượt khám trước.', 'visits', null, 'Chọn lượt khám'],
  payments: ['Chưa có giao dịch phù hợp', 'Mặc định chỉ hiển thị chuyển khoản đang chờ xác nhận. Đổi bộ lọc để xem giao dịch khác.'],
  orders: ['Chưa có chỉ định phù hợp', 'Kiểm tra ngày, trạng thái và phân công. KTV chỉ thấy chỉ định trong phạm vi được giao.', 'orders', 'createOrder', 'Tạo chỉ định'],
  prescriptions: ['Chưa có đơn thuốc phù hợp', 'Mặc định chỉ hiện thuốc còn phải cấp trong ngày. Đổi bộ lọc để xem lịch sử.'],
};

// Row actions that cancel, refund, revoke or void use the danger style and are never the primary action.
const DANGER = /^(Hủy|Huỷ|Hoàn tiền|Xóa|Xoá|Thu hồi|Ngừng|Khóa|Khoá|Từ chối|Vô hiệu|Đánh dấu nhập sai)/i;

export function renderWorklist(worklists, key, ctx) {
  const w = worklists[key],
    list = ctx.list || {},
    blocked = w.needs && !ctx.context[w.needs];
  return `<section class="panel workspace-records worklist" data-worklist-panel="${key}"><div class="workspace-heading"><div><h2>${esc(w.title)}</h2><p>${esc(w.hint)}</p></div><button type="button" data-worklist-reload="${key}" ${blocked ? 'disabled' : ''}>Làm mới</button></div>
<form data-worklist="${key}" class="worklist-filters"><div class="form-grid">${w.filters.map((f) => ctx.field({ ...f, name: "wl_" + f.name, placeholder: "Tất cả" }, { ["wl_" + f.name]: (list.filters || {})[f.name] ?? f.value ?? "" })).join("")}</div><div class="form-actions"><button type="submit" ${blocked ? "disabled" : ""}>Tìm kiếm</button></div></form>
<div data-worklist-results="${key}" aria-live="polite">${renderWorklistResults(worklists, key, ctx)}</div></section>`;
}
// Only this part is repainted when a response arrives, so filters being edited are never reset.
export function renderWorklistResults(
  worklists,
  key,
  { list = {}, canNavigate, context, selected = {}, role },
) {
  const w = worklists[key],
    rows = list.rows || [],
    blocked = w.needs && !context[w.needs];
  const actionButtons = (row, index) => {
    if (role === "doctor" && key === "visits") return "";
    const buttons = row.actions.map((a, i) => canNavigate(a)
      ? { html: `<button type="button" data-row-action data-list="${key}" data-row="${index}" data-action-index="${i}">${esc(a.label)}</button>`, a } : null).filter(Boolean).map(({ html, a }, i) => DANGER.test(a.label) ? html.replace('<button ', '<button class="danger" ') : i === 0 ? html.replace('<button ', '<button class="row-primary" ') : html);
    return buttons.slice(0, 2).join('') + (buttons.length > 2 ? `<details class="row-more"><summary>Khác</summary><div>${buttons.slice(2).join('')}</div></details>` : '');
  };
  const status = list.loading
    ? '<p class="readonly">Đang tải…</p>'
    : list.loadedAt
      ? `<p class="readonly worklist-time">Cập nhật lúc ${esc(formatTime(list.loadedAt))}</p>`
      : "";
  if (blocked)
    return '<p class="readonly">Chọn bệnh nhân trong Hồ sơ đang làm việc hoặc từ danh sách bệnh nhân/lượt khám để xem.</p>';
  if (list.error)
    return status + `<div class="list-feedback"><strong>Chưa tải được danh sách</strong><p class="error" role="alert">${esc(list.error)}</p><button type="button" data-worklist-reload="${key}">Thử tải lại</button></div>`;
  if (list.loading) return `<div class="list-loading" role="status" aria-busy="true"><span>Đang tải danh sách…</span><span class="skeleton" aria-hidden="true"></span><span class="skeleton" aria-hidden="true"></span><span class="skeleton" aria-hidden="true"></span></div>`;
  if (!list.loadedAt)
    return status || '<p class="readonly">Chưa tải danh sách.</p>';
  if (!rows.length) {
    const [title, hint, section, action, label] = EMPTY[key] || ['Chưa có kết quả phù hợp', 'Thử đổi bộ lọc hoặc kiểm tra lại ngày đã chọn.'];
    return status + `<div class="workspace-empty"><strong>${esc(title)}</strong><p>${esc(hint)}</p><div class="empty-actions"><button type="button" data-worklist-reset="${key}">Đặt lại bộ lọc</button>${section && canNavigate({ section, action }) ? `<button type="button" data-empty-section="${section}" ${action ? `data-empty-action="${action}"` : ''}>${esc(label)}</button>` : ''}</div></div>`;
  }
  const doctorList = role === 'doctor' && key === 'visits';
  return (
    status + `<p class="list-count">Đang hiển thị ${rows.length} bản ghi${list.hasMore ? ' · Còn bản ghi ở trang sau' : ''}</p>` +
    `${doctorList ? '<div class="doctor-patient-list">' : '<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Bản ghi</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>'}${rows
      .map((raw, index) => {
        const row = w.row(raw);
        const isSelected = selected[w.recordType] === row.id;
        const primary = role === 'doctor' && key === 'visits' ? -1 : row.actions.findIndex(canNavigate);
        const title = `<button type="button" class="worklist-record-link" data-row-action data-list="${key}" data-row="${index}" data-action-index="${primary < 0 ? 'select' : primary}">${esc(row.title || '—')}</button>`;
        if (role === 'doctor' && key === 'visits') return `<article data-worklist-row="visits" class="doctor-patient-row ${isSelected ? 'selected-row' : ''}">${title}<p>${esc(row.detail)}</p><span class="row-status">${esc(row.status)}</span></article>`;
        return `<tr data-worklist-row="${key}" class="${isSelected ? 'selected-row' : ''}"><td data-label="Hồ sơ"><strong>${title}</strong>${isSelected ? '<small class="selected-note">Đang chọn</small>' : ''}</td><td data-label="Thông tin">${esc(row.detail)}</td><td data-label="Trạng thái"><span class="row-status" data-state="${esc(raw.status || raw.state || '')}">${esc(row.status)}</span></td><td data-label="Thao tác">${actionButtons(row, index)}</td></tr>`;
      })
      .join(
        "",
      )}${doctorList ? '</div>' : '</tbody></table></div>'}${list.hasMore ? `<button type="button" data-worklist-more="${key}">Tải thêm</button>` : ""}`
  );
}
export function rowAt(worklists, key, list, index) {
  return worklists[key].row(list.rows[index]);
}
