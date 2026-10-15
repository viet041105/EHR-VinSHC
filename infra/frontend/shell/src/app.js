// VinSHC shell: login, workspace selection, layout, forms and the session state shared by modules.
// Business screens, actions and worklists come from the microfrontends in the registry; the shell
// renders them, enforces the role matrix in the UI and sends requests through one BackendClient.
import {
  BackendClient,
  BackendError,
  isSystemAdministrator,
  uuid,
  metadata as m,
  assignedRoles,
  permitted,
  facilityForLocation,
  F,
  choice,
  stateText,
  esc,
  note,
  WorkspaceMemory,
  createRegistry,
} from "@vinshc/core";
import {
  renderWorklist,
  renderWorklistResults,
  rowAt,
} from "./worklist-view.js";
import {
  OVERVIEW,
  contextPanel,
  workspaceScreen,
  resultHighlights,
} from "./screens.js";
import { displayResult, resultLabels } from "./result-view.js";
import { DoctorAssistant } from "./doctor-assistant.js";
import { SECTION_COPY, PRIMARY_ACTIONS, ROLE_START, actionTitle, submitLabel, plainText, sectionIcon } from "./presentation.js";
import { doctorWorkspaceScreen, ownConsultation } from "./doctor-workspace.js";
import { FIELD_HINTS, isDestructive, userError, reportPreset, actionGroups } from './page-design.js';
import { NotificationBell } from './notifications.js';
import { PatientAccess } from './patient-access.js';

let registry = createRegistry([]),
  labels = resultLabels(registry),
  moduleFailures = [],
  modulesLoaded = Promise.resolve();
const client = new BackendClient();
const memory = new WorkspaceMemory();
const agentChat = new DoctorAssistant(client);
const notifications = new NotificationBell(client, showError, openNotification);
const patientAccess = new PatientAccess(client, showError);
const state = {
  role: null,
  facility: null,
  section: null,
  action: null,
  result: null,
  context: {},
  error: "",
  message: "",
  busy: false,
  workspace: false,
  lists: {},
  prefill: {},
  matches: [],
  myProvider: null,
  providersLoaded: false,
  nextSteps: [],
  referenceChoices: {},
  doctorTab: "consultation",
  doctorData: {},
  doctorRequest: 0,
  doctorOpen: false,
  drafts: new Map(),
  readRequest: 0,
};
const localTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const allowed = (a) =>
  (!a.systemOnly || isSystemAdministrator(client.user)) &&
  (a.onlyRoles
    ? a.onlyRoles.includes(state.role)
    : permitted(state.role, a.resource, a.permission));
const canAction = (key) =>
  Boolean(registry.actions[key] && allowed(registry.actions[key]));
