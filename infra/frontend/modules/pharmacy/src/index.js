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
        "Backend chặn cấp vượt số lượng kê, đơn đã ngừng/hết hiệu lực, lượt đã hủy và lô hết hạn. Chưa trừ tồn kho.",
    },
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
    title: [r.drugName, r.drug?.strength].filter(Boolean).join(" "),
    detail: [
      patientLabel(r),
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
        "prescriptionDetail",
        "dispenseRecord",
        "printPrescription",
      ],
      note: "Danh sách đơn cần cấp lấy từ đơn thuốc đã xác nhận tại cơ sở. Kho, tồn và lô chi tiết thuộc phạm vi sau pilot; số lô/hạn dùng được ghi theo lần cấp.",
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
