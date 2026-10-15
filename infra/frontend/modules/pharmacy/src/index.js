// @vinshc/pharmacy: prescriptions waiting at the counter, dispensing and prescription printing.
// Contract: docs/api/care.md.
import {
  defineModule,
  BackendError,
  uuid,
  action,
  printAction,
  F,
  id,
  optional,
  stateText,
  qs,
  go,
  statusFilter,
  patientLabel,
} from "@vinshc/core";

const record = id("record", "Mã bản ghi (UUID)");

const actions = {
  dispense: action(
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
      record: "prescription",
      captures: "dispense",
      notice:
        "Backend chặn cấp vượt số lượng kê, đơn đã ngừng/hết hiệu lực, lượt đã hủy và lô hết hạn. KHÔNG ĐỐI CHIẾU TỒN KHO: hệ thống chỉ ghi nhận số lô/hạn dùng, không xác nhận lô còn hàng.",
    },
  ),
  correctDispense: action(
    "Đính chính phiếu cấp (giữ nguyên bản gốc)", "dispensing", "update",
    [
      id("record", "UUID phiếu cấp thuốc"),
      F("expectedVersion", "Phiên bản hiện tại", "number", { min: 0, value: "0" }),
      F("quantity", "Số lượng đúng (sau đính chính)", "number", { min: 0.0001, step: "any" }),
      F("reason", "Lý do đính chính", "textarea", { max: 1000 }),
    ],
    d => "pharmacy/dispenses/" + uuid(d.record) + "/corrections",
    d => ({ expectedVersion: Number(d.expectedVersion), quantity: Number(d.quantity), reason: d.reason }),
    { idempotent: true, record: "dispense", captures: "dispense",
      confirm: "Xác nhận tạo revision? Phiếu cũ được giữ nguyên; tổng đã cấp sẽ được tính lại.",
      notice: "CHƯA ĐỐI CHIẾU TỒN KHO. Chỉ tài khoản có quyền được phê duyệt mới sử dụng; cập nhật này không trả/nhập hàng vào kho." },
  ),
  voidDispense: action(
    "Hủy hiệu lực phiếu cấp (giữ lịch sử)", "dispensing", "void",
    [
      id("record", "UUID phiếu cấp thuốc"),
      F("expectedVersion", "Phiên bản hiện tại", "number", { min: 0, value: "0" }),
      F("reason", "Lý do hủy", "textarea", { max: 1000 }),
    ],
    d => "pharmacy/dispenses/" + uuid(d.record) + "/void",
    d => ({ expectedVersion: Number(d.expectedVersion), reason: d.reason }),
    { idempotent: true, record: "dispense", captures: "dispense",
      confirm: "Xác nhận hủy hiệu lực? Không xóa bản gốc; tổng số đã cấp giảm theo revision.",
      notice: "CHƯA ĐỐI CHIẾU TỒN KHO. Cần quy trình thu hồi thuốc thực tế ngoài hệ thống." },
  ),
  prescriptionDetail: action(
    "Xem dòng thuốc và lịch sử cấp",
    "dispensing",
    "read",
    [record],
    (d) => "pharmacy/prescriptions/" + uuid(d.record),
    null,
    { method: "GET", record: "prescription", captures: "prescription" },
  ),
  dispenseRecord: action(
    "Xem phiếu cấp thuốc",
    "dispensing",
    "read",
    [record],
    (d) => "pharmacy/dispenses/" + uuid(d.record),
    null,
    { method: "GET", record: "dispense", captures: "dispense" },
  ),
  printPrescription: printAction("Xem đơn thuốc", "prescription", "prescription", {
    record: "prescription",
  }),
};

const prescriptions = {
  recordType: "prescription",
  section: "pharmacy",
  resource: "dispensing",
  title: "Đơn thuốc cần cấp",
  hint: "Mặc định dòng thuốc đang hiệu lực chưa cấp đủ, kê trong ngày.",
  auto: true,
  filters: [
    statusFilter(
      "status",
      "Trạng thái",
      [
        ["pending", "Chờ cấp"],
        ["dispensed", "Đã cấp"],
        ["all", "Tất cả"],
      ],
      "pending",
    ),
    F("date", "Ngày kê", "date", { required: false }),
  ],
  path: (d) =>
    "pharmacy/prescriptions?" +
    qs({
      status: d.status || "pending",
      date: d.date,
      limit: 50,
      offset: d.offset,
    }),
  row: (r) => ({
    id: r.uuid,
    title: patientLabel(r) || "Đơn thuốc",
    detail: [
      [r.drugName, r.drug?.strength].filter(Boolean).join(" "),
      [r.dose, r.doseUnits, r.route, r.frequency].filter(Boolean).join(" "),
      "SL " +
        r.quantity +
        " " +
        (r.quantityUnits || "") +
        " · còn " +
        r.remainingQuantity,
    ].join(" · "),
    status: r.visitCancelled
      ? "Lượt đã hủy"
      : r.status !== "active"
        ? stateText(r.status)
        : {
            pending: "Chưa cấp",
            partial: "Cấp một phần",
            complete: "Đã cấp đủ",
          }[r.dispenseStatus],
    context: { patient: r.patientUuid, visit: r.visitUuid },
    label: patientLabel(r),
    actions: [
      ...(r.status === "active" &&
      !r.visitCancelled &&
      r.dispenseStatus !== "complete"
        ? [
            go("Cấp thuốc", "pharmacy", "dispense", {
              prefill: { record: r.uuid, quantity: r.remainingQuantity },
            }),
          ]
        : []),
      go("Chi tiết", "pharmacy", "prescriptionDetail", {
        prefill: { record: r.uuid },
      }),
      go("In đơn", "documents", "printPrescription", {
        prefill: { record: r.uuid },
      }),
    ],
  }),
};

export default defineModule({
  name: "pharmacy",
  version: "0.1.0",
  order: 100,
  sections: [
    {
      id: "pharmacy",
      title: "Quầy thuốc",
      resource: "dispensing",
      order: 100,
      actions: [
        "dispense",
        "correctDispense",
        "voidDispense",
        "prescriptionDetail",
        "dispenseRecord",
        "printPrescription",
      ],
      note: "Danh sách đơn cần cấp lấy từ đơn thuốc đã xác nhận tại cơ sở. KHÔNG ĐỐI CHIẾU TỒN KHO. Số lô/hạn dùng chỉ là dữ liệu ghi nhận khi cấp thuốc; không xác thực hàng trong kho hoặc trừ tồn. Chỉ sử dụng sau đối chiếu thủ công tại quầy.",
      description:
        "Đơn thuốc chờ cấp, ghi cấp theo số lượng kê, số lô và hạn dùng.",
      icon: "✚",
      records: ["prescription"],
      visible: ({ role, byDefault }) => byDefault() || role === "pharmacy",
    },
  ],
  actions,
  worklists: { prescriptions },
  records: {
    dispense: {
      label: "Phiếu cấp thuốc",
      section: "pharmacy",
      read: "dispenseRecord",
      // A dispense response embeds the prescription line it was recorded against.
      related: (r) => (r.prescription ? [["prescription", r.prescription]] : []),
      parentFrom: (r) => r.prescription || {},
    },
  },
});
