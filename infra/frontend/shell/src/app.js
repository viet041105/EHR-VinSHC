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
import { AgentChat } from "./agent-chat.js";
import { SECTION_COPY, PRIMARY_ACTIONS, actionTitle, submitLabel, plainText, sectionIcon } from "./presentation.js";

let registry = createRegistry([]),
  labels = resultLabels(registry),
  moduleFailures = [],
  modulesLoaded = Promise.resolve();
const client = new BackendClient();
const memory = new WorkspaceMemory();
const agentChat = new AgentChat(client);
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
    ...extra,
  };
}
function field(f, values = {}) {
  const provider = (registry.providerFields[state.role] || []).includes(f.name)
    ? state.myProvider
    : null;
  const value =
    values[f.name] ??
    state.prefill[f.name] ??
    f.value ??
    (f.type === "datetime-local" && f.required
      ? localTime()
      : f.type === "date" && f.required
        ? today()
        : (memory.defaults(state.action)[f.name] ??
          state.context[f.name] ??
          provider ??
          ""));
  const common = `name="${esc(f.name)}" ${f.required ? "required" : ""} ${f.max ? 'maxlength="' + f.max + '"' : ""}`;
  let control;
  if (f.type === "select")
    control = `<select ${common}><option value="">${esc(f.placeholder || (f.required ? "Chọn…" : "Chưa ghi nhận"))}</option>${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  else if (f.type === "textarea")
    control = `<textarea ${common} rows="3">${esc(value)}</textarea>`;
  else
    control = `<input ${common} type="${f.type === "uuid" ? "text" : f.type}" ${f.type === "file" ? 'accept="application/pdf,image/jpeg,image/png"' : 'value="' + esc(value) + '"'} ${f.type === "uuid" ? 'pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" spellcheck="false"' : ""} ${f.min !== undefined ? 'min="' + f.min + '"' : ""} ${f.type === "number" && f.max !== undefined ? 'max="' + f.max + '"' : ""} ${f.step ? 'step="' + f.step + '"' : ""}>`;
  const label = plainText(f.label);
  if (f.type === "uuid" && !f.name.startsWith("care_")) {
    const selected = Boolean(value);
    const person = memory.contextLabel?.split(" · ")[0];
    const caption = f.name === "patient" ? person : f.name === "user" ? state.context.userName : f.name === "orderer" || f.name === "authorProvider" ? client.user?.display : null;
    return `<div class="reference-field"><span class="field-label">${esc(label)}${f.required ? ' *' : ''}</span><div class="reference-value ${selected ? '' : 'unselected'}"><strong>${esc(selected ? caption || label.replace(/^Mã /, '') + ' đã chọn' : 'Chưa chọn')}</strong><small>${selected ? 'Được điền từ hồ sơ đang làm việc' : 'Chọn trong danh sách để điền thông tin'}</small></div><details class="reference-details"><summary>${selected ? 'Đổi lựa chọn bằng mã' : 'Nhập mã hồ sơ nếu đã biết'}</summary><label>${esc(label)}${control}</label></details></div>`;
  }
  return `<label>${esc(label)}${f.required ? " *" : ""}${control}</label>`;
}
function shell(content) {
  document.querySelector("#app").innerHTML =
    `<a class="skip-link" href="#main-content">Đến nội dung chính</a><header class="site-header clinic-header"><a class="site-brand" href="/"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>QUẢN LÝ PHÒNG KHÁM</small></span></a><div class="header-controls">${state.workspace ? `<div class="session-identity" aria-label="Thông tin phiên đăng nhập"><dl><div><dt>Tài khoản:</dt><dd>${esc(client.user?.display)}</dd></div><div><dt>Vai trò:</dt><dd>${esc(m.permissions.roles[state.role].label)}</dd></div></dl></div><div class="session-actions"><button id="logout" ${state.busy ? "disabled" : ""}>Đăng xuất</button></div>` : '<a class="back-home" href="/">Về trang chủ</a>'}</div></header>${content}`;
  if(state.workspace && state.role === "doctor" && state.section === "clinical") {
    const host=document.createElement("div");host.id="agentPanel";document.querySelector("#main-content")?.append(host);
    agentChat.mount(host,"doctor",memory.context);
  } else agentChat.clear();
  document.querySelector("#logout")?.addEventListener("click", logout);
}
const moduleNotice = () =>
  moduleFailures.length
    ? note(
        "Một số chức năng tạm thời chưa mở được: " +
          moduleFailures.map(f => SECTION_COPY[f.specifier.replace("@vinshc/", "")]?.[0] || (f.specifier.endsWith("scheduling") ? "Lịch hẹn và hàng đợi" : "Chức năng bổ sung")).join(", ") +
          ". Hãy tải lại trang hoặc liên hệ quản trị phòng khám.",
      )
    : "";
function render() {
  if (!client.user) {
    shell(
      `<main id="main-content" class="connection-login"><div class="login-intro"><span class="eyebrow">DÀNH CHO NHÂN VIÊN</span><h1>Phòng khám VinSHC</h1><p>Đăng nhập để sử dụng các chức năng được phân công tại cơ sở của bạn.</p><ol><li>Tìm đúng hồ sơ bệnh nhân</li><li>Tiếp tục công việc được phân công</li><li>Theo dõi và cập nhật kết quả</li></ol></div><section class="panel form-card login-card"><h2>Đăng nhập</h2><p>Dùng tài khoản được phòng khám cấp.</p><form id="loginForm">${field(F("username", "Tên đăng nhập"))}<label>Mật khẩu *<input name="password" type="password" autocomplete="current-password" required></label><p class="error" role="alert">${esc(plainText(state.error))}</p><button class="primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Đang đăng nhập…" : "Đăng nhập"}</button></form><p class="login-support">Chưa có tài khoản hoặc cần đổi mật khẩu?<br>Liên hệ quản trị của phòng khám.</p></section></main>`,
    );
    document.querySelector("#loginForm").onsubmit = login;
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
    `<main class="clinic-main"><aside class="clinic-sidebar" aria-label="Chức năng phòng khám"><nav>${available.map((s) => `<button data-section="${s.id}" class="${state.section === s.id ? "active" : ""}" ${state.section === s.id ? 'aria-current="page"' : ''} ${state.busy ? "disabled" : ""}>${sectionIcon(s.id)}<span>${esc(SECTION_COPY[s.id]?.[0] || s.title)}</span></button>`).join("")}</nav><div class="sidebar-note"><span class="sidebar-caption">Cơ sở đang làm việc</span><strong>${esc(facilityForLocation(state.facility)?.name || 'Chưa chọn cơ sở')}</strong></div></aside><div id="main-content" class="content connected-content"><div class="page-heading"><div><span class="eyebrow">PHÒNG KHÁM</span><h1>${esc(SECTION_COPY[current?.id]?.[0] || current?.title || "Chưa có chức năng")}</h1><p>${esc(SECTION_COPY[current?.id]?.[1] || '')}</p></div><time>${esc(new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date()))}</time></div>${moduleNotice()}<p id="connectionError" class="error" role="alert">${esc(plainText(state.error))}</p><div id="conflictMatches">${matchesPanel()}</div><p id="connectionMessage" class="connection-success" role="status">${esc(plainText(state.message))}</p>${current?.id !== OVERVIEW.id ? contextPanel({ role: state.role, memory, field }) : ""}${current ? sectionContent(current) : ""}${state.result ? `<section id="backendResult" class="panel result-panel" aria-live="polite"><div class="workspace-heading"><h2>${registry.actions[state.action]?.document ? 'Bản in' : 'Thông tin chi tiết'}</h2>${registry.actions[state.action]?.document ? '<button id="printDocument">In chứng từ</button>' : ''}</div>${resultHighlights(state.result)}${state.action === "systemUsers" ? accountResults(state.result) : displayResult(state.result, labels)}</section>` : '<div id="backendResult" aria-live="polite"></div>'}</div></main>`,
  );
  document.querySelectorAll("[data-section]").forEach(
    (b) =>
      (b.onclick = () => {
        state.section = b.dataset.section;
        state.action = null;
        state.result = null;
        state.error = "";
        state.message = "";
        state.prefill = {};
        state.matches = [];
        render();
      }),
  );
  bindWorkspaceScreens();
  document.querySelector("#actionPicker")?.addEventListener("change", (e) => {
    state.action = e.target.value;
    state.error = "";
    state.message = "";
    state.result = null;
    state.prefill = {};
    render();
  });
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
  if (form) registry.actions[state.action]?.bind?.(form, moduleContext());
}
function sectionContent(section) {
  const ctx = moduleContext({
    stateText,
    sections: visibleSections(),
    canList: (key) =>
      permitted(state.role, registry.worklists[key].resource, "read"),
    worklist: (key) =>
      renderWorklist(registry.worklists, key, worklistContext(key)),
  });
  const screen = workspaceScreen(section, ctx);
  const before = providerNote(section);
  const choices = section.actions.filter(canAction);
  if (!choices.length) return before + screen + (section.intro?.(ctx) || "");
  if (!choices.includes(state.action)) state.action = null;
  const a = registry.actions[state.action];
  const primary = (PRIMARY_ACTIONS[section.id] || choices.slice(0, 3)).filter(k => choices.includes(k));
  const toolbar = `<section class="task-actions" aria-label="Công việc ${esc(SECTION_COPY[section.id]?.[0] || section.title)}"><div class="action-shortcuts">${primary.map(k => `<button type="button" data-go-section="${section.id}" data-go-action="${k}" ${state.action === k ? 'aria-current="true"' : ''}>${esc(actionTitle(k, registry.actions[k]))}</button>`).join('')}</div><label class="action-menu">Chọn công việc<select id="actionPicker"><option value="">Chọn thao tác…</option>${choices.map(k => `<option value="${k}" ${state.action === k ? 'selected' : ''}>${esc(actionTitle(k, registry.actions[k]))}</option>`).join('')}</select></label></section>`;
  const form = a ? `<section class="panel form-card task-form"><div class="workspace-heading"><h2>${esc(actionTitle(state.action, a))}</h2><button type="button" id="closeTaskForm" aria-label="Đóng biểu mẫu">Đóng</button></div>${a.notice ? note(plainText(a.notice)) : ''}${knownRecordPicker(a)}<form id="actionForm"><div class="form-grid">${actionFields(a)}</div>${a.formNote ? note(plainText(a.formNote)) : ''}<div class="form-actions"><button class="primary" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Đang xử lý…' : esc(submitLabel(state.action, a))}</button></div></form></section>` : '';
  return before + toolbar + screen + (section.intro?.(ctx) || '') + form;
}
function actionFields(action) {
  if (!['consultation', 'correction'].includes(state.action)) return action.fields.map(f => field(f, formValues())).join('');
  const groups = [
    ['Hồ sơ và lý do khám', f => f.type === 'uuid' || f.name === 'visit.ly_do_kham'],
    ['Bệnh sử và tiền sử', f => f.name.startsWith('history.')],
    ['Khám và hướng điều trị', f => f.name.startsWith('exam.')],
    ['Dị ứng', f => f.name.startsWith('allergy.')],
    ['Hẹn tái khám', f => f.name.startsWith('followup.')],
    ['Lý do đính chính', f => f.name === 'reason'],
  ];
  return groups.map(([title, matches]) => {
    const fields = action.fields.filter(matches);
    return fields.length ? `<fieldset class="clinical-field-group"><legend>${title}</legend><div class="form-grid">${fields.map(f => field(f, formValues())).join('')}</div></fieldset>` : '';
  }).join('');
}
function accountResults(result) {
  const users = result?.results || [];
  if (!users.length) return '<div class="workspace-empty"><strong>Chưa tìm thấy tài khoản</strong><p>Thử tìm bằng tên đăng nhập hoặc tên nhân viên.</p></div>';
  return `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Phân công</th></tr></thead><tbody>${users.map((user, i) => `<tr><td><strong>${esc(user.display || user.username || user.systemId)}</strong><small>${esc(user.username || user.systemId || '')}</small></td><td>${esc((user.roles || []).map(r => {const name=r.name || r.display; return Object.values(m.permissions.roles).find(role => role.openmrs.name === name)?.label || plainText(name);}).join(', '))}</td><td>${user.retired ? 'Ngừng hoạt động' : 'Đang hoạt động'}</td><td><button type="button" data-pick-account="${i}" ${user.retired ? 'disabled' : ''}>Chọn nhân viên</button></td></tr>`).join('')}</tbody></table></div>`;
}

