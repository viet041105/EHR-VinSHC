import { uuid } from "./backend-client.js";

// Only successful backend responses enter this store. It lives in one workspace in memory.
export const recordTypes = {
  patient: { label: "Bệnh nhân", section: "patients", read: "identity" },
  visit: { label: "Lượt khám", section: "visits", read: "visitDetail" },
  encounter: { label: "Lần khám", section: "clinical", read: "summary" },
  vitals: { label: "Lần đo sinh hiệu", section: "vitals", read: null },
  dispense: {
    label: "Phiếu cấp thuốc",
    section: "pharmacy",
    read: "dispenseRecord",
  },
  appointment: {
    label: "Lịch hẹn",
    section: "appointments",
    read: "appointments",
  },
  queue: { label: "Phiếu hàng đợi", section: "queue", read: "queue" },
  bill: { label: "Phiếu phí", section: "billing", read: "bills" },
  payment: { label: "Giao dịch", section: "billing", read: "payment" },
  order: { label: "Chỉ định CLS", section: "orders", read: "order" },
  result: { label: "Kết quả CLS", section: "orders", read: "result" },
  prescription: { label: "Dòng thuốc", section: "clinical", read: null },
  attachment: { label: "Tệp CLS", section: "orders", read: "attachment" },
};
export const actionRecordTypes = {
  appointments: "appointment",
  appointmentTransition: "appointment",
  printAppointment: "appointment",
  queue: "queue",
  queueTransition: "queue",
  advance: "queue",
  bills: "bill",
  receipt: "bill",
  cancelBill: "bill",
  payment: "payment",
  settle: "payment",
  refund: "payment",
  printReceipt: "payment",
  printRefund: "payment",
  order: "order",
  orderTransition: "order",
  saveResult: "order",
  upload: "order",
  printOrder: "order",
  result: "result",
  correctResult: "result",
  printResult: "result",
  attachment: "attachment",
  download: "attachment",
  discontinue: "prescription",
  printPrescription: "prescription",
  correctVitals: "vitals",
  voidVitals: "vitals",
  dispense: "prescription",
  prescriptionDetail: "prescription",
  dispenseRecord: "dispense",
};
const responseTypes = {
  identity: "patient",
  summary: "encounter",
  book: "appointment",
  appointments: "appointment",
  appointmentTransition: "appointment",
  enqueue: "queue",
  queue: "queue",
  queueTransition: "queue",
  advance: "queue",
  bill: "bill",
  bills: "bill",
  cancelBill: "bill",
  receipt: "payment",
  payment: "payment",
  settle: "payment",
  refund: "payment",
  createOrder: "order",
  order: "order",
  orderTransition: "order",
  saveResult: "result",
  result: "result",
  correctResult: "result",
  prescription: "prescription",
  discontinue: "prescription",
  upload: "attachment",
  attachment: "attachment",
  registerPatient: "patient",
  patientProfile: "patient",
  updatePatient: "patient",
  openVisit: "visit",
  visitDetail: "visit",
  closeVisit: "visit",
  startVitalsEncounter: "encounter",
  startConsultation: "encounter",
  vitals: "vitals",
  correctVitals: "vitals",
  voidVitals: "vitals",
  prescriptionDetail: "prescription",
  dispense: "dispense",
  dispenseRecord: "dispense",
};
const valid = (value) => {
  try {
    return uuid(value);
  } catch {
    return null;
  }
};
export class WorkspaceMemory {
  constructor() {
    this.clear();
  }
  clear() {
    this.context = {};
    this.contextLabel = "";
    this.records = new Map();
    this.selected = {};
  }
  setContext(values) {
    const next = Object.fromEntries(
      ["patient", "visit", "encounter"]
        .filter((k) => values[k])
        .map((k) => [k, uuid(values[k])]),
    );
    // An explicit context replacement cannot retain identifiers from the previous patient.
    if (next.patient !== this.context.patient) this.contextLabel = "";
    this.context = next;
  }
  remember(type, response) {
    if (!response || typeof response !== "object" || Array.isArray(response))
      return;
    const id = valid(
      type === "patient"
        ? response.patientUuid
        : type === "encounter"
          ? response.encounterUuid
          : response.uuid,
    );
    if (!id) return;
    const key = type + ":" + id;
    this.records.delete(key);
    this.records.set(key, {
      type,
      id,
      data: response,
      openedAt: new Date().toISOString(),
    });
    if (this.records.size > 100)
      this.records.delete(this.records.keys().next().value);
  }
  capture(action, response, input = {}) {
    if (!response || typeof response !== "object" || Array.isArray(response))
      return;
    const type = responseTypes[action];
    if (type === "dispense" && response.prescription)
      this.remember("prescription", response.prescription);
    const parent = response.billUuid
      ? this.records.get("bill:" + response.billUuid)
      : response.orderUuid
        ? this.records.get("order:" + response.orderUuid)
        : type === "dispense"
          ? { data: response.prescription || {} }
          : null;
    const patient = valid(
      response.patientUuid ||
        response.patient ||
        parent?.data.patientUuid ||
        input.patient,
    );
    const encounter = valid(
      response.encounterUuid ||
        response.encounter ||
        parent?.data.encounterUuid ||
        input.encounter,
    );
    const visit = valid(
      response.visitUuid || parent?.data.visitUuid || input.visit,
    );
    if (!patient && ["payment", "attachment"].includes(type)) {
      this.context = {};
      this.selected = {};
    }
    if (patient) {
      if (this.context.patient !== patient) {
        this.context = { patient };
        this.contextLabel = "";
        this.selected = {};
      }
      if (encounter && this.context.encounter !== encounter) {
        delete this.context.visit;
        this.context.encounter = encounter;
        this.selected = {};
      }
      if (visit && this.context.visit !== visit) {
        if (!encounter) delete this.context.encounter;
        this.context.visit = visit;
        this.selected = {};
      }
      if (Object.hasOwn(response, "visitUuid") && response.visitUuid === null)
        delete this.context.visit;
    }
    if (type) {
      this.remember(type, response);
      const id = valid(
        type === "patient"
          ? response.patientUuid
          : type === "encounter"
            ? response.encounterUuid
            : response.uuid,
      );
      if (id) this.selected[type] = id;
    }
    if (["receipt", "settle", "refund"].includes(action)) {
      const bill = this.records.get("bill:" + response.billUuid);
      if (bill) bill.stale = true;
    }
    if (action === "advance" && input.record !== response.uuid) {
      const old = this.records.get("queue:" + input.record);
      if (old) old.stale = true;
    }
    if (action === "summary")
      for (const drug of response.drugOrders || [])
        this.remember("prescription", drug);
    // Embedded SQL projections use different keys from the individual REST DTOs.
    if (type === "bill")
      for (const payment of response.payments || [])
        this.remember("payment", {
          ...payment,
          uuid: payment.payment_uuid,
          billUuid: response.uuid,
          amountVnd: payment.amount_vnd,
        });
    if (type === "order")
      for (const result of response.results || [])
        this.remember("result", {
          ...result,
          uuid: result.result_uuid,
          orderUuid: response.uuid,
        });
    if (type === "result")
      for (const file of response.attachments || [])
        this.remember("attachment", { ...file, uuid: file.attachment_uuid });
  }
  list(types) {
    return [...this.records.values()]
      .filter((row) => types.includes(row.type))
      .reverse();
  }
  select(type, id) {
    const row = this.records.get(type + ":" + id);
    if (!row) return null;
    const parent = row.data.billUuid
      ? this.records.get("bill:" + row.data.billUuid)
      : row.data.orderUuid
        ? this.records.get("order:" + row.data.orderUuid)
        : null;
    const source = row.data.patientUuid ? row.data : parent?.data || {};
    const patient = valid(source.patientUuid),
      visit = valid(source.visitUuid),
      encounter = valid(source.encounterUuid);
    this.setContext({ patient, visit, encounter });
    this.selected = { [type]: row.id };
    if (row.data.billUuid) this.selected.bill = valid(row.data.billUuid);
    if (row.data.orderUuid) this.selected.order = valid(row.data.orderUuid);
    return row;
  }
  defaults(action) {
    const type = actionRecordTypes[action];
    return {
      ...this.context,
      ...(type && this.selected[type] ? { record: this.selected[type] } : {}),
    };
  }
}
