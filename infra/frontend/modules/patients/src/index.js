// @vinshc/patients: patient search/registration/update and the administrative identity section
// (contacts, coded addresses, missing-information states). Contract: docs/api/care.md,
// docs/api/patient-administration.md.
import {
  defineModule,
  metadata as m,
  BackendError,
  uuid,
  action,
  F,
  choice,
  id,
  optional,
  options,
  codeList,
  stateText,
  esc,
  qs,
  go,
  openButton,
  patientIdentity,
} from "@vinshc/core";

const policies = m.fieldPolicies;
const record = id("record", "Mã bản ghi (UUID)"),
  patient = id("patient", "Mã bệnh nhân (UUID)");
const reason = F("reason", "Lý do", "textarea", { max: 1000 });
const source = () => ({
  source: { kind: "manual" },
  recordedAt: new Date().toISOString(),
});
const omit = (data, keys) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));

// ---------------------------------------------------------------- payload builders (unit-tested)

export function birthPayload(d) {
  const out = { birthPrecision: d.birthPrecision };
  if (d.birthPrecision === "day") {
    if (!d.birthdate)
      throw new BackendError("Ngày sinh đủ ngày cần nhập ngày sinh.");
    out.birthdate = d.birthdate;
  } else if (d.birthPrecision === "month" || d.birthPrecision === "year") {
    if (!d.birthYear) throw new BackendError("Cần năm sinh.");
    out.birthYear = Number(d.birthYear);
    if (d.birthPrecision === "month") {
      if (!d.birthMonth) throw new BackendError("Cần tháng sinh.");
      out.birthMonth = Number(d.birthMonth);
    }
  }
  if (d.birthRaw) out.birthRaw = d.birthRaw;
  return out;
}
const identifiers = (d) =>
  ["cccd", "bhxh", "bhyt"]
    .filter((k) => d[k])
    .map((k) => ({ type: k, identifier: d[k] }));
export function registrationPayload(d) {
  const cccd = String(d.cccd || "").trim();
  if (!cccd)
    throw new BackendError("Cần nhập số CCCD để đăng ký bệnh nhân mới.");
  if (!/^[0-9]{12}$/.test(cccd))
    throw new BackendError("CCCD phải gồm đúng 12 chữ số.");
  const out = {
    familyName: d.familyName,
    givenName: d.givenName,
    gender: d.gender,
    ...birthPayload(d),
  };
  for (const k of ["middleName", "phone", "occupation"])
    if (d[k]) out[k] = d[k];
  const ids = identifiers({ ...d, cccd });
  if (ids.length) out.identifiers = ids;
  if (d.allowPossibleDuplicate === "true") out.allowPossibleDuplicate = true;
  return out;
}
export function patientPatch(d) {
  const out = {};
  for (const k of [
    "familyName",
    "middleName",
    "givenName",
    "gender",
    "phone",
    "occupation",
    "reason",
  ])
    if (d[k]) out[k] = d[k];
  if (d.clearPhone === "true") {
    if (d.phone)
      throw new BackendError("Chọn xóa hoặc nhập số điện thoại mới.");
    out.phone = null;
  }
  if (
    (out.familyName || out.middleName || out.givenName) &&
    !(out.familyName && out.givenName)
  )
    throw new BackendError("Đổi tên cần nhập đủ họ và tên.");
  if (d.birthPrecision) Object.assign(out, birthPayload(d));
  const ids = identifiers(d);
  if (ids.length) out.identifiers = ids;
  if (!Object.keys(out).filter((k) => k !== "reason").length)
    throw new BackendError("Cần nhập ít nhất một trường muốn sửa.");
  return out;
}
export function contactPatch(d) {
  const out = omit(d, ["record", "clearPhone", "clearAddress"]);
  if (out.priority !== undefined) out.priority = Number(out.priority);
  for (const k of ["isPrimary", "emergencyContact"])
    if (out[k] !== undefined) out[k] = out[k] === "true";
  if (d.clearPhone === "true") {
    if (d.phone) throw new BackendError("Chọn xóa hoặc nhập số điện thoại.");
    out.phone = null;
  }
  if (d.clearAddress === "true") {
    if (d.addressText) throw new BackendError("Chọn xóa hoặc nhập địa chỉ.");
    out.addressText = null;
  }
  if (!Object.keys(out).length)
    throw new BackendError("Cần nhập ít nhất một trường muốn sửa.");
  return out;
}
export function missingContext(d) {
  const policy = policies.fields.find((f) => f.code === d.fieldCode);
  if (!policy) throw new BackendError("Trường chưa có policy thông tin thiếu.");
  if (policy.rowKeyRequired && !d.rowKey)
    throw new BackendError("Trường này cần mã dòng liên hệ/địa chỉ.");
  if (!policy.rowKeyRequired && d.rowKey)
    throw new BackendError("Trường này không dùng mã dòng.");
  return {
    patient: uuid(d.patient),
    fieldCode: d.fieldCode,
    context: policy.context,
    ...(d.rowKey ? { rowKey: uuid(d.rowKey) } : {}),
  };
}

