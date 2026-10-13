// Patient, visit, vitals, pharmacy and report actions over the staff adapter (docs/api/care.md).
import uiOptions from "./metadata/ui-options.json" with { type: "json" };
import { BackendError, uuid, instant, VITAL_LIMITS } from "./backend-client.js";
import {
  actions,
  sections,
  F,
  choice,
  id,
  optional,
} from "./connected-actions.js";
import { VITAL_FIELD_MAP } from "./backend-mapping.js";
const act = (title, resource, permission, fields, path, build, extra = {}) => ({
  title,
  resource,
  permission,
  fields,
  path,
  build,
  ...extra,
});
const codes = (name) =>
  uiOptions.codeLists[name].map((row) => [row.code, row.label]);
const qs = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null,
    ),
  ).toString();
const patient = id("patient", "Mã bệnh nhân (UUID)"),
  visit = id("visit", "Mã lượt khám (UUID)"),
  record = id("record", "Mã bản ghi (UUID)");
const reason = F("reason", "Lý do", "textarea", { max: 255 });
const nameFields = (required) => [
  F("familyName", "Họ", "text", { required, max: 50 }),
  optional("middleName", "Tên đệm", "text", { max: 50 }),
  F("givenName", "Tên", "text", { required, max: 50 }),
];
const birthFields = (required) => [
  choice("birthPrecision", "Mức đầy đủ ngày sinh", codes("birth_precision"), {
    required,
  }),
  optional("birthdate", "Ngày sinh (khi đủ ngày)", "date"),
  optional("birthYear", "Năm sinh (khi chỉ biết tháng/năm)", "number", {
    min: 1900,
    step: 1,
  }),
  optional("birthMonth", "Tháng sinh (khi biết tháng)", "number", {
    min: 1,
    max: 12,
    step: 1,
  }),
  optional("birthRaw", "Ngày sinh nguyên văn trên giấy tờ", "text", {
    max: 50,
  }),
];
const identifierFields = [
  optional("cccd", "Số CCCD (12 số)", "text", { max: 12 }),
  optional("bhxh", "Mã BHXH", "text", { max: 32 }),
  optional("bhyt", "Số thẻ BHYT", "text", { max: 32 }),
];
export function birthPayload(d) {
  const out = { birthPrecision: d.birthPrecision };
  if (d.birthPrecision === "day") {
    if (!d.birthdate)
      throw new BackendError("Ngày sinh đủ ngày cần nhập ngày sinh.");
    out.birthdate = d.birthdate;
  } else if (d.birthPrecision === "month" || d.birthPrecision === "year") {
    if (!d.birthYear) throw new BackendError("Cần năm sinh.");
    out.birthYear = Number(d.birthYear);
    if (d.birthPrecision === "month") {
      if (!d.birthMonth) throw new BackendError("Cần tháng sinh.");
      out.birthMonth = Number(d.birthMonth);
    }
  }
  if (d.birthRaw) out.birthRaw = d.birthRaw;
  return out;
}
const identifiers = (d) =>
  ["cccd", "bhxh", "bhyt"]
    .filter((k) => d[k])
    .map((k) => ({ type: k, identifier: d[k] }));
