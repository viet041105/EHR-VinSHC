// Guided admin console: staff list, one-step onboarding (account + workspace + provider) and a
// readable change history. Raw per-endpoint tools stay available under "Công cụ nâng cao".
import { metadata as m, active, esc, isSystemAdministrator, passwordRules, usernameProblem } from "@vinshc/core";

const ROLE_INFO = {
  reception: ["🧾", "Đón bệnh nhân, đăng ký hồ sơ và mở lượt khám."],
  cashier: ["💳", "Thu phí dịch vụ và hoàn tiền."],
  nurse: ["🩺", "Đo sinh hiệu và hỗ trợ bác sĩ."],
  doctor: ["👨‍⚕️", "Khám bệnh, chẩn đoán, chỉ định và kê đơn."],
  lab: ["🧪", "Thực hiện xét nghiệm, trả kết quả cận lâm sàng."],
  pharmacy: ["💊", "Cấp phát thuốc theo đơn."],
  manager: ["📊", "Theo dõi báo cáo vận hành phòng khám."],
  admin: ["🛡️", "Quản lý nhân viên và cấu hình phòng khám."],
};
// Roles whose clinical writes need a practitioner (provider) record at the facility.
const CLINICAL = new Set(["doctor", "nurse", "lab"]);
const AUDIT_TEXT = {
  "user.created": "Tạo tài khoản",
  "user.retired": "Khóa tài khoản",
  "user.activated": "Mở khóa tài khoản",
  "user.password_reset": "Đặt lại mật khẩu",
  "user.password_changed": "Nhân viên đổi mật khẩu",
  "user.role_granted": "Cấp thêm vai trò",
  "user.username_changed": "Đổi tên đăng nhập",
  "provider.created": "Tạo hồ sơ chuyên môn",
  "provider.linked": "Liên kết hồ sơ chuyên môn",
  "provider.unlinked": "Hủy liên kết hồ sơ chuyên môn",
  "provider.retired": "Ngừng hồ sơ chuyên môn",
};
// Backend reasons (English, stable strings) rewritten for non-technical readers.
const ERROR_TEXT = [
  [/username already exists/i, "Tên đăng nhập này đã có người dùng. Hãy chọn tên khác."],
  [/username format/i, "Tên đăng nhập chỉ gồm chữ không dấu, số và . _ -"],
  [/username is unchanged/i, "Tên đăng nhập mới giống tên hiện tại."],
  [/rename your own account/i, "Không thể đổi tên đăng nhập của tài khoản đang đăng nhập."],
  [/password/i, "Mật khẩu cần tối thiểu 6 ký tự."],
  [/already in the requested state/i, "Tài khoản đã ở trạng thái này rồi."],
  [/own administrative account/i, "Không thể tự khóa tài khoản đang đăng nhập."],
  [/already has an active Provider/i, "Nhân viên đã có hồ sơ chuyên môn."],
  [/exactly one VinSHC application role/i, "Mỗi nhân viên chỉ được có một vai trò."],
  [/facility does not exist/i, "Cơ sở không còn hoạt động."],
];

const roleLabel = (key) => m.permissions.roles[key]?.label || key;
const icon = (key) => ROLE_INFO[key]?.[0] || "👤";
const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const when = (iso) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function suggestUsername(familyName, givenName) {
  const given = fold(givenName).trim().split(/\s+/).pop() || "";
  const family = fold(familyName).trim().split(/\s+/)[0] || "";
  return [given, family].filter(Boolean).join(".").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
}
/** Readable temporary password, e.g. "Kx7m-Pq4t-Rw9z": always upper, lower and digit. */
export function temporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnpqrstuvwxyz", digit = "23456789";
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const group = () => pick(upper) + pick(lower) + pick(digit) + pick(lower);
  return [group(), group(), group()].join("-");
}
export function friendlyError(error) {
  const reason = [error?.details?.error, error?.details?.detail, error?.message].filter((v) => typeof v === "string").join(" ");
  for (const [pattern, text] of ERROR_TEXT) if (pattern.test(reason)) return text;
  if (error?.status === 403) return "Tài khoản đang dùng không có quyền làm việc này.";
  return error?.message || "Có lỗi xảy ra. Vui lòng thử lại.";
}