// ---------------------------------------------------------------- form behaviour

function setCatalogue(select, rows) {
  select.innerHTML =
    '<option value="">Chọn…</option>' +
    rows
      .map(
        (r) =>
          `<option value="${esc(r.code)}">${esc(r.name || r.label || r.code)}</option>`,
      )
      .join("");
}
/** Fills the province list and reloads communes when the province changes. */
async function loadProvinces(form, ctx) {
  const generation = ctx.client.generation;
  const province = form?.elements.provinceCode,
    commune = form?.elements.communeCode;
  if (!province || province.options.length > 1) return;
  try {
    const [rows, config] = await Promise.all([
      ctx.client.request("vinshc/address-catalogue"),
      ctx.client.request("vinshc/configuration-status"),
    ]);
    if (generation !== ctx.client.generation || !form.isConnected) return;
    ctx.context.catalogueVersion = config.catalogueVersion;
    setCatalogue(province, rows);
    province.onchange = async () => {
      const selected = province.value;
      commune.innerHTML = '<option value="">Chọn xã/phường…</option>';
      if (!selected) return;
      try {
        const rows = await ctx.client.request(
          "vinshc/address-catalogue?" +
            new URLSearchParams({ parentCode: selected }),
        );
        if (
          generation === ctx.client.generation &&
          form.isConnected &&
          province.value === selected
        )
          setCatalogue(commune, rows);
      } catch (error) {
        ctx.showError(error);
      }
    };
  } catch (error) {
    ctx.showError(error);
  }
}
/** A coded address change is only valid for the catalogue version the server reported. */
function requireCatalogue(data, ctx) {
  if (data.provinceCode || data.communeCode) {
    if (!ctx.context.catalogueVersion)
      throw new BackendError(
        "Chưa đọc được phiên bản danh mục địa chỉ từ backend.",
      );
    data.catalogueVersion = ctx.context.catalogueVersion;
  }
}
/** Row key and allowed states follow the policy of the selected field. */
function syncFieldPolicy(form) {
  const code = form.elements.fieldCode;
  const sync = () => {
    const policy = policies.fields.find((f) => f.code === code.value),
      row = form.elements.rowKey;
    row.required = Boolean(policy?.rowKeyRequired);
    row.disabled = !policy?.rowKeyRequired;
    if (row.disabled) row.value = "";
    const status = form.elements.dataStatus;
    if (status) {
      const old = status.value;
      status.innerHTML =
        '<option value="">Chọn…</option>' +
        (policy?.allowedStates || [])
          .map(
            (v) => `<option value="${esc(v)}">${esc(stateText(v))}</option>`,
          )
          .join("");
      if (policy?.allowedStates.includes(old)) status.value = old;
    }
  };
  code.onchange = sync;
  sync();
}