export function registrationPayload(d) {
  if (d.cccd && !/^[0-9]{12}$/.test(d.cccd))
    throw new BackendError("CCCD phải gồm đúng 12 chữ số.");
  const out = {
    familyName: d.familyName,
    givenName: d.givenName,
    gender: d.gender,
    ...birthPayload(d),
  };
  for (const k of ["middleName", "phone", "occupation"])
    if (d[k]) out[k] = d[k];
  const ids = identifiers(d);
  if (ids.length) out.identifiers = ids;
  if (d.allowPossibleDuplicate === "true") out.allowPossibleDuplicate = true;
  return out;
}
export function patientPatch(d) {
  const out = {};
  for (const k of [
    "familyName",
    "middleName",
    "givenName",
    "gender",
    "phone",
    "occupation",
    "reason",
  ])
    if (d[k]) out[k] = d[k];
  if (d.clearPhone === "true") {
    if (d.phone)
      throw new BackendError("Chọn xóa hoặc nhập số điện thoại mới.");
    out.phone = null;
  }
  if (
    (out.familyName || out.middleName || out.givenName) &&
    !(out.familyName && out.givenName)
  )
    throw new BackendError("Đổi tên cần nhập đủ họ và tên.");
  if (d.birthPrecision) Object.assign(out, birthPayload(d));
  const ids = identifiers(d);
  if (ids.length) out.identifiers = ids;
  if (!Object.keys(out).filter((k) => k !== "reason").length)
    throw new BackendError("Cần nhập ít nhất một trường muốn sửa.");
  return out;
}
const vitalFields = VITAL_FIELD_MAP.flatMap((f) => [
  optional(f.key, f.label + " (" + f.unit + ")", "number", {
    min: VITAL_LIMITS[f.key][0],
    max: VITAL_LIMITS[f.key][1],
    step: "any",
  }),
  choice(
    f.key + "State",
    "Trạng thái thiếu · " + f.label,
    [
      ["unknown", "Không rõ"],
      ["not_asked", "Chưa hỏi"],
      ["refused", "Từ chối"],
      ["not_applicable", "Không áp dụng"],
      ["unreadable", "Không đọc được"],
    ],
    { required: false },
  ),
]);
export function vitalsValues(d) {
  const values = {},
    states = {};
  for (const f of VITAL_FIELD_MAP) {
    const raw = d[f.key],
      state = d[f.key + "State"];
    if (raw !== undefined && raw !== "") {
      const n = Number(raw),
        [min, max] = VITAL_LIMITS[f.key];
      if (!Number.isFinite(n) || n < min || n > max)
        throw new BackendError("Kiểm tra " + f.label + ".");
      if (state)
        throw new BackendError(
          f.label + ": chọn giá trị hoặc trạng thái thiếu.",
        );
      values[f.code] = n;
    } else if (state) states[f.code] = state;
  }
  if (!Object.keys(values).length && !Object.keys(states).length)
    throw new BackendError("Cần ít nhất một giá trị hoặc trạng thái thiếu.");
  const a = "vitals.ha_tam_thu",
    b = "vitals.ha_tam_truong";
  if (
    (values[a] !== undefined) !== (values[b] !== undefined) &&
    !states[values[a] === undefined ? a : b]
  )
    throw new BackendError(
      "Huyết áp thiếu một vế cần ghi trạng thái thiếu tường minh.",
    );
  return { values, states };
}
Object.assign(actions, {
  registerPatient: act(
    "Đăng ký bệnh nhân mới",
    "patient_identity",
    "create",
    [
      ...nameFields(true),
      choice("gender", "Giới tính", codes("gender")),
      ...birthFields(true),
      optional("phone", "Điện thoại người bệnh", "tel", { max: 50 }),
      optional("occupation", "Nghề nghiệp", "text", { max: 50 }),
      ...identifierFields,
      choice(
        "allowPossibleDuplicate",
        "Hồ sơ tương tự",
        [["true", "Đã kiểm tra, vẫn đăng ký hồ sơ mới"]],
        { required: false },
      ),
    ],
    () => "patients",
    registrationPayload,
    {
      idempotent: true,
      notice:
        "Backend cấp mã hồ sơ nội bộ, chặn CCCD/BHXH/BHYT đã thuộc hồ sơ khác và cảnh báo hồ sơ cùng họ tên, giới tính, năm sinh tại cơ sở. Kiểm tra danh sách tương tự trước khi xác nhận đăng ký mới.",
    },
  ),
  patientProfile: act(
    "Xem hồ sơ hành chính",
    "patient_identity",
    "read",
    [patient],
    (d) => "patients/" + uuid(d.patient),
    null,
    { method: "GET" },
  ),
  updatePatient: act(
    "Sửa thông tin hành chính",
    "patient_identity",
    "update",
    [
      patient,
      ...nameFields(false),
      choice("gender", "Giới tính", codes("gender"), { required: false }),
      ...birthFields(false),
      optional("phone", "Điện thoại mới", "tel", { max: 50 }),
      choice("clearPhone", "Xóa điện thoại", [["true", "Xóa số hiện tại"]], {
        required: false,
      }),
      optional("occupation", "Nghề nghiệp", "text", { max: 50 }),
      ...identifierFields,
      optional("reason", "Lý do sửa", "textarea", { max: 255 }),
    ],
    (d) => "patients/" + uuid(d.patient),
    patientPatch,
    {
      notice:
        "Chỉ nhập trường muốn đổi. Giá trị cũ được giữ trong lịch sử OpenMRS (voided) cùng lý do.",
    },
  ),
  openVisit: act(
    "Mở lượt khám",
    "visit",
    "create",
    [
      patient,
      choice("visitType", "Loại lượt", [
        ["outpatient", "Khám ngoại trú"],
        ["followup", "Tái khám"],
      ]),
      id("appointment", "Lịch hẹn được check-in (UUID, nếu có)", false),
      optional(
        "startDatetime",
        "Thời điểm bắt đầu (để trống = hiện tại)",
        "datetime-local",
      ),
    ],
    () => "visits",
    (d) => {
      const out = { patient: d.patient, visitType: d.visitType };
      if (d.appointment) out.appointment = d.appointment;
      if (d.startDatetime) out.startDatetime = instant(d.startDatetime);
      return out;
    },
    {
      notice:
        "Mỗi bệnh nhân chỉ có một lượt đang mở. Lịch hẹn được chọn sẽ chuyển sang Đã đến và liên kết với lượt.",
    },
  ),
  visitDetail: act(
    "Xem lượt khám",
    "visit",
    "read",
    [visit],
    (d) => "visits/" + uuid(d.visit),
    null,
    { method: "GET" },
  ),
  closeVisit: act(
    "Kết thúc lượt khám",
    "visit",
    "update",
    [
      visit,
      choice("closeReason", "Lý do kết thúc", codes("visit_close_reason")),
      optional(
        "note",
        "Ghi chú (bắt buộc nếu không phải Kết thúc khám)",
        "textarea",
        { max: 1000 },
      ),
      optional(
        "stopDatetime",
        "Thời điểm kết thúc (để trống = hiện tại)",
        "datetime-local",
      ),
    ],
    (d) => "visits/" + uuid(d.visit) + "/close",
    (d) => {
      if (d.closeReason !== "completed" && !d.note)
        throw new BackendError(
          "Cần ghi chú khi lượt không kết thúc khám bình thường.",
        );
      const out = { closeReason: d.closeReason };
      if (d.note) out.note = d.note;
      if (d.stopDatetime) out.stopDatetime = instant(d.stopDatetime);
      return out;
    },
    {
      notice:
        "Kết thúc khám bị từ chối khi còn chỉ định CLS chưa xong hoặc phiếu phí chưa thu đủ. Hủy tiếp nhận chỉ dành cho tiếp đón. Phiếu hàng đợi còn mở được đóng theo lý do.",
    },
  ),
  startVitalsEncounter: act(
    "Bắt đầu / tiếp tục đo sinh hiệu",
    "vitals",
    "create",
    [visit],
    (d) => "visits/" + uuid(d.visit) + "/encounters",
    () => ({ encounterType: "vitals" }),
    {
      notice:
        "Dùng lại encounter sinh hiệu của bạn trong lượt nếu đã có; người thực hiện là hồ sơ người hành nghề gắn với tài khoản.",
    },
  ),
  startConsultation: act(
    "Bắt đầu / tiếp tục phiếu khám",
    "clinical_chart",
    "create",
    [visit],
    (d) => "visits/" + uuid(d.visit) + "/encounters",
    () => ({ encounterType: "consultation" }),
    {
      notice:
        "Tạo encounter khám với bác sĩ đang đăng nhập là người điều trị; dùng lại encounter đã có trong lượt.",
    },
  ),
  vitalsHistory: act(
    "Lịch sử sinh hiệu",
    "vitals",
    "read",
    [
      patient,
      id("visit", "Lọc theo lượt (UUID)", false),
      choice("includeVoided", "Gồm lần đo đã hủy", [["true", "Có"]], {
        required: false,
      }),
    ],
    (d) =>
      "vitals?" +
      qs({
        patient: uuid(d.patient),
        visit: d.visit,
        includeVoided: d.includeVoided,
      }),
    null,
    { method: "GET" },
  ),
  correctVitals: act(
    "Đính chính lần đo",
    "vitals",
    "update",
    [
      record,
      ...vitalFields,
      optional(
        "measuredAt",
        "Thời điểm đo (để trống = giữ nguyên)",
        "datetime-local",
      ),
      reason,
    ],
    (d) => "vitals/" + uuid(d.record) + "/correction",
    (d) => {
      const out = { ...vitalsValues(d), reason: d.reason };
      if (d.measuredAt) out.measuredAt = instant(d.measuredAt);
      return out;
    },
    {
      notice:
        "Lần đo cũ được hủy kèm lý do và thay bằng lần đo mới trong cùng encounter. Chỉ thực hiện khi lượt còn mở.",
    },
  ),
  voidVitals: act(
    "Hủy lần đo",
    "vitals",
    "void",
    [record, reason],
    (d) => "vitals/" + uuid(d.record) + "?" + qs({ reason: d.reason }),
    null,
    { method: "DELETE" },
  ),
  dispense: act(
    "Ghi cấp thuốc",
    "dispensing",
    "create",
    [
      id("record", "Dòng thuốc cần cấp (UUID)"),
      F("quantity", "Số lượng cấp", "number", { min: 0.0001, step: "any" }),
      optional("batchNumber", "Số lô", "text", { max: 64 }),
      optional("expiryDate", "Hạn dùng", "date"),
      optional("note", "Ghi chú", "textarea", { max: 1000 }),
    ],
    () => "pharmacy/dispenses",
    (d) => {
      const out = { order: uuid(d.record), quantity: Number(d.quantity) };
      if (!(out.quantity > 0))
        throw new BackendError("Số lượng cấp phải lớn hơn 0.");
      for (const k of ["batchNumber", "expiryDate", "note"])
        if (d[k]) out[k] = d[k];
      return out;
    },
    {
      idempotent: true,
      notice:
        "Backend chặn cấp vượt số lượng kê, đơn đã ngừng/hết hiệu lực, lượt đã hủy và lô hết hạn. Chưa trừ tồn kho.",
    },
  ),
  prescriptionDetail: act(
    "Xem dòng thuốc và lịch sử cấp",
    "dispensing",
    "read",
    [record],
    (d) => "pharmacy/prescriptions/" + uuid(d.record),
    null,
    { method: "GET" },
  ),
  dispenseRecord: act(
    "Xem phiếu cấp thuốc",
    "dispensing",
    "read",
    [record],
    (d) => "pharmacy/dispenses/" + uuid(d.record),
    null,
    { method: "GET" },
  ),
  rangeReport: act(
    "Báo cáo nhiều ngày",
    "reports",
    "read",
    [F("from", "Từ ngày", "date"), F("to", "Đến ngày", "date")],
    (d) =>
      "operations/reports/range?" +
      qs({ from: d.from, to: d.to, facility: d.facility }),
    null,
    {
      method: "GET",
      facility: true,
      notice: "Tối đa 31 ngày; chỉ số tổng hợp, không có thông tin người bệnh.",
    },
  ),
});
actions.printPrescription.resource = "prescription";
actions.printResult.resource = "diagnostic_result";
sections
  .find((s) => s.id === "clinical")
  .actions.splice(1, 0, "startConsultation");
