// Server worklists of the staff adapter. Rows come from the backend with paging; selecting a row only
// fills the working context and form defaults, every write is still confirmed and checked by the server.
import { metadata as m } from "./metadata.js";
import { F, choice, stateText } from "./connected-actions.js";
import { VITAL_FIELD_MAP } from "./backend-mapping.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const qs = (values) =>
  new URLSearchParams(
    Object.entries(values).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null,
    ),
  ).toString();
const money = (v) =>
  typeof v === "number" ? new Intl.NumberFormat("vi-VN").format(v) + " ₫" : "—";
const time = (v) =>
  v
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(v))
    : "—";
const gender = { M: "Nam", F: "Nữ", O: "Khác", U: "Không rõ" };
const who = (r) =>
  [
    r.patientName || r.patient?.fullName,
    r.patientIdentifier || r.patient?.identifier,
  ]
    .filter(Boolean)
    .join(" · ");
const identity = (p) =>
  [
    p.identifier,
    gender[p.gender],
    p.birthdate
      ? (p.birthdateEstimated ? "~" : "") + p.birthdate.slice(0, 4)
      : null,
    p.age != null ? p.age + " tuổi" : null,
  ]
    .filter(Boolean)
    .join(" · ");
const encounterOf = (visit, key) =>
  (visit.encounters || []).find((e) => e.encounterType?.key === key);
const closeLabels = {
  completed: "Kết thúc khám",
  left_early: "Bỏ về",
  cancelled: "Hủy tiếp nhận",
  referred: "Chuyển cơ sở",
};
const vitalLabels = Object.fromEntries(
  VITAL_FIELD_MAP.map((f) => [f.code, f.label]),
);
const vitalUnits = Object.fromEntries(
  VITAL_FIELD_MAP.map((f) => [f.code, f.unit]),
);
const go = (label, section, action, extra = {}) => ({
  label,
  section,
  action,
  ...extra,
});
const statusFilter = (name, label, values, first) =>
  choice(
    name,
    label,
    values.map((v) => (Array.isArray(v) ? v : [v, stateText(v)])),
    { required: false, value: first },
  );
