// Form-field and action builders shared by every module. An action describes one backend call;
// the shell renders its fields, validates UUIDs and sends the payload built by `build`.
import { metadata as m, active } from "./metadata.js";
import { uuid } from "./backend-client.js";
export const F = (name, label, type = "text", extra = {}) => ({
  name,
  label,
  type,
  required: true,
  ...extra,
});
export const choice = (name, label, options, extra = {}) =>
  F(name, label, "select", { options, ...extra });
export const options = (records, key = "uuid") =>
  active(records).map((r) => [r[key], r.nameVi || r.name || r.code]);
export const optional = (name, label, type = "text", extra = {}) =>
  F(name, label, type, { required: false, ...extra });
export const id = (name, label, required = true) =>
  F(name, label, "uuid", { required });
export const pick = (d, keys) =>
  Object.fromEntries(
    keys.filter((k) => d[k] !== "" && d[k] !== undefined).map((k) => [k, d[k]]),
  );
export const body = (d) => ({ ...d });
/**
 * Action contract. `build(data)` returns the request body (null for GET/DELETE). Optional hooks
 * used by the shell: prepare(data, ctx) before build, finish(payload, data, ctx) after build,
 * send(ctx, {path, payload, data}) to replace the request, bind(form, ctx) after render,
 * formValues(ctx) for initial values. Flags: idempotent, facility, upload, binary, document,
 * adminCore, systemOnly, onlyRoles, record (memory record type used as form default),
 * captures (record type stored from the response), marksStale, embedded.
 */
export const action = (
  title,
  resource,
  permission,
  fields,
  path,
  build = body,
  extra = {},
) => ({ title, resource, permission, fields, path, build, ...extra });
export const printAction = (title, resource, template, extra = {}) =>
  action(
    title,
    resource,
    "print",
    [id("record", "Mã bản ghi (UUID)")],
    (d) => "operations/documents/" + template + "/" + uuid(d.record),
    null,
    { method: "GET", document: true, ...extra },
  );
const stateLabels = {
  booked: "Đã đặt",
  confirmed: "Đã xác nhận",
  arrived: "Đã đến",
  fulfilled: "Đã khám",
  cancelled: "Đã hủy",
  no_show: "Không đến",
  waiting: "Đang chờ",
  called: "Đã gọi",
  in_service: "Đang phục vụ",
  completed: "Hoàn tất",
  left: "Bỏ về",
  requested: "Chờ phân công",
  assigned: "Đã phân công",
  in_progress: "Đang thực hiện",
  "entered-in-error": "Nhập nhầm",
  draft: "Nháp",
  preliminary: "Sơ bộ",
  final: "Chính thức",
  corrected: "Đính chính",
  unpaid: "Chưa thu",
  paid: "Đã thu đủ",
  partially_paid: "Thu một phần",
  pending: "Chờ xác nhận",
  settled: "Đã thanh toán",
  active: "Đang hiệu lực",
  discontinued: "Đã ngừng",
  expired: "Hết hiệu lực",
  not_asked: "Chưa khai thác",
  unknown: "Không rõ",
  no_known_allergy: "Không ghi nhận dị ứng",
  present: "Có ghi nhận",
  none_reported: "Không ghi nhận",
  recorded: "Đã ghi",
  refused: "Từ chối",
  not_applicable: "Không áp dụng",
  not_recorded: "Chưa ghi",
  unreadable: "Không đọc được",
  masked: "Đã che",
};
export const stateText = (v) => stateLabels[v] || v;
export const states = (values) => values.map((v) => [v, stateText(v)]);
export const serviceOptions = () => options(m.services.records);
export const workflowConfigOptions = () =>
  m.workflow.configs.map((c) => [
    c.code,
    c.code === "STANDARD_POSTPAY" ? "Có điều dưỡng, trả sau" : "Tinh gọn, trả trước",
  ]);
export const codeList = (name) =>
  m.uiOptions.codeLists[name].map((row) => [row.code, row.label]);
