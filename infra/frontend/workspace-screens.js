import { metadata as m, permitted } from "./metadata.js";
import { recordTypes } from "./workspace-model.js";
import { F, id, choice } from "./connected-actions.js";
import { patientSections } from "./care-actions.js";
import { sectionWorklists } from "./worklists.js";

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pending = (text) =>
  `<span class="capability-badge pending">${esc(text || "Chờ backend")}</span>`;
const connected = '<span class="capability-badge connected">Đã nối API</span>';
const money = (value) =>
  typeof value === "number"
    ? new Intl.NumberFormat("vi-VN").format(value) + " ₫"
    : "—";
const empty = (title, text) =>
  `<div class="workspace-empty"><span class="empty-symbol" aria-hidden="true">▤</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
const open = (section, action, label) =>
  `<button type="button" data-go-section="${section}" ${action ? `data-go-action="${action}"` : ""}>${esc(label)}</button>`;
export function extraSections(role) {
  return [
    { id: "overview", title: "Tổng quan công việc", actions: [] },
    ...(permitted(role, "patient_identity", "read")
      ? [
          {
            id: "patients",
            title: "Bệnh nhân",
            resource: "patient_identity",
            actions: patientSections.patients,
          },
        ]
      : []),
    ...(permitted(role, "visit", "read")
      ? [
          {
            id: "visits",
            title: "Lượt khám",
            resource: "visit",
            actions: patientSections.visits,
          },
        ]
      : []),
  ];
}
export function contextPanel({ role, memory, field }) {
  if (!permitted(role, "patient_identity", "read")) return "";
  const canVisit =
    permitted(role, "visit", "read") ||
    permitted(role, "clinical_chart", "read");
  const contextField = (key, label) =>
    field(id("care_" + key, label, false), {
      ["care_" + key]: memory.context[key] || "",
    });
  return `<details class="panel context-panel" ${memory.context.patient ? "" : "open"}><summary><span>Hồ sơ đang làm việc</span><small>${memory.context.patient ? esc(memory.contextLabel || "Đã chọn mã bệnh nhân") + (memory.context.visit ? " · có lượt khám" : "") : "Chưa chọn bệnh nhân"}</small></summary><p class="readonly">Chọn từ danh sách bệnh nhân/lượt khám hoặc nhập mã. Các mã được dùng chung cho biểu mẫu trong workspace này; backend kiểm tra liên kết và quyền khi gửi.</p><form id="careContextForm"><div class="form-grid">${contextField("patient", "Mã bệnh nhân (UUID)")}${canVisit ? contextField("visit", "Mã lượt khám (UUID)") + contextField("encounter", "Mã encounter (UUID)") : ""}</div><div class="form-actions"><button type="submit">Áp dụng mã hồ sơ</button><button type="button" id="clearCareContext">Bỏ chọn hồ sơ</button></div></form>${memory.context.patient ? `<div class="context-links">${open("identity", "identity", "Đọc hành chính")}${permitted(role, "clinical_chart", "read") && memory.context.encounter ? open("clinical", "summary", "Đọc hồ sơ lần khám") : ""}</div>` : ""}</details>`;
}
const descriptions = {
  patients: "Tìm, đăng ký và sửa thông tin hành chính; mở lượt khám từ hồ sơ.",
  visits:
    "Danh sách lượt đang mở trong ngày, mở/kết thúc lượt và chuyển sang đo sinh hiệu, khám, thu ngân.",
  vitals:
    "Mở encounter sinh hiệu, ghi lần đo, xem lịch sử, đính chính hoặc hủy có lý do.",
  appointments:
    "Lịch hẹn theo ngày, cập nhật trạng thái, check-in mở lượt và in giấy hẹn.",
  queue: "Bảng hàng đợi theo điểm phục vụ, gọi số và chuyển bước.",
  billing:
    "Phiếu phí chưa thu đủ, giao dịch chuyển khoản chờ xác nhận, thu/hoàn/hủy.",
  orders:
    "Chỉ định CLS đang xử lý, phân công KTV, ghi kết quả và tệp đính kèm.",
  pharmacy: "Đơn thuốc chờ cấp, ghi cấp theo số lượng kê, số lô và hạn dùng.",
};
const sectionTypes = {
  patients: ["patient"],
  identity: ["patient"],
  visits: ["visit", "encounter"],
  vitals: ["vitals"],
  clinical: ["encounter", "prescription"],
  appointments: ["appointment"],
  queue: ["queue"],
  billing: ["bill", "payment"],
  orders: ["order", "result", "attachment"],
  pharmacy: ["prescription"],
};
function recordTable(section, { memory, stateText }) {
  const rows = memory.list(sectionTypes[section] || []);
  return `<section class="panel workspace-records"><div class="workspace-heading"><div><h2>Bản ghi đã mở trong phiên</h2><p>Chỉ gồm phản hồi thật đã nhận trong workspace này; không phải danh sách toàn bộ từ server.</p></div><span class="session-count">${rows.length} bản ghi</span></div>${
    rows.length
      ? `<label class="session-filter">Lọc các bản ghi đã mở<input id="sessionRecordFilter" type="search" placeholder="Mã, trạng thái, dịch vụ…" autocomplete="off"></label><div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Loại / mã</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows
          .map((row) => {
            const d = row.data,
              info =
                d.serviceName ||
                d.original_name ||
                (d.queueNumber && "Số " + d.queueNumber) ||
                d.patientUuid ||
                d.billUuid ||
                d.orderUuid ||
                "Đã nhận từ backend";
            return `<tr data-session-record data-filter="${esc([row.id, info, d.status, d.state].filter(Boolean).join(" ").toLowerCase())}"><td><strong>${esc(recordTypes[row.type].label)}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(info)}${typeof d.totalVnd === "number" || typeof d.amountVnd === "number" ? `<small>${esc(money(d.totalVnd ?? d.amountVnd))}</small>` : ""}<small>Đã nhận lúc ${esc(new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(row.openedAt)))}</small></td><td>${row.stale ? pending("Cần đọc lại") : esc(stateText(d.status || d.state || "Đã đọc"))}</td><td><button type="button" data-select-type="${row.type}" data-select-id="${row.id}">Chọn</button>${recordTypes[row.type].read ? `<button type="button" data-read-type="${row.type}" data-read-id="${row.id}">Đọc lại</button>` : ""}</td></tr>`;
          })
          .join(
            "",
          )}</tbody></table></div><p id="sessionFilterEmpty" class="readonly" hidden>Không có bản ghi đã mở phù hợp bộ lọc.</p>`
      : empty(
          "Chưa mở bản ghi nào",
          "Đọc một mã có sẵn hoặc thực hiện nghiệp vụ được cấp quyền để xem bản ghi tại đây.",
        )
  }</section>`;
}
function preparation(
  title,
  description,
  fields,
  { field },
  button = "Lưu lên hệ thống",
) {
  return `<details class="panel preparation-panel"><summary><span>${esc(title)}</span>${pending()}</summary><p class="readonly">${esc(description)} Các trường chỉ để xem trước và nhập thử, chưa lưu lên hệ thống.</p><form data-pending-form><div class="form-grid">${fields.map((f) => field({ ...f, name: "preview_" + f.name }, {})).join("")}</div><div class="form-actions"><button type="submit" disabled data-unavailable>${esc(button)} · Chờ backend</button></div></form></details>`;
}
function overview(ctx) {
  const available = ctx.sections.filter(
    (s) => !["overview", "documents", "identity"].includes(s.id),
  );
  return `<section class="workspace-welcome"><div><span class="eyebrow">CÔNG VIỆC THEO VAI TRÒ</span><h2>${esc(m.permissions.roles[ctx.role].label)}</h2><p>Chọn hồ sơ, mở công việc và thực hiện các thao tác được phân quyền tại cơ sở hiện tại.</p></div><div class="workspace-stat"><strong>${ctx.memory.records.size}</strong><span>Bản ghi đã mở trong phiên</span></div></section><div class="workspace-card-grid">${available.map((s) => `<article class="panel task-card"><div class="task-icon" aria-hidden="true">${esc({ patients: "◎", visits: "↗", vitals: "♥", clinical: "✚", appointments: "▦", queue: "≡", billing: "₫", orders: "⌕", pharmacy: "✚", reports: "▥", admin: "⚙" }[s.id] || "▤")}</div><h2>${esc(s.title)}</h2><p>${esc(descriptions[s.id] || s.note || "Mở các chức năng được cấp quyền trong workspace hiện tại.")}</p>${s.id === "admin" ? pending("Một phần chờ backend") : connected}<div>${open(s.id, null, "Mở công việc →")}</div></article>`).join("")}</div><section class="panel workflow-guide"><h2>Quy trình phòng khám</h2><ol>${m.workflow.configs[0].flow.map((step) => `<li>${esc({ RECEPTION: "Tiếp nhận", NURSE: "Sinh hiệu", DOCTOR: "Khám", LAB_IF_ORDERED: "CLS nếu có chỉ định", CASHIER: "Thanh toán", PHARMACY_IF_PRESCRIBED: "Cấp thuốc nếu có đơn" }[step] || step)}</li>`).join("")}</ol><p class="readonly">Chọn bản ghi trong danh sách để điền sẵn biểu mẫu. Chuyển màn hình không tự tạo lượt, thu tiền hoặc chuyển hàng đợi; mọi thao tác ghi cần xác nhận.</p></section>`;
}
export function workspaceScreen(section, ctx) {
  if (section === "overview") return overview(ctx);
  let content = (sectionWorklists[section] || [])
    .filter((key) => ctx.canList(key))
    .map((key) => ctx.worklist(key))
    .join("");
  if (section === "patients")
    content =
      `<section class="panel workspace-heading"><div><h2>Hồ sơ bệnh nhân</h2><p>Tìm hồ sơ trước khi đăng ký mới để tránh trùng. Chọn một dòng để dùng cho các thao tác tiếp theo.</p></div>${open("identity", "identity", "Người liên hệ / địa chỉ")}</section>` +
      content;
  if (section === "admin")
    content +=
      `<section class="panel admin-directory"><div class="workspace-heading"><div><h2>Tài khoản và phân quyền</h2><p>Vai trò được định nghĩa trong metadata; quyền sử dụng còn phụ thuộc phân công cơ sở của từng tài khoản.</p></div>${connected}</div><div class="role-tags">${Object.values(
        m.permissions.roles,
      )
        .map((role) => `<span>${esc(role.label)}</span>`)
        .join(
          "",
        )}</div><div class="context-links">${ctx.canAction("systemUsers") ? open("admin", "systemUsers", "Tìm tài khoản") : ""}${ctx.canAction("grantAppRole") ? open("admin", "grantAppRole", "Thêm role cho tài khoản") : ""}${open("admin", "assignWorkspace", "Phân công cơ sở")}${open("admin", "workspace", "Kiểm tra phân công")}${open("admin", "audit", "Nhật ký truy cập")}</div></section>` +
      preparation(
        "Tạo tài khoản nhân viên",
        "Chưa có luồng tạo tài khoản trên FE. Việc thêm role hiện tại chỉ áp dụng cho user đã tồn tại.",
        [
          F("username", "Tên đăng nhập"),
          F("fullName", "Họ tên nhân viên"),
          choice(
            "role",
            "Vai trò ứng dụng",
            Object.entries(m.permissions.roles).map(([k, v]) => [k, v.label]),
          ),
        ],
        ctx,
        "Tạo tài khoản",
      );
  if (section === "admin")
    content += preparation(
      "Thiết lập cơ sở và biểu mẫu",
      "Cấu hình hiện tại có thể đọc qua chức năng Kiểm tra cấu hình nghiệp vụ; backend chưa có API chỉnh cấu hình dành cho workspace.",
      [
        F("facilityName", "Tên cơ sở"),
        F("facilityAddress", "Địa chỉ cơ sở", "textarea"),
        F("facilityPhone", "Điện thoại", "tel", { required: false }),
        choice(
          "workflow",
          "Quy trình",
          m.workflow.configs.map((c) => [
            c.code,
            c.code === "STANDARD_POSTPAY"
              ? "Có điều dưỡng, trả sau"
              : "Tinh gọn, trả trước",
          ]),
        ),
        F("formVersion", "Phiên bản biểu mẫu", "text", { required: false }),
      ],
      ctx,
      "Lưu thiết lập",
    );
  return content + (sectionTypes[section] ? recordTable(section, ctx) : "");
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
    ? `<div class="result-metrics">${entries.map(([key, label]) => `<div><span>${label}</span><strong>${esc(key.endsWith("Vnd") ? money(result[key]) : result[key])}</strong></div>`).join("")}</div>`
    : "";
}
