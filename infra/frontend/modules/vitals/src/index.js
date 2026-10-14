// @vinshc/vitals: vital-sign encounters, measurements, history, correction and void.
// Contract: docs/api/care.md, docs/api/encounter-obs.md.
import {
  defineModule,
  BackendError,
  uuid,
  instant,
  vitalsPayload,
  VITAL_LIMITS,
  VITAL_FIELD_MAP,
  action,
  F,
  choice,
  id,
  optional,
  stateText,
  qs,
  go,
  note,
  formatTime,
} from "@vinshc/core";

const record = id("record", "Mã bản ghi (UUID)");
const reason = F("reason", "Lý do", "textarea", { max: 255 });
const missingStates = [
  ["unknown", "Không rõ"],
  ["not_asked", "Chưa hỏi"],
  ["refused", "Từ chối"],
  ["not_applicable", "Không áp dụng"],
  ["unreadable", "Không đọc được"],
];
const vitalFields = VITAL_FIELD_MAP.flatMap((f) => [
  optional(f.key, f.label + " (" + f.unit + ")", "number", {
    min: VITAL_LIMITS[f.key][0],
    max: VITAL_LIMITS[f.key][1],
    step: "any",
  }),
  choice(f.key + "State", "Trạng thái thiếu · " + f.label, missingStates, {
    required: false,
  }),
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

/** Measurement form shown above the section actions. */
function vitalsForm(ctx) {
  if (!ctx.permitted("vitals", "create"))
    return note(
      "Vai trò hiện tại chỉ xem lịch sử sinh hiệu, không ghi lần đo.",
    );
  const missing = [["", "Chưa ghi"], ...missingStates];
  const { field } = ctx;
  return `<section class="panel form-card"><h2>Ghi lần đo sinh hiệu</h2>${note("Chọn lượt khám trong danh sách Lượt khám, rồi dùng “Bắt đầu / tiếp tục đo sinh hiệu” để có mã encounter. Để trống chỉ số chưa ghi. Khi thiếu một vế huyết áp, chọn trạng thái thiếu tương ứng. Tâm thu ≤ tâm trương vẫn gửi để backend lưu cờ cần đối chiếu.")}<form id="vitalsForm"><div class="form-grid">${field(id("patient", "Mã bệnh nhân (UUID)"))}${field(id("encounter", "Mã encounter sinh hiệu (UUID)"))}${field(F("measuredAt", "Thời điểm đo", "datetime-local"))}${VITAL_FIELD_MAP.map((f) => `${field(F(f.key, f.label + " (" + f.unit + ")", "number", { required: false, min: VITAL_LIMITS[f.key][0], max: VITAL_LIMITS[f.key][1], step: "any" }))}${field(choice(f.key + "State", "Trạng thái thiếu · " + f.label, missing, { required: false }))}`).join("")}</div><div class="form-actions"><button class="primary" ${ctx.busy ? "disabled" : ""}>${ctx.busy ? "Đang lưu…" : "Lưu sinh hiệu lên OpenMRS"}</button></div></form></section>`;
}
function bindVitalsForm(ctx) {
  document
    .querySelector("#vitalsForm")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (ctx.busy || !ctx.permitted("vitals", "create")) return;
      try {
        const data = Object.fromEntries(new FormData(e.target)),
          payload = vitalsPayload(
            data.patient,
            data.encounter,
            data,
            VITAL_FIELD_MAP,
          );
        await ctx.perform(
          () =>
            ctx.client.request("vinshc/vitals", {
              method: "POST",
              body: payload,
            }),
          "OpenMRS đã lưu lần đo sinh hiệu.",
          (result) => {
            ctx.capture("vitals", result, data);
            if (result.needsVerification)
              ctx.setMessage(
                "Đã lưu sinh hiệu. Backend đánh dấu cần đối chiếu huyết áp; kiểm tra lại số đo.",
              );
            ctx.refreshWorklistsSoon();
          },
        );
      } catch (error) {
        ctx.showError(error);
      }
    });
}

const actions = {
  startVitalsEncounter: action(
    "Bắt đầu / tiếp tục đo sinh hiệu",
    "vitals",
    "create",
    [id("visit", "Mã lượt khám (UUID)")],
    (d) => "visits/" + uuid(d.visit) + "/encounters",
    () => ({ encounterType: "vitals" }),
    {
      captures: "encounter",
      notice:
        "Dùng lại encounter sinh hiệu của bạn trong lượt nếu đã có; người thực hiện là hồ sơ người hành nghề gắn với tài khoản.",
    },
  ),
  vitalsHistory: action(
    "Lịch sử sinh hiệu",
    "vitals",
    "read",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
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
  correctVitals: action(
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
      record: "vitals",
      captures: "vitals",
      notice:
        "Lần đo cũ được hủy kèm lý do và thay bằng lần đo mới trong cùng encounter. Chỉ thực hiện khi lượt còn mở.",
    },
  ),
  voidVitals: action(
    "Hủy lần đo",
    "vitals",
    "void",
    [record, reason],
    (d) => "vitals/" + uuid(d.record) + "?" + qs({ reason: d.reason }),
    null,
    { method: "DELETE", record: "vitals", captures: "vitals" },
  ),
};

const vitalLabels = Object.fromEntries(
  VITAL_FIELD_MAP.map((f) => [f.code, f.label]),
);
const vitalUnits = Object.fromEntries(
  VITAL_FIELD_MAP.map((f) => [f.code, f.unit]),
);
const vitals = {
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
    title: formatTime(g.measuredAt),
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
};

export default defineModule({
  name: "vitals",
  version: "0.1.0",
  order: 40,
  sections: [
    {
      id: "vitals",
      title: "Sinh hiệu",
      resource: "vitals",
      order: 40,
      actions: [
        "startVitalsEncounter",
        "vitalsHistory",
        "correctVitals",
        "voidVitals",
      ],
      description:
        "Mở encounter sinh hiệu, ghi lần đo, xem lịch sử, đính chính hoặc hủy có lý do.",
      icon: "♥",
      records: ["vitals"],
      needsProvider: true,
      intro: vitalsForm,
      bind: bindVitalsForm,
    },
  ],
  actions,
  worklists: { vitals },
  records: {
    vitals: { label: "Lần đo sinh hiệu", section: "vitals", read: null },
  },
  captures: { vitals: "vitals" },
  // The nurse records vitals as a provider; no form field is prefilled for that role.
  providerFields: { nurse: [] },
  calls: [{ name: "submitVitals", method: "POST", path: "vitals" }],
});