// ---------------------------------------------------------------- actions

const contact = action(
  "Thêm người liên hệ",
  "patient_identity",
  "update",
  [
    id("patient", "Mã bệnh nhân (UUID)"),
    F("fullName", "Họ tên người liên hệ"),
    choice(
      "relationshipCode",
      "Quan hệ",
      options(m.relationships.records, "code"),
    ),
    optional("phone", "Số điện thoại"),
    optional("addressText", "Địa chỉ"),
    F("priority", "Thứ tự ưu tiên", "number", { min: 1, step: 1 }),
    choice("isPrimary", "Liên hệ chính", [
      ["false", "Không"],
      ["true", "Có"],
    ]),
    choice("emergencyContact", "Liên hệ khẩn cấp", [
      ["false", "Không"],
      ["true", "Có"],
    ]),
  ],
  () => "contact",
  (d) => ({
    ...d,
    priority: Number(d.priority),
    isPrimary: d.isPrimary === "true",
    emergencyContact: d.emergencyContact === "true",
    ...source(),
  }),
);
const address = action(
  "Lưu địa chỉ hiện tại",
  "patient_identity",
  "update",
  [
    id("patient", "Mã bệnh nhân (UUID)"),
    F("addressText", "Số nhà, đường", "textarea"),
    choice("provinceCode", "Tỉnh/thành phố", []),
    choice("communeCode", "Xã/phường", []),
    optional("legacyAddressText", "Địa chỉ cũ trên giấy tờ"),
    F("addressAsOfDate", "Ngày đối chiếu", "date"),
  ],
  () => "address",
  (d) => ({ ...d, catalogueVersion: d.catalogueVersion, ...source() }),
  { prepare: requireCatalogue, bind: loadProvinces },
);

