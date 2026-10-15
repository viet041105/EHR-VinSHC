import { BackendClient, BackendError, esc, stateText } from '@vinshc/core';
import { AgentChat } from './agent-chat.js';
import { userError } from './page-design.js';
import { NotificationBell } from './notifications.js';
const client = new BackendClient(), chat = new AgentChat(client);
const root = document.querySelector('#portal-app'), PAGE_SIZE = 20;
const notifications = new NotificationBell(client, ex => {clearPatientContext();error=userError(ex);render();}, openNotification);
let session = null, visits = [], visit = null, record = null, generation = 0;
let loading = false, more = false, offset = 0, error = '', message = '', tab = 'instructions';
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)) : 'Chưa ghi thời điểm';
function clearPatientContext() {
  generation++; notifications.clear(); chat.clear(); client.clear(); session=null; visits=[]; visit=null; record=null;
  more=false; offset=0; loading=false; tab='instructions';
}
function recordContent() {
  if (!record) return `<div class="portal-empty"><strong>${visits.length?'Chọn lần khám để xem hồ sơ':'Chưa có hồ sơ được công bố'}</strong><p>${visits.length?'Bấm Xem hồ sơ để tải lời dặn, đơn thuốc và kết quả đã được duyệt.':'Phòng khám sẽ công bố hồ sơ sau khi kiểm tra. Liên hệ cơ sở nếu bạn cần hỗ trợ.'}</p></div>`;
  const tabs=[['instructions','Lời dặn'],['prescriptions','Đơn thuốc'],['results','Kết quả kiểm tra']];
  const content = tab==='instructions'
    ? record.instructions.items.map(i=>`<article class="portal-record"><h3>${esc(i.label||'Lời dặn của phòng khám')}</h3><p>${esc(i.text)}</p></article>`).join('')||'<p class="section-empty">Lần khám này chưa có lời dặn được công bố.</p>'
    : tab==='prescriptions'
      ? record.prescriptions.results.map(m=>`<article class="portal-record"><div class="workspace-heading"><h3>${esc([m.drugName,m.strength].filter(Boolean).join(' '))}</h3><span class="row-status">${esc(stateText(m.status||'Chưa ghi trạng thái'))}</span></div><dl class="portal-medication"><div><dt>Liều dùng</dt><dd>${esc([m.dose,m.doseUnits].filter(v=>v!=null&&v!=='').join(' ')||'Chưa ghi liều')}</dd></div><div><dt>Số lần dùng</dt><dd>${esc(m.frequency||'Chưa ghi số lần dùng')}</dd></div></dl><p>${esc(m.instructions||'Chưa ghi hướng dẫn thêm. Liên hệ phòng khám nếu cần làm rõ cách dùng.')}</p></article>`).join('')||'<p class="section-empty">Lần khám này chưa có đơn thuốc được công bố.</p>'
      : record.results.results.map(r=>`<article class="portal-record"><div class="workspace-heading"><h3>${esc(r.serviceName||'Kết quả kiểm tra')}</h3><span class="row-status">${esc(stateText(r.state||'Chưa ghi trạng thái'))}</span></div><p class="portal-result-value">${esc(r.numericValue??r.textValue??'Chưa ghi kết quả')} ${esc(r.unit||'')}</p>${r.version!=null?`<small>Bản công bố ${esc(r.version)}</small>`:''}</article>`).join('')||'<p class="section-empty">Lần khám này chưa có kết quả đã duyệt được công bố.</p>';
  return `<div class="portal-tabs" role="tablist" aria-label="Nội dung hồ sơ">${tabs.map(([key,label])=>`<button type="button" role="tab" data-portal-tab="${key}" aria-selected="${tab===key}" aria-controls="portalRecordBody" id="portal-tab-${key}">${label}</button>`).join('')}</div><section id="portalRecordBody" role="tabpanel" aria-labelledby="portal-tab-${tab}">${content}</section>`;
}
function render() {
  const selected=visits.find(v=>v.uuid===visit);
  root.innerHTML=`<header class="portal-header"><a class="site-brand" href="/"><span class="logo-plus">✚</span><span><strong>VinSHC</strong><small>HỒ SƠ CÁ NHÂN</small></span></a><div class="portal-header-controls">${session?`<div id="portalNotifications"></div><span class="portal-user">${esc(client.user?.display||'Tài khoản của bạn')}</span><button id="portalLogout">Đăng xuất</button>`:'<a href="/connected.html">Dành cho nhân viên</a>'}</div></header>
  <div class="portal-heading"><span class="eyebrow">CỔNG NGƯỜI BỆNH</span><h1>Hồ sơ của tôi</h1><p>${session?'Xem thông tin được phòng khám công bố cho bạn, theo từng lần khám.':'Đăng nhập bằng tài khoản được phòng khám cấp để xem hồ sơ đã công bố.'}</p></div>
  <p id="portalError" class="error" role="alert">${esc(error)}</p><p class="connection-success" role="status">${esc(message)}</p>
  ${!session?`<div class="portal-login-layout"><section class="panel portal-login-card"><nav class="login-personas" aria-label="Chọn cổng đăng nhập"><a href="/connected.html">Nhân viên</a><span aria-current="page">Người bệnh</span></nav><h2>Đăng nhập người bệnh</h2><form id="portalLogin"><label>Tên đăng nhập<input name="username" autocomplete="username" required></label><label>Mật khẩu<input type="password" name="password" autocomplete="current-password" required></label><label class="show-password"><input type="checkbox" id="portalShowPassword">Hiện mật khẩu</label><button class="primary" ${loading?'disabled':''}>${loading?'Đang đăng nhập…':'Đăng nhập'}</button></form><p class="portal-support">Chưa có tài khoản hoặc quên mật khẩu?<br>Liên hệ cơ sở đã khám để được hỗ trợ.</p></section><aside class="portal-welcome"><h2>Bạn có thể xem những gì?</h2><ol><li>Lời dặn sau buổi khám</li><li>Đơn thuốc đã được công bố</li><li>Kết quả kiểm tra đã duyệt</li></ol><p>Nội dung xuất hiện sau khi được phòng khám kiểm tra và công bố.</p></aside></div>`
  :`<div class="portal-layout"><aside class="portal-visit-sidebar"><section class="panel"><div class="workspace-heading"><h2>Chọn lần khám</h2><button type="button" id="portalReloadVisits" ${loading?'disabled':''}>Tải lại</button></div>${visits.length?`<label>Lần khám<select id="portalVisit" ${loading?'disabled':''}>${visits.map(v=>`<option value="${esc(v.uuid)}" ${v.uuid===visit?'selected':''}>${esc(date(v.startDatetime))} · ${esc(v.facilityName||'Cơ sở khám')}</option>`).join('')}</select></label><div class="portal-publication"><strong>${esc(selected?.facilityName||'Cơ sở khám')}</strong><small>Ngày khám: ${esc(date(selected?.startDatetime))}</small>${selected?.version!=null?`<small>Bản công bố: ${esc(selected.version)}</small>`:''}${selected?.publishedAt?`<small>Công bố ngày ${esc(date(selected.publishedAt))}</small>`:''}</div><button id="portalRead" type="button" class="primary" ${loading?'disabled':''}>${loading?'Đang tải…':'Xem hồ sơ'}</button>`:'<p>Chưa có lần khám được công bố trong trang này.</p>'}<nav class="portal-pagination" aria-label="Phân trang lượt khám"><button id="previousVisits" ${offset===0||loading?'disabled':''}>Trang trước</button><span>Trang ${Math.floor(offset/PAGE_SIZE)+1}</span><button id="nextVisits" ${!more||loading?'disabled':''}>Trang sau</button></nav></section><details class="panel portal-password"><summary>Đổi mật khẩu</summary><form id="portalPassword"><label>Mật khẩu hiện tại<input type="password" name="currentPassword" required autocomplete="current-password"></label><label>Mật khẩu mới<input type="password" name="newPassword" minlength="12" required autocomplete="new-password"></label><small>Dùng ít nhất 12 ký tự theo chính sách của phòng khám.</small><label>Nhập lại mật khẩu mới<input type="password" name="confirmPassword" minlength="12" required autocomplete="new-password"></label><button type="submit" ${loading?'disabled':''}>Đổi mật khẩu</button></form></details></aside><div class="portal-record-column"><section class="panel portal-record-panel" aria-busy="${loading}">${loading?'<p class="list-loading" role="status">Đang tải hồ sơ đã công bố…</p>':recordContent()}</section><div id="patientChat"></div></div></div>`}`;
  root.querySelector('#portalLogin')?.addEventListener('submit',login);
  root.querySelector('#portalShowPassword')?.addEventListener('change',e=>{root.querySelector('[name=password]').type=e.target.checked?'text':'password';});
  root.querySelector('#portalLogout')?.addEventListener('click',()=>{clearPatientContext();error='';message='';render();});
  root.querySelector('#portalVisit')?.addEventListener('change',e=>{generation++;visit=e.target.value;record=null;error='';tab='instructions';render();});
  root.querySelector('#portalRead')?.addEventListener('click',readVisit);
  root.querySelector('#portalReloadVisits')?.addEventListener('click',()=>pageVisits(offset));
  root.querySelector('#previousVisits')?.addEventListener('click',()=>pageVisits(Math.max(0,offset-PAGE_SIZE)));
  root.querySelector('#nextVisits')?.addEventListener('click',()=>{if(more)pageVisits(offset+PAGE_SIZE);});
  root.querySelector('#portalPassword')?.addEventListener('submit',changePassword);
  root.querySelectorAll('[data-portal-tab]').forEach(button=>button.onclick=()=>{tab=button.dataset.portalTab;render();});
  if(session) notifications.mount(root.querySelector('#portalNotifications'),'patient');
  else notifications.clear();
  if(session) chat.mount(root.querySelector('#patientChat'),'patient',{visit},{visitLabel:selected?`${date(selected.startDatetime)} · ${selected.facilityName||'Cơ sở khám'}`:''});
}
async function openNotification(target) {
  if(!session||loading||target.kind!=='portal_visit')return;
  const token=++generation;loading=true;record=null;error='';render();
  try {
    const item=await client.request('vinshc/portal/visits/'+target.visitUuid,{scoped:false});
    if(token!==generation)return;
    if(item?.uuid!==target.visitUuid)throw new BackendError('Chưa mở được lần khám này.');
    if(!visits.some(v=>v.uuid===item.uuid))visits=[item,...visits];
    visit=item.uuid;loading=false;await readVisit();
  }catch(ex){if(token===generation){error=userError(ex);if([401,403].includes(ex.status))clearPatientContext();}}
  finally{if(token===generation){loading=false;render();}}
}
async function login(event) {
  event.preventDefault();const data=new FormData(event.target);
  clearPatientContext();const token=generation;loading=true;error='';message='';event.target.querySelector('button').disabled=true;
  try {
    await client.login(data.get('username'),data.get('password'));
    const identity=await client.request('vinshc/portal/me',{scoped:false});if(token!==generation)return;
    session=identity;await loadVisits(token);
  } catch(ex) {if(token!==generation)return;clearPatientContext();error=ex.status===403?'Tài khoản chưa được xác minh hoặc đã bị khóa. Liên hệ cơ sở khám để kiểm tra.':userError(ex);render();}
  finally {data.delete('password');if(token===generation){loading=false;render();}}
}
async function loadVisits(token) {
  const data=await client.request(`vinshc/portal/visits?limit=${PAGE_SIZE}&offset=${offset}`,{scoped:false});if(token!==generation)return;
  if(!Array.isArray(data.results))throw new BackendError('Chưa nhận được danh sách lần khám hợp lệ. Vui lòng thử lại.');
  visits=data.results;more=!!data.hasMore;visit=visits[0]?.uuid||null;
}
async function pageVisits(next) {
  if(loading)return;const token=++generation;offset=next;record=null;visits=[];visit=null;loading=true;error='';render();
  try {await loadVisits(token);}catch(ex){if(token===generation){error=userError(ex);if([401,403].includes(ex.status)){clearPatientContext();render();}}}
  finally {if(token===generation){loading=false;render();}}
}
async function changePassword(event) {
  event.preventDefault();if(loading)return;const data=new FormData(event.target),token=generation;
  if(data.get('newPassword')!==data.get('confirmPassword')){error='Hai lần nhập mật khẩu mới chưa khớp. Kiểm tra lại.';root.querySelector('#portalError').textContent=error;return;}
  loading=true;error='';event.target.querySelector('button').disabled=true;
  try {await client.request('vinshc/portal/password',{method:'POST',scoped:false,body:{currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')}});if(token!==generation)return;clearPatientContext();message='Đã đổi mật khẩu. Vui lòng đăng nhập lại.';render();}
  catch(ex){if(token===generation){error=userError(ex);if([401,403].includes(ex.status)){clearPatientContext();render();}}}
  finally {for(const key of ['currentPassword','newPassword','confirmPassword'])data.delete(key);if(token===generation){loading=false;render();}}
}
async function readVisit() {
  if(!visit||loading)return;const selected=visit,token=generation;loading=true;record=null;error='';render();
  try {
    const [instructions,prescriptions,results]=await Promise.all([client.request(`vinshc/portal/visits/${selected}/instructions`,{scoped:false}),client.request(`vinshc/portal/prescriptions?visit=${selected}`,{scoped:false}),client.request(`vinshc/portal/results?visit=${selected}`,{scoped:false})]);
    if(token===generation&&selected===visit){if(![instructions.items,prescriptions.results,results.results].every(Array.isArray))throw new BackendError('Chưa nhận được hồ sơ hợp lệ. Vui lòng thử tải lại.');record={instructions,prescriptions,results};tab='instructions';}
  } catch(ex){if(token===generation){error=userError(ex);if([401,403].includes(ex.status)){clearPatientContext();render();}}}
  finally {if(token===generation){loading=false;render();}}
}
window.addEventListener('pagehide',clearPatientContext);
window.addEventListener('pageshow',event=>{if(event.persisted){clearPatientContext();render();}});
render();
