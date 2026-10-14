// Rendering of the server worklists contributed by modules. Rows come from the backend with paging;
// selecting a row only fills the working context and form defaults, every write is still confirmed
// and checked by the server.
import { esc, formatTime } from "@vinshc/core";

export function renderWorklist(worklists, key, ctx) {
  const w = worklists[key],
    list = ctx.list || {},
    blocked = w.needs && !ctx.context[w.needs];
  return `<section class="panel workspace-records worklist" data-worklist-panel="${key}"><div class="workspace-heading"><div><h2>${esc(w.title)}</h2><p>${esc(w.hint)}</p></div><span class="capability-badge connected">Dữ liệu từ backend</span></div>
<form data-worklist="${key}" class="worklist-filters"><div class="form-grid">${w.filters.map((f) => ctx.field({ ...f, name: "wl_" + f.name, placeholder: "Tất cả" }, { ["wl_" + f.name]: (list.filters || {})[f.name] ?? f.value ?? "" })).join("")}</div><div class="form-actions"><button type="submit" ${blocked ? "disabled" : ""}>Tải danh sách</button></div></form>
<div data-worklist-results="${key}" aria-live="polite">${renderWorklistResults(worklists, key, ctx)}</div></section>`;
}
// Only this part is repainted when a response arrives, so filters being edited are never reset.
export function renderWorklistResults(
  worklists,
  key,
  { list = {}, canNavigate, context },
) {
  const w = worklists[key],
    rows = list.rows || [],
    blocked = w.needs && !context[w.needs];
  const actionButtons = (row, index) =>
    row.actions
      .map((a, i) =>
        canNavigate(a)
          ? `<button type="button" data-row-action data-list="${key}" data-row="${index}" data-action-index="${i}">${esc(a.label)}</button>`
          : "",
      )
      .join("");
  const status = list.loading
    ? '<p class="readonly">Đang tải…</p>'
    : list.loadedAt
      ? `<p class="readonly worklist-time">Cập nhật lúc ${esc(formatTime(list.loadedAt))}</p>`
      : "";
  if (blocked)
    return '<p class="readonly">Chọn bệnh nhân trong Hồ sơ đang làm việc hoặc từ danh sách bệnh nhân/lượt khám để xem.</p>';
  if (list.error)
    return status + `<p class="error" role="alert">${esc(list.error)}</p>`;
  if (!list.loadedAt)
    return status || '<p class="readonly">Chưa tải danh sách.</p>';
  if (!rows.length)
    return (
      status +
      '<div class="workspace-empty"><strong>Không có bản ghi phù hợp</strong><p>Backend không trả bản ghi nào cho bộ lọc này.</p></div>'
    );
  return (
    status +
    `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Bản ghi</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows
      .map((raw, index) => {
        const row = w.row(raw);
        return `<tr data-worklist-row="${key}"><td><strong>${esc(row.title || "—")}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(row.detail)}</td><td>${esc(row.status)}</td><td><button type="button" data-row-action data-list="${key}" data-row="${index}" data-action-index="select">Chọn</button>${actionButtons(row, index)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div>${list.hasMore ? `<button type="button" data-worklist-more="${key}">Tải thêm</button>` : ""}`
  );
}
export function rowAt(worklists, key, list, index) {
  return worklists[key].row(list.rows[index]);
}
