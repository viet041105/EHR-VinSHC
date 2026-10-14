import { BackendClient, esc } from "@vinshc/core";
import { AgentChat } from "./agent-chat.js";
const client=new BackendClient(), chat=new AgentChat(client);
let session=null, visits=[], visit=null, error='', record=null, generation=0;
let loading=false, more=false, offset=0;
const PAGE_SIZE=20;
const clearPatientContext=()=>{generation++;chat.clear();client.clear();session=null;visits=[];visit=null;record=null;more=false;offset=0;loading=false;};
const root=document.querySelector('#portal-app');
function render() {
  root.innerHTML=`<header><a href="/">VinSHC</a><h1>Hồ sơ của tôi</h1>${session ? '<button id="portalLogout">Đăng xuất</button>' : '<a href="/connected.html">Đăng nhập nhân viên</a>'}</header>
    <p class="error" role="alert">${esc(error)}</p>${!session ? `<form id="portalLogin" class="panel"><label>Tên đăng nhập<input name="username" autocomplete="username" required></label><label>Mật khẩu<input type="password" name="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button></form>` : `<section class="panel"><h2>Các lần khám đã được công bố</h2>${visits.length ? `<label>Lần khám<select id="portalVisit">${visits.map(v=>`<option value="${esc(v.uuid)}" ${v.uuid===visit ? 'selected' : ''}>${esc(new Date(v.startDatetime).toLocaleString('vi-VN'))} · ${esc(v.facilityName)} · bản ${esc(v.version)} · công bố ${esc(new Date(v.publishedAt).toLocaleString('vi-VN'))}</option>`).join('')}</select></label><button id="portalRead" type="button">Xem dữ liệu đã công bố</button>` : '<p>Chưa có hồ sơ được phòng khám công bố. Lịch hẹn chỉ hiển thị khi có bản công bố được duyệt.</p>'}
    ${session ? `<nav aria-label="Phân trang lượt khám"><button id="previousVisits" ${offset===0||loading?'disabled':''}>Trang trước</button><span>Trang ${Math.floor(offset/PAGE_SIZE)+1}</span><button id="nextVisits" ${!more||loading?'disabled':''}>Trang sau</button></nav><form id="portalPassword"><h3>Đổi mật khẩu</h3><label>Mật khẩu hiện tại<input type="password" name="currentPassword" required autocomplete="current-password"></label><label>Mật khẩu mới<input type="password" name="newPassword" minlength="12" required autocomplete="new-password"></label><button type="submit">Đổi mật khẩu</button></form>` : ''}
    ${loading ? '<p role="status">Đang tải dữ liệu đã công bố…</p>' : ''}
    ${record ? `<h3>Lời dặn</h3>${record.instructions.items.map(i=>`<p>${esc(i.label)}: ${esc(i.text)}</p>`).join('') || '<p>Chưa có lời dặn.</p>'}<h3>Đơn thuốc đã công bố</h3>${record.prescriptions.results.map(m=>`<p>${esc(m.drugName)} ${esc(m.strength||'')} · ${esc(m.dose||'Chưa ghi liều')} · ${esc(m.frequency||'Chưa ghi số lần dùng')} · ${esc(m.instructions||'Chưa ghi hướng dẫn thêm')} · ${esc(m.status)}</p>`).join('') || '<p>Chưa có đơn thuốc.</p>'}<h3>Kết quả CLS đã duyệt</h3>${record.results.results.map(r=>`<p>${esc(r.serviceName)} · ${esc(r.numericValue ?? r.textValue ?? '')} ${esc(r.unit || '')} · ${esc(r.state)} · bản ${esc(r.version)}</p>`).join('') || '<p>Chưa có kết quả CLS được công bố.</p>'}` : ''}</section><div id="patientChat"></div>`}`;
  document.querySelector('#portalLogin')?.addEventListener('submit',async e=>{
    e.preventDefault();const data=new FormData(e.target);const button=e.target.querySelector('button');button.disabled=true;
    clearPatientContext();const attempt=generation;loading=true;
    try {await client.login(data.get('username'),data.get('password'));const identity=await client.request('vinshc/portal/me',{scoped:false});
      if(attempt!==generation)return;
      session=identity;await loadVisits();error='';}
    catch(ex){clearPatientContext();error=ex.status===403?'Tài khoản bệnh nhân chưa được xác minh, đã bị thu hồi hoặc đang bị khóa. Liên hệ cơ sở khám.':ex.message;}
    finally{loading=false;render();}
  });
  document.querySelector('#portalLogout')?.addEventListener('click',()=>{clearPatientContext();error='';render();});
  document.querySelector('#portalVisit')?.addEventListener('change',e=>{generation++;visit=e.target.value;record=null;render();});
  document.querySelector('#portalRead')?.addEventListener('click',readVisit);
  document.querySelector('#previousVisits')?.addEventListener('click',()=>pageVisits(Math.max(0,offset-PAGE_SIZE)));
  document.querySelector('#nextVisits')?.addEventListener('click',()=>{if(more)pageVisits(offset+PAGE_SIZE);});
  document.querySelector('#portalPassword')?.addEventListener('submit',changePassword);
  if(session) chat.mount(document.querySelector('#patientChat'),'patient',{visit});
}
async function loadVisits(){const data=await client.request(`vinshc/portal/visits?limit=${PAGE_SIZE}&offset=${offset}`,{scoped:false});visits=data.results;more=!!data.hasMore;visit=visits[0]?.uuid||null;}
async function pageVisits(next){const token=++generation;offset=next;record=null;loading=true;render();
  try{await loadVisits();if(token!==generation)return;error='';}
  catch(ex){if(token!==generation)return;error=ex.message;}
  finally{if(token===generation){loading=false;render();}}
}
async function changePassword(event){event.preventDefault();const data=new FormData(event.target);const token=generation;loading=true;render();
  try{await client.request('vinshc/portal/password',{method:'POST',scoped:false,body:{currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')}});
    if(token!==generation)return;clearPatientContext();error='Đã đổi mật khẩu. Vui lòng đăng nhập lại.';}
  catch(ex){if(token!==generation)return;error=ex.message;}
  finally{loading=false;render();}
}
async function readVisit(){
  const selected=visit,token=generation;
  loading=true;render();
  try {const [instructions,prescriptions,results]=await Promise.all([client.request(`vinshc/portal/visits/${selected}/instructions`,{scoped:false}),client.request(`vinshc/portal/prescriptions?visit=${selected}`,{scoped:false}),client.request(`vinshc/portal/results?visit=${selected}`,{scoped:false})]);
    if(token===generation && selected===visit){record={instructions,prescriptions,results};error='';render();}}
  catch(ex){if(token===generation){error=ex.message;if(ex.status===401||ex.status===403)clearPatientContext();}}
  finally{if(token===generation){loading=false;render();}}
}
render();
