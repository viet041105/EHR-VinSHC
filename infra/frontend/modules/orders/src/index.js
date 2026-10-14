// @vinshc/orders: diagnostic service orders, results, attachments and their print forms.
// Contract: docs/api/clinic-operations.md.
import {
  defineModule,
  BackendError,
  uuid,
  instant,
  action,
  printAction,
  F,
  choice,
  id,
  optional,
  pick,
  states,
  stateText,
  serviceOptions,
  workflowConfigOptions,
  qs,
  go,
  statusFilter,
  formatTime,
  patientLabel,
} from "@vinshc/core";

const fieldId = id("record", "Mã bản ghi (UUID)");
const reason = F("reason", "Lý do", "textarea", { max: 1000 });
const resultFields = [
  fieldId,
  choice("state", "Loại kết quả", states(["draft", "preliminary", "final"])),
  optional("numericValue", "Kết quả số", "number", { step: "any" }),
  optional("unit", "Đơn vị"),
  optional("textValue", "Kết quả văn bản", "textarea", { max: 4000 }),
  id("authorProvider", "Mã người nhập (UUID)"),
  id("reviewerProvider", "Mã người duyệt khi chính thức (UUID)", false),
  F("recordedAt", "Thời điểm ghi", "datetime-local"),
  optional("reviewedAt", "Thời điểm duyệt", "datetime-local"),
];
export function resultBody(d) {
  const out = pick(d, [
    "state",
    "unit",
    "textValue",
    "authorProvider",
    "reviewerProvider",
    "reason",
  ]);
  out.recordedAt = instant(d.recordedAt);
  if (d.reviewedAt) out.reviewedAt = instant(d.reviewedAt);
  if (d.numericValue !== undefined && d.numericValue !== "")
    out.numericValue = Number(d.numericValue);
  if ((out.numericValue === undefined) === !out.textValue)
    throw new BackendError("Nhập đúng một kết quả số hoặc văn bản.");
  if (out.numericValue !== undefined && !out.unit)
    throw new BackendError("Kết quả số cần đơn vị.");
  if (
    (d.state === "final" || d.reason) &&
    (!out.reviewerProvider || !out.reviewedAt)
  )
    throw new BackendError(
      "Kết quả chính thức/đính chính cần người duyệt và thời điểm duyệt.",
    );
  return out;
}

const actions = {
  order: action(
    "Đọc chỉ định CLS",
    "diagnostic_order",
    "read",
    [fieldId],
    (d) => "operations/service-orders/" + uuid(d.record),
    null,
    { method: "GET", record: "order", captures: "order" },
  ),
  createOrder: action(
    "Tạo chỉ định CLS",
    "diagnostic_order",
    "create",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
      id("encounter", "Mã lần khám (UUID)"),
      id("orderer", "Mã bác sĩ trên lần khám (UUID)"),
      choice("service", "Dịch vụ", serviceOptions()),
      choice("config", "Quy trình", workflowConfigOptions()),
      id("bill", "Mã phiếu phí (bắt buộc khi trả trước)", false),
      optional("clinicalHistory", "Thông tin lâm sàng", "textarea", {
        max: 1000,
      }),
    ],
    () => "operations/service-orders",
    undefined,
    { idempotent: true, facility: true, captures: "order" },
  ),
  orderTransition: action(
    "Cập nhật chỉ định CLS",
    "diagnostic_order",
    "update",
    [
      fieldId,
      choice(
        "state",
        "Trạng thái tiếp theo",
        states([
          "assigned",
          "in_progress",
          "completed",
          "cancelled",
          "entered-in-error",
        ]),
      ),
      id("assignedProvider", "Mã KTV khi phân công (UUID)", false),
      optional("reason", "Lý do hủy / nhập nhầm"),
    ],
    (d) => "operations/service-orders/" + uuid(d.record) + "/transition",
    (d) => {
      if (d.state === "assigned" && !d.assignedProvider)
        throw new BackendError("Cần chọn người được phân công.");
      if (["cancelled", "entered-in-error"].includes(d.state) && !d.reason)
        throw new BackendError("Cần lý do hủy / nhập nhầm.");
      if (!["cancelled", "entered-in-error"].includes(d.state)) delete d.reason;
      return pick(d, ["state", "assignedProvider", "reason"]);
    },
    { record: "order", captures: "order" },
  ),
  result: action(
    "Đọc kết quả CLS",
    "diagnostic_result",
    "read",
    [fieldId],
    (d) => "operations/results/" + uuid(d.record),
    null,
    { method: "GET", record: "result", captures: "result" },
  ),
  saveResult: action(
    "Ghi kết quả CLS",
    "diagnostic_result",
    "create",
    resultFields,
    (d) => "operations/service-orders/" + uuid(d.record) + "/results",
    resultBody,
    { record: "order", captures: "result" },
  ),
  correctResult: action(
    "Đính chính kết quả CLS",
    "diagnostic_result",
    "update",
    [...resultFields.filter((f) => f.name !== "state"), reason],
    (d) => "operations/results/" + uuid(d.record) + "/corrections",
    resultBody,
    { record: "result", captures: "result" },
  ),
  upload: action(
    "Đính kèm báo cáo CLS",
    "diagnostic_result",
    "update",
    [
      fieldId,
      id("result", "Mã kết quả liên quan (UUID)", false),
      F("file", "Tệp PDF/JPEG/PNG (tối đa 20 MiB)", "file"),
    ],
    (d) =>
      "operations/service-orders/" +
      uuid(d.record) +
      "/attachments" +
      (d.result ? "?" + new URLSearchParams({ result: d.result }) : ""),
    null,
    { upload: true, record: "order", captures: "attachment" },
  ),
  attachment: action(
    "Đọc thông tin tệp CLS",
    "diagnostic_result",
    "read",
    [fieldId],
    (d) => "operations/attachments/" + uuid(d.record),
    null,
    { method: "GET", record: "attachment", captures: "attachment" },
  ),
  download: action(
    "Tải tệp CLS",
    "diagnostic_result",
    "download",
    [fieldId],
    (d) => "operations/attachments/" + uuid(d.record) + "/content",
    null,
    { method: "GET", binary: true, record: "attachment" },
  ),
  printOrder: printAction("Xem phiếu chỉ định", "diagnostic_order", "order", {
    record: "order",
  }),
  printResult: printAction("Xem phiếu kết quả", "diagnostic_result", "result", {
    record: "result",
  }),
};

