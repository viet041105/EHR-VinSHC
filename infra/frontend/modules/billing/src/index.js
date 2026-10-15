// @vinshc/billing: bills, receipts, transfer settlement, refunds and receipt printing.
// Contract: docs/api/clinic-operations.md.
import {
  defineModule,
  uuid,
  money,
  action,
  printAction,
  F,
  choice,
  id,
  serviceOptions,
  stateText,
  qs,
  go,
  statusFilter,
  formatVnd,
  formatTime,
  patientLabel,
} from "@vinshc/core";

const fieldId = id("record", "Mã bản ghi (UUID)");
const reason = F("reason", "Lý do", "textarea", { max: 1000 });
// Receipt, settlement and refund change the bill totals; its copy in memory must be read again.
const staleBill = (r) => "bill:" + r.billUuid;

const actions = {
  bills: action(
    "Đọc phiếu phí",
    "billing",
    "read",
    [fieldId],
    (d) => "operations/bills/" + uuid(d.record),
    null,
    { method: "GET", record: "bill", captures: "bill" },
  ),
  bill: action(
    "Lập phiếu phí",
    "billing",
    "create",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
      id("visit", "Mã lượt khám (UUID)"),
      choice("service", "Dịch vụ", serviceOptions()),
      F("quantity", "Số lượng", "number", { min: 1, max: 10000, step: 1 }),
      F("discountVnd", "Giảm giá (VND)", "number", {
        min: 0,
        step: 1,
        value: "0",
      }),
      choice("paymentTiming", "Thời điểm thu", [
        ["postpay", "Trả sau"],
        ["prepay", "Trả trước"],
      ]),
    ],
    () => "operations/bills",
    (d) => ({
      patient: d.patient,
      visit: d.visit,
      facility: d.facility,
      paymentTiming: d.paymentTiming,
      idempotencyKey: d.idempotencyKey,
      lines: [
        {
          service: d.service,
          quantity: Number(d.quantity),
          discountVnd: Number(d.discountVnd),
        },
      ],
    }),
    {
      idempotent: true,
      facility: true,
      captures: "bill",
      notice:
        "Giá được lấy từ danh mục dịch vụ hiện hành. Kiểm tra số lượng và giảm giá trước khi lập phiếu.",
    },
  ),
  receipt: action(
    "Thu tiền",
    "payment",
    "create",
    [
      fieldId,
      F("amountVnd", "Số tiền (VND)", "number", { min: 1, step: 1 }),
      choice("method", "Phương thức", [
        ["cash", "Tiền mặt"],
        ["bank_transfer", "Chuyển khoản"],
      ]),
    ],
    (d) => "operations/bills/" + uuid(d.record) + "/receipts",
    (d) => ({
      amountVnd: money(d.amountVnd),
      method: d.method,
      idempotencyKey: d.idempotencyKey,
    }),
    { idempotent: true, record: "bill", captures: "payment", marksStale: staleBill },
  ),
  payment: action(
    "Đọc giao dịch",
    "payment",
    "read",
    [fieldId],
    (d) => "operations/payments/" + uuid(d.record),
    null,
    { method: "GET", record: "payment", captures: "payment" },
  ),
  settle: action(
    "Xác nhận chuyển khoản",
    "payment",
    "create",
    [fieldId],
    (d) => "operations/payments/" + uuid(d.record) + "/settle",
    () => ({}),
    { record: "payment", captures: "payment", marksStale: staleBill },
  ),
  refund: action(
    "Hoàn tiền",
    "payment",
    "create",
    [
      fieldId,
      F("amountVnd", "Số tiền hoàn (VND)", "number", { min: 1, step: 1 }),
      reason,
    ],
    (d) => "operations/payments/" + uuid(d.record) + "/refunds",
    (d) => ({
      amountVnd: money(d.amountVnd),
      reason: d.reason,
      idempotencyKey: d.idempotencyKey,
    }),
    { idempotent: true, record: "payment", captures: "payment", marksStale: staleBill },
  ),
  cancelBill: action(
    "Hủy phiếu phí",
    "billing",
    "cancel",
    [fieldId, reason],
    (d) => "operations/bills/" + uuid(d.record) + "/cancel",
    (d) => ({ reason: d.reason }),
    { record: "bill", captures: "bill" },
  ),
  printReceipt: printAction("Xem phiếu thu", "billing", "receipt", {
    record: "payment",
  }),
  printRefund: printAction("Xem phiếu hoàn", "billing", "refund", {
    record: "payment",
  }),
};

