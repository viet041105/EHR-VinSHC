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
  return `<details class="panel context-panel" ${memory.context.patient ? "" : "open"}><summary><span>Hồ sơ đang làm việc</span><small>${memory.context.patient ? esc(memory.contextLabel || "Đã chọn mã bệnh nhân") + (memory.context.visit ? " · có lượt khám" : "") : "Chưa chọn bệnh nhân"}</small></summary><p class="readonly">Chọn từ danh sách bệnh nhân/lượt khám hoặc nhập mã. Các mã được dùng chung cho biểu mẫu trong workspace này; backend kiểm tra liên kết và quyền khi gửi.</p><form id="careContextForm"><div class="form-grid">${contextField("patient", "Mã bệnh nhân (UUID)")}${canVisit ? contextField("visit", "Mã lượt khám (UUID)") + contextField("encounter", "Mã encounter (UUID)") : ""}</div><div class="form-actions"><button type="submit">Áp dụng mã hồ sơ</button><button type="button" id="clearCareContext">Bỏ chọn hồ sơ</button></div></form>${memory.context.patient ? `<div class="context-links">${openButton("identity", "identity", "Đọc hành chính")}${permitted(role, "clinical_chart", "read") && memory.context.encounter ? openButton("clinical", "summary", "Đọc hồ sơ lần khám") : ""}</div>` : ""}</details>`;
}
function recordTable(section, { memory, stateText, registry }) {
  const rows = memory.list(section.records);
  return `<section class="panel workspace-records"><div class="workspace-heading"><div><h2>Bản ghi đã mở trong phiên</h2><p>Chỉ gồm phản hồi thật đã nhận trong workspace này; không phải danh sách toàn bộ từ server.</p></div><span class="session-count">${rows.length} bản ghi</span></div>${
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
                "Đã nhận từ backend";
            return `<tr data-session-record data-filter="${esc([row.id, info, d.status, d.state].filter(Boolean).join(" ").toLowerCase())}"><td><strong>${esc(type.label)}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(info)}${typeof d.totalVnd === "number" || typeof d.amountVnd === "number" ? `<small>${esc(formatVnd(d.totalVnd ?? d.amountVnd))}</small>` : ""}<small>Đã nhận lúc ${esc(new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(row.openedAt)))}</small></td><td>${row.stale ? pendingBadge("Cần đọc lại") : esc(stateText(d.status || d.state || "Đã đọc"))}</td><td><button type="button" data-select-type="${row.type}" data-select-id="${row.id}">Chọn</button>${type.read ? `<button type="button" data-read-type="${row.type}" data-read-id="${row.id}">Đọc lại</button>` : ""}</td></tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p id="sessionFilterEmpty" class="readonly" hidden>Không có bản ghi đã mở phù hợp bộ lọc.</p>`
      : emptyState(
          "Chưa mở bản ghi nào",
          "Đọc một mã có sẵn hoặc thực hiện nghiệp vụ được cấp quyền để xem bản ghi tại đây.",
        )
  }</section>`;
}
function overview(ctx) {
  const available = ctx.sections.filter(
    (s) => s.id !== OVERVIEW.id && s.overview !== false,
  );
  return `<section class="workspace-welcome"><div><span class="eyebrow">CÔNG VIỆC THEO VAI TRÒ</span><h2>${esc(m.permissions.roles[ctx.role].label)}</h2><p>Chọn hồ sơ, mở công việc và thực hiện các thao tác được phân quyền tại cơ sở hiện tại.</p></div><div class="workspace-stat"><strong>${ctx.memory.records.size}</strong><span>Bản ghi đã mở trong phiên</span></div></section><div class="workspace-card-grid">${available.map((s) => `<article class="panel task-card"><div class="task-icon" aria-hidden="true">${esc(s.icon || "▤")}</div><h2>${esc(s.title)}</h2><p>${esc(s.description || s.note || "Mở các chức năng được cấp quyền trong workspace hiện tại.")}</p>${s.partial ? pendingBadge(s.partial) : CONNECTED_BADGE}<div>${openButton(s.id, null, "Mở công việc →")}</div></article>`).join("")}</div><section class="panel workflow-guide"><h2>Quy trình phòng khám</h2><ol>${m.workflow.configs[0].flow.map((step) => `<li>${esc({ RECEPTION: "Tiếp nhận", NURSE: "Sinh hiệu", DOCTOR: "Khám", LAB_IF_ORDERED: "CLS nếu có chỉ định", CASHIER: "Thanh toán", PHARMACY_IF_PRESCRIBED: "Cấp thuốc nếu có đơn" }[step] || step)}</li>`).join("")}</ol><p class="readonly">Chọn bản ghi trong danh sách để điền sẵn biểu mẫu. Chuyển màn hình không tự tạo lượt, thu tiền hoặc chuyển hàng đợi; mọi thao tác ghi cần xác nhận.</p></section>`;
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