function sectionVisible(s) {
  const byDefault = () =>
    s.actions.some(canAction) || permitted(state.role, s.resource, "read");
  return s.visible
    ? s.visible({
        role: state.role,
        permitted: (resource, action) => permitted(state.role, resource, action),
        byDefault,
      })
    : byDefault();
}
const visibleSections = () => [OVERVIEW, ...registry.sections.filter(sectionVisible)];
/** Context handed to module hooks; getters always read the current shell state. */
function moduleContext(extra = {}) {
  return {
    client,
    memory,
    registry,
    metadata: m,
    get role() {
      return state.role;
    },
    get facility() {
      return state.facility;
    },
    get context() {
      return state.context;
    },
    get busy() {
      return state.busy;
    },
    get encounterType() { return currentEncounterType(); },
    permitted: (resource, action) => permitted(state.role, resource, action),
    canAction,
    field,
    perform,
    showError,
    capture: captureWorkspaceResponse,
    setMessage: (text) => {
      state.message = text;
    },
    refreshWorklistsSoon: () => setTimeout(refreshWorklists, 0),
    navigate,
    completeTask,
    rememberChoices: (type, rows) => { state.referenceChoices[type] = rows; },
    mountPatientAccess: host => patientAccess.mountAdmin(host),
    takePatientAccessTab: () => { const open = state.openPatientRequests; state.openPatientRequests = false; return open; },
    ...extra,
  };
}
function field(f, values = {}) {
  if (f.name === 'status' && state.action === 'appointmentTransition') {
    const row = memory.records.get('appointment:' + (state.prefill.record || memory.selected.appointment))?.data;
    if (row) f = { ...f, options: f.options.filter(([v]) => (m.workflow.appointmentTransitions[row.status] || []).includes(v) && (v !== 'no_show' || Date.parse(row.startAt) < Date.now())) };
  }
  if (f.name === 'state' && ['queueTransition', 'orderTransition'].includes(state.action)) {
    const type = state.action === 'queueTransition' ? 'queue' : 'order';
    const record = state.prefill.record || memory.selected[type];
    const source = memory.records.get(type + ':' + record)?.data;
    const transitions = type === 'queue' ? m.workflow.queueTransitions : {
      requested: ['assigned', 'cancelled', 'entered-in-error'],
      assigned: ['in_progress', 'cancelled', 'entered-in-error'],
      in_progress: ['completed', 'cancelled', 'entered-in-error'],
      completed: [], cancelled: [], 'entered-in-error': [],
    };
    if (source && transitions[source.state]) f = { ...f, options: f.options.filter(([v]) => transitions[source.state].includes(v)) };
  }
  const provider = (registry.providerFields[state.role] || []).includes(f.name)
    ? state.myProvider
    : null;
  let value =
    values[f.name] ??
    state.prefill[f.name] ??
    f.value ??
    (f.type === "datetime-local" && f.required
      ? state.action === 'book' && f.name === 'endAt' ? new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + 20 * 60000).toISOString().slice(0,16) : localTime()
      : f.type === "date" && f.required
        ? today()
        : (memory.defaults(state.action)[f.name] ??
          state.context[f.name] ??
          provider ??
          ""));
  if (['state','status'].includes(f.name) && state.prefill[f.name] !== undefined) value = state.prefill[f.name];
  if ((['queueTransition','orderTransition'].includes(state.action) && f.name === 'state' || state.action === 'appointmentTransition' && f.name === 'status') && state.prefill[f.name])
    return `<input type="hidden" name="${f.name}" value="${esc(value)}"><p class="transition-target">${esc(stateText(value))}</p>`;
  const common = `name="${esc(f.name)}" ${f.required ? "required" : ""} ${f.max && f.type !== 'number' ? 'maxlength="' + f.max + '"' : ""} ${f.inputmode ? `inputmode="${esc(f.inputmode)}"` : ''}`;
  let control;
  if (f.type === "select")
    control = `<select ${common}><option value="">${esc(f.placeholder || (f.required ? "Chọn…" : "Chưa ghi nhận"))}</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (f.type === "textarea")
    control = `<textarea ${common} rows="3">${esc(value)}</textarea>`;
  else
    control = `<input ${common} type="${f.type === "uuid" ? "text" : f.type}" ${f.type === "file" ? 'accept="application/pdf,image/jpeg,image/png"' : 'value="' + esc(value) + '"'} ${f.type === "uuid" ? 'pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" spellcheck="false"' : ""} ${f.min !== undefined ? 'min="' + f.min + '"' : ""} ${f.type === "number" && f.max !== undefined ? 'max="' + f.max + '"' : ""} ${f.step ? 'step="' + f.step + '"' : ""}>`;
  const label = plainText(f.label);
  if (f.type === 'select' && (f.options.length > 12 || ['concept', 'drug', 'service'].includes(f.name)) && !f.name.startsWith('wl_'))
    return `<div class="catalogue-choice"><span class="field-label">${esc(label)}${f.required ? ' *' : ''}</span><input type="search" data-catalogue-search="${esc(f.name)}" aria-label="Tìm trong ${esc(label)}" placeholder="Gõ tên hoặc mã để lọc danh sách" autocomplete="off">${control.replace('<select ', `<select aria-label="${esc(label)}" `)}<small data-catalogue-count="${esc(f.name)}">${f.options.length} lựa chọn · chọn một mục bên trên</small></div>`;
  if (f.type === "uuid") {
    if (value || !f.required) return `<input type="hidden" name="${esc(f.name)}" value="${esc(value)}">`;
    const options = referenceOptions(f.name);
    return options.length ? `<label>${esc(label.replace(/^Mã /, ''))} *<select ${common}><option value="">Chọn theo tên…</option>${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>` :
      `<p class="missing-reference" role="status">Chưa chọn ${esc(label.replace(/^Mã /, '').toLowerCase())}. Chọn từ danh sách công việc hoặc liên hệ quản trị nếu chưa được phân công.</p>`;
  }
  return `<label><span class="field-text">${esc(label)}${f.required ? " *" : ' <span class="field-optional">không bắt buộc</span>'}</span>${control}${FIELD_HINTS[f.name] && !f.name.startsWith('wl_') ? `<small class="field-hint">${esc(FIELD_HINTS[f.name])}</small>` : ''}</label>`;
}

function referenceOptions(name) {
  const type = ({ orderer: 'provider', authorProvider: 'provider', assignedProvider: 'provider', reviewerProvider: 'provider', providerUuid: 'provider', userUuid: 'user', bill: 'bill', result: 'result' })[name] || name;
  const rows = [...memory.list([type]).map(row => row.data)];
  for (const [key, w] of Object.entries(registry.worklists))
    if (w.recordType === type) rows.push(...(state.lists[key]?.rows || []));
  const options = [...(state.referenceChoices[type] || [])];
  for (const r of rows) {
    if (memory.context.patient && r.patientUuid && r.patientUuid !== memory.context.patient && type !== 'patient' && type !== 'visit') continue;
    options.push({ value: r.uuid, label: [r.fullName || r.patientName || r.patient?.fullName || r.serviceName || registry.records[type]?.label, r.identifier || r.visitCode, r.state ? stateText(r.state) : ''].filter(Boolean).join(' · ') });
  }
  if (type === 'provider') {
    if (state.myProvider) options.push({ value: state.myProvider, label: client.user.display + ' (bạn)' });
    for (const row of state.lists.appointments?.rows || [])
      if (row.providerUuid && row.providerName) options.push({ value: row.providerUuid, label: row.providerName });
  }
  if (['facilityLocationUuid', 'locationUuid', 'facilityUuid'].includes(name))
    for (const f of m.facilities.records.filter(f => f.active && !f.retired)) options.push({ value: name === 'facilityUuid' ? f.uuid : f.locationUuid, label: f.name });
  const unique = new Map();
  for (const option of options) {
    try { uuid(option.value); } catch { continue; }
    if (option.label) unique.set(option.value, option);
  }
  return [...unique.values()];
}
function shell(content) {
  document.querySelector("#app").innerHTML =
    `<a class="skip-link" href="#main-content">Đến nội dung chính</a><header class="site-header clinic-header"><a class="site-brand" href="/"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>QUẢN LÝ PHÒNG KHÁM</small></span></a><div class="header-controls">${state.workspace ? `<div class="session-identity" aria-label="Thông tin phiên đăng nhập"><span class="role-chip"><span class="visually-hidden">Vai trò: </span>${esc(m.permissions.roles[state.role].label)}</span><span class="session-user"><span class="visually-hidden">Tài khoản: </span>${esc(client.user?.display)}</span></div><div class="session-actions"><button id="logout" ${state.busy ? "disabled" : ""}>Đăng xuất</button></div>` : '<a class="back-home" href="/">Về trang chủ</a>'}</div></header>${content}`;
  // The doctor assistant floats over every doctor screen; its open state and turns survive re-renders.
  if(state.workspace && state.role === "doctor") {
    const host=document.createElement("div");host.id="agentPanel";document.querySelector("#app").append(host);
    agentChat.mount(host,"doctor",memory.context,{label:memory.contextLabel,navigate,labels});
  } else agentChat.clear();
  document.querySelector("#logout")?.addEventListener("click", logout);
  if (state.workspace && client.user) {
    const host = document.createElement('div');
    document.querySelector('.session-actions').prepend(host);
    notifications.mount(host, state.role);
  } else { notifications.clear(); patientAccess.reset(); }
}

async function openNotification(target) {
  if (state.busy || !client.user) return;
  if (target.kind === 'patient_access_request' && state.role === 'admin') {
    state.section = 'admin'; state.action = null; state.openPatientRequests = true;
    render();
    await patientAccess.showRequest(target.requestUuid);
  } else if (target.kind === 'visit' && state.role === 'doctor') {
    const generation = client.generation;
    try {
      const visit = await client.request('vinshc/visits/' + uuid(target.visitUuid));
      if (generation !== client.generation || state.role !== 'doctor') return;
      if (visit.uuid !== target.visitUuid || !visit.patientUuid) throw new BackendError('Chưa mở được lượt khám từ thông báo.');
      rememberDraft(); memory.remember('visit', visit);
      memory.setContext({patient: visit.patientUuid, visit: visit.uuid});
      memory.contextLabel = visit.patient?.fullName || 'Người bệnh';
      resetCareContext(); state.section = 'visits'; state.action = null; state.doctorOpen = true;
      await loadDoctorProfile();
    } catch (error) { if (generation === client.generation || !client.user) showError(error); }
  }
}
const moduleNotice = () =>
  moduleFailures.length
    ? note(
        "Một số chức năng tạm thời chưa mở được: " +
          moduleFailures.map(f => SECTION_COPY[f.specifier.replace("@vinshc/", "")]?.[0] || (f.specifier.endsWith("scheduling") ? "Lịch hẹn và hàng đợi" : "Chức năng bổ sung")).join(", ") +
          ". Hãy tải lại trang hoặc liên hệ quản trị phòng khám.",
      )
    : "";
function isDoctorHome(section = null) {
  return state.role === "doctor" && (section?.id || section) === "visits";
}
function draftKey() {
  return JSON.stringify([client.generation, memory.context.patient, memory.context.visit, state.action, state.prefill.record || memory.selected[registry.actionRecordTypes[state.action]], state.prefill.state, state.prefill.status]);
}
function rememberDraft() {
  const form = document.querySelector('#actionForm'), action = registry.actions[form?.dataset.actionKey];
  if (form && client.user && Number(form.dataset.generation) === client.generation && action && action.method !== 'GET' && !action.sensitive)
    state.drafts.set(form.dataset.draftKey, Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string')));
}

function render() {
  rememberDraft();
  if (!client.user) {
    shell(
      `<main id="main-content" class="connection-login"><div class="login-intro"><span class="eyebrow">DÀNH CHO NHÂN VIÊN</span><h1>Phòng khám VinSHC</h1><p>Đăng nhập để sử dụng các chức năng được phân công tại cơ sở của bạn.</p><ol><li>Tìm đúng hồ sơ bệnh nhân</li><li>Tiếp tục công việc được phân công</li><li>Theo dõi và cập nhật kết quả</li></ol></div><section class="panel form-card login-card"><nav class="login-personas" aria-label="Chọn cổng đăng nhập"><span aria-current="page">Nhân viên</span><a href="/portal.html">Người bệnh</a></nav><h2>Đăng nhập</h2><p>Dùng tài khoản được phòng khám cấp.</p><form id="loginForm">${field(F("username", "Tên đăng nhập"))}<label>Mật khẩu *<input name="password" type="password" autocomplete="current-password" required></label><label class="show-password"><input type="checkbox" id="loginShowPassword">Hiện mật khẩu</label><p class="error" role="alert">${esc(plainText(state.error))}</p><button class="primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Đang đăng nhập…" : "Đăng nhập"}</button></form><p class="login-support">Chưa có tài khoản hoặc cần đổi mật khẩu?<br>Liên hệ quản trị của phòng khám.</p></section></main>`,
    );
    document.querySelector("#loginForm").onsubmit = login;
    document.querySelector("#loginShowPassword").onchange = e => { document.querySelector("#loginForm [name=password]").type = e.target.checked ? "text" : "password"; };
    return;
  }
  if (!state.workspace) {
    shell(
      `<main id="main-content" class="connection-login"><section class="panel form-card"><h1>Chưa thể mở công việc</h1><p>Xin chào ${esc(client.user.display)}.</p>${note(
        "Mỗi tài khoản chỉ được cấp một vai trò VinSHC và một cơ sở làm việc.",
      )}<p class="error" role="alert">${esc(state.error || "Tài khoản chưa được phân công vai trò và cơ sở. Liên hệ quản trị phòng khám để được cấp quyền.")}</p>${isSystemAdministrator(client.user) ? `<details class="support-details"><summary>Hỗ trợ kết nối</summary><button id="systemSetup" ${state.busy ? "disabled" : ""}>Kiểm tra dịch vụ</button><section id="setupResult" aria-live="polite">${state.result ? displayResult(state.result, labels) : ""}</section></details>` : ""}<button id="logout">Đăng xuất</button></section></main>`,
    );
    document.querySelector("#logout").onclick = logout;
    document.querySelector("#systemSetup")?.addEventListener("click", inspectSetup);
    return;
  }
  const available = visibleSections();
  if (!available.some((s) => s.id === state.section))
    state.section = available[0]?.id;
  const current = available.find((s) => s.id === state.section);
  shell(
    `<main class="clinic-main"><aside class="clinic-sidebar" aria-label="Chức năng phòng khám"><nav>${available.map((s) => `<button data-section="${s.id}" class="${state.section === s.id ? "active" : ""}" ${state.section === s.id ? 'aria-current="page"' : ''} ${state.busy ? "disabled" : ""}>${sectionIcon(s.id)}<span>${esc(state.role === "doctor" && s.id === "visits" ? "Danh sách khám" : SECTION_COPY[s.id]?.[0] || s.title)}</span></button>`).join("")}</nav><div class="sidebar-note"><span class="sidebar-caption">Cơ sở đang làm việc</span><strong>${esc(facilityForLocation(state.facility)?.name || 'Chưa chọn cơ sở')}</strong></div></aside><div id="main-content" class="content connected-content"><div class="page-heading"><div><span class="eyebrow">${esc([m.permissions.roles[state.role]?.label, facilityForLocation(state.facility)?.name].filter(Boolean).join(" · "))}</span><h1>${esc(state.role === "doctor" && current?.id === "visits" ? "Danh sách khám" : SECTION_COPY[current?.id]?.[0] || current?.title || "Chưa có chức năng")}</h1><p>${esc(SECTION_COPY[current?.id]?.[1] || '')}</p></div><time>${esc(new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date()))}</time></div>${moduleNotice()}<p id="connectionError" class="error" role="alert">${esc(plainText(state.error))}</p><div id="conflictMatches">${matchesPanel()}</div><p id="connectionMessage" class="connection-success" role="status">${esc(plainText(state.message))}</p>${current?.id !== OVERVIEW.id && !isDoctorHome(current) ? contextPanel({ role: state.role, memory, field }) : ""}${nextStepPanel()}${current ? sectionContent(current) : ""}${state.result && !isDoctorHome(current) ? `<section id="backendResult" class="panel result-panel" aria-live="polite"><div class="workspace-heading"><h2>${registry.actions[state.action]?.document ? 'Bản in' : 'Thông tin chi tiết'}</h2>${registry.actions[state.action]?.document ? '<button id="printDocument">In chứng từ</button>' : ''}</div>${resultHighlights(state.result)}${state.action === "systemUsers" ? accountResults(state.result) : displayResult(state.result, labels)}</section>` : '<div id="backendResult" aria-live="polite"></div>'}</div></main>`,
  );
  document.querySelectorAll("[data-section]").forEach(
    (b) =>
      (b.onclick = () => {
        rememberDraft();
        state.doctorOpen = false;
        state.section = b.dataset.section;
        state.action = null;
        state.result = null;
        state.error = "";
        state.message = "";
        state.prefill = {};
        state.matches = [];
        state.nextSteps = [];
        render();
      }),
  );
  bindWorkspaceScreens();

  document
    .querySelector("#actionForm")
    ?.addEventListener("submit", submitAction);
  document.querySelector('#closeTaskForm')?.addEventListener('click', () => {state.action = null; state.prefill = {}; render();});
  document.querySelectorAll('input[pattern]').forEach(input => input.addEventListener('invalid', () => {let ancestor=input.parentElement; while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}}));
  current?.bind?.(moduleContext());
  document
    .querySelector("#printDocument")
    ?.addEventListener("click", () => window.print());
  const form = document.querySelector("#actionForm");
  if (form) {
    registry.actions[state.action]?.bind?.(form, moduleContext());
    bindTaskHelpers(form);
  }
}
function sectionContent(section) {
  const ctx = moduleContext({
    stateText,
    sections: visibleSections(),
    canList: (key) =>
      Boolean(registry.worklists[key] && permitted(state.role, registry.worklists[key].resource, "read")),
    worklist: (key) =>
      renderWorklist(registry.worklists, key, worklistContext(key)),
  });
  const choices = section.actions.filter(canAction);
  if (!choices.includes(state.action) && !isDoctorHome(section)) state.action = null;
  const a = registry.actions[state.action];
  const form = a ? taskForm(a) : '';
  if (isDoctorHome(section)) {
    const selected = memory.records.get('visit:' + memory.context.visit)?.data ||
      state.lists.visits?.rows?.find(row => row.uuid === memory.context.visit) || null;
    return doctorWorkspaceScreen(section, {
      ...ctx, doctorVisit: selected, doctorTab: state.doctorTab, doctorData: state.doctorData,
      encounter: memory.context.encounter, taskForm: form,
      resultContent: state.result && a?.method === 'GET' ? `<section class="clinical-reading" id="doctorResult">${displayResult(state.result, labels)}</section>` : '',
    });
  }
  const pickerList = !memory.context.patient && ['clinical','vitals','identity'].includes(section.id) ? (section.id === 'identity' ? 'patients' : 'visits') : null;
  const screen = (pickerList && ctx.canList(pickerList) ? ctx.worklist(pickerList) : '') + workspaceScreen(section, ctx), primary = (PRIMARY_ACTIONS[section.id] || []).filter(k => choices.includes(k));
  // One filled button per page (the first main task, only while no form is open); destructive tasks use the danger style.
  const lead = !state.action && !section.advancedTools ? primary.find(key => !isDestructive(key, registry.actions[key])) : null;
  const tone = key => isDestructive(key, registry.actions[key]) ? 'class="danger"' : key === lead ? 'class="primary"' : '';
  const buttons = keys => keys.map(key => `<button type="button" data-task-action="${key}" ${tone(key)} ${state.action === key ? 'aria-current="true"' : ''}>${esc(actionTitle(key, registry.actions[key]))}</button>`).join('');
  const others = choices.filter(key => !primary.includes(key));
  const groups = actionGroups(section.id, others);
  const toolbar = `<div class="record-toolbar">${buttons(primary)}${others.length ? `<details class="other-actions" ${document.querySelector('details.other-actions')?.open || others.includes(state.action) ? 'open' : ''}><summary>Thao tác khác <span class="action-count">${others.length}</span></summary><div class="action-groups">${groups.map(g => `<div class="action-group">${groups.length > 1 ? `<span class="action-group-title">${esc(g.title)}</span>` : ''}<div class="action-group-buttons">${buttons(g.actions)}</div></div>`).join('')}</div></details>` : ''}</div>`;
  return providerNote(section) + (section.advancedTools ? screen + `<details class="advanced-tools" ${a || document.querySelector('details.advanced-tools')?.open ? 'open' : ''}><summary>Cấu hình và công cụ quản trị</summary>${toolbar}${form}</details>` : toolbar + form + (section.intro?.(ctx) || '') + screen);
}
function taskButtonLabel(action) {
  if (state.action === 'queueTransition') return {called:'Gọi bệnh nhân',in_service:'Bắt đầu phục vụ',completed:'Hoàn tất phục vụ'}[state.prefill.state] || submitLabel(state.action, action);
  if (state.action === 'orderTransition') return {assigned:'Nhận chỉ định',in_progress:'Bắt đầu thực hiện',completed:'Hoàn tất chỉ định'}[state.prefill.state] || submitLabel(state.action, action);
  return submitLabel(state.action, action);
}
function taskForm(action) {
  return `<section class="panel form-card task-form"><div class="workspace-heading"><h2>${esc(actionTitle(state.action, action))}</h2><button type="button" id="closeTaskForm" aria-label="Đóng biểu mẫu">Đóng</button></div>${taskPrerequisite(action)}${knownRecordPicker(action)}<form id="actionForm" data-action-key="${state.action}" data-generation="${client.generation}" data-draft-key="${esc(draftKey())}"><p id="taskFormError" class="error" aria-live="polite"></p>${action.fields.some(f => f.required) ? '<p class="form-legend">Trường có dấu * là bắt buộc.</p>' : ''}<div class="form-grid">${actionFields(action)}</div>${action.formNote ? note(plainText(action.formNote)) : ''}<div class="form-actions"><button class="primary ${isDestructive(state.action, action) ? 'danger-fill' : ''}" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Đang xử lý…' : esc(taskButtonLabel(action))}</button></div></form></section>`;
}

