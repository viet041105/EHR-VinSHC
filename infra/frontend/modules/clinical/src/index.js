// @vinshc/clinical: consultation note, diagnoses, allergies and drug orders of an encounter.
// Contract: docs/api/consultation.md, docs/api/diagnosis-allergy.md, docs/api/medication-order.md.
import {
  defineModule,
  metadata as m,
  active,
  BackendError,
  uuid,
  action,
  F,
  choice,
  id,
  optional,
  options,
  pick,
  states,
} from "@vinshc/core";

const ctx = [
  id("patient", "Mã bệnh nhân (UUID)"),
  id("encounter", "Mã lần khám (UUID)"),
];
const reason = F("reason", "Lý do", "textarea", { max: 1000 });
const fieldId = id("record", "Mã bản ghi (UUID)");
const numeric = (name, label, min = 0.001, max) =>
  F(name, label, "number", { min, max, step: "any" });
const units = (kind) =>
  options(
    m.units.catalogues[kind],
    kind === "frequencies" ? "uuid" : "conceptUuid",
  );
const frequencies = active(m.units.catalogues.frequencies)
  .filter((r) => r.frequencyPerDay !== null)
  .map((r) => [m.map.entities["frequency." + r.code.toLowerCase()], r.name]);
const omit = (data, keys) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));
/** Writes to the clinical chart (not reads) belong to the doctor workspace only. */
const doctorOnly = { onlyRoles: ["doctor"] };

export const consultationFields = [
  F("visit.ly_do_kham", "Lý do khám", "textarea", { max: 4000 }),
  optional("history.benh_su", "Bệnh sử", "textarea", { max: 4000 }),
  choice(
    "history.tien_su_ban_than_trang_thai",
    "Tiền sử bản thân",
    states(["not_asked", "none_reported", "present", "unknown"]),
  ),
  optional(
    "history.tien_su_ban_than",
    "Nội dung tiền sử bản thân",
    "textarea",
    { max: 4000 },
  ),
  choice(
    "history.tien_su_gia_dinh_trang_thai",
    "Tiền sử gia đình",
    states(["not_asked", "none_reported", "present", "unknown"]),
  ),
  optional(
    "history.tien_su_gia_dinh",
    "Nội dung tiền sử gia đình",
    "textarea",
    { max: 4000 },
  ),
  ...[
    ["exam.trieu_chung", "Triệu chứng"],
    ["exam.toan_than", "Khám toàn thân"],
    ["exam.bo_phan", "Khám bộ phận"],
    ["exam.tom_tat", "Tóm tắt"],
    ["exam.huong_dieu_tri", "Hướng điều trị"],
    ["exam.loi_dan", "Lời dặn"],
  ].map(([k, l]) => optional(k, l, "textarea", { max: 4000 })),
  choice(
    "allergy.trang_thai",
    "Trạng thái dị ứng",
    states(["not_asked", "unknown", "no_known_allergy", "present"]),
  ),
  optional("followup.ngay_tai_kham", "Ngày tái khám", "date"),
  optional("followup.loi_dan", "Lời dặn tái khám", "textarea", { max: 4000 }),
];
export function consultationValues(d) {
  const values = pick(
    d,
    consultationFields.map((f) => f.name),
  );
  for (const prefix of [
    "history.tien_su_ban_than",
    "history.tien_su_gia_dinh",
  ]) {
    if (values[prefix + "_trang_thai"] === "present" && !values[prefix])
      throw new BackendError("Trạng thái có tiền sử cần nội dung tương ứng.");
    if (values[prefix] && values[prefix + "_trang_thai"] !== "present")
      throw new BackendError("Nội dung tiền sử chỉ dùng khi chọn Có ghi nhận.");
  }
  return values;
}
/** Keeps the consultation group last read so a correction targets the record that was shown. */
function captureConsultation(result, ctx) {
  if (!result) return;
  const context = ctx.context;
  if (Object.hasOwn(result, "consultation") && !result.consultation) {
    delete context.group;
    delete context.consultationValues;
  }
  if (result.consultation) {
    context.group = result.consultation.groupUuid;
    context.consultationValues = result.consultation.values;
  }
  if (result.groupUuid) {
    context.group = result.groupUuid;
    context.consultationValues = result.values;
  }
}

