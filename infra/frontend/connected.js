import './clear-demo.js';
import {fieldPolicies} from './additional-actions.js';
import {BackendClient,BackendError,isSystemAdministrator,uuid,vitalsPayload,VITAL_LIMITS} from './backend-client.js';
import {metadata as m,assignedRoles,permitted,active,facilityForLocation} from './metadata.js';
import {actions,sections,consultationFields,F,choice,id,options,LABELS,stateText} from './connected-actions.js';
import {VITAL_FIELD_MAP} from './backend-mapping.js';
const client=new BackendClient();
const state={roles:[],role:null,facility:null,section:null,action:null,result:null,context:{},error:'',message:'',busy:false,workspace:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const allowed=a=>(!a.systemOnly||isSystemAdministrator(client.user))&&(a.resource==='clinical_chart'&&a.permission!=='read'?state.role==='doctor':permitted(state.role,a.resource,a.permission));
const visibleSections=()=>sections.filter(s=>s.actions.some(k=>allowed(actions[k]))||permitted(state.role,s.resource,'read')||s.id==='pharmacy'&&state.role==='pharmacy');
const note=text=>`<p class="connection-note">${esc(text)}</p>`;
function field(f,values={}){
 const value=values[f.name]??f.value??(f.type==='datetime-local'&&f.required?localTime():f.type==='date'&&f.required?today():state.context[f.name]||'');
 const common=`name="${esc(f.name)}" ${f.required?'required':''} ${f.max?'maxlength="'+f.max+'"':''}`;
 let control;
 if(f.type==='select')control=`<select ${common}><option value="">${f.required?'Chọn…':'Chưa ghi nhận'}</option>${f.options.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
 else if(f.type==='textarea')control=`<textarea ${common} rows="3">${esc(value)}</textarea>`;
 else control=`<input ${common} type="${f.type==='uuid'?'text':f.type}" ${f.type==='file'?'accept="application/pdf,image/jpeg,image/png"':'value="'+esc(value)+'"'} ${f.type==='uuid'?'pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" spellcheck="false"':''} ${f.min!==undefined?'min="'+f.min+'"':''} ${f.type==='number'&&f.max!==undefined?'max="'+f.max+'"':''} ${f.step?'step="'+f.step+'"':''}>`;
 return `<label>${esc(f.label)}${f.required?' *':''}${control}</label>`;
}
function shell(content){
 document.querySelector('#app').innerHTML=`<a class="skip-link" href="#main-content">Đến nội dung chính</a><header class="site-header clinic-header"><a class="site-brand" href="/"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>KHÔNG GIAN OPENMRS</small></span></a><div class="header-controls">${state.workspace?`<span class="account-badge"><strong>${esc(client.user?.display)}</strong><small>${esc(m.permissions.roles[state.role].label)} · Đã kết nối</small></span><button id="switchWorkspace" ${state.busy?'disabled':''}>Đổi vai trò/cơ sở</button><button id="logout" ${state.busy?'disabled':''}>Đăng xuất</button>`:'<a href="/">Về trang chủ</a>'}</div></header>${content}`;
 document.querySelector('#logout')?.addEventListener('click',logout);
 document.querySelector('#switchWorkspace')?.addEventListener('click',()=>{state.workspace=false;state.result=null;state.context={};retries.clear();state.error='';state.message='';state.busy=false;client.generation++;client.workspace=null;render();});
}
function render(){
 if(!client.user){shell(`<main id="main-content" class="connection-login"><section class="panel form-card"><span class="eyebrow">VINSHC / OPENMRS LOCAL</span><h1>Đăng nhập phòng khám</h1><p>Dùng tài khoản OpenMRS đã được phân công vai trò và cơ sở.</p>${note('Môi trường kiểm thử · danh mục hiện chưa được duyệt cho sử dụng lâm sàng. Hồ sơ và thao tác chỉ được đọc/ghi qua backend.')}<form id="loginForm">${field(F('username','Tên đăng nhập'))}<label>Mật khẩu *<input name="password" type="password" autocomplete="current-password" required></label><p class="error" role="alert">${esc(state.error)}</p><button class="primary" ${state.busy?'disabled':''}>${state.busy?'Đang kết nối…':'Đăng nhập OpenMRS'}</button></form></section></main>`);document.querySelector('#loginForm').onsubmit=login;return;}
 if(!state.workspace){
  shell(`<main id="main-content" class="connection-login"><section class="panel form-card"><h1>Chọn không gian làm việc</h1><p>${esc(client.user.display)} · Vai trò được lấy từ tài khoản, cơ sở được server kiểm tra khi mở.</p>${state.roles.length?`<form id="workspaceForm">${field(choice('role','Vai trò',state.roles.map(r=>[r,m.permissions.roles[r].label])),{role:state.role})}${field(choice('facility','Cơ sở',active(m.facilities.records).map(f=>[f.locationUuid,f.name])),{facility:state.facility})}<button class="primary" ${state.busy?'disabled':''}>${state.busy?'Đang xác nhận…':'Mở không gian làm việc'}</button></form>`:note('Tài khoản chưa có vai trò VinSHC App. Cần quản trị backend gán role và workspace; FE không tự cấp quyền.')}<p class="error" role="alert">${esc(state.error)}</p><button id="systemSetup" ${state.busy?'disabled':''}>Kiểm tra kết nối và cấu hình backend</button><section id="setupResult" aria-live="polite">${state.result?displayResult(state.result):''}</section><button id="logout">Đăng xuất</button></section></main>`);
  document.querySelector('#logout').onclick=logout;document.querySelector('#systemSetup').onclick=inspectSetup;document.querySelector('#workspaceForm')?.addEventListener('submit',openWorkspace);return;
 }
 const available=visibleSections();if(!available.some(s=>s.id===state.section))state.section=available[0]?.id;
 const current=available.find(s=>s.id===state.section);
 shell(`<main class="clinic-main"><aside class="clinic-sidebar"><div class="sidebar-label">${esc(m.permissions.roles[state.role].label)}</div>${available.map(s=>`<button data-section="${s.id}" class="${state.section===s.id?'active':''}" ${state.busy?'disabled':''}>${esc(s.title)}</button>`).join('')}<div class="sidebar-note"><span class="dot"></span> OpenMRS local<small>${esc(facilityForLocation(state.facility)?.name)}<br>Metadata ${esc(m.map.version)} · Dữ liệu kiểm thử</small></div></aside><div id="main-content" class="content connected-content"><div class="page-heading"><span class="eyebrow">VINSHC / KHÔNG GIAN KẾT NỐI</span><h1>${esc(current?.title||'Không có chức năng được cấp')}</h1></div>${note('Môi trường kiểm thử. Thao tác ghi sẽ lưu lên OpenMRS và được kiểm tra theo vai trò, cơ sở hiện tại.')}${current?.note?note(current.note):''}<p id="connectionError" class="error" role="alert">${esc(state.error)}</p><p id="connectionMessage" class="connection-success" role="status">${esc(state.message)}</p>${current?sectionContent(current):''}<section id="backendResult" class="panel result-panel" aria-live="polite">${state.result?`<h2>Kết quả từ OpenMRS</h2>${actions[state.action]?.document?'<button id="printDocument">In chứng từ</button>':''}${displayResult(state.result)}`:'<p class="readonly">Chọn thao tác để đọc hoặc ghi dữ liệu backend.</p>'}</section></div></main>`);
 document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{state.section=b.dataset.section;state.action=null;state.result=null;state.error='';state.message='';render();});
 document.querySelector('#actionPicker')?.addEventListener('change',e=>{state.action=e.target.value;state.error='';state.message='';state.result=null;render();});
 document.querySelector('#actionForm')?.addEventListener('submit',submitAction);
 document.querySelector('#vitalsForm')?.addEventListener('submit',submitVitals);
 document.querySelector('#printDocument')?.addEventListener('click',()=>window.print());
 if(actions[state.action]?.address)loadProvinces();
 if(['fieldState','clearFieldState'].includes(state.action)){
  const form=document.querySelector('#actionForm'),code=form.elements.fieldCode;
  const sync=()=>{const policy=fieldPolicies.find(f=>f.code===code.value),row=form.elements.rowKey;row.required=Boolean(policy?.rowKeyRequired);row.disabled=!policy?.rowKeyRequired;if(row.disabled)row.value='';
   const status=form.elements.dataStatus;if(status){const old=status.value;status.innerHTML='<option value="">Chọn…</option>'+(policy?.allowedStates||[]).map(v=>`<option value="${esc(v)}">${esc(stateText(v))}</option>`).join('');if(policy?.allowedStates.includes(old))status.value=old;}
  };code.onchange=sync;sync();
 }
}
function sectionContent(section){
 if(section.id==='vitals')return vitalsForm();
 const choices=section.actions.filter(k=>allowed(actions[k]));if(!choices.length)return '';
 if(!choices.includes(state.action))state.action=choices[0];
 const a=actions[state.action];
 return `<section class="panel form-card">${field(choice('actionPicker','Thao tác',choices.map(k=>[k,actions[k].title])),{actionPicker:state.action}).replace('name="actionPicker"','id="actionPicker"')}<h2>${esc(a.title)}</h2>${a.notice?note(a.notice):''}<form id="actionForm"><div class="form-grid">${a.fields.map(f=>field(f,formValues())).join('')}</div>${state.action==='correction'?note('Các trường đang hiển thị được lấy từ phiếu đã đọc. Để trống trường đã có nghĩa là xóa trường đó. Nhập lý do cho bản đính chính.'):''}<div class="form-actions"><button class="primary" ${state.busy?'disabled':''}>${state.busy?'Đang xử lý…':a.method==='GET'?'Đọc từ OpenMRS':'Xác nhận gửi OpenMRS'}</button></div></form></section>`;
}
function formValues(){return state.action==='correction'?state.context.consultationValues||{}:{};}
function vitalsForm(){
 const canWrite=permitted(state.role,'vitals','create');
 if(!canWrite)return note('Backend hiện chưa có API đọc các lần đo sinh hiệu dành riêng cho workspace. Vai trò hiện tại không được ghi sinh hiệu.');
 const missing=[['','Chưa ghi'],['unknown','Không rõ'],['not_asked','Chưa hỏi'],['refused','Từ chối'],['not_applicable','Không áp dụng'],['unreadable','Không đọc được']];
 return `<section class="panel form-card"><h2>Ghi lần đo sinh hiệu</h2>${note('Để trống chỉ số chưa ghi. Khi thiếu một vế huyết áp, chọn trạng thái thiếu tương ứng. Tâm thu ≤ tâm trương vẫn gửi để backend lưu cờ cần đối chiếu, không tự sửa số đo.')}<form id="vitalsForm"><div class="form-grid">${field(id('patient','Mã bệnh nhân (UUID)'))}${field(id('encounter','Mã encounter sinh hiệu (UUID)'))}${field(F('measuredAt','Thời điểm đo','datetime-local'))}${VITAL_FIELD_MAP.map(f=>`${field(F(f.key,f.label+' ('+f.unit+')','number',{required:false,min:VITAL_LIMITS[f.key][0],max:VITAL_LIMITS[f.key][1],step:'any'}))}${field(choice(f.key+'State','Trạng thái thiếu · '+f.label,missing,{required:false}))}`).join('')}</div><div class="form-actions"><button class="primary" ${state.busy?'disabled':''}>${state.busy?'Đang lưu…':'Lưu sinh hiệu lên OpenMRS'}</button></div></form></section>`;
}
async function inspectSetup(){
 if(state.busy)return;state.busy=true;state.error='';render();
 try{state.result=await client.request('vinshc/operations/configuration',{scoped:false});}
 catch(error){state.error=error.message;}finally{state.busy=false;render();}
}
async function login(e){
 e.preventDefault();const f=new FormData(e.target);state.busy=true;state.error='';render();
 try{const session=await client.login(f.get('username'),f.get('password'));state.roles=assignedRoles(session.user);state.role=state.roles[0]||null;state.facility=active(m.facilities.records)[0]?.locationUuid;}
 catch(error){state.error=error.message;}finally{f.delete('password');state.busy=false;render();}
}
async function openWorkspace(e){
 e.preventDefault();const f=new FormData(e.target);state.busy=true;state.error='';render();
 try{const role=f.get('role'),facility=uuid(f.get('facility'));if(!state.roles.includes(role))throw new BackendError('Vai trò không thuộc tài khoản.');await client.selectWorkspace(role,facility);state.role=role;state.facility=facility;state.workspace=true;state.section=null;state.action=null;state.result=null;state.context={};}
 catch(error){state.error=error.message;}finally{state.busy=false;render();}
}
function logout(){client.clear();retries.clear();Object.assign(state,{roles:[],role:null,facility:null,section:null,action:null,result:null,context:{},workspace:false,error:'',message:'',busy:false});render();}
// Keep an uncertain transaction's key for an identical manual retry; never auto-retry a write.
const retries=new Map();
async function submitAction(e){
 e.preventDefault();if(state.busy)return;const a=actions[state.action];if(!a||!allowed(a))return;
 const data=Object.fromEntries(new FormData(e.target));
 try{
  for(const f of a.fields){if(data[f.name]===undefined)continue;if(f.type==='file')continue;data[f.name]=data[f.name].trim();if(f.type==='uuid'&&data[f.name])data[f.name]=uuid(data[f.name]);if(data[f.name]===''&&!f.required)delete data[f.name];}
  if(a.facility){const facility=facilityForLocation(state.facility);if(!facility)throw new BackendError('Cơ sở chưa có trong metadata.');data.facility=facility.uuid;}
  if(a.address&&(data.provinceCode||data.communeCode)){if(!state.context.catalogueVersion)throw new BackendError('Chưa đọc được phiên bản danh mục địa chỉ từ backend.');data.catalogueVersion=state.context.catalogueVersion;}
  if(state.action==='revokeWorkspace'&&data.user===client.user.uuid&&data.role===state.role&&data.facility===state.facility)throw new BackendError('Đổi workspace trước khi thu hồi phân công đang sử dụng.');
  let payload=a.build?a.build(data):undefined;
  if(a.upload){const file=data.file;if(!file?.size||file.size>20*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw new BackendError('Chọn PDF/JPEG/PNG có dung lượng tối đa 20 MiB.');payload=new FormData();payload.set('file',file);}
  if(state.action==='correction'){
   if(!state.context.group||data.group!==state.context.group)throw new BackendError('Đọc hồ sơ lần khám trước, rồi đính chính đúng mã phiếu đã đọc.');
   for(const f of consultationFields)if(state.context.consultationValues?.[f.name]&&!payload.values[f.name])payload.values[f.name]=null;
  }
  const path=(a.adminCore?'':'vinshc/')+a.path(data);
  const fingerprint=JSON.stringify([client.workspace,state.action,path,payload]);
  if(a.idempotent){if(!retries.has(fingerprint))retries.set(fingerprint,crypto.randomUUID());payload.idempotencyKey=retries.get(fingerprint);}
  await perform(async()=>{
   if(a.grantRole){const user=await client.request(path+'?v=custom:(uuid,retired,roles:(uuid,name))',{adminCore:true});if(user.retired)throw new BackendError('Tài khoản đã ngừng hoạt động.');payload={roles:[...new Set([...user.roles.map(r=>r.uuid),m.permissions.roles[data.role].openmrs.uuid])]};}
   return client.request(path,{method:a.method||'POST',body:payload,binary:a.binary,adminCore:a.adminCore});
  },a.method==='GET'?'Đã đọc dữ liệu từ OpenMRS.':'OpenMRS đã xác nhận thao tác.',result=>{
   result=result||{};
   if(a.idempotent)retries.delete(fingerprint);
   if(a.binary){const href=URL.createObjectURL(result),link=document.createElement('a');link.href=href;link.download='vinshc-report-'+data.record;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);state.result={message:'Đã tải tệp từ OpenMRS.'};}
   if(a.document)state.message='Đã lấy chứng từ từ OpenMRS. Dùng nút In chứng từ để in nội dung đã nhận.';
   for(const k of ['patient','encounter','visit','orderer'])if(data[k])state.context[k]=data[k];
   if(result.patientUuid)state.context.patient=result.patientUuid;
   if(result.encounterUuid)state.context.encounter=result.encounterUuid;
   if(result.visitUuid)state.context.visit=result.visitUuid;
   if(Object.hasOwn(result,'consultation')&&!result.consultation){delete state.context.group;delete state.context.consultationValues;}
   if(result.consultation){state.context.group=result.consultation.groupUuid;state.context.consultationValues=result.consultation.values;}
   if(result.groupUuid){state.context.group=result.groupUuid;state.context.consultationValues=result.values;}
  });
 }catch(error){showError(error);}
}
async function submitVitals(e){
 e.preventDefault();if(state.busy||!permitted(state.role,'vitals','create'))return;
 try{const data=Object.fromEntries(new FormData(e.target)),payload=vitalsPayload(data.patient,data.encounter,data,VITAL_FIELD_MAP);await perform(()=>client.request('vinshc/vitals',{method:'POST',body:payload}),'OpenMRS đã lưu lần đo sinh hiệu.',result=>{if(result.needsVerification)state.message='Đã lưu sinh hiệu. Backend đánh dấu cần đối chiếu huyết áp; kiểm tra lại số đo.';});}catch(error){showError(error);}
}
async function perform(task,message,onSuccess){
 state.busy=true;state.error='';state.message='';
 // Disable controls without replacing the form: failed requests preserve the user's input.
 document.querySelectorAll('button,select').forEach(el=>el.disabled=true);
 try{const result=await task();state.result=result;state.message=message;onSuccess?.(result);state.busy=false;render();}
 catch(error){state.busy=false;showError(error);}finally{document.querySelectorAll('button,select').forEach(el=>el.disabled=false);}
}
function showError(error){
 state.error=error.message;
 if(!client.user){state.workspace=false;state.result=null;state.context={};state.roles=[];retries.clear();render();return;}
 const target=document.querySelector('#connectionError');if(target)target.textContent=state.error;else render();
}
async function loadProvinces(){
 const form=document.querySelector('#actionForm'),generation=client.generation;
 const province=form?.elements.provinceCode,commune=form?.elements.communeCode;if(!province||province.options.length>1)return;
 try{
  const [rows,config]=await Promise.all([client.request('vinshc/address-catalogue'),client.request('vinshc/configuration-status')]);if(generation!==client.generation||!form.isConnected)return;
  state.context.catalogueVersion=config.catalogueVersion;setCatalogue(province,rows);province.onchange=async()=>{
   const selected=province.value;commune.innerHTML='<option value="">Chọn xã/phường…</option>';if(!selected)return;
   try{const rows=await client.request('vinshc/address-catalogue?'+new URLSearchParams({parentCode:selected}));if(generation===client.generation&&form.isConnected&&province.value===selected)setCatalogue(commune,rows);}catch(error){showError(error);}
  };
 }catch(error){showError(error);}
}
function setCatalogue(select,rows){select.innerHTML='<option value="">Chọn…</option>'+rows.map(r=>`<option value="${esc(r.code)}">${esc(r.name||r.label||r.code)}</option>`).join('');}
const resultLabels={userUuid:'Mã tài khoản',roleName:'Tên role',roles:'Các role',username:'Tên đăng nhập',systemId:'Mã hệ thống',retired:'Ngừng hoạt động',role:'Vai trò',privilege:'Quyền',resource:'Nghiệp vụ',allowed:'Được phép',uuid:'Mã bản ghi',patientUuid:'Mã bệnh nhân',encounterUuid:'Mã lần khám',visitUuid:'Mã lượt khám',groupUuid:'Mã phiếu khám',status:'Trạng thái',state:'Trạng thái',contacts:'Người liên hệ',addresses:'Địa chỉ',fieldStates:'Trạng thái thông tin',consultation:'Phiếu khám',values:'Nội dung',diagnoses:'Chẩn đoán',drugOrders:'Đơn thuốc',allergies:'Dị ứng',events:'Lịch sử thay đổi',needsVerification:'Cần đối chiếu',totalVnd:'Tổng phí (VND)',settledVnd:'Đã thu (VND)',refundedVnd:'Đã hoàn (VND)',outstandingVnd:'Còn phải thu (VND)',netCollectedVnd:'Thu ròng (VND)',amountVnd:'Số tiền (VND)',grossVnd:'Tổng thu (VND)',refundVnd:'Hoàn tiền (VND)',netVnd:'Thu ròng (VND)',openedVisits:'Lượt mở',completedVisits:'Lượt hoàn tất',aggregateOnly:'Chỉ số tổng hợp',serviceName:'Dịch vụ',serviceCode:'Mã dịch vụ',lines:'Chi tiết phí',payments:'Giao dịch',queueNumber:'Số thứ tự',point:'Điểm phục vụ',config:'Quy trình',results:'Kết quả',numericValue:'Kết quả số',textValue:'Kết quả văn bản',unit:'Đơn vị',version:'Phiên bản',recordedAt:'Thời điểm ghi',reviewedAt:'Thời điểm duyệt',full_name:'Họ tên',phone_raw:'Điện thoại nguyên văn',phone_e164:'Điện thoại chuẩn hóa',address_text:'Địa chỉ nguyên văn',province_name:'Tỉnh/thành',commune_name:'Xã/phường',legacy_address_text:'Địa chỉ cũ',relationship_name:'Quan hệ',source_kind:'Nguồn',version_number:'Phiên bản',row_key:'Mã bản ghi',recorded_at:'Thời điểm ghi',method:'Phương thức',reason:'Lý do',testOnly:'Chỉ dùng kiểm thử',productionUploadEnabled:'Upload production',workflowConfigs:'Quy trình',date:'Ngày',timezone:'Múi giờ',currency:'Tiền tệ',display:'Tên hiển thị',name:'Tên',code:'Mã',concept:'Danh mục',rank:'Loại chẩn đoán',certainty:'Mức chắc chắn',icd10Code:'Mã ICD-10',icd10Name:'Tên chẩn đoán',stateReason:'Lý do trạng thái',assignedProviderUuid:'Người được phân công',is_current:'Phiên bản hiện hành',data_status:'Trạng thái thông tin',field_code:'Trường thông tin',createdAt:'Thời điểm tạo',at:'Thời điểm',action:'Thao tác',byUserUuid:'Người thao tác',members:'Các chỉ số đã lưu',billUuid:'Mã phiếu phí',orderUuid:'Mã chỉ định',orderer:'Người kê',drug:'Thuốc',dose:'Liều mỗi lần',quantity:'Số lượng',facilityUuid:'Cơ sở nghiệp vụ',facilityLocationUuid:'Location cơ sở'};
function displayResult(value,depth=0){
 if(value===null||value===undefined)return '<span class="readonly">Chưa ghi nhận</span>';
 if(typeof value!=='object')return esc(typeof value==='boolean'?(value?'Có':'Không'):stateText(value));
 if(Array.isArray(value))return value.length?`<div class="result-list">${value.map(v=>`<article>${displayResult(v,depth+1)}</article>`).join('')}</div>`:'<p class="readonly">Chưa có bản ghi.</p>';
 return `<dl class="result-fields">${Object.entries(value).filter(([k])=>!['memberUuids','packSha256','upstreamBoundaries','adapterStrategy'].includes(k)).map(([k,v])=>`<div><dt>${esc(LABELS[k]||resultLabels[k]||k)}</dt><dd>${typeof v==='number'&&/Vnd$/.test(k)?esc(new Intl.NumberFormat('vi-VN').format(v)):displayResult(v,depth+1)}</dd></div>`).join('')}</dl>`;
}
window.addEventListener('pageshow',event=>{if(event.persisted)logout();});
window.addEventListener('pagehide',()=>{client.clear();retries.clear();state.context={};state.result=null;});
render();