const bills = {
  recordType: "bill",
  section: "billing",
  resource: "billing",
  title: "Phiếu phí",
  hint: "Mặc định phiếu chưa thu đủ lập trong ngày.",
  auto: true,
  filters: [
    statusFilter(
      "status",
      "Trạng thái",
      [
        ["open", "Chưa thu đủ"],
        ["all", "Tất cả"],
        ["paid", "Đã thu đủ"],
        ["refunded", "Đã hoàn"],
        ["cancelled", "Đã hủy"],
      ],
      "open",
    ),
    F("date", "Ngày lập", "date", { required: false }),
  ],
  path: (d) =>
    "operations/bills?" +
    qs({
      status: d.status || "open",
      date: d.date,
      limit: 50,
      offset: d.offset,
    }),
  row: (b) => ({
    id: b.uuid,
    title: patientLabel(b) || b.uuid,
    detail:
      (b.lines || []).map((l) => l.serviceName).join(", ") +
      " · Tổng " +
      formatVnd(b.totalVnd) +
      " · Còn " +
      formatVnd(b.outstandingVnd),
    status: stateText(b.status),
    context: { patient: b.patientUuid, visit: b.visitUuid },
    label: patientLabel(b),
    actions: [
      ...(["unpaid", "partially_paid"].includes(b.status)
        ? [
            go("Thu tiền", "billing", "receipt", {
              prefill: { record: b.uuid, amountVnd: b.outstandingVnd },
            }),
          ]
        : []),
      go("Xem chi tiết", "billing", "bills", { prefill: { record: b.uuid } }),
      ...(['unpaid', 'partially_paid'].includes(b.status) ? [go('Hủy phiếu', 'billing', 'cancelBill', { prefill: { record: b.uuid } })] : []),
    ],
  }),
};
const payments = {
  recordType: "payment",
  section: "billing",
  resource: "payment",
  title: "Giao dịch chờ xác nhận / trong ngày",
  hint: "Chuyển khoản chờ xác nhận hiển thị không giới hạn ngày.",
  auto: true,
  filters: [
    statusFilter(
      "status",
      "Trạng thái",
      [
        ["pending", "Chờ xác nhận"],
        ["settled", "Đã thanh toán"],
        ["all", "Tất cả"],
      ],
      "pending",
    ),
    F("date", "Ngày", "date", { required: false }),
  ],
  path: (d) =>
    "operations/payments?" +
    qs({
      status: d.status || "pending",
      date: d.date,
      limit: 50,
      offset: d.offset,
    }),
  row: (p) => ({
    id: p.uuid,
    title: (p.kind === "refund" ? "Hoàn " : "Thu ") + formatVnd(p.amountVnd),
    detail: [
      patientLabel(p),
      p.method === "cash" ? "Tiền mặt" : "Chuyển khoản",
      formatTime(p.createdAt),
    ]
      .filter(Boolean)
      .join(" · "),
    status: stateText(p.status),
    context: { patient: p.patientUuid },
    label: patientLabel(p),
    actions: [
      ...(p.status === "pending"
        ? [
            go("Xác nhận chuyển khoản", "billing", "settle", {
              prefill: { record: p.uuid },
            }),
          ]
        : []),
      ...(p.kind === "receipt" && p.status === "settled"
        ? [
            go("In phiếu thu", "documents", "printReceipt", {
              prefill: { record: p.uuid },
            }),
            go("Hoàn tiền", "billing", "refund", {
              prefill: { record: p.uuid },
            }),
          ]
        : []),
    ],
  }),
};

export default defineModule({
  name: "billing",
  version: "0.1.0",
  order: 80,
  sections: [
    {
      id: "billing",
      title: "Thu ngân",
      resource: "billing",
      order: 80,
      actions: [
        "bills",
        "bill",
        "receipt",
        "payment",
        "settle",
        "refund",
        "cancelBill",
      ],
      description:
        "Phiếu phí chưa thu đủ, giao dịch chuyển khoản chờ xác nhận, thu/hoàn/hủy.",
      icon: "₫",
      records: ["bill", "payment"],
    },
  ],
  actions,
  worklists: { bills, payments },
  records: {
    bill: {
      label: "Phiếu phí",
      section: "billing",
      read: "bills",
      // Bill responses embed their payments as SQL projections with snake_case keys.
      embedded: (r) =>
        (r.payments || []).map((payment) => [
          "payment",
          {
            ...payment,
            uuid: payment.payment_uuid,
            billUuid: r.uuid,
            amountVnd: payment.amount_vnd,
          },
        ]),
    },
    payment: {
      label: "Giao dịch",
      section: "billing",
      read: "payment",
      clearsContextWithoutPatient: true,
    },
  },
  links: [{ key: "billUuid", type: "bill", priority: 10 }],
});