const diagnosis = action(
  "Ghi chẩn đoán",
  "diagnosis",
  "create",
  [
    ...ctx,
    choice(
      "concept",
      "Chẩn đoán ICD-10",
      active(m.diagnoses.records)
        .filter((r) => r.selectable)
        .map((r) => [r.conceptUuid, r.code + " · " + r.nameVi]),
    ),
    choice("rank", "Loại chẩn đoán", [
      ["primary", "Chính"],
      ["secondary", "Kèm theo"],
    ]),
    choice("certainty", "Mức chắc chắn", [
      ["provisional", "Sơ bộ"],
      ["confirmed", "Xác định"],
    ]),
    optional("reason", "Lý do bổ sung sau khi chốt"),
  ],
  () => "diagnosis",
);
const actions = {
  summary: action(
    "Đọc hồ sơ lần khám",
    "clinical_chart",
    "read",
    [id("encounter", "Mã lần khám (UUID)")],
    (d) => "encounter/" + uuid(d.encounter) + "/clinical-summary",
    null,
    {
      method: "GET",
      captures: "encounter",
      embedded: (r) => (r.drugOrders || []).map((drug) => ["prescription", drug]),
    },
  ),
  startConsultation: action(
    "Bắt đầu / tiếp tục phiếu khám",
    "clinical_chart",
    "create",
    [id("visit", "Mã lượt khám (UUID)")],
    (d) => "visits/" + uuid(d.visit) + "/encounters",
    () => ({ encounterType: "consultation" }),
    {
      ...doctorOnly,
      captures: "encounter",
      notice:
        "Tạo encounter khám với bác sĩ đang đăng nhập là người điều trị; dùng lại encounter đã có trong lượt.",
    },
  ),
  clinicalConfiguration: action(
    "Kiểm tra danh mục backend",
    "clinical_chart",
    "read",
    [],
    () => "clinical-configuration",
    null,
    { method: "GET" },
  ),
  consultation: action(
    "Lưu phiếu khám",
    "clinical_chart",
    "create",
    [...ctx, ...consultationFields],
    () => "consultation",
    (d) => ({
      patient: d.patient,
      encounter: d.encounter,
      values: consultationValues(d),
    }),
    doctorOnly,
  ),
  correction: action(
    "Đính chính phiếu khám",
    "clinical_chart",
    "update",
    [id("group", "Mã phiếu khám (UUID)"), ...consultationFields, reason],
    (d) => "consultation/" + uuid(d.group),
    (d) => ({ values: consultationValues(d), reason: d.reason }),
    {
      ...doctorOnly,
      formValues: (ctx) => ctx.context.consultationValues || {},
      formNote:
        "Các trường đang hiển thị được lấy từ phiếu đã đọc. Để trống trường đã có nghĩa là xóa trường đó. Nhập lý do cho bản đính chính.",
      finish(payload, data, ctx) {
        const context = ctx.context;
        if (!context.group || data.group !== context.group)
          throw new BackendError(
            "Đọc hồ sơ lần khám trước, rồi đính chính đúng mã phiếu đã đọc.",
          );
        for (const f of consultationFields)
          if (context.consultationValues?.[f.name] && !payload.values[f.name])
            payload.values[f.name] = null;
      },
    },
  ),
  diagnosis,
  allergy: action(
    "Ghi dị ứng",
    "allergy",
    "create",
    [
      ...ctx,
      choice(
        "allergenChoice",
        "Tác nhân",
        active(m.allergies.records)
          .filter((r) =>
            ["medication", "food", "environment"].includes(r.category),
          )
          .map((r) => [r.conceptUuid, r.name]),
      ),
      choice(
        "severity",
        "Mức độ",
        options(m.allergies.severities, "conceptUuid"),
      ),
      choice(
        "reaction",
        "Phản ứng",
        options(
          m.allergies.reactions.filter((r) => r.code !== "OTHER"),
          "conceptUuid",
        ),
      ),
      optional("comment", "Ghi chú", "textarea", { max: 1024 }),
    ],
    () => "allergy",
    (d) => ({
      patient: d.patient,
      encounter: d.encounter,
      allergenType: {
        medication: "DRUG",
        food: "FOOD",
        environment: "ENVIRONMENT",
      }[
        m.allergies.records.find((r) => r.conceptUuid === d.allergenChoice)
          .category
      ],
      allergen: { concept: d.allergenChoice },
      severity: d.severity,
      reactions: [{ concept: d.reaction }],
      comment: d.comment,
    }),
  ),
  prescription: action(
    "Xác nhận một dòng thuốc",
    "prescription",
    "create",
    [
      ...ctx,
      id("orderer", "Mã người kê trên lần khám (UUID)"),
      choice(
        "drug",
        "Thuốc trong danh mục kiểm thử",
        options(m.medications.records),
      ),
      numeric("dose", "Liều mỗi lần"),
      choice("doseUnits", "Đơn vị liều", units("dose")),
      choice("route", "Đường dùng", units("routes")),
      choice("frequency", "Tần suất", frequencies),
      F("duration", "Thời gian dùng", "number", { min: 1, max: 3650, step: 1 }),
      choice("durationUnits", "Đơn vị thời gian", units("duration")),
      numeric("quantity", "Số lượng"),
      choice("quantityUnits", "Đơn vị số lượng", units("quantity")),
      optional("dosingInstructions", "Hướng dẫn dùng", "textarea", {
        max: 1024,
      }),
      optional(
        "allergyOverrideReason",
        "Lý do vượt cảnh báo dị ứng (chỉ khi có xung đột)",
      ),
      optional("reason", "Lý do kê thêm sau khi chốt phiếu"),
    ],
    () => "drug-order",
    (d) => ({
      ...d,
      dose: Number(d.dose),
      quantity: Number(d.quantity),
      duration: Number(d.duration),
      numRefills: 0,
      asNeeded: false,
    }),
    {
      captures: "prescription",
      notice:
        "Gửi sẽ tạo đơn đã xác nhận trên OpenMRS. Không có trạng thái nháp phía backend; server kiểm tra đơn trùng và dị ứng.",
    },
  ),
  finalize: action(
    "Chốt phiếu khám",
    "clinical_chart",
    "create",
    [id("encounter", "Mã lần khám (UUID)")],
    (d) => "encounter/" + uuid(d.encounter) + "/finalize",
    () => ({}),
    {
      ...doctorOnly,
      notice:
        "Backend chỉ chốt khi phiếu có lý do khám, trạng thái dị ứng và đúng một chẩn đoán chính. Chốt phiếu không kết thúc lượt khám.",
    },
  ),
  discontinue: action(
    "Ngừng thuốc",
    "prescription",
    "cancel",
    [fieldId, id("orderer", "Mã người kê (UUID)"), reason],
    (d) => "drug-order/" + uuid(d.record) + "/discontinue",
    (d) => ({ orderer: d.orderer, reason: d.reason }),
    { record: "prescription", captures: "prescription" },
  ),
  voidDiagnosis: action(
    "Hủy chẩn đoán",
    "diagnosis",
    "void",
    [fieldId, reason],
    (d) =>
      "diagnosis/" + uuid(d.record) + "?" + new URLSearchParams({ reason: d.reason }),
    null,
    { method: "DELETE" },
  ),
  voidAllergy: action(
    "Hủy ghi nhận dị ứng",
    "allergy",
    "void",
    [fieldId, reason],
    (d) =>
      "allergy/" + uuid(d.record) + "?" + new URLSearchParams({ reason: d.reason }),
    null,
    { method: "DELETE" },
  ),
  allergies: action(
    "Đọc các dị ứng hiện tại",
    "allergy",
    "read",
    [id("patient", "Mã bệnh nhân (UUID)")],
    (d) => "allergy?" + new URLSearchParams({ patient: uuid(d.patient) }),
    null,
    { method: "GET" },
  ),
  replaceDiagnosis: action(
    "Thay chẩn đoán có lý do",
    "diagnosis",
    "update",
    [
      fieldId,
      ...diagnosis.fields.filter(
        (f) => !["patient", "encounter", "reason"].includes(f.name),
      ),
      reason,
    ],
    (d) => "diagnosis/" + uuid(d.record),
    (d) => omit(d, ["record"]),
  ),
};

export default defineModule({
  name: "clinical",
  version: "0.1.0",
  order: 50,
  sections: [
    {
      id: "clinical",
      title: "Khám & điều trị",
      resource: "clinical_chart",
      order: 50,
      actions: [
        "summary",
        "startConsultation",
        "clinicalConfiguration",
        "consultation",
        "correction",
        "diagnosis",
        "allergy",
        "prescription",
        "finalize",
        "discontinue",
        "voidDiagnosis",
        "voidAllergy",
        "allergies",
        "replaceDiagnosis",
      ],
      icon: "✚",
      records: ["encounter", "prescription"],
      needsProvider: true,
    },
  ],
  actions,
  records: {
    encounter: {
      label: "Lần khám",
      section: "clinical",
      read: "summary",
      readField: "encounter",
      idKey: "encounterUuid",
    },
    prescription: { label: "Dòng thuốc", section: "clinical", read: null },
  },
  providerFields: { doctor: ["orderer"] },
  onCapture: captureConsultation,
});
