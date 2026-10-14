// Screens owned by the shell: the overview, the working-record panel, the session record table and
// the frame of a module section (intro/header/worklists/footer hooks come from the module).
import {
  metadata as m,
  permitted,
  id,
  esc,
  formatVnd,
  pendingBadge,
  CONNECTED_BADGE,
  openButton,
  emptyState,
} from "@vinshc/core";
import { SECTION_COPY, ROLE_START, sectionIcon } from "./presentation.js";

export const OVERVIEW = {
  id: "overview",
  title: "Tổng quan công việc",
  actions: [],
};
export function contextPanel({ role, memory, field }) {
  if (!permitted(role, "patient_identity", "read")) return "";
  const canVisit =
    permitted(role, "visit", "read") ||
    permitted(role, "clinical_chart", "read");
  const contextField = (key, label) =>
    field(id("care_" + key, label, false), {
      ["care_" + key]: memory.context[key] || "",
    });
  return `<section class="panel care-summary"><div><span class="eyebrow">BỆNH NHÂN ĐANG CHỌN</span><strong>${memory.context.patient ? esc(memory.contextLabel || "Hồ sơ đã chọn") : "Chưa chọn bệnh nhân"}</strong><p>${memory.context.patient ? memory.context.visit ? 'Đã chọn lượt khám. Các biểu mẫu dùng hồ sơ này.' : 'Chọn lượt khám để tiếp tục công việc.' : 'Chọn một dòng trong danh sách bệnh nhân hoặc lượt khám.'}</p></div><div class="context-links">${memory.context.patient ? `<button type="button" id="clearCareContext">Bỏ chọn</button>${permitted(role, "clinical_chart", "read") && memory.context.encounter ? openButton("clinical", "summary", "Xem hồ sơ khám") : ""}` : openButton("patients", null, "Tìm bệnh nhân")}</div><details class="context-panel"><summary>Chọn hồ sơ bằng mã</summary><form id="careContextForm"><div class="form-grid">${contextField("patient", "Mã bệnh nhân")}${canVisit ? contextField("visit", "Mã lượt khám") + contextField("encounter", "Mã lần khám") : ''}</div><button type="submit">Áp dụng mã hồ sơ</button></form></details></section>`;
}
function recordTable(section, { memory, stateText, registry }) {
  const rows = memory.list(section.records);
  if (!rows.length) return "";
  return `<details class="panel workspace-records session-records"><summary>Hồ sơ đã xem trong phiên · ${rows.length}</summary><div class="workspace-heading"><div><h2>Bản ghi đã mở trong phiên</h2><p>Các hồ sơ bạn đã mở trong lần đăng nhập này.</p></div><span class="session-count">${rows.length} bản ghi</span></div>${
    rows.length
      ? `<label class="session-filter">Lọc các bản ghi đã mở<input id="sessionRecordFilter" type="search" placeholder="Mã, trạng thái, dịch vụ…" autocomplete="off"></label><div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Loại / mã</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows
          .map((row) => {
            const d = row.data,
              type = registry.records[row.type] || { label: row.type },
              info =
                d.serviceName ||
                d.original_name ||
                (d.queueNumber && "Số " + d.queueNumber) ||
                d.patientUuid ||
                d.billUuid ||
                d.orderUuid ||
                "Đã xem";
            return `<tr data-session-record data-filter="${esc([row.id, info, d.status, d.state].filter(Boolean).join(" ").toLowerCase())}"><td><strong>${esc(type.label)}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(info)}${typeof d.totalVnd === "number" || typeof d.amountVnd === "number" ? `<small>${esc(formatVnd(d.totalVnd ?? d.amountVnd))}</small>` : ""}<small>Đã nhận lúc ${esc(new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(row.openedAt)))}</small></td><td>${row.stale ? pendingBadge("Cần đọc lại") : esc(stateText(d.status || d.state || "Đã đọc"))}</td><td><button type="button" data-select-type="${row.type}" data-select-id="${row.id}">Chọn</button>${type.read ? `<button type="button" data-read-type="${row.type}" data-read-id="${row.id}">Đọc lại</button>` : ""}</td></tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p id="sessionFilterEmpty" class="readonly" hidden>Không có bản ghi đã mở phù hợp bộ lọc.</p>`
      : emptyState(
          "Chưa mở bản ghi nào",
          "Đọc một mã có sẵn hoặc thực hiện nghiệp vụ được cấp quyền để xem bản ghi tại đây.",
        )
  }</details>`;
}
function overview(ctx) {
  const available = ctx.sections.filter(
    (s) => s.id !== OVERVIEW.id && s.overview !== false,
  );
  const [title, description, first] = ROLE_START[ctx.role];
  const start = available.find(s => s.id === first) || available[0];
  return `<section class="daily-start"><div><span class="eyebrow">BẮT ĐẦU CA LÀM VIỆC</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${start ? openButton(start.id, null, 'Mở ' + (SECTION_COPY[start.id]?.[0] || start.title).toLowerCase()) : ''}</div><aside><span>Thao tác thường dùng</span><p>Chọn hồ sơ trong danh sách, kiểm tra thông tin rồi xác nhận thao tác.</p></aside></section><section class="panel task-directory"><div class="workspace-heading"><h2>Công việc của bạn</h2><span>${available.length} mục được phân công</span></div><div class="task-directory-list">${available.map(s => `<button type="button" data-go-section="${s.id}" class="task-entry">${sectionIcon(s.id)}<span><strong>${esc(SECTION_COPY[s.id]?.[0] || s.title)}</strong><small>${esc(SECTION_COPY[s.id]?.[1] || 'Xem thông tin và thực hiện công việc.')}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></section>${['manager','admin'].includes(ctx.role) ? '' : `<section class="workflow-guide"><h2>Các bước trong lượt khám</h2><ol>${m.workflow.configs[0].flow.map(step => `<li>${esc({ RECEPTION:'Tiếp nhận', NURSE:'Đo sinh hiệu', DOCTOR:'Khám bệnh', LAB_IF_ORDERED:'Làm CLS nếu có', CASHIER:'Thanh toán', PHARMACY_IF_PRESCRIBED:'Cấp thuốc nếu có' }[step] || step)}</li>`).join('')}</ol><p>Chọn công việc của bạn ở menu bên trái để tiếp tục. Mỗi thao tác lưu cần được xác nhận.</p></section>`}`;
}
/** Section body below the action form: module header, worklists, module footer, session records. */
export function workspaceScreen(section, ctx) {
  if (section.id === OVERVIEW.id) return overview(ctx);
  const worklists = (ctx.registry.sectionWorklists[section.id] || [])
    .filter((key) => ctx.canList(key))
    .map((key) => ctx.worklist(key))
    .join("");
  return (
    (section.header?.(ctx) || "") +
    worklists +
    (section.footer?.(ctx) || "") +
    (section.records ? recordTable(section, ctx) : "")
  );
}
export function resultHighlights(result) {
  if (!result || Array.isArray(result) || typeof result !== "object") return "";
  if (result.totals && typeof result.totals === "object")
    return resultHighlights(result.totals);
  const keys = {
    totalVnd: "Tổng phí",
    settledVnd: "Đã thu",
    outstandingVnd: "Còn phải thu",
    refundedVnd: "Đã hoàn",
    grossVnd: "Tổng thu",
    refundVnd: "Hoàn tiền",
    netVnd: "Thu ròng",
    openedVisits: "Lượt mở",
    completedVisits: "Lượt hoàn tất",
  };
  const entries = Object.entries(keys).filter(
    ([key]) => typeof result[key] === "number",
  );
  return entries.length
    ? `<div class="result-metrics">${entries.map(([key, label]) => `<div><span>${label}</span><strong>${esc(key.endsWith("Vnd") ? formatVnd(result[key]) : result[key])}</strong></div>`).join("")}</div>`
    : "";
}
