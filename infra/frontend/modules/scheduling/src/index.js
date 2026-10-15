// @vinshc/scheduling: appointments and the service queue. Contract: docs/api/clinic-operations.md.
import {
  defineModule,
  metadata as m,
  BackendError,
  uuid,
  instant,
  action,
  printAction,
  F,
  choice,
  id,
  optional,
  options,
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
const personVisit = [
  id("patient", "Mã bệnh nhân (UUID)"),
  id("visit", "Mã lượt khám (UUID)"),
];
const keyBody = (d) => ({ ...d, idempotencyKey: d.idempotencyKey });
const points = options(m.workflow.queuePoints, "code");
const pointOptions = m.workflow.queuePoints.map((p) => [p.code, p.name]);

const actions = {
  appointments: action(
    "Đọc lịch hẹn",
    "appointment",
    "read",
    [fieldId],
    (d) => "operations/appointments/" + uuid(d.record),
    null,
    { method: "GET", record: "appointment", captures: "appointment" },
  ),
  book: action(
    "Đặt lịch hẹn",
    "appointment",
    "create",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
      id("provider", "Mã bác sĩ (UUID)"),
      choice("service", "Dịch vụ", serviceOptions()),
      choice(
        "appointmentType",
        "Loại lịch hẹn",
        options(m.workflow.appointmentTypes, "code"),
      ),
      F("startAt", "Bắt đầu", "datetime-local"),
      F("endAt", "Kết thúc", "datetime-local"),
      optional("note", "Ghi chú", "textarea", { max: 1000 }),
    ],
    () => "operations/appointments",
    (d) => {
      if (Date.parse(d.startAt) >= Date.parse(d.endAt))
        throw new BackendError("Giờ kết thúc phải sau giờ bắt đầu.");
      return { ...d, startAt: instant(d.startAt), endAt: instant(d.endAt) };
    },
    { idempotent: true, facility: true, captures: "appointment" },
  ),
  appointmentTransition: action(
    "Cập nhật lịch hẹn",
    "appointment",
    "update",
    [
      fieldId,
      choice(
        "status",
        "Trạng thái tiếp theo",
        states(m.workflow.appointmentStates),
      ),
      optional("reason", "Lý do"),
    ],
    (d) => "operations/appointments/" + uuid(d.record) + "/transition",
    (d) => pick(d, ["status", "reason"]),
    { record: "appointment", captures: "appointment" },
  ),
  queue: action(
    "Đọc phiếu hàng đợi",
    "queue",
    "read",
    [fieldId],
    (d) => "operations/queue/" + uuid(d.record),
    null,
    { method: "GET", record: "queue", captures: "queue" },
  ),
  enqueue: action(
    "Thêm vào hàng đợi",
    "queue",
    "create",
    [
      ...personVisit,
      choice("config", "Quy trình", workflowConfigOptions()),
      choice("point", "Điểm phục vụ", points),
      id("provider", "Mã bác sĩ (UUID)", false),
    ],
    () => "operations/queue",
    keyBody,
    { idempotent: true, captures: "queue" },
  ),
  queueTransition: action(
    "Cập nhật hàng đợi",
    "queue",
    "update",
    [
      fieldId,
      choice("state", "Trạng thái tiếp theo", states(m.workflow.queueStates)),
      choice(
        "exitReason",
        "Lý do hủy / bỏ về",
        m.workflow.exitReasons.map((v) => [
          v,
          {
            patient_requested: "Người bệnh yêu cầu",
            duplicate_registration: "Tiếp nhận trùng",
            service_unavailable: "Không có dịch vụ",
            referred_elsewhere: "Chuyển cơ sở",
            other: "Khác",
          }[v],
        ]),
        { required: false },
      ),
    ],
    (d) => "operations/queue/" + uuid(d.record) + "/transition",
    (d) => {
      if (!["cancelled", "left"].includes(d.state)) delete d.exitReason;
      return pick(d, ["state", "exitReason"]);
    },
    { record: "queue", captures: "queue" },
  ),
  advance: action(
    "Chuyển điểm phục vụ",
    "queue",
    "update",
    [
      fieldId,
      choice("nextPoint", "Điểm tiếp theo", points),
      id("provider", "Mã bác sĩ (UUID)", false),
    ],
    (d) => "operations/queue/" + uuid(d.record) + "/advance",
    (d) => pick(d, ["nextPoint", "provider", "idempotencyKey"]),
    {
      idempotent: true,
      record: "queue",
      captures: "queue",
      // Advancing issues a new ticket; the ticket that was advanced must be read again.
      marksStale: (r, input) =>
        input.record !== r.uuid ? "queue:" + input.record : null,
    },
  ),
  printAppointment: printAction("Xem giấy hẹn", "appointment", "appointment", {
    record: "appointment",
  }),
};

