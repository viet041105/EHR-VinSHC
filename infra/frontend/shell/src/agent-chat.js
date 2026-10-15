import { esc, RESULT_LABELS } from "@vinshc/core";
import { displayResult } from "./result-view.js";
import "./agent-chat.css";

const paths = {
  spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>',
  book: '<path d="M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4Z"/><path d="M12 6v15"/>',
  arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
const kinds = {
  patient: "Thông tin bệnh nhân", visit: "Lượt khám", encounter: "Phiếu khám",
  clinical_summary: "Hồ sơ khám", consultation: "Phiếu khám", diagnosis: "Chẩn đoán", drug_order: "Đơn thuốc", vitals: "Sinh hiệu", allergy: "Dị ứng",
  result: "Kết quả cận lâm sàng", service_order: "Chỉ định dịch vụ",
  prescription: "Đơn thuốc", published_instruction: "Lời dặn đã công bố",
  published_prescription: "Đơn thuốc đã công bố", appointment: "Lịch hẹn",
  document: "Tài liệu tham khảo",
};
const toolLabels = {
  get_patient_demographics: "Thông tin bệnh nhân", list_visits: "Lượt khám",
  get_encounter_summary: "Hồ sơ khám", get_vitals_history: "Sinh hiệu", get_active_allergies: "Dị ứng",
  list_diagnostic_orders: "Chỉ định", get_diagnostic_result: "Kết quả",
  list_appointments: "Lịch hẹn", list_my_visits: "Lượt khám đã công bố",
  get_visit_instructions: "Lời dặn", get_my_prescriptions: "Đơn thuốc đã công bố",
  list_my_appointments: "Lịch hẹn",
  search_documents: "Tìm tài liệu", read_document_chunk: "Đọc tài liệu",
};
const suggestions = {
  doctor: [
    ["Tóm tắt lần khám", "Lý do khám, bệnh sử và thông tin đã ghi", "Tóm tắt lần khám này giúp tôi"],
    ["Sinh hiệu đã ghi", "Xem lại các chỉ số và thời điểm đo", "Sinh hiệu đã ghi trong lượt khám này là gì?"],
    ["Thuốc trong đơn", "Đối chiếu thuốc và hướng dẫn đã lưu", "Đơn thuốc trong lượt khám này có những gì?"],
    ["Lời dặn và tái khám", "Tìm lời dặn, ngày hẹn trong hồ sơ", "Lời dặn và lịch tái khám đã ghi là gì?"],
  ],
  patient: [
    ["Lời dặn của bác sĩ", "Đọc lại hướng dẫn sau lần khám", "Bác sĩ đã dặn tôi những gì?"],
    ["Xem lại đơn thuốc", "Thông tin trong đơn đã được công bố", "Đơn thuốc đã công bố của tôi có những gì?"],
    ["Lịch hẹn sắp tới", "Kiểm tra lịch hẹn đã được ghi nhận", "Tôi có lịch hẹn nào sắp tới?"],
    ["Các lần khám", "Xem những lượt khám được công bố", "Tôi có những lần khám nào đã được công bố?"],
  ],
};
const dateText = (value) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const sourceKey = (source) => JSON.stringify([source.kind, source.uuid, source.field, source.recordedAt, source.encounterUuid, source.visitUuid]);
// Routing identifiers remain in memory for authorized requests, not in the reading panel.
export function readingFields(value) {
  if (Array.isArray(value)) return value.map(readingFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !/uuid|packSha256|adapterStrategy|upstreamBoundaries|memberUuids|patientId|personId/i.test(key) && !(typeof item === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item)))
    .map(([key, item]) => [key, readingFields(item)]));
}
export function chatContextKey(client, persona, context) {
  return JSON.stringify([client.generation, client.user?.uuid, persona, client.workspace?.role,
    client.workspace?.facility, context?.patient, context?.visit, context?.encounter]);
}

