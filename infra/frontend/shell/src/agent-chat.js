import { displayResult } from "./result-view.js";
import { RESULT_LABELS } from "@vinshc/core";
import { esc } from "@vinshc/core";

export function chatContextKey(client, persona, context) {
  return JSON.stringify([client.generation,client.user?.uuid,persona,client.workspace?.role,client.workspace?.facility,
    context?.patient,context?.visit,context?.encounter]);
}
export class AgentChat {
  constructor(client) { this.client=client; this.key=null; this.version=0; this.history=[]; this.turns=[]; this.pending=false; }
  mount(root,persona,context={}) {
    const key=chatContextKey(this.client,persona,context);
    if(key!==this.key) {
      this.controller?.abort(); this.version++; this.key=key; this.history=[];this.turns=[];this.pending=false;this.source=null;this.error="";
    }
    this.root=root; this.persona=persona; this.context={...context}; this.draw();
  }
  clear() { this.controller?.abort();this.version++;this.key=null;this.history=[];this.turns=[];this.pending=false;this.root=null; }
  draw() {
    if(!this.root) return;
    const ready=this.persona==="patient" || (this.context.patient && this.context.encounter);
    this.root.innerHTML=`<section class="panel agent-chat"><h2>${this.persona==="doctor" ? "Trợ lý hồ sơ" : "Trợ lý hồ sơ của tôi"}</h2>
      <p>${this.persona==="doctor" ? "Chọn bệnh nhân và lần khám để hỏi hoặc tóm tắt." : "Hỏi về lời dặn, đơn thuốc đã công bố và lịch hẹn của bạn."}</p>
      ${this.persona==="doctor" ? `<button data-summary ${!ready||this.pending ? "disabled" : ""}>Tóm tắt lần khám</button>` : ""}
      <div class="agent-turns" aria-live="polite">${this.turns.map((t,i)=>`<article><p class="agent-question">${esc(t.question)}</p>${t.result.message ? `<p role="status">${esc(t.result.message)}</p>` : ""}
        ${t.result.answer.map((a,j)=>`<p class="agent-answer">${esc(a.text)}</p><div class="agent-sources">${a.sources.map((source,k)=>`<button data-source="${i},${j},${k}">${esc(source.label)} · xem nguồn</button>`).join("")}</div>`).join("")}
        ${t.result.missing.length ? `<details><summary>Thông tin thiếu hoặc chưa đọc được</summary><ul>${t.result.missing.map(m=>`<li>${esc(m.label)}: ${esc(m.detail)}</li>`).join("")}</ul></details>` : ""}
        ${t.result.notes.map(n=>`<p class="readonly">${esc(n)}</p>`).join("")}<small>${esc(t.result.disclaimer)} · ${esc(new Date(t.result.generatedAt).toLocaleString("vi-VN"))}</small></article>`).join("")}</div>
      <form data-chat><label>Câu hỏi<textarea name="message" rows="2" maxlength="1000" required ${!ready||this.pending ? "disabled" : ""}></textarea></label>
      <button class="primary" ${!ready||this.pending ? "disabled" : ""}>${this.pending ? "Đang đọc hồ sơ…" : "Gửi câu hỏi"}</button><button type="button" data-clear>Xóa hội thoại</button></form>
      <p class="error" role="alert">${esc(this.error||"")}</p>
      <details ${this.source ? "open" : ""}><summary>Nguồn hồ sơ</summary><div class="agent-source-record">${this.source ? displayResult(this.source, RESULT_LABELS) : "Chọn một nguồn để đối chiếu."}</div></details>
      </section>`;
    this.root.querySelector('[data-chat]').onsubmit=e=>{e.preventDefault();this.ask(new FormData(e.target).get('message'));};
    this.root.querySelector('[data-summary]')?.addEventListener('click',()=>this.ask('Tóm tắt lần khám này giúp tôi'));
    this.root.querySelector('[data-clear]').onclick=()=>{this.controller?.abort();this.key=null;this.mount(this.root,this.persona,this.context);};
    for(const button of this.root.querySelectorAll('[data-source]')) button.onclick=()=>{
      const [i,j,k]=button.dataset.source.split(',').map(Number);this.openSource(this.turns[i].result.answer[j].sources[k]);
    };
  }
  async ask(question) {
    if(this.pending || !question?.trim()) return;
    const key=this.key, version=this.version, generation=this.client.generation, context={...this.context}, persona=this.persona;
    const controller=new AbortController();this.controller=controller;this.pending=true;this.error='';this.draw();
    const body={message:question.trim(),history:this.history.slice(-12)};
    if(persona==='doctor') Object.assign(body,{patientUuid:context.patient,encounterUuid:context.encounter,visitUuid:context.visit||null});
    else if(context.visit) body.visitUuid=context.visit;
    try {
      const result=await this.client.chat(persona,body,{signal:controller.signal});
      if(version!==this.version || key!==this.key || generation!==this.client.generation) return;
      if(persona==='doctor' && (result.context?.patientUuid!==context.patient || result.context?.encounterUuid!==context.encounter || result.context?.facilityUuid!==this.client.workspace?.facility)) throw new Error('Phản hồi không khớp hồ sơ đang mở.');
      this.turns.push({question,result});this.turns=this.turns.slice(-6);
      const reply=result.answer.map(a=>a.text).join('\n') || result.message || 'Chưa có thông tin.';
      this.history.push({role:'user',text:question.slice(0,2000)},{role:'assistant',text:reply.slice(0,2000)});
    } catch(error) { if(version===this.version && key===this.key && !controller.signal.aborted) this.error=error.message; }
    finally { if(version===this.version && key===this.key) {this.pending=false;this.draw();} }
  }
  async openSource(source) {
    const key=this.key,version=this.version;let path;
    if(this.persona==='patient') {
      if(source.kind==='published_instruction') path=`vinshc/portal/visits/${source.uuid}/instructions`;
      else if(source.kind==='published_prescription') path='vinshc/portal/prescriptions';
      else if(source.kind==='appointment') path='vinshc/portal/appointments';
      else path='vinshc/portal/visits';
    } else {
      const encounter=source.encounterUuid || (source.kind==='encounter' ? source.uuid : this.context.encounter);
      if(source.kind==='result') path=`vinshc/operations/results/${source.uuid}`;
      else if(source.kind==='visit') path=`vinshc/visits/${source.uuid}`;
      else if(source.kind==='patient') path=`vinshc/patients/${this.context.patient}`;
      else if(source.kind==='allergy') path=`vinshc/allergy?patient=${this.context.patient}`;
      else if(source.kind==='vitals') path=`vinshc/vitals?patient=${this.context.patient}${source.visitUuid ? '&visit='+source.visitUuid : ''}`;
      else if(source.kind==='service_order') path=`vinshc/operations/service-orders/${source.uuid}`;
      else if(source.kind==='appointment') path=`vinshc/operations/appointments/${source.uuid}`;
      else path=`vinshc/encounter/${encounter}/clinical-summary`;
    }
    try {
      const result=await this.client.request(path,{scoped:this.persona==='doctor'});
      if(version===this.version && key===this.key) {this.source=result;this.draw();}
    } catch(error) {if(version===this.version && key===this.key){this.error=error.message;this.draw();}}
  }
}