const appointments = {
  recordType: "appointment",
  section: "appointments",
  resource: "appointment",
  title: "Lịch hẹn trong ngày",
  hint: "Theo cơ sở đang làm việc.",
  auto: true,
  filters: [
    F("date", "Ngày", "date", { required: false }),
    statusFilter("status", "Trạng thái", m.workflow.appointmentStates),
  ],
  path: (d) =>
    "operations/appointments?" +
    qs({ date: d.date, status: d.status, limit: 50, offset: d.offset }),
  row: (a) => ({
    id: a.uuid,
    title: formatTime(a.startAt) + " – " + formatTime(a.endAt).slice(0, 5),
    detail: [patientLabel(a), a.serviceName, a.providerName]
      .filter(Boolean)
      .join(" · "),
    status: stateText(a.status),
    context: {
      patient: a.patientUuid,
      ...(a.visitUuid ? { visit: a.visitUuid } : {}),
    },
    label: patientLabel(a),
    actions: [
      ...(a.status === 'booked' ? [go('Xác nhận lịch', 'appointments', 'appointmentTransition', { prefill: { record: a.uuid, status: 'confirmed' } })] : []),
      ...(a.status === 'confirmed' ? [go('Ghi nhận đã đến', 'appointments', 'appointmentTransition', { prefill: { record: a.uuid, status: 'arrived' } })] : []),
      go("Cập nhật", "appointments", "appointmentTransition", {
        prefill: { record: a.uuid },
      }),
      ...(["booked", "confirmed", "arrived"].includes(a.status) && !a.visitUuid
        ? [
            go("Tiếp nhận mở lượt", "visits", "openVisit", {
              prefill: { appointment: a.uuid, visitType: "followup" },
            }),
          ]
        : []),
      go("In giấy hẹn", "documents", "printAppointment", {
        prefill: { record: a.uuid },
      }),
    ],
  }),
};
const queue = {
  recordType: "queue",
  section: "queue",
  resource: "queue",
  title: "Bảng hàng đợi hôm nay",
  hint: "Mặc định các phiếu đang chờ, đã gọi hoặc đang phục vụ.",
  auto: true,
  filters: [
    choice("point", "Điểm phục vụ", pointOptions, { required: false }),
    statusFilter(
      "state",
      "Trạng thái",
      [
        ["active", "Đang xử lý"],
        ["all", "Tất cả"],
        ...m.workflow.queueStates.map((v) => [v, stateText(v)]),
      ],
      "active",
    ),
    F("date", "Ngày", "date", { required: false }),
  ],
  path: (d) =>
    "operations/queue?" +
    qs({
      point: d.point,
      state: d.state || "active",
      date: d.date,
      limit: 100,
      offset: d.offset,
    }),
  row: (q) => ({
    id: q.uuid,
    title: "Số " + q.queueNumber + " · " + (q.pointName || q.point),
    detail: patientLabel(q),
    status: stateText(q.state),
    context: { patient: q.patientUuid, visit: q.visitUuid },
    label: patientLabel(q),
    actions: [
      ...(q.state === 'waiting' ? [go('Gọi bệnh nhân', 'queue', 'queueTransition', { prefill: { record: q.uuid, state: 'called' } })] : []),
      ...(q.state === 'called' ? [go('Bắt đầu phục vụ', 'queue', 'queueTransition', { prefill: { record: q.uuid, state: 'in_service' } })] : []),
      ...(q.state === 'in_service' ? [go('Chuyển điểm tiếp theo', 'queue', 'advance', { prefill: { record: q.uuid } })] : []),
      go("Chuyển trạng thái", "queue", "queueTransition", {
        prefill: { record: q.uuid },
      }),
    ],
  }),
};

export default defineModule({
  name: "scheduling",
  version: "0.1.0",
  order: 60,
  sections: [
    {
      id: "appointments",
      title: "Lịch hẹn",
      resource: "appointment",
      order: 60,
      actions: ["appointments", "book", "appointmentTransition"],
      description:
        "Lịch hẹn theo ngày, cập nhật trạng thái, check-in mở lượt và in giấy hẹn.",
      icon: "▦",
      records: ["appointment"],
    },
    {
      id: "queue",
      title: "Hàng đợi",
      resource: "queue",
      order: 70,
      actions: ["queue", "enqueue", "queueTransition", "advance"],
      description: "Bảng hàng đợi theo điểm phục vụ, gọi số và chuyển bước.",
      icon: "≡",
      records: ["queue"],
    },
  ],
  actions,
  worklists: { appointments, queue },
  records: {
    appointment: {
      label: "Lịch hẹn",
      section: "appointments",
      read: "appointments",
    },
    queue: { label: "Phiếu hàng đợi", section: "queue", read: "queue" },
  },
});