function knownRecordPicker(action) {
  if (!action.fields.some((f) => f.name === "record")) return "";
  const type = registry.actionRecordTypes[state.action],
    rows = type ? memory.list([type]) : [];
  if (!rows.length) return "";
  const label = registry.records[type]?.label || type;
  return `<label class="known-record-picker">Chọn ${esc(label.toLowerCase())} đã mở<select id="knownRecordPicker"><option value="">Chọn hồ sơ đã xem…</option>${rows.map((row) => `<option value="${row.id}" ${memory.selected[type] === row.id ? "selected" : ""}>${esc(row.data.fullName || row.data.patientName || row.data.serviceName || label)} · ${esc(stateText(row.data.status || row.data.state || "Đã xem"))}</option>`).join("")}</select></label>`;
}
function navigate(section, action, prefill = {}) {
  if (state.busy || !visibleSections().some((s) => s.id === section)) return;
  if (action && !canAction(action)) return;
  state.section = section;
  state.action = action || null;
  state.result = null;
  state.error = "";
  state.message = "";
  state.prefill = prefill;
  state.matches = [];
  render();
  document.querySelector(action ? ".task-form" : "#main-content")?.scrollIntoView({ block: "start", behavior: "instant" });
}
function resetCareContext() {
  state.context = { catalogueVersion: state.context.catalogueVersion };
  state.result = null;
  retries.clear();
  for (const [key, w] of Object.entries(registry.worklists))
    if (w.needs) delete state.lists[key];
}
function resetWorkspaceState() {
  state.lists = {};
  state.prefill = {};
  state.matches = [];
  state.myProvider = null;
  state.providersLoaded = false;
}
const canNavigate = (a) =>
  visibleSections().some((s) => s.id === a.section) &&
  (!a.action || canAction(a.action));