export function missingView(result, className) {
  const shown = new Set((result?.answer || []).flatMap(a => (a.sources || []).map(s => s.section + ':' + s.label)));
  const items = (result?.missing || []).filter(m => !shown.has(m.section + ':' + m.label));
  if (!items.length) return '';
  return `<details class="${className}" open><summary>Thông tin thiếu hoặc chưa đọc được (${items.length})</summary><ul>${items.map(m =>
    `<li><strong>${esc(m.label || 'Thông tin chưa có')}</strong>: ${esc(m.detail || 'Nguồn đang đọc chưa ghi thông tin này.')}</li>`).join('')}</ul></details>`;
}

export function notesView(result, className) {
  const notes = (result?.notes || []).filter(n => typeof n === 'string' && n.trim());
  return notes.length ? `<details class="${className}"><summary>Thông tin về nguồn</summary>${notes.map(n => `<p>${esc(n)}</p>`).join('')}</details>` : '';
}

export class AgentChat {
  constructor(client) {
    this.client = client; this.key = null; this.version = 0; this.sourceVersion = 0;
    this.reset();
  }
  reset() {
    this.history = []; this.turns = []; this.pending = false; this.draft = "";
    this.conversationId = null; this.serverMemory = true;
    this.source = null; this.sourceRecord = null; this.sourcePending = false;
    this.sourceError = ""; this.error = ""; this.copied = null;
  }
  mount(root, persona, context = {}, options = {}) {
    const key = chatContextKey(this.client, persona, context);
    if (key !== this.key) { this.detach(); this.key = key; this.reset(); }
    this.root = root; this.persona = persona; this.context = { ...context }; this.options = options;
    this.draw();
  }
  detach() {
    this.controller?.abort(); this.sourceController?.abort();
    this.version++; this.sourceVersion++;
    for (const turn of this.turns) if (turn.pending) { turn.pending = false; turn.cancelled = true; }
    this.pending = false; this.sourcePending = false; this.root = null;
  }
  clear() { this.detach(); this.key = null; this.reset(); }
  // Doctors may also ask general questions with no chart open; the agent then reads no patient data.
  get ready() { return this.persona === "patient" || this.persona === "doctor"; }
  get hasRecord() { return Boolean(this.context.patient && this.context.encounter); }
  sources(result) {
    const entries = [], indexes = new Map();
    for (const answer of result?.answer || []) for (const source of answer.sources || []) {
      const key = sourceKey(source);
      if (!indexes.has(key)) { indexes.set(key, entries.length + 1); entries.push({ source, excerpt: answer.text }); }
    }
    return { entries, indexes };
  }
  turnView(turn, index) {
    const result = turn.result, sources = this.sources(result);
    let body;
    if (turn.pending) body = '<div class="agent-wait" role="status"><span class="agent-dots"><i></i><i></i><i></i></span><span>Đang xử lý câu hỏi và đọc hồ sơ…</span></div>';
    else if (turn.error || turn.cancelled) body = `<div class="agent-notice" ${turn.error ? 'role="alert"' : ''}>${esc(turn.error || "Đã dừng chờ phản hồi. Bạn có thể gửi lại câu hỏi.")}</div>`;
    else body = `${result?.message ? `<p class="agent-notice" role="status">${esc(result.message)}</p>` : ""}
      ${(result?.answer || []).map((answer) => `<div class="agent-answer-block"><p class="agent-answer">${esc(answer.text)}</p><div class="agent-citations">${(answer.sources || []).map((source) => `<button type="button" data-source="${index},${sources.indexes.get(sourceKey(source)) - 1}" title="Đối chiếu ${esc(source.label)}"><span>${sources.indexes.get(sourceKey(source))}</span>${icon("book")}${esc(source.label)}</button>`).join("")}</div></div>`).join("")}
      ${missingView(result, 'agent-missing')}${notesView(result, 'agent-note')}`;
    const read = [...new Set((result?.toolsUsed || []).map((key) => toolLabels[key]).filter(Boolean))];
    const retry = !turn.pending && (turn.error || turn.cancelled || result?.status === "limited" && !result.answer?.length);
    return `<article class="agent-turn"><div class="agent-user-message"><span class="agent-speaker">${this.persona === "doctor" ? "Bạn · Bác sĩ" : "Bạn"}</span><p>${esc(turn.question)}</p></div>
      <div class="agent-assistant-message"><span class="agent-avatar">${icon("spark")}</span><div class="agent-response"><div class="agent-response-heading"><span>Trợ lý VinSHC</span>${result?.generatedAt ? `<time>${esc(dateText(result.generatedAt))}</time>` : ""}</div>
      ${read.length ? `<p class="agent-read-status">${icon("check")} Đã đọc: ${esc(read.join(" · "))}</p>` : ""}${body}
      ${!turn.pending ? `<div class="agent-response-actions">${result?.answer?.length ? `<button type="button" data-copy="${index}">${icon("copy")}${this.copied === index ? "Đã sao chép" : "Sao chép"}</button>` : ""}${retry ? `<button type="button" data-retry="${index}" ${this.pending ? "disabled" : ""}>Thử lại câu hỏi</button>` : ""}</div>` : ""}
      ${result?.disclaimer ? `<p class="agent-disclaimer">${esc(result.disclaimer)}</p>` : ""}</div></div></article>`;
  }
  inspectorView() {
    const latest = this.turns.findLast((turn) => turn.result?.answer?.length);
    const entries = this.sources(latest?.result).entries;
    return `<aside class="agent-inspector" aria-label="Đối chiếu nguồn hồ sơ"><div class="agent-inspector-heading">${icon("book")}<h3>Nguồn hồ sơ</h3>${entries.length ? `<span class="agent-count">${entries.length}</span>` : ""}</div>
      <p class="agent-inspector-intro">Đối chiếu câu trả lời với dữ liệu đã được ghi nhận.</p>
      ${this.source ? `<section class="agent-source-detail"><div class="agent-source-top"><span class="agent-source-type">${esc(kinds[this.source.kind] || "Bản ghi hồ sơ")}</span><button type="button" class="agent-icon-button" data-close-source aria-label="Đóng nguồn đang xem">${icon("close")}</button></div><h4>${esc(this.source.label)}</h4>${this.source.recordedAt ? `<p class="agent-source-date">${esc(dateText(this.source.recordedAt))}</p>` : ""}${this.sourceExcerpt ? `<blockquote>${esc(this.sourceExcerpt)}</blockquote>` : ""}
      <div class="agent-source-record" aria-live="polite">${this.sourcePending ? '<p role="status">Đang mở bản ghi…</p>' : this.sourceError ? `<p class="error" role="alert">${esc(this.sourceError)}</p><button type="button" data-reload-source>Thử mở lại</button>` : this.sourceRecord ? displayResult(readingFields(this.sourceRecord), { ...RESULT_LABELS, ...this.options.labels, items: "Nội dung", label: "Thông tin", text: "Nội dung ghi nhận", instructions: "Hướng dẫn", publishedAt: "Ngày công bố" }) : ""}</div></section>` : `<div class="agent-source-empty"><span>${icon("book")}</span><p>${entries.length ? "Chọn một nguồn bên dưới hoặc trong câu trả lời." : "Nguồn sẽ xuất hiện khi trợ lý trả lời từ hồ sơ."}</p></div>`}
      ${entries.length ? `<div class="agent-source-list"><h4>Nguồn của câu trả lời gần nhất</h4>${entries.map(({ source }, i) => `<button type="button" data-inspect="${i}" class="${this.source && sourceKey(source) === sourceKey(this.source) ? "selected" : ""}"><span class="agent-source-number">${i + 1}</span><span>${esc(source.label)}<small>${esc(kinds[source.kind] || "Bản ghi hồ sơ")}</small></span><span aria-hidden="true">↗</span></button>`).join("")}</div>` : ""}
      <div class="agent-source-footnote"><span class="agent-readonly-dot"></span>Trợ lý chỉ đọc hồ sơ. Không thay đổi dữ liệu hoặc tự tạo chỉ định.</div></aside>`;
  }
  draw() {
    if (!this.root) return;
    const input = this.root.querySelector('[data-chat] textarea');
    const focused = input && document.activeElement === input;
    const selection = input ? [input.selectionStart, input.selectionEnd] : null;
    const oldThread = this.root.querySelector('.agent-thread');
    const atEnd = !oldThread || oldThread.scrollHeight - oldThread.scrollTop - oldThread.clientHeight < 60;
    const oldScroll = oldThread?.scrollTop || 0;
    const doctor = this.persona === "doctor", prompts = suggestions[this.persona];
    const contextTitle = this.options.contextLabel || (doctor ? this.context.patient ? "Hồ sơ bệnh nhân đã chọn" : "Chưa chọn hồ sơ" : "Hồ sơ của tôi");
    const contextNote = doctor ? this.ready ? "Lượt khám đang chọn · chỉ truy cập theo quyền bác sĩ" : "Chọn bệnh nhân và phiếu khám trước khi hỏi" : this.options.visitLabel || "Lời dặn, đơn thuốc đã công bố và lịch hẹn";
    this.root.innerHTML = `<section class="agent-chat"><header class="agent-header"><div class="agent-title"><span class="agent-brand-icon">${icon("spark")}</span><div><h2>${doctor ? "Trợ lý hồ sơ" : "Trợ lý hồ sơ của tôi"}</h2><p>${doctor ? "Đọc nhanh thông tin, đối chiếu ngay với hồ sơ." : "Tìm lại thông tin bác sĩ đã ghi cho bạn."}</p></div></div><button type="button" data-clear class="agent-new-chat" ${!this.turns.length && !this.draft ? "disabled" : ""}>${icon("plus")} Hội thoại mới</button></header>
      <div class="agent-context"><span class="agent-context-icon">${icon("book")}</span><div><strong>${esc(contextTitle)}</strong><small>${esc(contextNote)}</small></div><span class="agent-context-badge ${this.ready ? "ready" : ""}"><i></i>${this.ready ? "Chỉ đọc" : "Chưa chọn"}</span>${doctor ? '<button type="button" data-select-context>Chọn hồ sơ</button>' : ""}</div>
      <div class="agent-grid"><div class="agent-conversation"><div class="agent-thread" role="log" aria-label="Hội thoại với trợ lý" aria-live="polite" aria-relevant="additions text" tabindex="0">
      ${this.turns.length ? this.turns.map((turn, i) => this.turnView(turn, i)).join("") : `<div class="agent-welcome"><span class="agent-welcome-icon">${icon("spark")}</span><span class="agent-eyebrow">TRỢ LÝ VINSHC</span><h3>${doctor ? "Bạn muốn tìm gì trong hồ sơ?" : "Bạn muốn xem lại thông tin nào?"}</h3><p>${doctor ? "Hỏi về lần khám đang chọn. Mỗi thông tin có nguồn để bạn kiểm tra lại." : "Hỏi về hồ sơ được phòng khám công bố. Bạn có thể mở nguồn để đọc lại."}</p><div class="agent-starters">${prompts.map(([title, description], i) => `<button type="button" data-prompt="${i}" ${doctor && i === 0 ? "data-summary" : ""} ${!this.ready ? "disabled" : ""}><span>${icon("book")}</span><strong>${title}</strong><small>${description}</small><span class="agent-starter-arrow" aria-hidden="true">↗</span></button>`).join("")}</div>${!this.ready ? '<p class="agent-context-help">Mở mục Lượt khám, chọn bệnh nhân và hồ sơ khám rồi quay lại trợ lý.</p>' : ""}</div>`}</div>
      <form data-chat class="agent-composer"><label class="agent-sr-only" for="agentMessage">Câu hỏi cho trợ lý</label><textarea id="agentMessage" name="message" rows="2" maxlength="1000" required placeholder="${doctor ? this.ready ? "Hỏi về hồ sơ đang chọn…" : "Chọn hồ sơ để bắt đầu…" : "Hỏi về lời dặn, đơn thuốc hoặc lịch hẹn…"}" ${!this.ready ? "disabled" : ""}>${esc(this.draft)}</textarea><div class="agent-composer-bottom"><span>Enter để gửi <span aria-hidden="true">·</span> Shift + Enter xuống dòng</span>${this.pending ? '<button type="button" data-stop class="agent-stop"><span aria-hidden="true">■</span> Dừng chờ</button>' : `<button type="submit" class="primary agent-send" aria-label="Gửi câu hỏi" ${!this.ready || !this.draft.trim() ? "disabled" : ""}>Gửi ${icon("arrow")}</button>`}</div></form>
      ${this.error ? `<p class="agent-ui-error" role="alert">${esc(this.error)}</p>` : ""}<p class="agent-composer-note">${doctor ? "Đối chiếu nguồn trước khi sử dụng thông tin trong quyết định lâm sàng." : "Trợ lý giúp đọc lại hồ sơ. Liên hệ bác sĩ khi cần tư vấn hoặc thay đổi điều trị."}</p></div>${this.inspectorView()}</div></section>`;
    const thread = this.root.querySelector('.agent-thread');
    thread.scrollTop = this.followEnd || atEnd ? thread.scrollHeight : oldScroll;
    this.followEnd = false;
    const textarea = this.root.querySelector('[data-chat] textarea');
    if (focused && !textarea.disabled) { textarea.focus({ preventScroll: true }); if (selection) textarea.setSelectionRange(...selection); }
    textarea.oninput = () => {
      this.draft = textarea.value;
      const send = this.root.querySelector('.agent-send');
      if (send) send.disabled = !this.ready || !this.draft.trim();
      this.root.querySelector('[data-clear]').disabled = !this.turns.length && !this.draft;
    };
    textarea.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.ask(textarea.value); }
    };
    this.root.querySelector('[data-chat]').onsubmit = (event) => { event.preventDefault(); this.ask(textarea.value); };
    const host = this.root;
    this.root.querySelector('[data-clear]').onclick = () => {
      this.detach(); this.reset(); this.root = host; this.draw();
    };
    this.root.querySelector('[data-select-context]')?.addEventListener('click', () => this.options.onSelectContext?.());
    this.root.querySelector('[data-stop]')?.addEventListener('click', () => this.stop());
    for (const button of this.root.querySelectorAll('[data-prompt]')) button.onclick = () => this.ask(prompts[Number(button.dataset.prompt)][2]);
    for (const button of this.root.querySelectorAll('[data-source]')) button.onclick = () => {
      const [turnIndex, sourceIndex] = button.dataset.source.split(',').map(Number);
      const item = this.sources(this.turns[turnIndex]?.result).entries[sourceIndex];
      if (item) this.openSource(item.source, item.excerpt);
    };
    const entries = this.sources(this.turns.findLast((turn) => turn.result?.answer?.length)?.result).entries;
    for (const button of this.root.querySelectorAll('[data-inspect]')) button.onclick = () => {
      const item = entries[Number(button.dataset.inspect)]; this.openSource(item.source, item.excerpt);
    };
    for (const button of this.root.querySelectorAll('[data-retry]')) button.onclick = () => this.ask(this.turns[Number(button.dataset.retry)].question, Number(button.dataset.retry));
    for (const button of this.root.querySelectorAll('[data-copy]')) button.onclick = () => this.copy(Number(button.dataset.copy));
    this.root.querySelector('[data-reload-source]')?.addEventListener('click', () => this.openSource(this.source, this.sourceExcerpt));
    this.root.querySelector('[data-close-source]')?.addEventListener('click', () => {
      this.sourceController?.abort(); this.sourceVersion++; this.source = null; this.sourcePending = false; this.draw();
    });
  }
  stop() {
    this.controller?.abort(); this.version++;
    // A non-streamed request may still hold its old session lease. Resume safely in a new session.
    this.conversationId = null;
    // Also settle the inspector request invalidated by this render generation.
    this.sourceController?.abort(); this.sourceVersion++; this.sourcePending = false;
    for (const turn of this.turns) if (turn.pending) { turn.pending = false; turn.cancelled = true; }
    this.pending = false; this.draw();
  }
  async copy(index) {
    const key = this.key, version = this.version;
    try {
      await navigator.clipboard.writeText(this.turns[index].result.answer.map((answer) => answer.text).join('\n\n'));
      if (key === this.key && version === this.version) { this.copied = index; this.error = ""; this.draw(); }
    } catch { if (key === this.key && version === this.version) { this.error = "Không sao chép được. Bạn có thể chọn văn bản trong câu trả lời."; this.draw(); } }
  }
  async ask(question, retryIndex = null) {
    if (this.pending || !this.ready || !question?.trim()) return;
    question = question.trim().slice(0, 1000);
    const key = this.key, version = this.version, generation = this.client.generation;
    const context = { ...this.context }, persona = this.persona, record = this.hasRecord;
    const turn = { question, pending: true };
    if (retryIndex !== null) this.turns[retryIndex] = turn;
    else this.turns.push(turn);
    this.turns = this.turns.slice(-6);
    const controller = new AbortController(); this.controller = controller;
    this.pending = true; this.error = ""; this.draft = ""; this.copied = null; this.followEnd = true; this.draw();
    const body = { message: question };
    if (this.serverMemory) body.remember = true;
    if (this.serverMemory && this.conversationId) body.conversationId = this.conversationId;
    else body.history = this.history.slice(-12);
    if (persona === 'doctor' && record) Object.assign(body, { patientUuid: context.patient, encounterUuid: context.encounter, visitUuid: context.visit || null });
    else if (context.visit) body.visitUuid = context.visit;
    try {
      let result;
      try { result = await this.client.chat(persona, body, { signal: controller.signal }); }
      catch (error) {
        if (version !== this.version || key !== this.key || generation !== this.client.generation || controller.signal.aborted) return;
        const code = error.details?.code;
        if (code === 'advanced_disabled' && body.remember) {
          this.serverMemory = false; this.conversationId = null;
          delete body.remember; delete body.conversationId; body.history = this.history.slice(-12);
        } else if (code === 'conversation_not_found' && body.conversationId) {
          this.conversationId = null; delete body.conversationId; body.history = this.history.slice(-12);
        } else throw error;
        // These errors are returned before model execution; retrying cannot duplicate a model turn.
        result = await this.client.chat(persona, body, { signal: controller.signal });
      }
      if (version !== this.version || key !== this.key || generation !== this.client.generation) return;
      if (persona === 'doctor' && ((result.context?.patientUuid ?? null) !== (record ? context.patient : null) || (result.context?.encounterUuid ?? null) !== (record ? context.encounter : null) || result.context?.facilityUuid !== this.client.workspace?.facility)) throw new Error('Phản hồi không khớp hồ sơ đang mở.');
      turn.result = result;
      if (this.serverMemory && result.conversationId) this.conversationId = result.conversationId;
      const reply = result.answer?.length ? result.answer.map((answer) => answer.text).join('\n') : result.message;
      if ((['ok', 'not_found', 'out_of_scope'].includes(result.status) || result.status === 'limited' && result.answer?.length) && reply)
        this.history.push({ role: 'user', text: question }, { role: 'assistant', text: reply.slice(0, 2000) });
      this.history = this.history.slice(-12);
    } catch (error) {
      if (version === this.version && key === this.key && !controller.signal.aborted) turn.error = error.message;
    } finally {
      if (version === this.version && key === this.key) { turn.pending = false; this.pending = false; this.draw(); }
    }
  }
  async openSource(source, excerpt = "") {
    const key = this.key, version = this.version, sourceVersion = ++this.sourceVersion;
    this.sourceController?.abort(); const controller = new AbortController(); this.sourceController = controller;
    this.source = source; this.sourceExcerpt = excerpt; this.sourceRecord = null; this.sourceError = ""; this.sourcePending = true; this.draw();
    if (window.matchMedia('(max-width: 780px)').matches) this.root?.querySelector('.agent-inspector')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const current = () => version === this.version && key === this.key && sourceVersion === this.sourceVersion;
    if (source.kind === 'document') {
      try {
        const result = await this.client.readKnowledgeChunk(this.persona, source.uuid, { signal: controller.signal });
        if (result.kind !== 'document' || result.uuid !== source.uuid || result.documentId !== source.documentId || result.documentVersion !== source.documentVersion)
          throw new Error('Nguồn tài liệu đã thay đổi; hãy hỏi lại để đọc phiên bản hiện tại.');
        if (current()) this.sourceRecord = { 'Tài liệu': result.documentTitle, 'Phiên bản': result.documentVersion, 'Mục': result.documentSection, 'Nội dung': result.text };
      } catch (error) { if (current() && !controller.signal.aborted) this.sourceError = error.message; }
      finally { if (current()) { this.sourcePending = false; this.draw(); } }
      return;
    }
    let path;
    if (this.persona === 'patient') {
      if (source.kind === 'published_instruction') path = `vinshc/portal/visits/${source.uuid}/instructions`;
      else if (source.kind === 'published_prescription') path = `vinshc/portal/prescriptions${source.visitUuid ? '?visit=' + source.visitUuid : ''}`;
      else if (source.kind === 'appointment') path = 'vinshc/portal/appointments';
      else path = 'vinshc/portal/visits';
    } else {
      const encounter = source.encounterUuid || (source.kind === 'encounter' ? source.uuid : this.context.encounter);
      if (source.kind === 'result') path = `vinshc/operations/results/${source.uuid}`;
      else if (source.kind === 'visit') path = source.uuid ? `vinshc/visits/${source.uuid}` : `vinshc/visits?patient=${this.context.patient}`;
      else if (source.kind === 'patient') path = `vinshc/patients/${this.context.patient}`;
      else if (source.kind === 'allergy') path = `vinshc/allergy?patient=${this.context.patient}`;
      else if (source.kind === 'vitals') path = `vinshc/vitals?patient=${this.context.patient}${source.visitUuid ? '&visit=' + source.visitUuid : ''}`;
      else if (source.kind === 'service_order') path = source.uuid ? `vinshc/operations/service-orders/${source.uuid}` : `vinshc/operations/service-orders?patient=${this.context.patient}${source.visitUuid ? '&visit=' + source.visitUuid : ''}&state=all`;
      else if (source.kind === 'appointment') path = source.uuid ? `vinshc/operations/appointments/${source.uuid}` : `vinshc/operations/appointments?patient=${this.context.patient}`;
      else path = `vinshc/encounter/${encounter}/clinical-summary`;
    }
    try {
      const result = await this.client.request(path, { scoped: this.persona === 'doctor', signal: controller.signal });
      if (current()) {
        const selected = result.results?.filter((item) => item.uuid === source.uuid);
        this.sourceRecord = selected?.length ? { ...result, results: selected } : result;
      }
    } catch (error) { if (current() && !controller.signal.aborted) this.sourceError = error.message; }
    finally { if (current()) { this.sourcePending = false; this.draw(); } }
  }
}
