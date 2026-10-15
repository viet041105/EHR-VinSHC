// Doctor-workspace chatbot. Request handling, stale-response protection and source
// lookup are inherited from AgentChat; this class renders a launcher that opens a docked side column
// that stays available on every doctor screen and survives shell re-renders.
import { AgentChat, readingFields, missingView, notesView } from "./agent-chat.js";
import { displayResult } from "./result-view.js";
import { RESULT_LABELS, esc } from "@vinshc/core";

const SUGGESTIONS = [
  ["📋", "Tóm tắt lần khám", "Tóm tắt lần khám này giúp tôi"],
  ["💓", "Sinh hiệu gần nhất", "Sinh hiệu gần nhất của bệnh nhân là bao nhiêu?"],
  ["⚠️", "Dị ứng", "Bệnh nhân có ghi nhận dị ứng nào không?"],
  ["🧪", "Kết quả CLS", "Kết quả cận lâm sàng của lần khám này là gì?"],
  ["💊", "Thuốc đã kê", "Bệnh nhân đang được kê những thuốc nào?"],
];
// Offered with no chart open; answered from the reference documents only.
const GENERAL_SUGGESTIONS = [
  ["📏", "Đơn vị sinh hiệu", "SpO2 và huyết áp dùng đơn vị nào?"],
  ["❔", "Trạng thái thiếu dữ liệu", "not_asked, not_recorded và unknown khác nhau thế nào?"],
  ["🗂️", "Lượt và phiếu khám", "Visit và Encounter khác nhau thế nào?"],
  ["📤", "Công bố cho bệnh nhân", "Hồ sơ final và published khác nhau thế nào?"],
];
const WIDTH_KEY ="vinshc.assistantWidth";
const clampWidth = (w) => Math.round(Math.min(Math.max(w, 320), Math.min(900, window.innerWidth * 0.7)));
const applyWidth = (w) => document.documentElement.style.setProperty("--assistant-w", `${clampWidth(w)}px`);
try {
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  if (saved) applyWidth(saved);
} catch {}
const time = (iso) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export class DoctorAssistant extends AgentChat {
  constructor(client) {
    super(client);
    this.open = false;
    this.draft = "";
  }
  /** options: { label: patient display text, navigate(section, action) } */
  mount(root, persona, context = {}, options = {}) {
    const changed = (this.label ?? "") !== (options.label ?? "");
    this.label = options.label || "";
    this.navigate = options.navigate;
    if (changed) this.draft = "";
    super.mount(root, persona, context, options);
  }
  clear() {
    super.clear();
    this.open = false;
    this.draft = "";
    document.body.classList.remove("assistant-docked");
  }
  missingStep() {
    if (!this.context.patient) return ["Chọn bệnh nhân hoặc lượt khám trong danh sách.", "visits", null, "Mở danh sách lượt khám"];
    if (!this.context.encounter)
      return ["Đã có thể hỏi về hồ sơ bệnh nhân. Bắt đầu phiếu khám nếu muốn trợ lý đọc thêm lần khám này.", "clinical", "startConsultation", "Bắt đầu phiếu khám"];
    return null;
  }
  draw() {
    if (!this.root) return;
    const previousInput = this.root.querySelector("[data-chat] textarea");
    const focused = previousInput && document.activeElement === previousInput;
    const selection = previousInput ? [previousInput.selectionStart, previousInput.selectionEnd] : null;
    const previousList = this.root.querySelector(".assistant-messages");
    const oldScroll = previousList?.scrollTop || 0;
    const atEnd = !previousList || previousList.scrollHeight - oldScroll - previousList.clientHeight < 60;
    // Wide screens dock the panel: the page reflows beside it instead of being covered.
    document.body.classList.toggle("assistant-docked", this.open);
    const missing = this.missingStep();
    const ready = this.ready;
    const record = this.hasRecord;
    const busy = this.pending;
    const turns = this.turns
      .map((t, i) => {
        const r = t.result;
        const answer = (r?.answer || [])
          .map((a, j) => `<p>${esc(a.text)}</p>${a.sources.length ? `<div class="assistant-sources">${a.sources.map((s, k) => `<button type="button" data-source="${i},${j},${k}" title="Xem nguồn trong hồ sơ">📎 ${esc(s.label)}</button>`).join("")}</div>` : ""}`)
          .join("");
        return `<div class="assistant-msg user"><div class="assistant-bubble">${esc(t.question)}</div></div>
          <div class="assistant-msg bot"><span class="assistant-avatar" aria-hidden="true">🩺</span><div class="assistant-bubble">
            ${t.pending ? '<p class="assistant-typing" role="status">Đang đọc hồ sơ…</p>' : t.error || t.cancelled ? `<p class="assistant-status" role="status">${esc(t.error || "Đã dừng chờ phản hồi. Bạn có thể gửi lại câu hỏi.")}</p>` : `${r?.message ? `<p class="assistant-status">${esc(r.message)}</p>` : ""}${answer || (r?.message ? "" : "<p>Chưa có thông tin trong hồ sơ.</p>")}`}
            ${missingView(r, 'assistant-missing')}${notesView(r, 'assistant-note')}
            ${!t.pending && (t.error || t.cancelled || r?.status === "limited" && !r.answer?.length) ? `<button type="button" data-retry="${i}" ${busy ? "disabled" : ""}>Thử lại câu hỏi</button>` : ""}
            ${r?.answer?.length ? `<button type="button" data-copy="${i}">${this.copied === i ? "Đã sao chép" : "Sao chép"}</button>` : ""}
            ${r?.generatedAt ? `<small class="assistant-meta">${esc(time(r.generatedAt))}</small>` : ""}
          </div></div>`;
      })
      .join("");
    const welcome = `<div class="assistant-msg bot"><span class="assistant-avatar" aria-hidden="true">🩺</span><div class="assistant-bubble">
      <p>Chào bác sĩ. Tôi đọc <strong>hồ sơ của bệnh nhân đang chọn</strong> và trả lời kèm nguồn trích dẫn để bác sĩ đối chiếu.</p>
      ${record ? "" : "<p>Chưa chọn hồ sơ: bác sĩ vẫn có thể hỏi chung, tôi trả lời từ tài liệu hướng dẫn của hệ thống.</p>"}
      <p>Tôi không chẩn đoán hay kê đơn thay bác sĩ.</p></div></div>`;
    this.root.innerHTML = `<div class="assistant ${this.open ? "open" : ""}">
      <button type="button" class="assistant-fab" data-assistant-toggle aria-expanded="${this.open}" aria-controls="assistantPanel">
        <span aria-hidden="true">🩺</span><span class="assistant-fab-label">Trợ lý bác sĩ</span>${!this.open && this.turns.length ? `<span class="assistant-dot" aria-label="Có hội thoại"></span>` : ""}
      </button>
      <section id="assistantPanel" class="assistant-panel" role="complementary" aria-label="Trợ lý bác sĩ" ${this.open ? "" : "hidden"}>
        <div class="assistant-resize" data-assistant-resize title="Kéo để đổi độ rộng" aria-hidden="true"></div>
        <header class="assistant-head">
          <span class="assistant-avatar" aria-hidden="true">🩺</span>
          <div><strong>Trợ lý bác sĩ</strong><small>Đọc hồ sơ · có trích nguồn</small></div>
          <button type="button" data-clear title="Bắt đầu hội thoại mới" ${!this.turns.length && !this.draft ? "disabled" : ""}>↺</button>
          <button type="button" data-assistant-close title="Thu nhỏ">✕</button>
        </header>
        <div class="assistant-context ${record ? "" : "warn"}">
          ${this.context.patient ? `<span>Đang hỏi về</span><strong>${esc(this.label || "Bệnh nhân đã chọn")}</strong>` : "<strong>Chưa chọn bệnh nhân · đang hỏi chung</strong>"}
          ${missing ? `<p>${esc(missing[0])}</p>${this.navigate ? `<button type="button" data-assistant-go="${missing[1]}" data-assistant-action="${missing[2] || ""}">${esc(missing[3])} →</button>` : ""}` : ""}
        </div>
        <div class="assistant-messages" aria-live="polite">
          ${welcome}${turns}
          ${this.error ? `<div class="assistant-error" role="alert">${esc(this.error)}</div>` : ""}
        </div>
        ${this.source ? `<div class="assistant-source" aria-label="Đối chiếu nguồn hồ sơ"><div class="assistant-source-head"><strong>📎 ${esc(this.source.label || "Nguồn trong hồ sơ")}</strong><button type="button" data-source-close>Đóng</button></div><div class="assistant-source-body">${this.sourcePending ? '<p role="status">Đang mở bản ghi…</p>' : this.sourceError ? `<p role="alert">${esc(this.sourceError)}</p><button type="button" data-source-retry>Thử mở lại</button>` : this.sourceRecord ? displayResult(readingFields(this.sourceRecord), { ...RESULT_LABELS, ...this.options.labels, text: "Nội dung ghi nhận", items: "Nội dung" }) : ""}</div></div>` : ""}
        ${ready && !busy ? `<div class="assistant-suggestions">${(record ? SUGGESTIONS : GENERAL_SUGGESTIONS).map(([icon, label, q]) => `<button type="button" data-ask="${esc(q)}">${icon} ${esc(label)}</button>`).join("")}</div>` : ""}
        <form data-chat class="assistant-input">
          <textarea name="message" rows="1" maxlength="1000" placeholder="${record ? "Hỏi về hồ sơ… (Enter để gửi)" : "Hỏi chung, hoặc chọn bệnh nhân để hỏi về hồ sơ…"}" aria-label="Câu hỏi cho trợ lý" ${!ready || busy ? "disabled" : ""}>${esc(this.draft)}</textarea>
          ${busy ? '<button type="button" data-stop aria-label="Dừng chờ phản hồi">■</button>' : `<button class="primary" aria-label="Gửi câu hỏi" ${!ready ? "disabled" : ""}>➤</button>`}
        </form>
        <p class="assistant-disclaimer">Chỉ để tham khảo. Bác sĩ chịu trách nhiệm quyết định lâm sàng.</p>
      </section>
    </div>`;
    this.bind();
    const input = this.root.querySelector("[data-chat] textarea");
    if (focused && !input.disabled) { input.focus({ preventScroll: true }); if (selection) input.setSelectionRange(...selection); }
    const list = this.root.querySelector(".assistant-messages");
    list.scrollTop = this.followEnd || atEnd ? list.scrollHeight : oldScroll;
    this.followEnd = false;
  }
  bind() {
    const root = this.root;
    const toggle = (open) => {
      this.open = open;
      this.draw();
      if (open) root.querySelector(".assistant-input textarea:not([disabled])")?.focus();
      else root.querySelector("[data-assistant-toggle]")?.focus();
    };
    root.querySelector("[data-assistant-toggle]").onclick = () => toggle(!this.open);
    root.querySelector("[data-assistant-close]").onclick = () => toggle(false);
    root.querySelector(".assistant-panel").onkeydown = (e) => {
      if (e.key === "Escape") toggle(false);
    };
    // Drag the left edge to resize; the width lives on :root so re-renders keep it.
    const handle = root.querySelector("[data-assistant-resize]");
    handle.onpointerdown = (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("dragging");
      document.body.classList.add("assistant-resizing");
      handle.onpointermove = (ev) => applyWidth(window.innerWidth - ev.clientX);
      handle.onpointerup = handle.onpointercancel = () => {
        handle.onpointermove = handle.onpointerup = handle.onpointercancel = null;
        handle.classList.remove("dragging");
        document.body.classList.remove("assistant-resizing");
        try {
          localStorage.setItem(WIDTH_KEY, parseInt(getComputedStyle(document.documentElement).getPropertyValue("--assistant-w")));
        } catch {}
      };
    };
    handle.ondblclick = () => {
      document.documentElement.style.removeProperty("--assistant-w");
      try { localStorage.removeItem(WIDTH_KEY); } catch {}
    };
    root.querySelector("[data-clear]").onclick = () => {
      this.controller?.abort();
      this.key = null;
      this.draft = "";
      this.mount(this.root, this.persona, this.context, this.options);
    };
    root.querySelector("[data-assistant-go]")?.addEventListener("click", (e) => {
      const { assistantGo, assistantAction } = e.currentTarget.dataset;
      // On phones the panel is full-screen: get out of the way so the list can be used.
      if (window.matchMedia("(max-width: 600px)").matches) this.open = false;
      this.navigate?.(assistantGo, assistantAction || null);
      this.draw();
    });
    root.querySelector("[data-source-close]")?.addEventListener("click", () => {
      this.sourceController?.abort(); this.sourceVersion++;
      this.source = null;
      this.draw();
    });
    root.querySelector("[data-source-retry]")?.addEventListener("click", () => this.openSource(this.source, this.sourceExcerpt));
    root.querySelector("[data-stop]")?.addEventListener("click", () => this.stop());
    for (const b of root.querySelectorAll("[data-retry]")) b.onclick = () => this.ask(this.turns[Number(b.dataset.retry)].question, Number(b.dataset.retry));
    for (const b of root.querySelectorAll("[data-copy]")) b.onclick = () => this.copy(Number(b.dataset.copy));
    for (const b of root.querySelectorAll("[data-ask]")) b.onclick = () => this.send(b.dataset.ask);
    for (const b of root.querySelectorAll("[data-source]"))
      b.onclick = () => {
        const [i, j, k] = b.dataset.source.split(",").map(Number);
        this.openSource(this.turns[i].result.answer[j].sources[k], this.turns[i].result.answer[j].text);
      };
    const form = root.querySelector("[data-chat]");
    const input = form.elements.message;
    const grow = () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 140) + "px";
    };
    input.oninput = () => {
      this.draft = input.value;
      grow();
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      this.send(input.value);
    };
    grow();
  }
  send(question) {
    if (!question?.trim() || this.pending) return;
    this.draft = "";
    this.source = null;
    this.ask(question).then(() => {
      if (this.open) this.root?.querySelector(".assistant-input textarea:not([disabled])")?.focus();
    });
  }
}