function captureIdentity(result, ctx) {
  if (Array.isArray(result?.contacts) && Array.isArray(result?.addresses)) {
    ctx.context.identity = result;
    for (const [type, rows] of [['contact', result.contacts], ['address', result.addresses]])
      for (const row of rows) ctx.memory.remember(type, { ...row, patientUuid: result.patientUuid });
  }
  if (result?.row_key) {
    const type = Object.hasOwn(result, 'full_name') ? 'contact' : Object.hasOwn(result, 'address_text') ? 'address' : null;
    if (type) ctx.memory.remember(type, { ...result, patientUuid: ctx.memory.context.patient });
  }
}
function identityCards(ctx) {
  const identity = ctx.context.identity;
  if (!identity || identity.patientUuid !== ctx.memory.context.patient) return '';
  return `<section class="identity-details"><h2>Thông tin liên hệ đã lưu</h2>${[['contact', 'Người liên hệ', identity.contacts], ['address', 'Địa chỉ', identity.addresses]].map(([type, title, rows]) => {
    const current = rows.filter(r => r.is_current !== false && r.status !== 'void');
    return `<div class="identity-group"><h3>${title}</h3>${current.length ? `<div class="identity-card-grid">${current.map(r => `<article class="panel identity-card"><strong>${esc(type === 'contact' ? r.full_name : r.address_text || 'Địa chỉ đã lưu')}</strong><p>${esc(type === 'contact' ? [r.relationship_name, r.phone_raw, r.address_text].filter(Boolean).join(' · ') : [r.commune_name, r.province_name].filter(Boolean).join(' · '))}</p><small>Phiên bản ${esc(r.version_number)}${r.is_primary ? ' · Liên hệ chính' : ''}${r.emergency_contact ? ' · Liên hệ khẩn cấp' : ''}</small><div>${ctx.canAction(type === 'contact' ? 'updateContact' : 'updateAddress') ? `<button type="button" data-identity-action="${type === 'contact' ? 'updateContact' : 'updateAddress'}" data-identity-row="${esc(r.row_key)}">Sửa thông tin</button><button type="button" class="danger" data-identity-action="${type === 'contact' ? 'voidContact' : 'voidAddress'}" data-identity-row="${esc(r.row_key)}">Ngừng sử dụng</button>` : ''}</div></article>`).join('')}</div>` : `<p class="section-empty">Chưa có ${title.toLowerCase()} hiện hành. ${ctx.canAction(type === 'contact' ? 'contact' : 'address') ? 'Chọn công việc thêm mới ở phía trên để bổ sung.' : ''}</p>`}</div>`;
  }).join('')}${(identity.fieldStates || []).filter(r => r.is_current !== false && r.status !== 'void').length ? `<div class="identity-group"><h3>Thông tin chưa đầy đủ</h3><div class="identity-state-list">${identity.fieldStates.filter(r => r.is_current !== false && r.status !== 'void').map(r => `<p><strong>${esc(policies.fields.find(f => f.code === r.field_code)?.label || 'Thông tin trong hồ sơ')}</strong><span class="row-status">${esc(stateText(r.data_status))}</span></p>`).join('')}</div></div>` : ''}</section>`;
}
function bindIdentity(ctx) {
  document.querySelectorAll('[data-identity-action]').forEach(button => button.onclick = () => {
    ctx.navigate('identity', button.dataset.identityAction, { record: button.dataset.identityRow });
  });
}
const missingFields = [
  patient,
  choice(
    "fieldCode",
    "Trường thông tin",
    policies.fields.map((f) => [f.code, f.label]),
  ),
  id("rowKey", "Mã dòng liên hệ/địa chỉ (UUID)", false),
];
const missingStates = [...new Set(policies.fields.flatMap((f) => f.allowedStates))];
const nameFields = (required) => [
  F("familyName", "Họ", "text", { required, max: 50 }),
  optional("middleName", "Tên đệm", "text", { max: 50 }),
  F("givenName", "Tên", "text", { required, max: 50 }),
];
const birthFields = (required) => [
  choice("birthPrecision", "Mức đầy đủ ngày sinh", codeList("birth_precision"), {
    required,
  }),
  optional("birthdate", "Ngày sinh (khi đủ ngày)", "date"),
  optional("birthYear", "Năm sinh (khi chỉ biết tháng/năm)", "number", {
    min: 1900,
    step: 1,
  }),
  optional("birthMonth", "Tháng sinh (khi biết tháng)", "number", {
    min: 1,
    max: 12,
    step: 1,
  }),
  optional("birthRaw", "Ngày sinh nguyên văn trên giấy tờ", "text", {
    max: 50,
  }),
];
const identifierFields = [
  F("cccd", "Số CCCD (12 số)", "text", { max: 12, inputmode: "numeric" }),
  optional("bhxh", "Mã BHXH", "text", { max: 32 }),
  optional("bhyt", "Số thẻ BHYT", "text", { max: 32 }),
];