function actionFields(action) {
  const renderFields = fields => fields.map(f => field(f, formValues())).join('');
  if (!['consultation', 'correction'].includes(state.action)) {
    const references = action.fields.filter(f => f.type === 'uuid');
    const inputs = action.fields.filter(f => f.type !== 'uuid');
    const refs = renderFields(references);
    const review = ['saveResult', 'correctResult'].includes(state.action) && state.role === 'lab'
      ? `<label class="review-self"><input type="checkbox" id="reviewSelf" ${state.myProvider ? '' : 'disabled'}> Tôi là người duyệt kết quả này <small>Chọn để điền tên bạn và thời điểm hiện tại. Chỉ dùng khi bạn có trách nhiệm duyệt.</small></label>` : '';
    if (['registerPatient', 'updatePatient'].includes(state.action)) {
      const groups = [
        ['1. Thông tin người bệnh', ['familyName', 'middleName', 'givenName', 'gender']],
        ['2. Ngày sinh', ['birthPrecision', 'birthdate', 'birthYear', 'birthMonth', 'birthRaw']],
        ['3. Giấy tờ định danh', ['cccd', 'bhxh', 'bhyt']],
        ['4. Liên lạc và thông tin bổ sung', ['phone', 'clearPhone', 'occupation', 'reason']],
      ];
      return refs + groups.map(([title, names]) => `<fieldset class="clinical-field-group"><legend>${title}</legend><div class="form-grid">${renderFields(inputs.filter(f => names.includes(f.name)))}</div></fieldset>`).join('') + renderFields(inputs.filter(f => f.name === 'allowPossibleDuplicate'));
    }
    if (state.action === 'prescription') {
      const groups = [
        ['1. Chọn thuốc và liều mỗi lần', ['drug', 'dose', 'doseUnits']],
        ['2. Cách dùng và thời gian', ['route', 'frequency', 'duration', 'durationUnits']],
        ['3. Số lượng và hướng dẫn', ['quantity', 'quantityUnits', 'dosingInstructions']],
      ];
      const used = groups.flatMap(([, names]) => names);
      return refs + groups.map(([title, names]) => `<fieldset class="clinical-field-group"><legend>${title}</legend><div class="form-grid">${renderFields(inputs.filter(f => names.includes(f.name)))}</div></fieldset>`).join('') + `<details class="optional-fields"><summary>Lý do kê bổ sung / vượt cảnh báo dị ứng (nếu có)</summary><div class="form-grid">${renderFields(inputs.filter(f => !used.includes(f.name)))}</div></details>`;
    }
    if (['saveResult', 'correctResult'].includes(state.action)) {
      const byName = names => renderFields(inputs.filter(f => names.includes(f.name)));
      return refs + byName(['state', 'textValue', 'reason']) + `<details class="optional-fields"><summary>Kết quả dạng số (dùng thay cho văn bản)</summary><p>Nhập kết quả số và đơn vị. Xóa ô kết quả văn bản nếu dùng dạng số.</p><div class="form-grid">${byName(['numericValue', 'unit'])}</div></details>` + review + `<details class="optional-fields"><summary>Kiểm tra thời điểm ghi / duyệt</summary><div class="form-grid">${byName(['recordedAt', 'reviewedAt'])}</div></details>`;
    }
    return refs + renderFields(inputs) + review;
  }
  const groups = [
    ['Lý do khám', f => f.name === 'visit.ly_do_kham'],
    ['Bệnh sử và tiền sử', f => f.name.startsWith('history.')],
    ['Khám và hướng điều trị', f => f.name.startsWith('exam.')],
    ['Dị ứng', f => f.name.startsWith('allergy.')],
    ['Hẹn tái khám', f => f.name.startsWith('followup.')],
    ['Lý do đính chính', f => f.name === 'reason'],
  ];
  const references = action.fields.filter(f => f.type === 'uuid');
  const refs = renderFields(references);
  return refs + groups.map(([title, matches]) => {
    const fields = action.fields.filter(matches);
    if (!fields.length) return '';
    const content = `<div class="form-grid">${renderFields(fields)}</div>`;
    if (title === 'Hẹn tái khám') return `<details class="optional-fields"><summary>Hẹn tái khám (nếu có)</summary>${content}</details>`;
    if (title === 'Khám và hướng điều trị') {
      const core = fields.filter(f => ['exam.bo_phan', 'exam.loi_dan'].includes(f.name));
      const more = fields.filter(f => !core.includes(f));
      return `<fieldset class="clinical-field-group"><legend>Kết quả khám và lời dặn</legend><div class="form-grid">${renderFields(core)}</div><details class="optional-fields"><summary>Triệu chứng, khám toàn thân, tóm tắt và hướng điều trị</summary><div class="form-grid">${renderFields(more)}</div></details></fieldset>`;
    }
    return `<fieldset class="clinical-field-group"><legend>${title}</legend>${content}</fieldset>`;
  }).join('');
}