Object.assign(
  sections.find((s) => s.id === "vitals"),
  {
    actions: [
      "startVitalsEncounter",
      "vitalsHistory",
      "correctVitals",
      "voidVitals",
    ],
  },
);
Object.assign(
  sections.find((s) => s.id === "pharmacy"),
  {
    actions: [
      "dispense",
      "prescriptionDetail",
      "dispenseRecord",
      "printPrescription",
    ],
    note: "Danh sách đơn cần cấp lấy từ đơn thuốc đã xác nhận tại cơ sở. Kho, tồn và lô chi tiết thuộc phạm vi sau pilot; số lô/hạn dùng được ghi theo lần cấp.",
  },
);
sections.find((s) => s.id === "reports").actions.push("rangeReport");
Object.assign(
  sections.find((s) => s.id === "identity"),
  {
    note: "Người liên hệ, địa chỉ có mã hành chính và trạng thái thông tin thiếu. Đăng ký, tìm và sửa thông tin cơ bản nằm ở mục Bệnh nhân.",
  },
);
for (const s of ["appointments", "queue"])
  delete sections.find((x) => x.id === s).note;
export const patientSections = {
  patients: ["registerPatient", "patientProfile", "updatePatient"],
  visits: ["openVisit", "visitDetail", "closeVisit"],
};