const actions = {
  identity: action(
    "Đọc thông tin hành chính",
    "patient_identity",
    "read",
    [
      id("patient", "Mã bệnh nhân (UUID)"),
      choice(
        "includeHistory",
        "Lịch sử",
        [
          ["false", "Chỉ hiện hành"],
          ["true", "Gồm lịch sử"],
        ],
        { required: false },
      ),
    ],
    (d) =>
      "identity/" +
      uuid(d.patient) +
      "?includeHistory=" +
      (d.includeHistory === "true"),
    null,
    { method: "GET", captures: "patient" },
  ),
  contact,
  address,
  updateContact: action(
    "Sửa người liên hệ",
    "patient_identity",
    "update",
    [
      record,
      ...contact.fields
        .filter((f) => f.name !== "patient")
        .map((f) => ({ ...f, required: false })),
      choice(
        "clearPhone",
        "Xóa số điện thoại",
        [["true", "Xóa giá trị hiện tại"]],
        { required: false },
      ),
      choice(
        "clearAddress",
        "Xóa địa chỉ liên hệ",
        [["true", "Xóa giá trị hiện tại"]],
        { required: false },
      ),
    ],
    (d) => "contact/" + uuid(d.record),
    contactPatch,
    {
      record: 'contact', captures: 'contact',
      notice:
        "Chỉ nhập thông tin muốn đổi. Bỏ trống để giữ nguyên; chọn Xóa để bỏ thông tin cũ.",
    },
  ),
  voidContact: action(
    "Hủy người liên hệ",
    "patient_identity",
    "update",
    [record, reason],
    (d) =>
      "contact/" + uuid(d.record) + "?" + new URLSearchParams({ reason: d.reason }),
    null,
    { method: "DELETE", record: 'contact', captures: 'contact' },
  ),
  updateAddress: action(
    "Sửa địa chỉ đã lưu",
    "patient_identity",
    "update",
    [
      record,
      ...address.fields
        .filter((f) => f.name !== "patient")
        .map((f) => ({ ...f, required: false })),
    ],
    (d) => "address/" + uuid(d.record),
    (d) => {
      const out = omit(d, ["record"]);
      if (!Object.keys(out).length)
        throw new BackendError("Cần nhập trường muốn sửa.");
      if (Boolean(d.provinceCode) !== Boolean(d.communeCode))
        throw new BackendError("Cần chọn đủ tỉnh và xã khi đổi địa chỉ mã hóa.");
      return out;
    },
    {
      record: 'address', captures: 'address',
      prepare: requireCatalogue,
      bind: loadProvinces,
      notice:
        "Bỏ trống để giữ giá trị hiện tại. Đổi mã địa chỉ cần chọn đủ tỉnh và xã.",
    },
  ),
  voidAddress: action(
    "Hủy địa chỉ đã lưu",
    "patient_identity",
    "update",
    [record, reason],
    (d) =>
      "address/" + uuid(d.record) + "?" + new URLSearchParams({ reason: d.reason }),
    null,
    { method: "DELETE", record: 'address', captures: 'address' },
  ),
  fieldState: action(
    "Ghi trạng thái thông tin thiếu",
    "patient_identity",
    "update",
    [
      ...missingFields,
      choice(
        "dataStatus",
        "Trạng thái thiếu",
        missingStates.map((v) => [
          v,
          {
            unknown: "Không rõ",
            not_asked: "Chưa hỏi",
            refused: "Từ chối",
            unreadable: "Không đọc được",
            not_recorded: "Chưa ghi",
            not_applicable: "Không áp dụng",
            masked: "Đã che",
          }[v] || v,
        ]),
      ),
    ],
    () => "field-state",
    (d) => {
      const policy = policies.fields.find((f) => f.code === d.fieldCode);
      if (!policy?.allowedStates.includes(d.dataStatus))
        throw new BackendError(
          "Trạng thái này không được phép cho trường đã chọn.",
        );
      return { ...missingContext(d), dataStatus: d.dataStatus, ...source() };
    },
    { bind: syncFieldPolicy },
  ),
  clearFieldState: action(
    "Xóa trạng thái thông tin thiếu",
    "patient_identity",
    "update",
    missingFields,
    (d) => "field-state?" + new URLSearchParams(missingContext(d)),
    null,
    { method: "DELETE", bind: syncFieldPolicy },
  ),
  identityConfiguration: action(
    "Kiểm tra danh mục hành chính",
    "patient_identity",
    "read",
    [],
    () => "configuration-status",
    null,
    { method: "GET" },
  ),
  registerPatient: action(
    "Đăng ký bệnh nhân mới",
    "patient_identity",
    "create",
    [
      ...nameFields(true),
      choice("gender", "Giới tính", codeList("gender")),
      ...birthFields(true),
      optional("phone", "Điện thoại người bệnh", "tel", { max: 50 }),
      optional("occupation", "Nghề nghiệp", "text", { max: 50 }),
      ...identifierFields,
      choice(
        "allowPossibleDuplicate",
        "Hồ sơ tương tự",
        [["true", "Đã kiểm tra, vẫn đăng ký hồ sơ mới"]],
        { required: false },
      ),
    ],
    () => "patients",
    registrationPayload,
    {
      idempotent: true,
      captures: "patient",
      notice:
        "Mã hồ sơ được cấp khi đăng ký. Kiểm tra hồ sơ tương tự nếu có cảnh báo trùng trước khi tạo mới.",
    },
  ),
  patientProfile: action(
    "Xem hồ sơ hành chính",
    "patient_identity",
    "read",
    [patient],
    (d) => "patients/" + uuid(d.patient),
    null,
    { method: "GET", captures: "patient" },
  ),
  updatePatient: action(
    "Sửa thông tin hành chính",
    "patient_identity",
    "update",
    [
      patient,
      ...nameFields(false),
      choice("gender", "Giới tính", codeList("gender"), { required: false }),
      ...birthFields(false),
      optional("phone", "Điện thoại mới", "tel", { max: 50 }),
      choice("clearPhone", "Xóa điện thoại", [["true", "Xóa số hiện tại"]], {
        required: false,
      }),
      optional("occupation", "Nghề nghiệp", "text", { max: 50 }),
      ...identifierFields.map(f => ({ ...f, required: false })),
      optional("reason", "Lý do sửa", "textarea", { max: 255 }),
    ],
    (d) => "patients/" + uuid(d.patient),
    patientPatch,
    {
      captures: "patient",
      notice:
        "Chỉ nhập thông tin muốn đổi và ghi lý do. Thông tin cũ được giữ trong lịch sử.",
    },
  ),
};