const ui = {
  tab: "staff",
  users: null,
  hasMore: false,
  loading: false,
  error: "",
  flash: "",
  query: "",
  roleFilter: "",
  showRetired: false,
  facilities: null,
  audit: null,
  panel: null, // {kind:"create"|"assign"|"reset"|"retire", user?, ...}
};
let ctx = null;

/** Active facilities: registered via the API plus the metadata catalogue (the seeded clinic lives there). */
function activeFacilities() {
  const byLocation = new Map();
  for (const f of [...active(m.facilities.records), ...(ui.facilities || [])])
    if (f.active !== false && !byLocation.has(f.locationUuid)) byLocation.set(f.locationUuid, f);
  return [...byLocation.values()];
}
const facilityOptions = () => activeFacilities().map((f) => [f.locationUuid, f.name]);
const facilitySelect = (name, selected) =>
  `<select name="${name}" required>${facilityOptions().map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

async function call(path, options) {
  try {
    return await ctx.client.request("vinshc/" + path, options);
  } catch (error) {
    if (error.status === 401) ctx.showError(error); // session ended: shell returns to login
    throw error;
  }
}

async function loadUsers(append = false) {
  ui.loading = true;
  ui.error = "";
  paint();
  try {
    const offset = append ? ui.users.length : 0;
    const data = await call("staff/users?" + new URLSearchParams({ q: ui.query, offset, limit: "100" }));
    const rows = (data?.results || []).filter((u) => u.username !== "daemon");
    ui.users = append ? [...ui.users, ...rows] : rows;
    ui.hasMore = Boolean(data.hasMore);
  } catch (error) {
    ui.error = friendlyError(error);
    ui.users = ui.users || [];
  }
  ui.loading = false;
  paint();
}
async function loadFacilities() {
  try {
    ui.facilities = (await call("directory/facilities"))?.results || [];
  } catch {
    ui.facilities = [];
  }
  paint();
}
async function loadAudit() {
  ui.audit = null;
  paint();
  try {
    ui.audit = (await call("staff/audit?limit=100"))?.results || [];
  } catch (error) {
    ui.audit = [];
    ui.error = friendlyError(error);
  }
  paint();
}

function stats() {
  const users = ui.users || [];
  const live = users.filter((u) => !u.retired);
  return `<div class="admin-stats">
    <div><span>Nhân viên đang làm việc</span><strong>${live.length}</strong></div>
    <div class="${live.some((u) => !u.workspace) ? "warn" : ""}"><span>Chưa phân công nơi làm việc</span><strong>${live.filter((u) => !u.workspace).length}</strong></div>
    <div><span>Đã khóa</span><strong>${users.length - live.length}</strong></div>
  </div>`;
}

function statusBadge(u) {
  if (u.retired) return '<span class="admin-badge muted">Đã khóa</span>';
  if (!u.workspace) return '<span class="admin-badge warn">Chưa phân công</span>';
  return '<span class="admin-badge ok">Đang hoạt động</span>';
}

function staffTable() {
  if (ui.users === null) return '<p class="admin-empty">Đang tải danh sách nhân viên…</p>';
  const me = ctx.client.user?.uuid;
  const rows = ui.users.filter((u) => (ui.showRetired || !u.retired) && (!ui.roleFilter || u.roles.includes(ui.roleFilter)));
  if (!rows.length) return `<div class="admin-empty"><strong>Không có nhân viên phù hợp</strong><p>Thử bỏ bộ lọc, hoặc bấm “Thêm nhân viên”.</p></div>`;
  return `<div class="workspace-table-wrap"><table class="workspace-table admin-staff-table"><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Nơi làm việc</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows
    .map((u) => {
      const role = u.roles[0];
      const self = u.uuid === me;
      const buttons = u.retired
        ? `<button type="button" data-admin="unretire" data-user="${u.uuid}">Mở khóa</button>`
        : [
            !u.workspace && role ? `<button type="button" class="primary" data-admin="assign" data-user="${u.uuid}">Phân công</button>` : "",
            u.workspace && role && !self ? `<button type="button" data-admin="assign" data-user="${u.uuid}">Đổi nơi làm việc</button>` : "",
            self ? "" : `<button type="button" data-admin="rename" data-user="${u.uuid}">Đổi tên đăng nhập</button>`,
            self ? "" : `<button type="button" data-admin="reset" data-user="${u.uuid}">Cấp lại mật khẩu</button>`,
            self ? "" : `<button type="button" class="danger" data-admin="retire" data-user="${u.uuid}">Khóa</button>`,
          ].join("");
      return `<tr class="${u.retired ? "retired" : ""}"><td><strong>${esc(u.display)}${self ? ' <span class="admin-you">(bạn)</span>' : ""}</strong><small>${esc(u.username || "")}</small></td>
        <td>${u.roles.length ? u.roles.map((r) => `<span class="admin-role">${icon(r)} ${esc(roleLabel(r))}</span>`).join(" ") : '<span class="admin-badge muted">Chưa có vai trò</span>'}</td>
        <td>${u.workspace ? esc(u.workspace.facilityName) : "—"}</td><td>${statusBadge(u)}</td><td class="admin-row-actions"><div>${buttons}</div></td></tr>`;
    })
    .join("")}</tbody></table></div>${ui.hasMore ? '<button type="button" data-admin="more" class="admin-more">Xem thêm</button>' : ""}`;
}

function createPanel(p) {
  const values = p.values || {};
  const role = values.role || "";
  return `<section class="panel admin-panel" aria-labelledby="adminPanelTitle">
    <div class="workspace-heading"><h2 id="adminPanelTitle">Thêm nhân viên mới</h2><button type="button" data-admin="close">Đóng</button></div>
    <form id="adminCreateForm" class="admin-steps" novalidate>
      <fieldset><legend><span>1</span> Nhân viên là ai?</legend><div class="form-grid">
        <label>Họ và tên đệm *<input name="familyName" required maxlength="100" placeholder="VD: Nguyễn Văn" value="${esc(values.familyName || "")}"></label>
        <label>Tên *<input name="givenName" required maxlength="100" placeholder="VD: An" value="${esc(values.givenName || "")}"></label>
        <div class="admin-gender" role="radiogroup" aria-label="Giới tính"><span class="field-label">Giới tính</span>${[["M", "Nam"], ["F", "Nữ"], ["U", "Không nêu"]].map(([v, l]) => `<label class="admin-pill"><input type="radio" name="gender" value="${v}" ${(values.gender || "U") === v ? "checked" : ""}>${l}</label>`).join("")}</div>
      </div></fieldset>
      <fieldset><legend><span>2</span> Nhân viên làm công việc gì?</legend>
        <div class="admin-role-cards">${Object.keys(m.permissions.roles).map((k) => `<label class="admin-role-card"><input type="radio" name="role" value="${k}" ${role === k ? "checked" : ""} required><span class="admin-role-icon" aria-hidden="true">${icon(k)}</span><strong>${esc(roleLabel(k))}</strong><small>${esc(ROLE_INFO[k]?.[1] || "")}</small></label>`).join("")}</div>
      </fieldset>
      <fieldset><legend><span>3</span> Làm việc ở đâu?</legend><div class="form-grid">
        <label>Cơ sở *${facilitySelect("facility", values.facility || ctx.facility)}</label></div>
      </fieldset>
      <fieldset><legend><span>4</span> Thông tin đăng nhập</legend><div class="form-grid">
        <label>Tên đăng nhập *<input name="username" required maxlength="50" autocomplete="off" spellcheck="false" value="${esc(values.username || "")}"><small class="admin-hint">Tự gợi ý theo họ tên. Chỉ chữ không dấu, số và . _ -</small></label>
        <label>Mật khẩu *<span class="admin-password"><input name="password" type="text" required minlength="6" autocomplete="off" spellcheck="false" value="${esc(values.password || temporaryPassword())}"><button type="button" data-admin="newpass" title="Tạo mật khẩu khác">↻ Tạo mới</button></span><small class="admin-hint">Tối thiểu 6 ký tự. Có thể tự gõ hoặc bấm “Tạo mới”.</small></label>
      </div></fieldset>
      <p class="error" role="alert">${esc(p.error || "")}</p>
      ${p.progress ? progressList(p.progress) : ""}
      <div class="form-actions"><button type="button" data-admin="close">Hủy</button><button class="primary" ${p.busy ? "disabled" : ""}>${p.busy ? "Đang tạo…" : "Tạo tài khoản"}</button></div>
    </form></section>`;
}

const progressList = (steps) =>
  `<ol class="admin-progress">${steps.map((s) => `<li class="${s.state}"><span aria-hidden="true">${{ done: "✓", fail: "✕", run: "…", wait: "○" }[s.state]}</span>${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ""}</li>`).join("")}</ol>`;

function credentialsCard(p) {
  return `<section class="panel admin-panel admin-done" aria-live="polite">
    <div class="workspace-heading"><h2>✓ ${esc(p.title)}</h2><button type="button" data-admin="close">Xong</button></div>
    ${p.progress ? progressList(p.progress) : ""}
    <p>Gửi thông tin dưới đây cho <strong>${esc(p.name)}</strong> qua kênh riêng (gặp trực tiếp, tin nhắn nội bộ):</p>
    <dl class="admin-credentials"><div><dt>Địa chỉ đăng nhập</dt><dd>${esc(location.origin + location.pathname)}</dd></div><div><dt>Tên đăng nhập</dt><dd>${esc(p.username)}</dd></div><div><dt>Mật khẩu</dt><dd>${esc(p.password)}</dd></div></dl>
    ${accountId(p.uuid)}
    <div class="form-actions"><button type="button" data-admin="copy">Sao chép thông tin</button></div>
    <p class="admin-hint">Mật khẩu chỉ hiển thị lúc này và sẽ biến mất khi bấm “Xong”. Nhân viên đăng nhập là dùng được ngay.</p>
  </section>`;
}

/** Account identity shown on every account action, so the UUID can be checked or copied into the advanced tools. */
const accountId = (id, username) =>
  id ? `<dl class="admin-account-id">${username ? `<div><dt>Tên đăng nhập</dt><dd>${esc(username)}</dd></div>` : ""}<div><dt>Mã tài khoản (UUID)</dt><dd><code>${esc(id)}</code><button type="button" data-admin="copyuuid" data-uuid="${esc(id)}">Sao chép</button></dd></div></dl>` : "";

function userPanel(p) {
  const u = p.user;
  const head = (title) => `<div class="workspace-heading"><h2>${title}</h2><button type="button" data-admin="close">Đóng</button></div>${accountId(u.uuid, u.username)}`;
  const foot = (label, cls = "primary") => `<p class="error" role="alert">${esc(p.error || "")}</p><div class="form-actions"><button type="button" data-admin="close">Hủy</button><button class="${cls}" ${p.busy ? "disabled" : ""}>${p.busy ? "Đang xử lý…" : label}</button></div>`;
  if (p.kind === "assign")
    return `<section class="panel admin-panel">${head(`Phân công nơi làm việc cho ${esc(u.display)}`)}<form id="adminUserForm"><p>Vai trò: <span class="admin-role">${icon(u.roles[0])} ${esc(roleLabel(u.roles[0]))}</span></p><div class="form-grid"><label>Làm việc tại cơ sở *${facilitySelect("facility", u.workspace?.facilityUuid || ctx.facility)}</label></div>${foot("Lưu phân công")}</form></section>`;
  if (p.kind === "rename")
    return `<section class="panel admin-panel">${head(`Đổi tên đăng nhập của ${esc(u.display)}`)}<form id="adminUserForm"><p>Sau khi đổi, nhân viên đăng nhập bằng tên mới với mật khẩu cũ.</p><div class="form-grid"><label>Tên đăng nhập mới *<input name="username" required maxlength="50" autocomplete="off" spellcheck="false" value="${esc(u.username || "")}"><small class="admin-hint">3–50 ký tự: chữ không dấu, số và . _ -</small></label></div>${foot("Lưu tên đăng nhập")}</form></section>`;
  if (p.kind === "reset")
    return `<section class="panel admin-panel">${head(`Cấp lại mật khẩu cho ${esc(u.display)}`)}<form id="adminUserForm"><p>Dùng khi nhân viên quên mật khẩu. Mật khẩu cũ sẽ không dùng được nữa.</p><div class="form-grid"><label>Mật khẩu mới *<span class="admin-password"><input name="password" type="text" required minlength="6" autocomplete="off" spellcheck="false" value="${esc(temporaryPassword())}"><button type="button" data-admin="newpass">↻ Tạo mới</button></span></label></div>${foot("Cấp lại mật khẩu")}</form></section>`;
  return `<section class="panel admin-panel">${head(`Khóa tài khoản ${esc(u.display)}`)}<form id="adminUserForm"><p>Nhân viên sẽ không đăng nhập được nữa và bị gỡ khỏi nơi làm việc. Dữ liệu cũ vẫn được giữ, có thể mở khóa lại sau.</p><div class="form-grid"><label>Lý do khóa *<input name="reason" required maxlength="255" placeholder="VD: Nghỉ việc từ 15/10/2026"></label></div>${foot("Khóa tài khoản", "primary danger-fill")}</form></section>`;
}

function staffTab() {
  const roles = Object.keys(m.permissions.roles);
  return `${stats()}
    <ol class="admin-guide"><li><strong>Thêm nhân viên</strong><span>Chọn vai trò và nơi làm việc</span></li><li><strong>Gửi tài khoản</strong><span>Tên đăng nhập + mật khẩu</span></li><li><strong>Nhân viên đăng nhập</strong><span>Vào thẳng màn hình làm việc</span></li></ol>
    ${ui.panel ? (ui.panel.done ? credentialsCard(ui.panel.done) : ui.panel.kind === "create" ? createPanel(ui.panel) : userPanel(ui.panel)) : ""}
    <section class="panel admin-list"><div class="admin-toolbar">
      <form id="adminSearch" role="search"><input name="staffQuery" type="search" placeholder="Tìm theo tên hoặc tên đăng nhập…" value="${esc(ui.query)}" aria-label="Tìm nhân viên"><button>Tìm</button></form>
      <select id="adminRoleFilter" aria-label="Lọc theo vai trò"><option value="">Tất cả vai trò</option>${roles.map((k) => `<option value="${k}" ${ui.roleFilter === k ? "selected" : ""}>${esc(roleLabel(k))}</option>`).join("")}</select>
      <label class="admin-check"><input type="checkbox" id="adminShowRetired" ${ui.showRetired ? "checked" : ""}> Hiện tài khoản đã khóa</label>
      <button type="button" class="primary admin-add" data-admin="create">＋ Thêm nhân viên</button>
    </div>${ui.flash ? `<p class="connection-success" role="status">${esc(ui.flash)}</p>` : ""}${ui.error ? `<p class="error" role="alert">${esc(ui.error)}</p>` : ""}${staffTable()}</section>`;
}

function facilitiesTab() {
  if (ui.facilities === null) return '<p class="admin-empty">Đang tải danh sách cơ sở…</p>';
  const list = activeFacilities();
  const stopped = ui.facilities.filter((f) => f.active === false).length;
  const staffAt = (loc) => (ui.users || []).filter((u) => !u.retired && u.workspace?.facilityUuid === loc).length;
  return `<div class="admin-facilities">${list
    .map((f) => `<article class="panel admin-facility ${f.active === false ? "retired" : ""}"><h3>🏥 ${esc(f.name)}</h3><p>${esc(f.address || f.legalName || "")}</p><dl><div><dt>Mã cơ sở</dt><dd>${esc(f.code || "—")}</dd></div><div><dt>Điện thoại</dt><dd>${esc(f.phone || "—")}</dd></div><div><dt>Nhân viên</dt><dd>${ui.users ? staffAt(f.locationUuid) : "…"}</dd></div><div><dt>Trạng thái</dt><dd>${f.active === false ? "Ngừng hoạt động" : "Đang hoạt động"}</dd></div></dl></article>`)
    .join("")}</div><p class="admin-hint">${stopped ? `Đã ẩn ${stopped} cơ sở ngừng hoạt động. ` : ""}Thêm hoặc sửa thông tin cơ sở trong mục “Công cụ nâng cao” bên dưới.</p>`;
}

function auditTab() {
  if (ui.audit === null) return '<p class="admin-empty">Đang tải lịch sử…</p>';
  if (!ui.audit.length) return '<div class="admin-empty"><strong>Chưa có thay đổi nào</strong></div>';
  const names = new Map((ui.users || []).map((u) => [u.uuid, u.display]));
  const me = ctx.client.user?.uuid;
  const who = (id) => (id === me ? "Bạn" : names.get(id) || "Quản trị viên khác");
  const detail = (e) => {
    const role = /role=(\w+)/.exec(e.detail || "")?.[1] || (e.action === "user.role_granted" ? e.detail : "");
    const renamed = /^from=(\S*) to=(\S+)$/.exec(e.action === "user.username_changed" ? e.detail || "" : "");
    if (renamed) return `Tên đăng nhập: ${renamed[1] || "—"} → ${renamed[2]}`;
    return role && m.permissions.roles[role] ? "Vai trò: " + roleLabel(role) : "";
  };
  return `<section class="panel"><ol class="admin-timeline">${ui.audit
    .map((e) => `<li><time>${esc(when(e.at))}</time><p><strong>${esc(who(e.actorUuid))}</strong> · ${esc(AUDIT_TEXT[e.action] || e.action)}${names.has(e.entityUuid) && e.entityUuid !== e.actorUuid ? ` cho <strong>${esc(names.get(e.entityUuid))}</strong>` : ""}</p>${detail(e) ? `<small>${esc(detail(e))}</small>` : ""}</li>`)
    .join("")}</ol></section>`;
}

function view() {
  if (!isSystemAdministrator(ctx.client.user))
    return `<section class="panel admin-panel"><h2>Quản lý nhân viên</h2><p>Việc tạo và khóa tài khoản do <strong>quản trị hệ thống</strong> thực hiện. Bạn vẫn có thể cấu hình biểu mẫu và quy trình trong “Công cụ nâng cao” bên dưới.</p></section>`;
  const tabs = [["staff", "👥 Nhân viên"], ["facilities", "🏥 Cơ sở"], ["audit", "🕘 Lịch sử thay đổi"]];
  return `<nav class="admin-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-admin-tab="${k}" aria-selected="${ui.tab === k}" class="${ui.tab === k ? "active" : ""}">${l}</button>`).join("")}</nav>
    <div role="tabpanel">${ui.tab === "staff" ? staffTab() : ui.tab === "facilities" ? facilitiesTab() : auditTab()}</div>`;
}

function paint() {
  const host = document.querySelector("#adminConsole");
  if (!host || !ctx) return;
  // Keep what the admin is typing when a background load repaints the console.
  const draft = document.querySelector("#adminCreateForm");
  if (draft && ui.panel?.kind === "create") ui.panel.values = Object.fromEntries(new FormData(draft));
  host.innerHTML = view();
  bindConsole();
}

const findUser = (id) => ui.users?.find((u) => u.uuid === id);

async function createStaff(form) {
  const p = ui.panel;
  const d = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(d)) d[k] = String(d[k]).trim();
  p.values = d;
  p.error =
    (!d.familyName || !d.givenName ? "Nhập đầy đủ họ và tên." : "") ||
    (!d.role ? "Chọn công việc của nhân viên." : "") ||
    (!d.facility ? "Chọn cơ sở làm việc." : "") ||
    usernameProblem(d.username) ||
    passwordRules(d.password, "Mật khẩu");
  if (p.error) return paint();
  const steps = [
    { key: "account", label: "Tạo tài khoản đăng nhập", state: "wait" },
    { key: "workspace", label: "Phân công nơi làm việc", state: "wait" },
    ...(CLINICAL.has(d.role) ? [{ key: "provider", label: "Tạo hồ sơ chuyên môn (để ghi nhận khám, chỉ định)", state: "wait" }] : []),
  ];
  p.progress = steps;
  p.busy = true;
  paint();
  const step = async (key, task) => {
    const s = steps.find((x) => x.key === key);
    if (!s) return;
    s.state = "run";
    paint();
    try {
      await task();
      s.state = "done";
    } catch (error) {
      s.state = "fail";
      s.note = friendlyError(error);
      throw error;
    } finally {
      paint();
    }
  };
  let created = p.created;
  try {
    if (!created)
      await step("account", async () => {
        created = await call("staff/users", { method: "POST", body: { username: d.username, givenName: d.givenName, familyName: d.familyName, gender: d.gender || "U", role: d.role, password: d.password } });
        p.created = created; // a retry after a later failure must not create the account twice
      });
    else steps[0].state = "done";
    await step("workspace", () => call("authorization/assignment", { method: "POST", body: { user: created.uuid, role: d.role, facility: d.facility } }));
    await step("provider", () => call("directory/providers", { method: "POST", body: { userUuid: created.uuid, facilityLocationUuid: d.facility, identifier: d.username } }));
    ui.panel = { kind: "create", done: { title: "Đã tạo tài khoản", name: d.familyName + " " + d.givenName, username: d.username, password: d.password, uuid: created.uuid, progress: steps } };
    ui.flash = "";
    loadUsers();
  } catch (error) {
    p.busy = false;
    p.error = created ? "Tài khoản đã được tạo nhưng còn bước chưa xong. Bấm “Tạo tài khoản” để thử lại bước bị lỗi." : friendlyError(error);
    paint();
  }
}

async function userAction(form) {
  const p = ui.panel, u = p.user;
  const d = Object.fromEntries(new FormData(form));
  p.busy = true;
  p.error = "";
  paint();
  try {
    if (p.kind === "assign") {
      await call("authorization/assignment", { method: "POST", body: { user: u.uuid, role: u.roles[0], facility: d.facility } });
      ui.flash = `Đã phân công ${u.display} làm việc tại ${facilityOptions().find(([v]) => v === d.facility)?.[1] || "cơ sở đã chọn"}.`;
      ui.panel = null;
    } else if (p.kind === "rename") {
      const username = String(d.username).trim();
      const problem = usernameProblem(username) || (username === u.username ? "Tên đăng nhập mới giống tên hiện tại." : "");
      if (problem) throw Object.assign(new Error(problem), { status: 0 });
      await call(`staff/users/${u.uuid}/username`, { method: "POST", body: { username } });
      ui.flash = `Đã đổi tên đăng nhập của ${u.display}: ${u.username || "—"} → ${username}.`;
      ui.panel = null;
    } else if (p.kind === "reset") {
      const problem = passwordRules(String(d.password).trim(), "Mật khẩu");
      if (problem) throw Object.assign(new Error(problem), { status: 0 });
      await call(`staff/users/${u.uuid}/password`, { method: "POST", body: { password: String(d.password).trim() } });
      ui.panel = { kind: "reset", done: { title: "Đã cấp lại mật khẩu", name: u.display, username: u.username, password: String(d.password).trim(), uuid: u.uuid } };
    } else {
      if (!String(d.reason).trim()) throw Object.assign(new Error("Nhập lý do khóa tài khoản."), { status: 0 });
      await call(`staff/users/${u.uuid}/state`, { method: "POST", body: { active: false, reason: String(d.reason).trim() } });
      ui.flash = `Đã khóa tài khoản ${u.display}.`;
      ui.panel = null;
    }
    loadUsers();
  } catch (error) {
    p.busy = false;
    p.error = friendlyError(error);
    paint();
  }
}

async function unretire(u) {
  if (!window.confirm(`Mở khóa tài khoản ${u.display}?\nTên đăng nhập: ${u.username || "—"}\nMã tài khoản (UUID): ${u.uuid}\n\nSau đó cần phân công lại nơi làm việc.`)) return;
  try {
    await call(`staff/users/${u.uuid}/state`, { method: "POST", body: { active: true } });
    ui.flash = `Đã mở khóa ${u.display}. Bấm “Phân công” để giao lại nơi làm việc.`;
  } catch (error) {
    ui.error = friendlyError(error);
  }
  loadUsers();
}

function bindConsole() {
  const root = document.querySelector("#adminConsole");
  root.querySelectorAll("[data-admin-tab]").forEach((b) => (b.onclick = () => {
    ui.tab = b.dataset.adminTab;
    ui.error = "";
    paint();
    if (ui.tab === "audit") loadAudit();
  }));
  root.querySelectorAll("[data-admin]").forEach((b) => (b.onclick = () => {
    const kind = b.dataset.admin, u = findUser(b.dataset.user);
    ui.flash = "";
    if (kind === "create") ui.panel = { kind: "create" };
    else if (["assign", "rename", "reset", "retire"].includes(kind) && u) ui.panel = { kind, user: u };
    else if (kind === "close") ui.panel = null;
    else if (kind === "more") return loadUsers(true);
    else if (kind === "unretire" && u) return unretire(u);
    else if (kind === "newpass") {
      b.closest(".admin-password").querySelector("input").value = temporaryPassword();
      return;
    } else if (kind === "copyuuid") {
      navigator.clipboard?.writeText(b.dataset.uuid)
        .then(() => (b.textContent = "✓ Đã sao chép"), () => (b.textContent = "Không sao chép được"));
      return;
    } else if (kind === "copy") {
      const c = ui.panel?.done;
      navigator.clipboard?.writeText(`Địa chỉ: ${location.origin + location.pathname}\nTên đăng nhập: ${c.username}\nMật khẩu: ${c.password}`)
        .then(() => (b.textContent = "✓ Đã sao chép"), () => (b.textContent = "Không sao chép được, hãy chép tay"));
      return;
    }
    paint();
    document.querySelector(".admin-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
    document.querySelector(".admin-panel input:not([type=radio])")?.focus();
  }));
  const create = root.querySelector("#adminCreateForm");
  if (create) {
    create.onsubmit = (e) => {
      e.preventDefault();
      if (!ui.panel.busy) createStaff(create);
    };
    const username = create.elements.username;
    username.oninput = () => (username.dataset.edited = "1");
    if (ui.panel.values?.username) username.dataset.edited = "1";
    const suggest = () => {
      if (!username.dataset.edited) username.value = suggestUsername(create.elements.familyName.value, create.elements.givenName.value);
    };
    create.elements.familyName.oninput = suggest;
    create.elements.givenName.oninput = suggest;
  }
  const other = root.querySelector("#adminUserForm");
  if (other) other.onsubmit = (e) => {
    e.preventDefault();
    if (!ui.panel.busy) userAction(other);
  };
  const search = root.querySelector("#adminSearch");
  if (search) search.onsubmit = (e) => {
    e.preventDefault();
    ui.query = search.elements.staffQuery.value.trim();
    loadUsers();
  };
  const filter = root.querySelector("#adminRoleFilter");
  if (filter) filter.onchange = () => {
    ui.roleFilter = filter.value;
    paint();
  };
  const retired = root.querySelector("#adminShowRetired");
  if (retired) retired.onchange = () => {
    ui.showRetired = retired.checked;
    paint();
  };
}

/** Section footer: the console host; content is painted by bind so async loads can repaint it. */
export const adminConsole = () => '<div id="adminConsole" class="admin-console"></div>';
export function bindAdminConsole(moduleCtx) {
  const changed = ctx?.client.user?.uuid !== moduleCtx.client.user?.uuid;
  ctx = moduleCtx;
  if (changed) Object.assign(ui, { users: null, facilities: null, audit: null, panel: null, flash: "", error: "", query: "" });
  paint();
  if (!isSystemAdministrator(ctx.client.user)) return;
  if (ui.users === null && !ui.loading) loadUsers();
  if (ui.facilities === null) loadFacilities();
}