function hasMissingReferences(fields) {
  const values = { ...memory.defaults(state.action), ...state.context, ...formValues(), ...state.prefill };
  return fields.some(f => f.required && !values[f.name] && !((registry.providerFields[state.role] || []).includes(f.name) && state.myProvider));
}

function taskPrerequisite(action) {
  const defaults = { ...memory.defaults(state.action), ...state.context, ...formValues(), ...state.prefill };
  const missing = action.fields.filter(f => f.type === 'uuid' && f.required && !defaults[f.name] && !(registry.providerFields[state.role] || []).includes(f.name));
  if (!missing.length) return '';
  let section = 'visits', next = null, text = 'Chọn đúng lượt khám trong danh sách trước khi điền biểu mẫu.';
  if (missing.some(f => f.name === 'patient')) {
    section = permitted(state.role, 'visit', 'read') ? 'visits' : 'patients';
    text = 'Chưa chọn người bệnh. Mở danh sách và bấm thao tác trên đúng dòng người bệnh.';
  } else if (missing.some(f => f.name === 'encounter') && memory.context.visit) {
    section = state.role === 'nurse' ? 'vitals' : 'clinical';
    next = state.role === 'nurse' ? 'startVitalsEncounter' : 'startConsultation';
    text = state.role === 'nurse' ? 'Cần bắt đầu lần đo trước khi nhập sinh hiệu.' : 'Cần bắt đầu phiếu khám trước khi ghi thông tin cho người bệnh này.';
  } else if (missing.some(f => f.name === 'record')) {
    const source = registry.records[registry.actionRecordTypes[state.action]]?.section;
    section = source && canNavigate({ section: source }) ? source : state.section;
    text = 'Chưa chọn phiếu cần xử lý. Chọn bản ghi đã mở hoặc quay về danh sách nghiệp vụ để bấm thao tác trên đúng dòng.';
  } else if (missing.some(f => ['provider', 'assignedProvider', 'reviewerProvider', 'orderer', 'authorProvider'].includes(f.name))) {
    section = state.section;
    text = 'Cần chọn người thực hiện. Chọn theo tên trong mục Hồ sơ và người thực hiện. Nếu cơ sở chưa cung cấp danh sách, nhờ quản trị hỗ trợ mã người hành nghề.';
  } else if (state.role === 'admin') {
    section = 'admin';
    text = 'Chọn nhân viên, cơ sở hoặc bản ghi cần cấu hình trong phần Hồ sơ và người thực hiện. Dữ liệu lựa chọn đến từ danh sách đã tải.';
  }
  return `<div class="task-prerequisite" role="status"><strong>Cần chọn hồ sơ trước</strong><p>${esc(text)}</p>${canNavigate({ section, action: next }) ? `<button type="button" data-guide-section="${section}" ${next ? `data-guide-action="${next}"` : ''}>${next ? 'Bắt đầu trước khi nhập' : 'Mở danh sách để chọn'}</button>` : ''}</div>`;
}

function bindTaskHelpers(form) {
  const progress = () => {
    const required = [...form.elements].filter(el => el.required && !el.disabled);
    const target = form.querySelector('#requiredProgress');
    if (target) target.textContent = `${required.filter(el => el.validity.valid).length}/${required.length} ô bắt buộc đã đủ thông tin.`;
  };
  form.addEventListener('input', progress);
  form.addEventListener('change', progress);
  if (state.action === 'book') {
    const start = form.elements.namedItem('startAt'), end = form.elements.namedItem('endAt');
    let endEdited = false;
    end.addEventListener('input', () => { endEdited = true; });
    start.addEventListener('change', () => {
      if (!endEdited && start.value) {
        const next = new Date(Date.parse(start.value) + 20 * 60000);
        end.value = new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0,16);
        progress();
      }
    });
  }
  form.addEventListener('invalid', event => {
    let ancestor = event.target.parentElement;
    while (ancestor && ancestor !== form) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    const label = registry.actions[state.action]?.fields.find(f => f.name === event.target.name)?.label;
    form.querySelector('#taskFormError').textContent = 'Kiểm tra ô ' + plainText(label || 'đang được đánh dấu') + ' trước khi tiếp tục.';
  }, true);
  for (const picker of form.querySelectorAll('[data-reference-field]')) {
    picker.onchange = () => {
      const name = picker.dataset.referenceField, value = picker.value;
      if (!value) return;
      form.elements.namedItem(name).value = value;
      if (name === 'patient' && value !== memory.context.patient) {
        memory.setContext({ patient: value }); memory.selected = {};
        memory.contextLabel = picker.selectedOptions[0].text;
        resetCareContext(); state.prefill = { patient: value }; render(); return;
      }
      if (name === 'visit' && value !== memory.context.visit) {
        const v = (state.lists.visits?.rows || []).find(row => row.uuid === value) || memory.records.get('visit:' + value)?.data;
        if (v) {
          const e = (v.encounters || []).find(e => e.encounterType?.key === (state.role === 'nurse' ? 'vitals' : 'consultation'));
          memory.setContext({ patient: v.patientUuid, visit: value, encounter: e?.uuid }); memory.selected = {};
          memory.contextLabel = [v.patient?.fullName, v.patient?.identifier].filter(Boolean).join(' · ');
          resetCareContext(); state.prefill = { visit: value }; render(); return;
        }
      }
      const display = picker.closest('.reference-field').querySelector('.reference-value');
      display.classList.remove('unselected');
      display.querySelector('strong').textContent = picker.selectedOptions[0].text;
      state.prefill[name] = value;
      progress();
    };
  }
  const birth = form.elements.namedItem('birthPrecision');
  if (birth) {
    const syncBirth = () => {
      const required = state.action === 'registerPatient' || Boolean(birth.value);
      for (const name of ['birthdate', 'birthYear', 'birthMonth']) {
        const input = form.elements.namedItem(name);
        const show = name === 'birthdate' ? birth.value === 'full' : name === 'birthYear' ? ['year', 'month'].includes(birth.value) : birth.value === 'month';
        input.closest('label').hidden = !show; input.disabled = !show; input.required = required && show;
      }
      progress();
    };
    birth.addEventListener('change', syncBirth); syncBirth();
  }
  for (const input of form.querySelectorAll('[data-catalogue-search]')) {
    const select = form.elements.namedItem(input.dataset.catalogueSearch);
    const normalize = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    input.addEventListener('input', () => {
      const query = normalize(input.value.trim());
      let count = 0;
      for (const option of select.options) {
        const match = !option.value || normalize(option.text).includes(query);
        option.hidden = !match && !option.selected;
        if (option.value && match) count++;
      }
      form.querySelector(`[data-catalogue-count="${input.dataset.catalogueSearch}"]`).textContent = count ? `${count} lựa chọn phù hợp · chọn trong danh sách bên trên` : 'Không tìm thấy. Thử từ khóa khác.';
    });
  }
  for (const prefix of ['history.tien_su_ban_than', 'history.tien_su_gia_dinh']) {
    const select = form.elements.namedItem(prefix + '_trang_thai');
    const input = form.elements.namedItem(prefix);
    if (!select || !input) continue;
    const update = () => { input.closest('label').hidden = select.value !== 'present' && !input.value; };
    select.addEventListener('change', update);
    update();
  }
  const self = form.querySelector('#reviewSelf');
  self?.addEventListener('change', () => {
    const reviewer = form.elements.namedItem('reviewerProvider');
    const time = form.elements.namedItem('reviewedAt');
    reviewer.value = self.checked ? state.myProvider : '';
    time.value = self.checked ? localTime() : '';
    const display = reviewer.closest('.reference-field')?.querySelector('.reference-value');
    if (display) {
      display.classList.toggle('unselected', !self.checked);
      display.querySelector('strong').textContent = self.checked ? client.user.display + ' (bạn)' : 'Chưa chọn';
    }
  });
  progress();
}