// ---------------------------------------------------------------- worklist

const patients = {
  recordType: "patient",
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
    detail: patientIdentity(p) + (p.phone ? " · ĐT " + p.phone : ""),
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
};

export default defineModule({
  name: "patients",
  version: "0.1.0",
  order: 10,
  sections: [
    {
      id: "patients",
      title: "Bệnh nhân",
      resource: "patient_identity",
      order: 10,
      actions: ["registerPatient", "patientProfile", "updatePatient"],
      description:
        "Tìm, đăng ký và sửa thông tin hành chính; mở lượt khám từ hồ sơ.",
      icon: "◎",
      records: ["patient"],
      visible: ({ permitted }) => permitted("patient_identity", "read"),

    },
    {
      id: "identity",
      title: "Hành chính",
      resource: "patient_identity",
      order: 30,
      actions: [
        "identity",
        "contact",
        "address",
        "updateContact",
        "voidContact",
        "updateAddress",
        "voidAddress",
        "fieldState",
        "clearFieldState",
        "identityConfiguration",
      ],
      note: "Người liên hệ, địa chỉ có mã hành chính và trạng thái thông tin thiếu. Đăng ký, tìm và sửa thông tin cơ bản nằm ở mục Bệnh nhân.",
      records: ["patient"],
      overview: false,
      footer: identityCards,
      bind: bindIdentity,
    },
  ],
  actions,
  worklists: { patients },
  records: {
    contact: { label: 'Người liên hệ', section: 'identity', idKey: 'row_key' },
    address: { label: 'Địa chỉ', section: 'identity', idKey: 'row_key' },
    patient: {
      label: "Bệnh nhân",
      section: "patients",
      read: "identity",
      readSection: "identity",
      readField: "patient",
      idKey: "patientUuid",
      contextFrom: r => ({ patient: r.patientUuid || r.uuid }),
    },
  },
  onCapture: captureIdentity,
  calls: [
    { name: "loadProvinces", method: "GET", path: "address-catalogue" },
    { name: "loadCatalogueVersion", method: "GET", path: "configuration-status" },
  ],
});