function worklistContext(key) {
  return {
    list: state.lists[key],
    field,
    canNavigate,
    context: memory.context,
  };
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
    if (
      generation !== client.generation ||
      state.lists[key]?.request !== request
    )
      return;
    state.lists[key] = {
      ...state.lists[key],
      loading: false,
      error: error.message,
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
          memory.setContext(target?.context || row.context);
        } catch (error) {
          showError(error);
          return;
        }
        memory.contextLabel = row.label || "";
        memory.selected = {};
        resetCareContext();
        if (!target) {
          state.message =
            "Đã chọn " +
            (row.label || row.title || "bản ghi") +
            ". Chọn thao tác để tiếp tục.";
          state.error = "";
          render();
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
function bindWorkspaceScreens() {
  document.querySelectorAll('[data-pick-account]').forEach(button => button.onclick = () => {
    const user = state.result?.results?.[Number(button.dataset.pickAccount)];
    if (!user || state.busy || user.retired) return;
    state.context.user = uuid(user.uuid);
    state.context.userName = user.display || user.username || user.systemId;
    navigate('admin', 'assignWorkspace');
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
      memory.select(registry.actionRecordTypes[state.action], record);
      resetCareContext();
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
}
function formValues() {
  return registry.actions[state.action]?.formValues?.(moduleContext()) || {};
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
    const session = await client.login(f.get("username"), f.get("password"));
    const roles = new Set(assignedRoles(session.user));
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
  } catch (error) {
    state.error = plainText(error.message);
  } finally {
    f.delete("password");
    state.busy = false;
    render();
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
  state.section = null;
  state.action = null;
  state.result = null;
  state.context = {};
  loadProviders();
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
}
// Keep an uncertain transaction's key for an identical manual retry; never auto-retry a write.
const retries = new Map();
async function submitAction(e) {
  e.preventDefault();
  if (state.busy) return;
  const a = registry.actions[state.action];
  if (!a || !allowed(a)) return;
  state.matches = [];
  const data = Object.fromEntries(new FormData(e.target));
  const ctx = moduleContext();
  try {
    for (const f of a.fields) {
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
    const fingerprint = JSON.stringify([
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
            "Bản in đã sẵn sàng. Chọn In chứng từ để in.";
        captureWorkspaceResponse(state.action, result, data);
        if (data.orderer) state.context.orderer = data.orderer;
        if (a.method !== "GET") {
          state.prefill = {};
          setTimeout(refreshWorklists, 0);
        }
      },
    );
  } catch (error) {
    showError(error);
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
  state.error = plainText(error.message);
  state.matches = Array.isArray(error.details?.matches)
    ? error.details.matches
    : [];
  const matches = document.querySelector("#conflictMatches");
  if (matches) {
    matches.innerHTML = matchesPanel();
    bindMatches();
  }
  if (!client.user) {
    memory.clear();
    state.workspace = false;
    state.result = null;
    state.context = {};
    retries.clear();
    render();
    return;
  }
  const target = document.querySelector("#connectionError");
  if (target) target.textContent = state.error;
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
    client.clear();
    memory.clear();
    retries.clear();
    state.context = {};
    state.result = null;
  });
  render();
}