function completeTask(action, result, input = {}) {
  const step = (label, section, action, prefill = {}) => ({ label, section, action, prefill });
  const followups = {
    registerPatient: [step('Tiếp theo: mở lượt khám', 'visits', 'openVisit')],
    openVisit: [step('Tiếp theo: xếp hàng', 'queue', 'enqueue')],
    enqueue: [step('Xem hàng đợi', 'queue')],
    consultation: [step('Chỉ định CLS nếu cần', 'orders', 'createOrder'), step('Ghi chẩn đoán', 'clinical', 'diagnosis')],
    createOrder: [step('Xem chỉ định đang xử lý', 'orders')],
    diagnosis: [step('Kê thuốc nếu cần', 'clinical', 'prescription'), step('Kiểm tra trước khi chốt', 'clinical', 'summary')],
    prescription: [step('Thêm dòng thuốc', 'clinical', 'prescription'), step('Kiểm tra trước khi chốt', 'clinical', 'summary')],
    finalize: [step('Chuyển người bệnh tới thu ngân', 'queue'), step('Xem phiếu khám', 'clinical', 'summary')],
    vitals: [step('Tiếp theo: chuyển sang bác sĩ', 'queue')],
    orderTransition: [step('Xem danh sách chỉ định', 'orders')],
    saveResult: [step('Xem chỉ định để hoàn tất', 'orders')],
    bill: [step('Thu tiền phiếu vừa lập', 'billing', 'receipt', { record: result.uuid, amountVnd: result.outstandingVnd }), step('Lập thêm phiếu dịch vụ', 'billing', 'bill')],
    receipt: result.status === 'settled' ? [step('In phiếu thu vừa lập', 'documents', 'printReceipt', { record: result.uuid }), step('Xem phiếu còn phải thu', 'billing')] : [step('Xác nhận khi tiền đã về', 'billing', 'settle', { record: result.uuid })],
    settle: [step('In phiếu thu', 'documents', 'printReceipt', { record: result.uuid })],
    dispense: [step('Xem các đơn còn phải cấp', 'pharmacy')],
    advance: [step('Xem hàng đợi mới', 'queue')],
    closeVisit: [step('Tiếp nhận người bệnh tiếp theo', 'patients')],
    book: [step('Xem lịch đã đặt', 'appointments')],
    appointmentTransition: [step('Xem lịch hẹn', 'appointments')],
  };
  state.nextSteps = (followups[action] || []).filter(canNavigate);
  if (['contact', 'address', 'updateContact', 'voidContact', 'updateAddress', 'voidAddress', 'fieldState', 'clearFieldState'].includes(action)) {
    delete state.context.identity;
    state.nextSteps = [step('Xem lại thông tin hành chính', 'identity', 'identity')].filter(canNavigate);
  }
  // A confirmed task gives way to the next step instead of leaving a second blank write form.
  if (state.nextSteps.length) state.action = null;
  if (action === 'startConsultation') { state.action = 'consultation'; state.result = null; }
  if (action === 'startVitalsEncounter') { state.action = null; state.result = null; }
  if (action === 'registerPatient') {
    memory.setContext({ patient: result.uuid });
    memory.contextLabel = [result.fullName, result.identifier].filter(Boolean).join(' · ');
  }
  if (action === 'openVisit') {
    // The visit endpoint identifies the new visit as `uuid`, not `visitUuid`.
    memory.setContext({ patient: result.patientUuid || input.patient, visit: result.uuid });
  }
}

