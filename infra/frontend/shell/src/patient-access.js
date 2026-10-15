import { esc, isSystemAdministrator, usernameProblem, passwordRules } from '@vinshc/core';
import { userError } from './page-design.js';

const BASE='vinshc/patient-access/requests';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES={patient_account_create:'Tạo tài khoản bệnh nhân',patient_password_reset:'Đặt lại mật khẩu bệnh nhân'};
const STATES={pending:'Chờ xử lý',fulfilled:'Đã xử lý',rejected:'Đã từ chối'};
const waiting='Chờ kết nối máy chủ. Backend chưa hỗ trợ lưu và chuyển yêu cầu tài khoản bệnh nhân.';
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('vi-VN'):'';
export const validAccessRequest=row=>!!row&&ID.test(row.uuid)&&ID.test(row.patientUuid)&&Object.hasOwn(TYPES,row.type)&&Object.hasOwn(STATES,row.status);

// View state is session-only. A successful GET must explicitly advertise each allowed write.
export class PatientAccess {
  constructor(client,onError){this.client=client;this.onError=onError;this.reset();}
  reset(){this.serial=(this.serial||0)+1;this.detailSerial=(this.detailSerial||0)+1;this.closeDoctor();this.rows=[];this.host=null;this.key=null;this.capabilities={};this.status='idle';this.busy=false;this.error='';this.message='';this.selected=null;this.filter='pending';this.more=false;this.pendingRequest=null;}
  session(){return JSON.stringify([this.client.generation,this.client.workspace]);}
  activate(){const key=this.session();if(this.key!==key){this.reset();this.key=key;}return key;}
  current(key){return this.key===key&&this.session()===key&&!!this.client.user;}
  mountAdmin(host){
    this.activate();this.host=host;this.paintAdmin();
    if(this.status==='idle')this.load();
  }
  async load(more=false){
    if(this.busy||!this.client.user)return;
    const key=this.key,serial=++this.serial,offset=more?this.rows.length:0,patientScope=this.doctor?this.patient.patientUuid:null;this.busy=true;this.error='';if(!more)this.status='loading';this.paintAdmin();this.paintDoctor();
    this.detailSerial++;
    try{
      const data=await this.client.request(`${BASE}?status=${encodeURIComponent(this.doctor?'':this.filter)}${this.doctor?'&patientUuid='+encodeURIComponent(this.patient.patientUuid):''}&limit=20&offset=${offset}`);
      if(!this.current(key)||serial!==this.serial)return;
      if(this.doctor&&patientScope!==this.patient.patientUuid)return;
      if(!Array.isArray(data?.results)||!data.results.every(validAccessRequest)||!data.capabilities||typeof data.capabilities!=='object')throw new Error('unsupported');
      this.rows=more?[...this.rows,...data.results]:data.results;this.more=!!data.hasMore;this.capabilities=data.capabilities;this.status='ready';
      if(this.selected){this.selected=this.rows.find(r=>r.uuid===this.selected.uuid)||null;}
    }catch(error){
      if(!this.current(key)||serial!==this.serial){if(error.status===401&&this.key===key){this.reset();this.onError(error);}return;}
      this.capabilities={};this.rows=[];this.more=false;this.selected=null;
      this.status=[404,405,501].includes(error.status)||error.message==='unsupported'?'waiting':error.status===403?'forbidden':'error';
      if(error.status===401){this.reset();this.onError(error);return;}
    }finally{if(this.current(key)&&serial===this.serial){this.busy=false;if(this.doctor&&patientScope!==this.patient.patientUuid){this.rows=[];this.capabilities={};this.load();return;}this.paintAdmin();this.paintDoctor();if(this.pendingRequest){const id=this.pendingRequest;this.pendingRequest=null;this.showRequest(id);}}}
  }
  statusText(){return {idle:waiting,loading:'Đang kiểm tra kết nối…',waiting,forbidden:'Tài khoản này chưa có quyền xử lý yêu cầu bệnh nhân.',error:'Chưa tải được yêu cầu. Vui lòng thử lại.'}[this.status]||'';}
  openDoctor(patient){
    if(!ID.test(patient?.patientUuid)||!ID.test(patient?.visitUuid))return;
    this.activate();this.closeDoctor();this.patient={...patient};this.draft={type:'patient_account_create',note:''};this.requestKey=crypto.randomUUID();this.sent=false;this.doctorError='';
    this.doctor=document.createElement('dialog');this.doctor.className='patient-access-dialog';this.doctor.setAttribute('aria-labelledby','access-dialog-title');document.body.append(this.doctor);
    const dialog=this.doctor;
    dialog.addEventListener('close',()=>{dialog.remove();if(this.doctor===dialog){this.doctor=null;this.patient=null;this.draft=null;}});
    this.paintDoctor();this.doctor.showModal();this.status='idle';this.capabilities={};this.rows=[];this.load();
  }
  closeDoctor(){this.doctor?.close();this.doctor?.remove();this.doctor=null;this.patient=null;this.draft=null;}
  async showRequest(id){
    if(!ID.test(id)||!this.key)return;
    if(this.busy){this.pendingRequest=id;return;}
    const key=this.key,serial=++this.detailSerial;
    try{
      const data=await this.client.request(`${BASE}/${encodeURIComponent(id)}`);
      if(!this.current(key)||serial!==this.detailSerial)return;
      if(!validAccessRequest(data)||data.uuid!==id)throw new Error('Chưa tìm được yêu cầu này. Thử làm mới danh sách.');
      // Read permission does not grant the right to fulfill or reject; capabilities come from the list API.
      this.selected=data;this.fulfillKey=crypto.randomUUID();this.paintAdmin();
    }catch(error){if(error.status===401&&this.key===key){this.reset();this.onError(error);return;}if(this.current(key)&&serial===this.detailSerial){this.error=userError(error);this.paintAdmin();}}
  }
  paintDoctor(){
    if(!this.doctor?.isConnected)return;
    const form=this.doctor.querySelector('form');if(form&&!this.sent)this.draft={type:form.elements.type.value,note:form.elements.note.value};
    const prior=this.rows.find(r=>r.patientUuid===this.patient.patientUuid&&r.type===this.draft.type&&(r.status==='pending'||(this.draft.type==='patient_account_create'&&r.status==='fulfilled')));
    const canSend=this.status==='ready'&&this.capabilities.request===true&&!this.busy&&!this.sent&&!prior;
    const creating=this.draft.type==='patient_account_create';
    this.doctor.innerHTML=`<div class="access-dialog-heading"><h2 id="access-dialog-title">${creating?'Yêu cầu tạo tài khoản':'Yêu cầu đặt lại mật khẩu'}</h2><button type="button" data-access-close aria-label="Đóng yêu cầu">×</button></div>
      <p><strong>${esc(this.patient.name||'Người bệnh đang khám')}</strong></p>
      <p>${creating?'Quản trị sẽ tạo tài khoản cho hồ sơ người bệnh này.':'Quản trị sẽ hỗ trợ mật khẩu cho tài khoản của người bệnh này.'}</p>
      ${this.sent?'<p class="connection-success" role="status">Đã gửi yêu cầu đến quản trị. Bạn sẽ nhận thông báo khi yêu cầu được xử lý.</p>':prior?`<p class="access-availability" role="status">${prior.status==='pending'?'Đã có yêu cầu đang chờ quản trị xử lý.':'Yêu cầu này đã được quản trị xử lý.'}</p>`:''}
      ${!this.sent&&!prior?`<form id="patientAccessRequest"><input type="hidden" name="type" value="${this.draft.type}">
      <label>Ghi chú (không bắt buộc)<textarea name="note" maxlength="1000" rows="2" placeholder="Thông tin cần quản trị lưu ý…">${esc(this.draft.note)}</textarea></label>
      ${this.status!=='ready'?`<p class="access-availability" role="status">${this.statusText()}</p>`:this.capabilities.request!==true?'<p class="access-availability" role="status">Tài khoản hiện chưa được phép gửi yêu cầu.</p>':''}
      <p class="error" role="alert">${esc(this.doctorError||'')}</p><div class="access-actions"><button type="button" data-access-retry ${this.busy?'disabled':''}>Tải lại</button><button class="primary" type="submit" ${canSend?'':'disabled'}>${this.busy?'Đang tải…':'Gửi quản trị'}</button></div></form>`:''}
      <button type="button" class="access-secondary" data-access-type ${this.busy?'disabled':''}>${creating?'Người bệnh cần đặt lại mật khẩu?':'Yêu cầu tạo tài khoản mới'}</button>`;
    this.doctor.querySelector('[data-access-close]').onclick=()=>this.closeDoctor();
    this.doctor.querySelector('[data-access-retry]')?.addEventListener('click',()=>this.load());
    this.doctor.querySelector('[data-access-type]').onclick=()=>{this.draft.type=creating?'patient_password_reset':'patient_account_create';this.sent=false;this.requestKey=crypto.randomUUID();const input=this.doctor.querySelector('[name=type]');if(input)input.value=this.draft.type;this.paintDoctor();};
    this.doctor.querySelector('form')?.addEventListener('submit',e=>this.sendDoctor(e));
  }
  async sendDoctor(event){
    event.preventDefault();if(this.busy||this.sent||this.capabilities.request!==true||this.status!=='ready')return;
    const key=this.key,patient=this.patient,dialog=this.doctor,d=new FormData(event.target);
    if(!Object.hasOwn(TYPES,d.get('type')))return;
    this.busy=true;this.doctorError='';this.paintDoctor();
    try{
      const result=await this.client.request(BASE,{method:'POST',body:{type:d.get('type'),patientUuid:patient.patientUuid,visitUuid:patient.visitUuid,note:d.get('note'),idempotencyKey:this.requestKey}});
      if(!this.current(key)||this.doctor!==dialog)return;
      if(!validAccessRequest(result)||result.patientUuid!==patient.patientUuid||result.type!==d.get('type'))throw new Error('Chưa xác nhận được yêu cầu. Kiểm tra lại danh sách trước khi gửi tiếp.');
      this.sent=true;this.rows=[result,...this.rows.filter(r=>r.uuid!==result.uuid)];
    }catch(error){if(error.status===401&&this.key===key){this.reset();this.onError(error);return;}if(this.current(key)&&this.doctor===dialog)this.doctorError=userError(error);}
    finally{if(this.current(key)){this.busy=false;if(this.doctor===dialog)this.paintDoctor();}}
  }
  paintAdmin(){
    if(!this.host?.isConnected)return;
    const r=this.selected,system=isSystemAdministrator(this.client.user);
    // Background console renders never retain a password. Actions are always explicit submissions.
    this.host.innerHTML=`<section class="panel patient-access-admin"><div class="workspace-heading"><div><h2>Yêu cầu tài khoản người bệnh</h2><p>Bác sĩ gửi hồ sơ cần cấp tài khoản. Chọn yêu cầu để tạo và bàn giao thông tin đăng nhập cho người bệnh.</p></div><button type="button" data-access-refresh ${this.busy?'disabled':''}>Làm mới</button></div><label>Trạng thái<select data-access-filter ${this.busy?'disabled':''}>${Object.entries(STATES).map(([v,l])=>`<option value="${v}" ${v===this.filter?'selected':''}>${l}</option>`).join('')}</select></label>${this.message?`<p class="connection-success" role="status">${esc(this.message)}</p>`:''}${this.error?`<p class="error" role="alert">${esc(this.error)}</p>`:''}${this.status!=='ready'?`<p class="access-availability" role="status">${this.statusText()}</p>`:this.rows.length?`<ul class="access-request-list">${this.rows.map((row,i)=>`<li><div><strong>${esc(row.patientName||'Người bệnh')}</strong><p>${esc(TYPES[row.type])} · ${STATES[row.status]}</p><small>${esc(row.requesterName||'Nhân viên phòng khám')} · ${esc(date(row.createdAt))}</small></div><button type="button" data-access-select="${i}" ${this.busy?'disabled':''}>${row.status==='pending'?(row.type==='patient_account_create'?'Tạo tài khoản':'Đặt lại mật khẩu'):'Xem yêu cầu'}</button></li>`).join('')}</ul>`:'<p class="section-empty">Chưa có yêu cầu ở trạng thái này.</p>'}${this.more?`<button type="button" data-access-more ${this.busy?'disabled':''}>Tải thêm</button>`:''}${r?`<section class="access-request-detail"><h3>${esc(TYPES[r.type])} · ${esc(r.patientName||'Người bệnh')}</h3><p>Người gửi: ${esc(r.requesterName||'Nhân viên phòng khám')}</p>${r.note?`<p>${esc(r.note)}</p>`:''}${r.reason?`<p>Lý do: ${esc(r.reason)}</p>`:''}${r.status==='pending'?`<p>Tạo cho đúng hồ sơ do bác sĩ chuyển. Bàn giao mật khẩu riêng cho người bệnh.</p>${!system?'<p class="access-availability">Cần quyền quản trị hệ thống để cấp hoặc đặt lại tài khoản.</p>':''}<form id="accessFulfill"><fieldset ${!system||this.capabilities.fulfill!==true||this.busy?'disabled':''}><legend>${TYPES[r.type]}</legend>${r.type==='patient_account_create'?'<label>Tên đăng nhập<input name="username" required autocomplete="off" maxlength="50"></label>':''}<label>Mật khẩu mới<input type="password" name="password" required minlength="12" maxlength="256" autocomplete="new-password"></label><label>Nhập lại mật khẩu<input type="password" name="confirmation" required minlength="12" autocomplete="new-password"></label><label class="access-confirm"><input type="checkbox" name="patientConfirmed" required> Tôi đã đối chiếu đúng hồ sơ người bệnh do bác sĩ chuyển.</label><button class="primary">${r.type==='patient_account_create'?'Tạo tài khoản':'Đặt lại mật khẩu'}</button></fieldset></form><form id="accessReject"><fieldset ${!system||this.capabilities.reject!==true||this.busy?'disabled':''}><legend>Từ chối yêu cầu</legend><label>Lý do<textarea name="reason" required maxlength="1000"></textarea></label><button>Từ chối yêu cầu</button></fieldset></form>`:`<p>${STATES[r.status]}</p>`}</section>`:''}</section>`;
    this.host.querySelector('[data-access-refresh]').onclick=()=>{this.message='';this.load();};
    this.host.querySelector('[data-access-filter]').onchange=e=>{this.filter=e.target.value;this.selected=null;this.message='';this.load();};
    this.host.querySelector('[data-access-more]')?.addEventListener('click',()=>this.load(true));
    this.host.querySelectorAll('[data-access-select]').forEach(b=>b.onclick=()=>{this.detailSerial++;this.selected=this.rows[Number(b.dataset.accessSelect)];this.fulfillKey=crypto.randomUUID();this.error='';this.paintAdmin();});
    this.host.querySelector('#accessFulfill')?.addEventListener('submit',e=>this.process(e,'fulfill'));
    this.host.querySelector('#accessReject')?.addEventListener('submit',e=>this.process(e,'reject'));
  }
  async process(event,action){
    event.preventDefault();const r=this.selected,key=this.key;
    if(!isSystemAdministrator(this.client.user)||this.busy||r?.status!=='pending'||this.capabilities[action]!==true)return;
    const data=new FormData(event.target),body=action==='reject'?{reason:String(data.get('reason')||'').trim()}:{username:data.get('username')||undefined,password:data.get('password'),verificationMethod:data.get('patientConfirmed')==='on'?'verified_clinic_record':undefined,idempotencyKey:this.fulfillKey};
    const problem=action==='fulfill'?(body.password!==data.get('confirmation')?'Hai lần nhập mật khẩu chưa khớp.':passwordRules(body.password)|| (body.password.length<12?'Dùng ít nhất 12 ký tự.':'') ||(r.type==='patient_account_create'?usernameProblem(body.username||''):'')||(data.get('patientConfirmed')!=='on'?'Xác nhận đã đối chiếu đúng hồ sơ người bệnh.':'')):!body.reason?'Nhập lý do từ chối.':'';
    if(problem){this.error=problem;this.paintAdmin();return;}
    event.target.reset();this.busy=true;this.error='';this.message='';this.paintAdmin();
    try{
      const result=await this.client.request(`${BASE}/${encodeURIComponent(r.uuid)}/${action}`,{method:'POST',body});
      if(!this.current(key))return;
      if(!validAccessRequest(result)||result.uuid!==r.uuid||result.status!==(action==='fulfill'?'fulfilled':'rejected'))throw new Error('Chưa xác nhận được kết quả. Làm mới danh sách để kiểm tra trước khi xử lý lại.');
      this.message=action==='fulfill'?(r.type==='patient_account_create'?'Đã tạo tài khoản '+(result.username||'cho người bệnh')+'. Bàn giao thông tin đăng nhập riêng cho người bệnh.':'Đã đặt lại mật khẩu. Bàn giao mật khẩu mới riêng cho người bệnh.'):'Đã từ chối yêu cầu.';
      this.selected=null;this.busy=false;await this.load();
    }catch(error){if(error.status===401&&this.key===key){this.reset();this.onError(error);return;}if(this.current(key))this.error=userError(error);}
    finally{data.delete('password');data.delete('confirmation');delete body.password;if(this.current(key)){this.busy=false;this.paintAdmin();}}
  }
}