const orders = {
  section: "orders",
  resource: "diagnostic_order",
  title: "Chỉ định CLS",
  hint: "KTV chỉ thấy chỉ định được giao cho mình và chỉ định chưa phân công.",
  auto: true,
  filters: [
    statusFilter(
      "state",
      "Trạng thái",
      [
        ["active", "Đang xử lý"],
        ["all", "Tất cả"],
        ["requested", "Chờ phân công"],
        ["assigned", "Đã phân công"],
        ["in_progress", "Đang thực hiện"],
        ["completed", "Hoàn tất"],
      ],
      "active",
    ),
    F("date", "Ngày chỉ định", "date", { required: false }),
  ],
  path: (d) =>
    "operations/service-orders?" +
    qs({
      state: d.state || "active",
      date: d.date,
      limit: 50,
      offset: d.offset,
    }),
  row: (o) => ({
    id: o.uuid,
    title: o.serviceName,
    detail: [
      patientLabel(o),
      o.assignedProviderName ? "KTV " + o.assignedProviderName : null,
      formatTime(o.createdAt),
    ]
      .filter(Boolean)
      .join(" · "),
    status: stateText(o.state),
    context: {
      patient: o.patientUuid,
      visit: o.visitUuid,
      encounter: o.encounterUuid,
    },
    label: patientLabel(o),
    actions: [
      go("Cập nhật trạng thái", "orders", "orderTransition", {
        prefill: { record: o.uuid },
      }),
      ...(["assigned", "in_progress"].includes(o.state) &&
      !(o.results || []).length
        ? [
            go("Ghi kết quả", "orders", "saveResult", {
              prefill: { record: o.uuid },
            }),
          ]
        : []),
      go("Xem", "orders", "order", { prefill: { record: o.uuid } }),
    ],
  }),
};

export default defineModule({
  name: "orders",
  version: "0.1.0",
  order: 90,
  sections: [
    {
      id: "orders",
      title: "Chỉ định & kết quả",
      resource: "diagnostic_order",
      order: 90,
      actions: [
        "order",
        "createOrder",
        "orderTransition",
        "result",
        "saveResult",
        "correctResult",
        "upload",
        "attachment",
        "download",
      ],
      description:
        "Chỉ định CLS đang xử lý, phân công KTV, ghi kết quả và tệp đính kèm.",
      icon: "⌕",
      records: ["order", "result", "attachment"],
      needsProvider: true,
    },
  ],
  actions,
  worklists: { orders },
  records: {
    order: {
      label: "Chỉ định CLS",
      section: "orders",
      read: "order",
      embedded: (r) =>
        (r.results || []).map((result) => [
          "result",
          { ...result, uuid: result.result_uuid, orderUuid: r.uuid },
        ]),
    },
    result: {
      label: "Kết quả CLS",
      section: "orders",
      read: "result",
      embedded: (r) =>
        (r.attachments || []).map((file) => [
          "attachment",
          { ...file, uuid: file.attachment_uuid },
        ]),
    },
    attachment: {
      label: "Tệp CLS",
      section: "orders",
      read: "attachment",
      clearsContextWithoutPatient: true,
    },
  },
  links: [{ key: "orderUuid", type: "order", priority: 20 }],
  providerFields: { lab: ["authorProvider", "assignedProvider"] },
});