function nextStepPanel() {
  if (!state.nextSteps.length) return '';
  return `<section class="next-step-panel" aria-label="Bước tiếp theo"><div><strong>Đã lưu thành công</strong><p>Bạn có thể tiếp tục bên dưới. Các thao tác tiếp theo vẫn cần xác nhận.</p></div><div>${state.nextSteps.map((s, i) => `<button type="button" data-next-step="${i}" ${i === 0 ? 'class="primary"' : ''}>${esc(s.label)} <span aria-hidden="true">→</span></button>`).join('')}</div></section>`;
}
function accountResults(result) {
  const users = result?.results || [];
  if (!users.length) return '<div class="workspace-empty"><strong>Chưa tìm thấy tài khoản</strong><p>Thử tìm bằng tên đăng nhập hoặc tên nhân viên.</p></div>';
  return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Phân công</th></tr></thead><tbody>${users.map((user, i) => `<tr><td><strong>${esc(user.display || user.username || user.systemId)}</strong><small>${esc(user.username || user.systemId || '')}</small></td><td>${esc((user.roles || []).map(r => {const name=typeof r === 'string' ? r : r.name || r.display; return Object.entries(m.permissions.roles).find(([key, role]) => key === name || role.openmrs.name === name)?.[1].label || plainText(name);}).join(', '))}</td><td>${user.retired ? 'Ngừng hoạt động' : 'Đang hoạt động'}</td><td><button type="button" data-pick-account="${i}" ${user.retired ? 'disabled' : ''}>Chọn nhân viên</button></td></tr>`).join('')}</tbody></table></div>`;
}

function knownRecordPicker(action) {
  if (!action.fields.some((f) => f.name === "record")) return "";
  const type = registry.actionRecordTypes[state.action],
    rows = type ? memory.list([type]) : [];
  if (!rows.length) return "";
  const label = registry.records[type]?.label || type;
  return `<label class="known-record-picker">Chọn ${esc(label.toLowerCase())} đã mở<select id="knownRecordPicker"><option value="">Chọn hồ sơ đã xem…</option>${rows.map((row) => `<option value="${row.id}" ${(state.prefill.record || memory.selected[type]) === row.id ? "selected" : ""}>${esc(row.data.fullName || row.data.full_name || row.data.patientName || row.data.serviceName || row.data.address_text || label)} · ${esc(stateText(row.data.status || row.data.state || "Đã xem"))}</option>`).join("")}</select></label>`;
}
function navigate(section, action, prefill = {}) {
  rememberDraft();
  if (state.busy || !visibleSections().some((s) => s.id === section)) return;
  if (action && !canAction(action)) return;
  if (state.role === 'doctor' && memory.context.visit && ['clinical','orders','vitals'].includes(section)) {
    state.doctorOpen = true;
    state.doctorTab = section === 'orders' ? 'orders' : section === 'vitals' ? 'vitals' : ['diagnosis','prescription'].includes(action) ? 'clinical' : 'consultation';
    section = 'visits';
  }
  state.doctorOpen = state.role === 'doctor' && section === 'visits';
  state.section = section;
  state.action = action || null;
  state.result = null;
  state.error = "";
  state.message = "";
  state.prefill = prefill;
  state.matches = [];
  state.nextSteps = [];
  render();
  if (state.doctorOpen && memory.context.visit && !memory.records.has('visit:' + memory.context.visit)) setTimeout(loadDoctorProfile, 0);
  if (action && registry.actions[action]?.method === 'GET') readSelectedAction();
  document.querySelector(action ? ".task-form" : "#main-content")?.scrollIntoView({ block: "start", behavior: "instant" });
}
function resetCareContext() {
  patientAccess.closeDoctor();
  state.context = { catalogueVersion: state.context.catalogueVersion };
  state.result = null;
  retries.clear();
  state.nextSteps = [];
  for (const [key, w] of Object.entries(registry.worklists))
    if (w.needs) delete state.lists[key];
}
function resetWorkspaceState() {
  notifications.clear();
  patientAccess.reset();
  state.openPatientRequests = false;
  state.lists = {};
  state.prefill = {};
  state.matches = [];
  state.myProvider = null;
  state.providersLoaded = false;
  state.referenceChoices = {};
  state.nextSteps = [];
  state.doctorTab = "consultation";
  state.doctorData = {};
  state.doctorRequest += 1;
  state.doctorOpen = false;
  state.drafts.clear();
  state.readRequest += 1;
}
const canNavigate = (a) =>
  (!a.onlyRoles || a.onlyRoles.includes(state.role)) &&
  visibleSections().some((s) => s.id === a.section) &&
  (!a.action || canAction(a.action));
function worklistContext(key) {
  return {
    list: state.lists[key],
    field,
    canNavigate,
    context: memory.context,
    selected: memory.selected,
    role: state.role,
  };
}
function currentEncounterType() {
  const id = memory.context.encounter;
  if (!id) return null;
  const direct = memory.records.get('encounter:' + id)?.data.encounterType?.key;
  if (direct) return direct;
  for (const v of state.lists.visits?.rows || []) {
    const found = (v.encounters || []).find(e => e.uuid === id);
    if (found?.encounterType?.key) return found.encounterType.key;
  }
  if ([...(state.lists.vitals?.rows || []), ...memory.list(['vitals']).map(r => r.data)].some(r => r.encounterUuid === id || r.encounter === id)) return 'vitals';
  return null;
}
/** Clinical sections need the account's provider record; say so before a write is rejected. */
function providerNote(section) {
  if (
    !registry.providerFields[state.role] ||
    !state.providersLoaded ||
    state.myProvider ||
    !section.needsProvider
  )
    return "";
  return note(
    "Tài khoản chưa được liên kết với hồ sơ người hành nghề. Liên hệ quản trị phòng khám trước khi ghi nhận chuyên môn.",
  );
}
function matchesPanel() {
  if (!state.matches.length) return "";
  return `<section class="panel workspace-records"><h2>Hồ sơ tương tự đã có</h2><p class="readonly">Đã tìm thấy hồ sơ hoặc lượt khám có sẵn. Kiểm tra thông tin và chọn để tiếp tục, tránh tạo trùng.</p><div class="workspace-table-wrap"><table class="workspace-table"><tbody>${state.matches
    .map((row, index) => {
      const visit = Boolean(row.visitType),
        p = visit ? row.patient || {} : row;
      return `<tr><td><strong>${esc(p.fullName || row.uuid)}</strong><small class="record-id">${esc(row.uuid)}</small></td><td>${esc([p.identifier, p.birthdate, visit ? "Lượt " + stateText(row.status) : null].filter(Boolean).join(" · "))}</td><td><button type="button" data-match-index="${index}">${visit ? "Dùng lượt này" : "Chọn hồ sơ này"}</button></td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}
function bindMatches() {
  document.querySelectorAll("[data-match-index]").forEach(
    (button) =>
      (button.onclick = () => {
        const row = state.matches[Number(button.dataset.matchIndex)];
        if (!row || state.busy) return;
        const visit = Boolean(row.visitType),
          p = visit ? row.patient || {} : row;
        try {
          memory.setContext(
            visit
              ? { patient: row.patientUuid, visit: row.uuid }
              : { patient: row.uuid },
          );
        } catch (error) {
          showError(error);
          return;
        }
        memory.contextLabel = [p.fullName, p.identifier]
          .filter(Boolean)
          .join(" · ");
        memory.selected = {};
        resetCareContext();
        state.matches = [];
        state.error = "";
        state.message = "Đã chọn bản ghi có sẵn: " + memory.contextLabel + ".";
        render();
      }),
  );
}
// The latest request of a list wins: a filter submitted while the automatic first load is still
// running replaces it instead of being dropped.
let worklistRequest = 0;
async function loadWorklist(key, filters, append = false) {
  const w = registry.worklists[key],
    generation = client.generation,
    previous = state.lists[key] || {},
    request = ++worklistRequest;
  if (append && previous.loading) return;
  const offset = append
    ? (previous.offset || 0) + (previous.rows?.length || 0)
    : 0;
  state.lists[key] = {
    ...previous,
    filters,
    loading: true,
    error: "",
    attempted: true,
    request,
  };
  paintWorklist(key);
  try {
    const data = await client.request(
      "vinshc/" + w.path({ ...filters, offset }, memory.context),
    );
    if (
      generation !== client.generation ||
      state.lists[key]?.request !== request
    )
      return;
    state.lists[key] = {
      filters,
      rows: append ? [...(previous.rows || []), ...data.results] : data.results,
      hasMore: Boolean(data.hasMore),
      offset: append ? previous.offset || 0 : 0,
      loadedAt: new Date().toISOString(),
      loading: false,
      error: "",
      attempted: true,
      request,
    };
  } catch (error) {
    if (!client.user && error.status === 401) return showError(error);
    if (
      generation !== client.generation ||
      state.lists[key]?.request !== request
    )
      return;
    state.lists[key] = {
      ...state.lists[key],
      loading: false,
      error: userError(error),
    };
    if (!client.user) {
      showError(error);
      return;
    }
  }
  paintWorklist(key);
}
function paintWorklist(key) {
  const results = document.querySelector(
    '[data-worklist-results="' + key + '"]',
  );
  if (!results) return;
  results.innerHTML = renderWorklistResults(
    registry.worklists,
    key,
    worklistContext(key),
  );
  bindWorklists();
}
function bindWorklists() {
  document.querySelectorAll('[data-worklist-reload]').forEach(button => button.onclick = () => {
    if (!state.busy) loadWorklist(button.dataset.worklistReload, state.lists[button.dataset.worklistReload]?.filters || {});
  });
  document.querySelectorAll('[data-worklist-reset]').forEach(button => button.onclick = () => {
    if (state.busy) return;
    const key = button.dataset.worklistReset, w = registry.worklists[key];
    const filters = Object.fromEntries(w.filters.filter(f => f.value).map(f => [f.name, f.value]));
    const form = document.querySelector(`form[data-worklist="${key}"]`);
    for (const f of w.filters) form.elements.namedItem('wl_' + f.name).value = filters[f.name] || '';
    loadWorklist(key, filters);
  });
  document.querySelectorAll('[data-empty-section]').forEach(button => button.onclick = () => navigate(button.dataset.emptySection, button.dataset.emptyAction));
  document.querySelectorAll("form[data-worklist]").forEach(
    (form) =>
      (form.onsubmit = (event) => {
        event.preventDefault();
        if (state.busy) return;
        const filters = Object.fromEntries(
          [...new FormData(form)]
            .map(([k, v]) => [k.replace(/^wl_/, ""), String(v).trim()])
            .filter(([, v]) => v !== ""),
        );
        loadWorklist(form.dataset.worklist, filters);
      }),
  );
  document.querySelectorAll("[data-worklist-more]").forEach(
    (button) =>
      (button.onclick = () => {
        const key = button.dataset.worklistMore;
        loadWorklist(key, state.lists[key]?.filters || {}, true);
      }),
  );
  document.querySelectorAll("[data-worklist-open]").forEach((button) => {
    button.onclick = () => {
      if (state.busy) return;
      const tr = button.closest('tr');
      const select = tr?.querySelector(state.role === 'doctor' && button.dataset.list === 'visits' ? '[data-action-index="select"]' : '[data-row-action]:not([data-action-index="select"])') || tr?.querySelector('[data-action-index="select"]');
      select?.click();
    };
  });
  document.querySelectorAll("[data-row-action]").forEach(
    (button) =>
      (button.onclick = () => {
        if (state.busy) return;
        const key = button.dataset.list,
          list = state.lists[key];
        if (!list?.rows) return;
        const row = rowAt(registry.worklists, key, list, Number(button.dataset.row)),
          index = button.dataset.actionIndex,
          target = index === "select" ? null : row.actions[Number(index)];
        if (target && !canNavigate(target)) return;
        try {
          const context = { ...(target?.context || row.context) };
          if (key === 'visits' && state.role === 'nurse') {
            const e = (list.rows[Number(button.dataset.row)].encounters || []).find(e => e.encounterType?.key === 'vitals');
            if (e) context.encounter = e.uuid; else delete context.encounter;
          }
          memory.setContext(context);
        } catch (error) {
          showError(error);
          return;
        }
        rememberDraft();
        memory.contextLabel = row.label || "";
        memory.selected = {};
        resetCareContext();
        const type = registry.worklists[key].recordType;
        if (type) {
          memory.remember(type, list.rows[Number(button.dataset.row)]);
          memory.selected[type] = row.id;
        }
        if (!target) {
          state.message =
            "Đã chọn " +
            (row.label || row.title || "bản ghi") +
            ".";
          state.error = "";
          if (state.role === "doctor" && key === "visits") {
            state.action = null;
            state.prefill = {};
            state.result = null;
            state.doctorOpen = true;
            delete memory.context.encounter;
            state.doctorTab = "consultation";
            state.doctorData = { loading: true };
            render();
            loadDoctorProfile();
          } else {
            render();
          }
          return;
        }
        navigate(target.section, target.action, target.prefill || {});
      }),
  );
  for (const panel of document.querySelectorAll("[data-worklist-panel]")) {
    const key = panel.dataset.worklistPanel,
      w = registry.worklists[key],
      list = state.lists[key];
    if (w.auto && !list?.attempted && !(w.needs && !memory.context[w.needs]))
      loadWorklist(
        key,
        Object.fromEntries(
          w.filters.filter((f) => f.value).map((f) => [f.name, f.value]),
        ),
      );
  }
}
function refreshWorklists() {
  for (const panel of document.querySelectorAll("[data-worklist-panel]")) {
    const key = panel.dataset.worklistPanel;
    if (state.lists[key]?.loadedAt)
      loadWorklist(key, state.lists[key].filters || {});
  }
}
async function loadDoctorProfile() {
  const { patient, visit } = memory.context;
  if (!patient || !visit || state.role !== 'doctor') return;
  const request = ++state.doctorRequest, generation = client.generation;
  const current = () => request === state.doctorRequest && generation === client.generation && memory.context.visit === visit && memory.context.patient === patient && state.role === 'doctor';
  state.doctorData = { loading: true };
  render();
  const errors = {}, data = {};
  let selected;
  try {
    selected = await client.request('vinshc/visits/' + visit);
    if (!current()) return;
    memory.remember('visit', selected);
    const own = ownConsultation(selected, state.myProvider);
    if (own) memory.context.encounter = own.uuid;
    else delete memory.context.encounter;
  } catch (error) {
    if (!client.user && error.status === 401) return showError(error);
    if (!current()) return;
    if (!client.user) return showError(error);
    errors.visit = 'Không tải được lượt khám: ' + userError(error);
    delete memory.context.encounter;
  }
  const calls = {
    vitals: `vitals?patient=${patient}&visit=${visit}`,
    orders: `operations/service-orders?patient=${patient}&visit=${visit}&state=all&limit=50&offset=0`,
    history: `visits?patient=${patient}&status=all&limit=25&offset=0`,
  };
  if (memory.context.encounter) calls.summary = `encounter/${memory.context.encounter}/clinical-summary`;
  await Promise.all(Object.entries(calls).map(async ([key, path]) => {
    try { data[key] = await client.request('vinshc/' + path); }
    catch (error) { errors[key] = userError(error); }
  }));
  if (!client.user) return showError(new BackendError('Phiên đăng nhập đã hết hạn.', 401));
  if (!current()) return;
  if (data.summary) captureWorkspaceResponse('summary', data.summary, { patient, visit, encounter: memory.context.encounter });
  state.doctorData = { ...data, errors, loading: false };
  render();
  if (registry.actions[state.action]?.method === 'GET' && !state.result) setTimeout(readSelectedAction, 0);
}
async function readSelectedAction() {
  const key = state.action, action = registry.actions[key];
  if (!action || action.method !== 'GET' || state.busy) return;
  const form = document.querySelector('#actionForm');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form));
  if (action.fields.some(f => f.required && !data[f.name])) return;
  const request = ++state.readRequest, generation = client.generation, patient = memory.context.patient, visit = memory.context.visit;
  try {
    if (action.facility) data.facility = facilityForLocation(state.facility)?.uuid;
    action.prepare?.(data, moduleContext());
    const result = await client.request((action.adminCore ? '' : 'vinshc/') + action.path(data), { method: 'GET', adminCore: action.adminCore, binary: action.binary });
    if (request !== state.readRequest || generation !== client.generation || state.action !== key || memory.context.patient !== patient || memory.context.visit !== visit) return;
    state.result = result;
    captureWorkspaceResponse(key, result, data);
    state.message = '';
    render();
  } catch (error) {
    if (!client.user && error.status === 401) return showError(error);
    if (request === state.readRequest && generation === client.generation && state.action === key) showError(error);
  }
}
async function loadMoreDoctorData(key) {
  if (!['orders', 'history'].includes(key) || state.busy) return;
  const previous = state.doctorData[key];
  if (!previous?.hasMore) return;
  const patient = memory.context.patient, visit = memory.context.visit, request = state.doctorRequest, generation = client.generation;
  const path = key === 'orders' ? `operations/service-orders?patient=${patient}&visit=${visit}&state=all&limit=50` : `visits?patient=${patient}&status=all&limit=25`;
  await perform(async () => {
    const next = await client.request('vinshc/' + path + '&offset=' + previous.results.length);
    if (generation !== client.generation || request !== state.doctorRequest || memory.context.visit !== visit) throw new BackendError('Hồ sơ đã thay đổi.');
    state.doctorData[key] = { ...next, results: [...previous.results, ...next.results] };
    return null;
  }, '', () => { state.result = null; });
}

async function startDoctorConsultation() {
  if (state.busy || !memory.context.visit || !canAction("startConsultation")) return;
  if (!state.myProvider) return showError(new BackendError('Tài khoản cần được liên kết với đúng một hồ sơ chuyên môn tại cơ sở.'));
  const a = registry.actions.startConsultation;
  const data = { visit: memory.context.visit };
  try {
    const payload = a.build(data);
    await perform(
      () => client.request("vinshc/" + a.path(data), { method: "POST", body: payload }),
      "Đã mở phiếu khám.",
      (result) => {
        captureWorkspaceResponse("startConsultation", result, data);
        state.doctorTab = "consultation";
        state.doctorOpen = true;
        state.action = "consultation";
        state.doctorData = { loading: true };
        state.result = null;
        setTimeout(loadDoctorProfile, 0);
      },
    );
  } catch (error) {
    showError(error);
  }
}

function bindWorkspaceScreens() {
  document.querySelector('[data-doctor-patient-access]')?.addEventListener('click', () => {
    if (state.role !== 'doctor' || state.busy) return;
    const visit = memory.records.get('visit:' + memory.context.visit)?.data;
    if (!visit || visit.patientUuid !== memory.context.patient) return;
    patientAccess.openDoctor({patientUuid: visit.patientUuid, visitUuid: visit.uuid, name: visit.patient?.fullName || memory.contextLabel});
  });
  document.querySelectorAll('[data-task-action]').forEach(button => button.onclick = () => navigate(state.section, button.dataset.taskAction));
  document.querySelectorAll('[data-report-days]').forEach(button => button.onclick = () => {
    const days = Number(button.dataset.reportDays), dates = reportPreset(today(), days, button.dataset.yesterday === 'true');
    navigate('reports', days === 1 ? 'report' : 'rangeReport', days === 1 ? { date: dates.to } : dates);
  });
  document.querySelectorAll('[data-guide-section]').forEach(button => button.onclick = () => {
    let action = button.dataset.guideAction;
    if (action === 'consultation' && memory.context.visit && (!memory.context.encounter || (currentEncounterType() && currentEncounterType() !== 'consultation'))) action = 'startConsultation';
    navigate(button.dataset.guideSection, action);
  });
  document.querySelectorAll('[data-next-step]').forEach(button => button.onclick = () => {
    const step = state.nextSteps[Number(button.dataset.nextStep)];
    if (step) navigate(step.section, step.action, step.prefill);
  });
  document.querySelectorAll('[data-pick-account]').forEach(button => button.onclick = () => {
    const user = state.result?.results?.[Number(button.dataset.pickAccount)];
    if (!user || state.busy || user.retired) return;
    state.context.user = uuid(user.uuid);
    state.context.userName = user.display || user.username || user.systemId;
    navigate('admin', 'assignWorkspace');
  });
  document.querySelectorAll("[data-doctor-tab]").forEach((button) => {
    button.onclick = () => {
      if (state.busy) return;
      rememberDraft();
      state.action = null;
      state.result = null;
      state.error = "";
      state.message = "";
      state.doctorTab = button.dataset.doctorTab;
      render();
    };
  });
  document.querySelectorAll("[data-doctor-clear]").forEach((button) => {
    button.onclick = () => {
      if (state.busy) return;
      rememberDraft();
      state.doctorRequest += 1;
      state.action = null;
      state.result = null;
      memory.clear();
      resetCareContext();
      state.doctorData = {};
      state.doctorTab = "consultation";
      state.message = "";
      state.error = "";
      render();
    };
  });
  document.querySelectorAll("[data-doctor-reload]").forEach((button) => {
    button.onclick = () => loadDoctorProfile();
  });
  document.querySelectorAll("[data-doctor-start]").forEach((button) => {
    button.onclick = () => startDoctorConsultation();
  });
  document.querySelectorAll("[data-doctor-go-section]").forEach((button) => {
    button.onclick = () => navigate(button.dataset.doctorGoSection, button.dataset.doctorGoAction);
  });
  document.querySelectorAll('[data-doctor-print]').forEach(button => button.onclick = () => navigate('documents', 'printPrescription', { record: button.dataset.doctorPrint }));
  document.querySelectorAll('[data-doctor-action]').forEach(button => button.onclick = () => {
    navigate(['createOrder'].includes(button.dataset.doctorAction) ? 'orders' : 'clinical', button.dataset.doctorAction);
  });
  document.querySelectorAll('[data-doctor-more]').forEach(button => button.onclick = () => loadMoreDoctorData(button.dataset.doctorMore));
  document.querySelectorAll('[data-doctor-result]').forEach(button => button.onclick = async () => {
    if (state.busy) return;
    const id = button.dataset.doctorResult, visit = memory.context.visit, generation = client.generation;
    await perform(async () => {
      const result = await client.request('vinshc/operations/results/' + uuid(id));
      if (generation !== client.generation || memory.context.visit !== visit) throw new BackendError('Hồ sơ đã thay đổi.');
      state.doctorData.results = { ...state.doctorData.results, [id]: result };
      return null;
    }, '', () => { state.result = null; });
  });
  bindWorklists();
  bindMatches();
  document
    .querySelectorAll("[data-go-section]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          navigate(button.dataset.goSection, button.dataset.goAction)),
    );
  document
    .querySelectorAll("[data-pending-form]")
    .forEach((form) => (form.onsubmit = (event) => event.preventDefault()));
  document
    .querySelector("#careContextForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.busy) return;
      try {
        const form = new FormData(event.target),
          context = Object.fromEntries(
            ["patient", "visit", "encounter"].map((k) => [
              k,
              String(form.get("care_" + k) || "").trim(),
            ]),
          );
        if ((context.visit || context.encounter) && !context.patient)
          throw new BackendError(
            "Chọn bệnh nhân trước khi chọn lượt hoặc lần khám.",
          );
        memory.setContext(context);
        memory.selected = {};
        resetCareContext();
        state.message =
          "Đã chọn hồ sơ cho công việc hiện tại.";
        state.error = "";
        render();
      } catch (error) {
        showError(error);
      }
    });
  document.querySelector("#clearCareContext")?.addEventListener("click", () => {
    if (state.busy) return;
    memory.context = {};
    memory.contextLabel = "";
    memory.selected = {};
    resetCareContext();
    state.message = "Đã bỏ chọn hồ sơ.";
    state.error = "";
    render();
  });
  document
    .querySelector("#knownRecordPicker")
    ?.addEventListener("change", (event) => {
      const record = event.target.value;
      if (!record) return;
      const selected = memory.select(registry.actionRecordTypes[state.action], record);
      if (!selected) return;
      resetCareContext();
      state.prefill = {};
      state.result = null;
      state.error = '';
      state.message = '';
      if (selected.data.patientName) memory.contextLabel = [selected.data.patientName, selected.data.patientIdentifier].filter(Boolean).join(' · ');
      if (state.action === 'receipt' && !selected.stale) state.prefill.amountVnd = selected.data.outstandingVnd;
      render();
    });
  document.querySelectorAll("[data-select-type],[data-read-type]").forEach(
    (button) =>
      (button.onclick = async () => {
        if (state.busy) return;
        const type = button.dataset.selectType || button.dataset.readType,
          id = button.dataset.selectId || button.dataset.readId;
        const row = memory.select(type, id);
        if (!row) return;
        resetCareContext();
        state.error = "";
        const definition = registry.records[type] || { label: type };
        if (button.dataset.readType) {
          const key = definition.read,
            a = registry.actions[key];
          if (!a || !allowed(a)) return;
          const data = { [definition.readField || "record"]: id };
          state.action = key;
          state.section = definition.readSection || definition.section;
          await perform(
            () => client.request("vinshc/" + a.path(data)),
            "Đã cập nhật thông tin.",
            (result) => captureWorkspaceResponse(key, result, data),
          );
        } else {
          state.message =
            "Đã chọn " +
            definition.label.toLowerCase() +
            ". Chọn thao tác để tiếp tục.";
          render();
        }
      }),
  );
  document
    .querySelector("#sessionRecordFilter")
    ?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      let count = 0;
      document.querySelectorAll("[data-session-record]").forEach((row) => {
        row.hidden = !row.dataset.filter.includes(query);
        if (!row.hidden) count++;
      });
      document.querySelector("#sessionFilterEmpty").hidden = Boolean(count);
    });
}
function captureWorkspaceResponse(action, result, input) {
  const previousPatient = memory.context.patient,
    previousEncounter = memory.context.encounter;
  memory.capture(action, result, input);
  if (
    previousPatient !== memory.context.patient ||
    previousEncounter !== memory.context.encounter
  )
    state.context = { catalogueVersion: state.context.catalogueVersion };
  const ctx = moduleContext();
  for (const hook of registry.captureHooks) hook(result, ctx);
  if (action === 'identity' && Array.isArray(result?.contacts) && Array.isArray(result?.addresses)) state.result = null;
}
function formValues() {
  return { ...(registry.actions[state.action]?.formValues?.(moduleContext()) || {}), ...(state.drafts.get(draftKey()) || {}) };
}
async function inspectSetup() {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    state.result = await client.request("vinshc/operations/configuration", {
      scoped: false,
    });
  } catch (error) {
    state.error = plainText(error.message);
  } finally {
    state.busy = false;
    render();
  }
}
async function login(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  state.busy = true;
  state.error = "";
  render();
  try {
    await client.login(f.get("username"), f.get("password"));
    await openAssignedWorkspace();
  } catch (error) {
    state.error = plainText(error.message);
  } finally {
    f.delete("password");
    state.busy = false;
    render();
  }
}
// Loads the account's single assigned workspace.
async function openAssignedWorkspace() {
  const roles = new Set(assignedRoles(client.user));
  const assigned = await client.request("vinshc/authorization/workspaces", { scoped: false });
  const workspaces = (Array.isArray(assigned) ? assigned : []).filter(
    (workspace) => roles.has(workspace.role) &&
      m.permissions.roles[workspace.role] &&
      facilityForLocation(workspace.facilityUuid) &&
      typeof workspace.facilityName === "string",
  );
  if (workspaces.length > 1)
    throw new BackendError("Tài khoản có nhiều phân công đang hoạt động. Quản trị viên cần gán lại một vai trò và một cơ sở.", 409);
  state.role = workspaces[0]?.role || null;
  state.facility = workspaces[0]?.facilityUuid || null;
  if (workspaces.length === 1) {
    await activateWorkspace(state.role, state.facility);
  } else {
    state.error = "Tài khoản chưa được phân công vai trò và cơ sở. Liên hệ quản trị phòng khám để được cấp quyền.";
  }
}
async function modulesReady() {
  try {
    await modulesLoaded;
  } catch (error) {
    throw new BackendError(
      "Không ghép được các module giao diện: " + error.message,
    );
  }
}
async function activateWorkspace(role, facility) {
  await modulesReady();
  await client.selectWorkspace(role, facility);
  memory.clear();
  resetWorkspaceState();
  state.role = role;
  state.facility = facility;
  state.workspace = true;
  state.section = ROLE_START[role]?.[2] || null;
  state.action = role === 'manager' ? 'report' : null;
  if (role === 'manager') { state.prefill = { date: today() }; setTimeout(readSelectedAction, 0); }
  state.result = null;
  state.context = {};
  await loadProviders();
}
function logout() {
  client.clear();
  memory.clear();
  retries.clear();
  resetWorkspaceState();
  Object.assign(state, {
    role: null,
    facility: null,
    section: null,
    action: null,
    result: null,
    context: {},
    workspace: false,
    error: "",
    message: "",
    busy: false,
  });
  render();
}
async function loadProviders() {
  if (!registry.providerFields[state.role]) return;
  const generation = client.generation;
  try {
    const mine = await client.request("vinshc/providers/me");
    if (generation !== client.generation) return;
    state.myProvider =
      mine.providers.length === 1 ? mine.providers[0].uuid : null;
  } catch {
    if (generation !== client.generation) return;
    state.myProvider = null;
  }
  state.providersLoaded = true;
  if (state.workspace && !state.busy) render();
  if (state.role === 'doctor' && memory.context.visit) loadDoctorProfile();
}
// Keep an uncertain transaction's key for an identical manual retry; never auto-retry a write.
const retries = new Map();
async function submitAction(e) {
  e.preventDefault();
  if (state.busy) return;
  const a = registry.actions[state.action];
  const submittedAction = state.action, submittedDraft = draftKey(), inDoctor = isDoctorHome(state.section);
  if (!a || !allowed(a)) return;
  state.matches = [];
  const data = Object.fromEntries(new FormData(e.target));
  const ctx = moduleContext();
  try {
    if (state.role === 'doctor' && a.method !== 'GET' && a.fields.some(f => f.name === 'encounter') && currentEncounterType() && currentEncounterType() !== 'consultation')
      throw new BackendError('Hồ sơ đang chọn là lần đo sinh hiệu. Chọn lại lượt khám và bắt đầu phiếu khám của bác sĩ trước khi lưu.');
    for (const f of a.fields) {
      if (f.type === 'uuid' && f.required && !data[f.name]) throw new BackendError('Chưa chọn ' + plainText(f.label).replace(/^Mã /, '').toLowerCase() + '. Chọn bản ghi từ danh sách trước khi tiếp tục.');
      if (data[f.name] === undefined) continue;
      if (f.type === "file") continue;
      data[f.name] = data[f.name].trim();
      if (f.type === "uuid" && data[f.name]) data[f.name] = uuid(data[f.name]);
      if (data[f.name] === "" && !f.required) delete data[f.name];
    }
    if (a.facility) {
      const facility = facilityForLocation(state.facility);
      if (!facility) throw new BackendError("Cơ sở chưa có trong metadata.");
      data.facility = facility.uuid;
    }
    a.prepare?.(data, ctx);
    if (a.confirm && !window.confirm(a.confirm)) return;
    const payload = a.build ? a.build(data) : undefined;
    let body = payload;
    if (a.upload) {
      const file = data.file;
      if (
        !file?.size ||
        file.size > 20 * 1024 * 1024 ||
        !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
      )
        throw new BackendError(
          "Chọn PDF/JPEG/PNG có dung lượng tối đa 20 MiB.",
        );
      body = new FormData();
      body.set("file", file);
    }
    a.finish?.(body, data, ctx);
    const path = (a.adminCore ? "" : "vinshc/") + a.path(data);
    // Never include credentials in the retry fingerprint or retained UI state.
    const fingerprint = a.sensitive ? null : JSON.stringify([
      client.workspace,
      state.action,
      path,
      body,
    ]);
    if (a.idempotent) {
      if (!retries.has(fingerprint))
        retries.set(fingerprint, crypto.randomUUID());
      body.idempotencyKey = retries.get(fingerprint);
    }
    await perform(
      () =>
        a.send
          ? a.send(ctx, { path, payload: body, data })
          : client.request(path, {
              method: a.method || "POST",
              body,
              binary: a.binary,
              adminCore: a.adminCore,
            }),
      a.method === "GET"
        ? "Đã tải thông tin."
        : "Thông tin đã được lưu.",
      (result) => {
        result = result || {};
        if (a.idempotent) retries.delete(fingerprint);
        if (a.binary) {
          const href = URL.createObjectURL(result),
            link = document.createElement("a");
          link.href = href;
          link.download = "vinshc-report-" + data.record;
          link.click();
          setTimeout(() => URL.revokeObjectURL(href), 1000);
          state.result = { message: "Đã tải tệp." };
        }
        if (a.document)
          state.message =
            "Đã mở bản in. Kiểm tra thông tin, rồi bấm In chứng từ.";
        if (a.sensitive) delete data.password;
        captureWorkspaceResponse(submittedAction, result, data);
        if (a.method !== 'GET') {
          state.drafts.delete(submittedDraft);
          document.querySelector('#actionForm')?.remove();
          state.action = null;
          completeTask(submittedAction, result, data);
          if (inDoctor) {
            state.action = submittedAction === 'startConsultation' ? 'consultation' : null;
            state.nextSteps = [];
            state.result = null;
            setTimeout(loadDoctorProfile, 0);
          }
        }
        if (data.orderer) state.context.orderer = data.orderer;
        if (a.method !== "GET") {
          state.prefill = {};
          setTimeout(refreshWorklists, 0);
        }
      },
    );
  } catch (error) {
    showError(error);
  } finally {
    // Password inputs must not survive rerender or appear in session metadata.
    if (a.sensitive) {
      delete data.password;
      const secret = e.target?.elements?.namedItem("password");
      if (secret) secret.value = "";
    }
  }
}
async function perform(task, message, onSuccess) {
  state.busy = true;
  state.error = "";
  state.message = "";
  const messageElement = document.querySelector("#connectionMessage");
  if (messageElement) messageElement.textContent = "";
  // Disable controls without replacing the form: failed requests preserve the user's input.
  const locked = [...document.querySelectorAll("button,select")].map((el) => ({
    el,
    disabled: el.disabled,
  }));
  locked.forEach(({ el }) => (el.disabled = true));
  try {
    const result = await task();
    state.result = result;
    state.message = message;
    onSuccess?.(result);
    state.busy = false;
    render();
    document.querySelector('#connectionMessage')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  } catch (error) {
    state.busy = false;
    showError(error);
  } finally {
    locked.forEach(({ el, disabled }) => {
      if (el.isConnected) el.disabled = disabled;
    });
  }
}
function showError(error) {
  state.error = userError(error);
  const inline = document.querySelector("#taskFormError");
  if (inline) inline.textContent = state.error;
  state.matches = Array.isArray(error.details?.matches)
    ? error.details.matches
    : [];
  const matches = document.querySelector("#conflictMatches");
  if (matches) {
    matches.innerHTML = matchesPanel();
    bindMatches();
  }
  if (!client.user) {
    resetWorkspaceState();
    memory.clear();
    state.workspace = false;
    state.result = null;
    state.context = {};
    retries.clear();
    render();
    return;
  }
  const target = document.querySelector("#connectionError");
  if (target) {
    target.textContent = state.error;
    target.scrollIntoView({ block: "center", behavior: "instant" });
  }
  else render();
}
/**
 * Starts the shell. `loading` resolves to {registry, failures} from module-loader.js; the login and
 * workspace-selection screens do not need the modules, the workspace waits for them.
 */
export function startShell(loading) {
  modulesLoaded = Promise.resolve(loading).then((loaded) => {
    registry = loaded.registry;
    labels = resultLabels(registry);
    moduleFailures = loaded.failures;
    memory.configure(registry);
  });
  modulesLoaded.catch((error) =>
    console.error("VinSHC modules could not be combined:", error),
  );
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) logout();
  });
  window.addEventListener("pagehide", () => {
    notifications.clear();
    patientAccess.reset();
    client.clear();
    memory.clear();
    retries.clear();
    state.context = {};
    state.result = null;
  });
  render();
}