const pointOptions = m.workflow.queuePoints.map((p) => [p.code, p.name]);
const visitContext = (v) => {
  const consult = encounterOf(v, "consultation");
  return {
    patient: v.patientUuid,
    visit: v.uuid,
    ...(consult ? { encounter: consult.uuid } : {}),
  };
};
export const worklists = {
  patients: {
    section: "patients",
    resource: "patient_identity",
    title: "Tìm bệnh nhân",
    hint: "Tên có thể gõ không dấu; cũng tìm theo mã hồ sơ, CCCD/BHYT hoặc số điện thoại. Để trống để xem hồ sơ đăng ký gần đây.",
    auto: true,
    filters: [F("q", "Từ khóa tìm kiếm", "search", { required: false })],
    path: (d) => "patients?" + qs({ q: d.q, limit: 25, offset: d.offset }),
    row: (p) => ({
      id: p.uuid,
      title: p.fullName,
      detail: identity(p) + (p.phone ? " · ĐT " + p.phone : ""),
      status: p.openVisit ? "Đang có lượt mở" : "Chưa có lượt mở",
      context: {
        patient: p.uuid,
        ...(p.openVisit ? { visit: p.openVisit.uuid } : {}),
      },
      label: p.fullName + " · " + (p.identifier || ""),
      actions: [
        p.openVisit
          ? go("Xem lượt đang mở", "visits", "visitDetail")
          : go("Mở lượt khám", "visits", "openVisit"),
        go("Hồ sơ", "patients", "patientProfile"),
        go("Sửa hành chính", "patients", "updatePatient"),
        go("Liên hệ / địa chỉ", "identity", "contact"),
        go("Đặt lịch hẹn", "appointments", "book"),
      ],
    }),
  },
  visits: {
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
          identity(v.patient || {}),
          v.visitType?.name,
          "Bắt đầu " + time(v.startDatetime),
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
  },
  vitals: {
    section: "vitals",
    resource: "vitals",
    title: "Các lần đo của bệnh nhân",
    hint: "Theo bệnh nhân (và lượt) đang chọn trong Hồ sơ đang làm việc.",
    auto: true,
    needs: "patient",
    filters: [
      choice("includeVoided", "Gồm lần đo đã hủy", [["true", "Có"]], {
        required: false,
      }),
    ],
    path: (d, c) =>
      "vitals?" +
      qs({
        patient: c.patient,
        visit: c.visit,
        includeVoided: d.includeVoided,
      }),
    row: (g) => ({
      id: g.uuid,
      title: time(g.measuredAt),
      detail:
        Object.entries(g.values || {})
          .map(([k, v]) => vitalLabels[k] + " " + v + " " + vitalUnits[k])
          .concat(
            Object.entries(g.states || {}).map(
              ([k, v]) => vitalLabels[k] + ": " + stateText(v),
            ),
          )
          .join(" · ") || "—",
      status: g.voided
        ? "Đã hủy" + (g.voidReason ? " · " + g.voidReason : "")
        : g.needsVerification
          ? "Cần đối chiếu huyết áp"
          : "Đã ghi",
      context: {
        patient: g.patientUuid,
        visit: g.visitUuid,
        encounter: g.encounterUuid,
      },
      actions: g.voided
        ? []
        : [
            go("Đính chính", "vitals", "correctVitals", {
              prefill: { record: g.uuid },
            }),
            go("Hủy lần đo", "vitals", "voidVitals", {
              prefill: { record: g.uuid },
            }),
          ],
    }),
  },
  appointments: {
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
      title: time(a.startAt) + " – " + time(a.endAt).slice(0, 5),
      detail: [who(a), a.serviceName, a.providerName]
        .filter(Boolean)
        .join(" · "),
      status: stateText(a.status),
      context: {
        patient: a.patientUuid,
        ...(a.visitUuid ? { visit: a.visitUuid } : {}),
      },
      label: who(a),
      actions: [
        go("Cập nhật", "appointments", "appointmentTransition", {
          prefill: { record: a.uuid },
        }),
        ...(["booked", "confirmed", "arrived"].includes(a.status) &&
        !a.visitUuid
          ? [
              go("Check-in mở lượt", "visits", "openVisit", {
                prefill: { appointment: a.uuid, visitType: "followup" },
              }),
            ]
          : []),
        go("In giấy hẹn", "documents", "printAppointment", {
          prefill: { record: a.uuid },
        }),
      ],
    }),
  },
  queue: {
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
      detail: who(q),
      status: stateText(q.state),
      context: { patient: q.patientUuid, visit: q.visitUuid },
      label: who(q),
      actions: [
        go("Chuyển trạng thái", "queue", "queueTransition", {
          prefill: { record: q.uuid },
        }),
        ...(q.state === "in_service"
          ? [
              go("Chuyển điểm tiếp theo", "queue", "advance", {
                prefill: { record: q.uuid },
              }),
            ]
          : []),
      ],
    }),
  },
  bills: {
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
      title: who(b) || b.uuid,
      detail:
        (b.lines || []).map((l) => l.serviceName).join(", ") +
        " · Tổng " +
        money(b.totalVnd) +
        " · Còn " +
        money(b.outstandingVnd),
      status: stateText(b.status),
      context: { patient: b.patientUuid, visit: b.visitUuid },
      label: who(b),
      actions: [
        ...(["unpaid", "partially_paid"].includes(b.status)
          ? [
              go("Thu tiền", "billing", "receipt", {
                prefill: { record: b.uuid, amountVnd: b.outstandingVnd },
              }),
              go("Hủy phiếu", "billing", "cancelBill", {
                prefill: { record: b.uuid },
              }),
            ]
          : []),
        go("Xem chi tiết", "billing", "bills", { prefill: { record: b.uuid } }),
      ],
    }),
  },
  payments: {
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
      title: (p.kind === "refund" ? "Hoàn " : "Thu ") + money(p.amountVnd),
      detail: [
        who(p),
        p.method === "cash" ? "Tiền mặt" : "Chuyển khoản",
        time(p.createdAt),
      ]
        .filter(Boolean)
        .join(" · "),
      status: stateText(p.status),
      context: { patient: p.patientUuid },
      label: who(p),
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
              go("Hoàn tiền", "billing", "refund", {
                prefill: { record: p.uuid },
              }),
              go("In phiếu thu", "documents", "printReceipt", {
                prefill: { record: p.uuid },
              }),
            ]
          : []),
      ],
    }),
  },
  orders: {
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
        who(o),
        o.assignedProviderName ? "KTV " + o.assignedProviderName : null,
        time(o.createdAt),
      ]
        .filter(Boolean)
        .join(" · "),
      status: stateText(o.state),
      context: {
        patient: o.patientUuid,
        visit: o.visitUuid,
        encounter: o.encounterUuid,
      },
      label: who(o),
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
  },
  prescriptions: {
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
        who(r),
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
      label: who(r),
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
  },
};
export const sectionWorklists = {
  patients: ["patients"],
  visits: ["visits"],
  vitals: ["vitals"],
  appointments: ["appointments"],
  queue: ["queue"],
  billing: ["bills", "payments"],
  orders: ["orders"],
  pharmacy: ["prescriptions"],
};
export function renderWorklist(key, ctx) {
  const w = worklists[key],
    list = ctx.list || {},
    blocked = w.needs && !ctx.context[w.needs];
  return `<section class="panel workspace-records worklist" data-worklist-panel="${key}"><div class="workspace-heading"><div><h2>${esc(w.title)}</h2><p>${esc(w.hint)}</p></div><span class="capability-badge connected">Dữ liệu từ backend</span></div>
<form data-worklist="${key}" class="worklist-filters"><div class="form-grid">${w.filters.map((f) => ctx.field({ ...f, name: "wl_" + f.name, placeholder: "Tất cả" }, { ["wl_" + f.name]: (list.filters || {})[f.name] ?? f.value ?? "" })).join("")}</div><div class="form-actions"><button type="submit" ${blocked ? "disabled" : ""}>Tải danh sách</button></div></form>
<div data-worklist-results="${key}" aria-live="polite">${renderWorklistResults(key, ctx)}</div></section>`;
}
// Only this part is repainted when a response arrives, so filters being edited are never reset.
export function renderWorklistResults(
  key,
  { list = {}, canNavigate, context },
) {
  const w = worklists[key],
    rows = list.rows || [],
    blocked = w.needs && !context[w.needs];
  const actionButtons = (row, index) =>
    row.actions
      .map((a, i) =>
        canNavigate(a)
          ? `<button type="button" data-row-action data-list="${key}" data-row="${index}" data-action-index="${i}">${esc(a.label)}</button>`
          : "",
      )
      .join("");
  const status = list.loading
    ? '<p class="readonly">Đang tải…</p>'
    : list.loadedAt
      ? `<p class="readonly worklist-time">Cập nhật lúc ${esc(time(list.loadedAt))}</p>`
      : "";
  if (blocked)
    return '<p class="readonly">Chọn bệnh nhân trong Hồ sơ đang làm việc hoặc từ danh sách bệnh nhân/lượt khám để xem.</p>';
  if (list.error)
    return status + `<p class="error" role="alert">${esc(list.error)}</p>`;
  if (!list.loadedAt)
    return status || '<p class="readonly">Chưa tải danh sách.</p>';
  if (!rows.length)
    return (
      status +
      '<div class="workspace-empty"><strong>Không có bản ghi phù hợp</strong><p>Backend không trả bản ghi nào cho bộ lọc này.</p></div>'
    );
  return (
    status +
    `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Bản ghi</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows
      .map((raw, index) => {
        const row = w.row(raw);
        return `<tr data-worklist-row="${key}"><td><strong>${esc(row.title || "—")}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(row.detail)}</td><td>${esc(row.status)}</td><td><button type="button" data-row-action data-list="${key}" data-row="${index}" data-action-index="select">Chọn</button>${actionButtons(row, index)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div>${list.hasMore ? `<button type="button" data-worklist-more="${key}">Tải thêm</button>` : ""}`
  );
}
export function rowAt(key, list, index) {
  return worklists[key].row(list.rows[index]);
}
