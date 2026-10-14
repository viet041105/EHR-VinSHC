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
  active,
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

let registry = createRegistry([]),
  labels = resultLabels(registry),
  moduleFailures = [],
  modulesLoaded = Promise.resolve();
const client = new BackendClient();
const memory = new WorkspaceMemory();
const agentChat = new AgentChat(client);
const state = {
  roles: [],
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
  return `<label>${esc(f.label)}${f.required ? " *" : ""}${control}</label>`;
}
function shell(content) {
  document.querySelector("#app").innerHTML =
    `<a class="skip-link" href="#main-content">Đến nội dung chính</a><header class="site-header clinic-header"><a class="site-brand" href="/"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>KHÔNG GIAN OPENMRS</small></span></a><div class="header-controls">${state.workspace ? `<div class="session-identity" aria-label="Thông tin phiên đăng nhập"><dl><div><dt>Tài khoản:</dt><dd>${esc(client.user?.display)}</dd></div><div><dt>Vai trò hiện tại:</dt><dd>${esc(m.permissions.roles[state.role].label)}</dd></div></dl><span class="session-connection">Đã kết nối</span></div><div class="session-actions"><button id="switchWorkspace" ${state.busy ? "disabled" : ""}>Đổi vai trò/cơ sở</button><button id="logout" ${state.busy ? "disabled" : ""}>Đăng xuất</button></div>` : '<a href="/">Về trang chủ</a>'}</div></header>${content}`;
  if(state.workspace && state.role === "doctor") {
    const host=document.createElement("div");host.id="agentPanel";document.querySelector("#main-content")?.append(host);
    agentChat.mount(host,"doctor",memory.context);
  } else agentChat.clear();
  document.querySelector("#logout")?.addEventListener("click", logout);
  document.querySelector("#switchWorkspace")?.addEventListener("click", () => {
    memory.clear();
    state.workspace = false;
    state.result = null;
    state.context = {};
    resetWorkspaceState();
    retries.clear();
    state.error = "";
    state.message = "";
    state.busy = false;
    client.generation++;
    client.workspace = null;
    render();
  });
}
const moduleNotice = () =>
  moduleFailures.length
    ? note(
        "Không tải được module giao diện: " +
          moduleFailures.map((f) => f.specifier).join(", ") +
          ". Các chức năng của module này tạm ẩn; liên hệ quản trị triển khai.",
      )
    : "";
