// @vinshc/visits: open, list and close outpatient visits. Contract: docs/api/care.md.
import {
  defineModule,
  BackendError,
  uuid,
  instant,
  action,
  F,
  choice,
  id,
  optional,
  codeList,
  qs,
  go,
  statusFilter,
  formatTime,
  patientIdentity,
} from "@vinshc/core";

const visit = id("visit", "Mã lượt khám (UUID)");
const closeLabels = {
  completed: "Kết thúc khám",
  left_early: "Bỏ về",
  cancelled: "Hủy tiếp nhận",
  referred: "Chuyển cơ sở",
};
const encounterOf = (v, key) =>
  (v.encounters || []).find((e) => e.encounterType?.key === key);
const visitContext = (v) => {
  const consult = encounterOf(v, "consultation");
  return {
    patient: v.patientUuid,
    visit: v.uuid,
    ...(consult ? { encounter: consult.uuid } : {}),
  };
};

const actions = {
  openVisit: action(
    "Mở lượt khám",
    "visit",
    "create",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
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
      captures: "visit",
      notice:
        "Mỗi bệnh nhân chỉ có một lượt đang mở. Lịch hẹn được chọn sẽ chuyển sang Đã đến và liên kết với lượt.",
    },
  ),
  visitDetail: action(
    "Xem lượt khám",
    "visit",
    "read",
    [visit],
    (d) => "visits/" + uuid(d.visit),
    null,
    { method: "GET", captures: "visit" },
  ),
  closeVisit: action(
    "Kết thúc lượt khám",
    "visit",
    "update",
    [
      visit,
      choice("closeReason", "Lý do kết thúc", codeList("visit_close_reason")),
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
      captures: "visit",
      notice:
        "Kết thúc khám bị từ chối khi còn chỉ định CLS chưa xong hoặc phiếu phí chưa thu đủ. Hủy tiếp nhận chỉ dành cho tiếp đón. Phiếu hàng đợi còn mở được đóng theo lý do.",
    },
  ),
};

const visits = {
  section: "visits",
  resource: "visit",
  title: "Lượt khám tại cơ sở",
  hint: "Mặc định là các lượt đang mở; chọn ngày để xem lượt bắt đầu trong ngày.",
  auto: true,
  filters: [
    statusFilter(
      "status",
      "Trạng thái",
      [
        ["open", "Đang mở"],
        ["closed", "Đã kết thúc"],
        ["all", "Tất cả"],
      ],
      "open",
    ),
    F("date", "Ngày bắt đầu", "date", { required: false }),
  ],
  path: (d) =>
    "visits?" +
    qs({
      status: d.status || "open",
      date: d.date,
      limit: 25,
      offset: d.offset,
    }),
  row: (v) => {
    const consult = encounterOf(v, "consultation"),
      vitals = encounterOf(v, "vitals");
    return {
      id: v.uuid,
      title: v.patient?.fullName,
      detail: [
        patientIdentity(v.patient || {}),
        v.visitType?.name,
        "Bắt đầu " + formatTime(v.startDatetime),
      ]
        .filter(Boolean)
        .join(" · "),
      status:
        v.status === "open"
          ? "Đang mở"
          : "Đã kết thúc" +
            (v.closeReason ? " · " + closeLabels[v.closeReason] : ""),
      context: visitContext(v),
      label:
        (v.patient?.fullName || "") + " · " + (v.patient?.identifier || ""),
      actions:
        v.status === "open"
          ? [
              vitals
                ? go("Ghi sinh hiệu", "vitals", null, {
                    context: { ...visitContext(v), encounter: vitals.uuid },
                  })
                : go("Ghi sinh hiệu", "vitals", "startVitalsEncounter"),
              consult
                ? go("Hồ sơ khám", "clinical", "summary")
                : go("Khám", "clinical", "startConsultation"),
              go("Xếp hàng", "queue", "enqueue"),
              go("Lập phiếu phí", "billing", "bill"),
              go("Kết thúc lượt", "visits", "closeVisit"),
              go("Chi tiết", "visits", "visitDetail"),
            ]
          : [
              go("Chi tiết", "visits", "visitDetail"),
              ...(consult ? [go("Hồ sơ khám", "clinical", "summary")] : []),
            ],
    };
  },
};

export default defineModule({
  name: "visits",
  version: "0.1.0",
  order: 20,
  sections: [
    {
      id: "visits",
      title: "Lượt khám",
      resource: "visit",
      order: 20,
      actions: ["openVisit", "visitDetail", "closeVisit"],
      description:
        "Danh sách lượt đang mở trong ngày, mở/kết thúc lượt và chuyển sang đo sinh hiệu, khám, thu ngân.",
      icon: "↗",
      records: ["visit", "encounter"],
      visible: ({ permitted }) => permitted("visit", "read"),
    },
  ],
  actions,
  worklists: { visits },
  records: {
    visit: { label: "Lượt khám", section: "visits", read: "visitDetail" },
  },
});
