// HTML and formatting helpers shared by the shell and the modules. Every interpolated value goes
// through esc(); identifiers rendered without esc() must be UUIDs validated by uuid().
import { choice, stateText } from "./forms.js";
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const qs = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null,
    ),
  ).toString();
export const formatVnd = (v) =>
  typeof v === "number" ? new Intl.NumberFormat("vi-VN").format(v) + " ₫" : "—";
export const formatTime = (v) =>
  v
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(v))
    : "—";
const genders = { M: "Nam", F: "Nữ", O: "Khác", U: "Không rõ" };
/** Patient label of a worklist row: name and internal record number. */
export const patientLabel = (r) =>
  [
    r.patientName || r.patient?.fullName,
    r.patientIdentifier || r.patient?.identifier,
  ]
    .filter(Boolean)
    .join(" · ");
/** Minimal identity line: record number, gender, birth year and age. */
export const patientIdentity = (p) =>
  [
    p.identifier,
    genders[p.gender],
    p.birthdate
      ? (p.birthdateEstimated ? "~" : "") + p.birthdate.slice(0, 4)
      : null,
    p.age != null ? p.age + " tuổi" : null,
  ]
    .filter(Boolean)
    .join(" · ");
/** Row action: navigate to a section/action of any module; hidden when it is not available. */
export const go = (label, section, action, extra = {}) => ({
  label,
  section,
  action,
  ...extra,
});
export const statusFilter = (name, label, values, first) =>
  choice(
    name,
    label,
    values.map((v) => (Array.isArray(v) ? v : [v, stateText(v)])),
    { required: false, value: first },
  );
export const note = (text) => `<p class="connection-note">${esc(text)}</p>`;
export const pendingBadge = (text) =>
  `<span class="capability-badge pending">${esc(text || "Chờ backend")}</span>`;
export const CONNECTED_BADGE =
  '<span class="capability-badge connected">Đã nối API</span>';
export const openButton = (section, action, label) =>
  `<button type="button" data-go-section="${section}" ${action ? `data-go-action="${action}"` : ""}>${esc(label)}</button>`;
export const emptyState = (title, text) =>
  `<div class="workspace-empty"><span class="empty-symbol" aria-hidden="true">▤</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
/** Preview of a form whose backend API does not exist yet; never submits. */
export function preparationPanel(
  title,
  description,
  fields,
  field,
  button = "Lưu lên hệ thống",
) {
  return `<details class="panel preparation-panel"><summary><span>${esc(title)}</span>${pendingBadge()}</summary><p class="readonly">${esc(description)} Các trường chỉ để xem trước và nhập thử, chưa lưu lên hệ thống.</p><form data-pending-form><div class="form-grid">${fields.map((f) => field({ ...f, name: "preview_" + f.name }, {})).join("")}</div><div class="form-actions"><button type="submit" disabled data-unavailable>${esc(button)} · Chờ backend</button></div></form></details>`;
}