function render() {
  if (!client.user) {
    shell(
      `<main id="main-content" class="connection-login"><section class="panel form-card"><span class="eyebrow">VINSHC / OPENMRS LOCAL</span><h1>Đăng nhập phòng khám</h1><p>Dùng tài khoản OpenMRS đã được phân công vai trò và cơ sở.</p>${note("Môi trường kiểm thử · danh mục hiện chưa được duyệt cho sử dụng lâm sàng. Hồ sơ và thao tác chỉ được đọc/ghi qua backend.")}<form id="loginForm">${field(F("username", "Tên đăng nhập"))}<label>Mật khẩu *<input name="password" type="password" autocomplete="current-password" required></label><p class="error" role="alert">${esc(state.error)}</p><button class="primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Đang kết nối…" : "Đăng nhập OpenMRS"}</button></form></section></main>`,
    );
    document.querySelector("#loginForm").onsubmit = login;
    return;
  }
  if (!state.workspace) {
    shell(
      `<main id="main-content" class="connection-login"><section class="panel form-card"><h1>Chọn không gian làm việc</h1><p>${esc(client.user.display)} · Vai trò được lấy từ tài khoản, cơ sở được server kiểm tra khi mở.</p>${
        state.roles.length
          ? `<form id="workspaceForm">${field(
              choice(
                "role",
                "Vai trò",
                state.roles.map((r) => [r, m.permissions.roles[r].label]),
              ),
              { role: state.role },
            )}${field(
              choice(
                "facility",
                "Cơ sở",
                active(m.facilities.records).map((f) => [
                  f.locationUuid,
                  f.name,
                ]),
              ),
              { facility: state.facility },
            )}<button class="primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Đang xác nhận…" : "Mở không gian làm việc"}</button></form>`
          : note(
              "Tài khoản chưa có vai trò VinSHC App. Cần quản trị backend gán role và workspace; FE không tự cấp quyền.",
            )
      }<p class="error" role="alert">${esc(state.error)}</p><button id="systemSetup" ${state.busy ? "disabled" : ""}>Kiểm tra kết nối và cấu hình backend</button><section id="setupResult" aria-live="polite">${state.result ? displayResult(state.result, labels) : ""}</section><button id="logout">Đăng xuất</button></section></main>`,
    );
    document.querySelector("#logout").onclick = logout;
    document.querySelector("#systemSetup").onclick = inspectSetup;
    document
      .querySelector("#workspaceForm")
      ?.addEventListener("submit", openWorkspace);
    return;
  }
  const available = visibleSections();
  if (!available.some((s) => s.id === state.section))
    state.section = available[0]?.id;
  const current = available.find((s) => s.id === state.section);
  shell(
    `<main class="clinic-main"><aside class="clinic-sidebar">${available.map((s) => `<button data-section="${s.id}" class="${state.section === s.id ? "active" : ""}" ${state.busy ? "disabled" : ""}>${esc(s.title)}</button>`).join("")}<div class="sidebar-note"><span class="dot"></span> OpenMRS local<small>${esc(facilityForLocation(state.facility)?.name)}<br>Metadata ${esc(m.map.version)} · Dữ liệu kiểm thử</small></div></aside><div id="main-content" class="content connected-content"><div class="page-heading"><span class="eyebrow">VINSHC / KHÔNG GIAN KẾT NỐI</span><h1>${esc(current?.title || "Không có chức năng được cấp")}</h1></div>${note("Môi trường kiểm thử. Thao tác ghi sẽ lưu lên OpenMRS và được kiểm tra theo vai trò, cơ sở hiện tại.")}${moduleNotice()}${current?.note ? note(current.note) : ""}<p id="connectionError" class="error" role="alert">${esc(state.error)}</p><div id="conflictMatches">${matchesPanel()}</div><p id="connectionMessage" class="connection-success" role="status">${esc(state.message)}</p>${current?.id !== OVERVIEW.id ? contextPanel({ role: state.role, memory, field }) : ""}${current ? sectionContent(current) : ""}<section id="backendResult" class="panel result-panel" aria-live="polite">${state.result ? `<h2>Kết quả từ OpenMRS</h2>${registry.actions[state.action]?.document ? '<button id="printDocument">In chứng từ</button>' : ""}${resultHighlights(state.result)}${displayResult(state.result, labels)}` : '<p class="readonly">Chọn thao tác để đọc hoặc ghi dữ liệu backend.</p>'}</section></div></main>`,
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
  const before = (section.intro ? section.intro(ctx) : "") + providerNote(section);
  const choices = section.actions.filter(canAction);
  if (!choices.length) return before + screen;
  if (!choices.includes(state.action)) state.action = choices[0];
  const a = registry.actions[state.action];
  return (
    before +
    `<section class="panel form-card"><div class="workspace-heading"><h2>Thao tác ${esc(section.title.toLowerCase())}</h2><span class="capability-badge connected">Đã nối API</span></div><div class="action-shortcuts">${choices
      .slice(0, 6)
      .map(
        (k) =>
          `<button type="button" data-go-section="${section.id}" data-go-action="${k}" ${state.action === k ? 'aria-current="true"' : ""}>${esc(registry.actions[k].title)}</button>`,
      )
      .join("")}</div>${field(
      choice(
        "actionPicker",
        "Thao tác",
        choices.map((k) => [k, registry.actions[k].title]),
      ),
      { actionPicker: state.action },
    ).replace(
      'name="actionPicker"',
      'id="actionPicker"',
    )}<h2>${esc(a.title)}</h2>${a.notice ? note(a.notice) : ""}${knownRecordPicker(a)}<form id="actionForm"><div class="form-grid">${a.fields.map((f) => field(f, formValues())).join("")}</div>${a.formNote ? note(a.formNote) : ""}<div class="form-actions"><button class="primary" ${state.busy ? "disabled" : ""}>${state.busy ? "Đang xử lý…" : a.method === "GET" ? "Đọc từ OpenMRS" : "Xác nhận gửi OpenMRS"}</button></div></form></section>${screen}`
  );
}
function knownRecordPicker(action) {
  if (!action.fields.some((f) => f.name === "record")) return "";
  const type = registry.actionRecordTypes[state.action],
    rows = type ? memory.list([type]) : [];
  if (!rows.length) return "";
  const label = registry.records[type]?.label || type;
  return `<label class="known-record-picker">Chọn ${esc(label.toLowerCase())} đã mở<select id="knownRecordPicker"><option value="">Hoặc nhập mã bên dưới…</option>${rows.map((row) => `<option value="${row.id}" ${memory.selected[type] === row.id ? "selected" : ""}>${esc(row.data.serviceName || stateText(row.data.status || row.data.state || label))} · ${row.id}</option>`).join("")}</select></label>`;
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
  document.querySelector("#main-content")?.scrollIntoView({ block: "start" });
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
    "Tài khoản chưa gắn đúng một hồ sơ người hành nghề (provider). Backend sẽ từ chối tạo encounter hoặc ghi nhận cần người thực hiện; liên hệ quản trị để liên kết hồ sơ.",
  );
}
function matchesPanel() {
  if (!state.matches.length) return "";
  return `<section class="panel workspace-records"><h2>Bản ghi liên quan từ backend</h2><p class="readonly">Backend từ chối vì đã có bản ghi phù hợp. Chọn để tiếp tục với bản ghi có sẵn.</p><div class="workspace-table-wrap"><table class="workspace-table"><tbody>${state.matches
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
            "Chọn bệnh nhân trước khi áp dụng mã lượt hoặc encounter.",
          );
        memory.setContext(context);
        memory.selected = {};
        resetCareContext();
        state.message =
          "Đã áp dụng mã hồ sơ cho các biểu mẫu. Backend sẽ kiểm tra khi gửi.";
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
            "Đã đọc lại bản ghi từ OpenMRS.",
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
    state.error = error.message;
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
    state.roles = assignedRoles(session.user);
    // System Developer can manage staffing via a server-verified admin workspace,
    // without granting the Core user a VinSHC clinical application role.
    if (isSystemAdministrator(session.user) && !state.roles.includes("admin"))
      state.roles.push("admin");
    state.role = state.roles[0] || null;
    state.facility = active(m.facilities.records)[0]?.locationUuid;
  } catch (error) {
    state.error = error.message;
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
async function openWorkspace(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  state.busy = true;
  state.error = "";
  render();
  try {
    const role = f.get("role"),
      facility = uuid(f.get("facility"));
    if (!state.roles.includes(role))
      throw new BackendError("Vai trò không thuộc tài khoản.");
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
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = false;
    render();
  }
}
function logout() {
  client.clear();
  memory.clear();
  retries.clear();
  resetWorkspaceState();
  Object.assign(state, {
    roles: [],
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
        ? "Đã đọc dữ liệu từ OpenMRS."
        : "OpenMRS đã xác nhận thao tác.",
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
          state.result = { message: "Đã tải tệp từ OpenMRS." };
        }
        if (a.document)
          state.message =
            "Đã lấy chứng từ từ OpenMRS. Dùng nút In chứng từ để in nội dung đã nhận.";
        if (a.sensitive) delete data.password;
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
  state.error = error.message;
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
    state.roles = [];
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
