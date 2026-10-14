import { BackendClient, esc } from "@vinshc/core";
import { AgentChat } from "./agent-chat.js";
const client=new BackendClient(), chat=new AgentChat(client);
let session=null, visits=[], visit=null, error='', record=null, generation=0;
const root=document.querySelector('#portal-app');
function render() {
  root.innerHTML=`<header><a href="/">VinSHC</a><h1>Hồ sơ của tôi</h1>${session ? '<button id="portalLogout">Đăng xuất</button>' : '<a href="/connected.html">Đăng nhập nhân viên</a>'}</header>
    <p class="error" role="alert">${esc(error)}</p>${!session ? `<form id="portalLogin" class="panel"><label>Tên đăng nhập<input name="username" autocomplete="username" required></label><label>Mật khẩu<input type="password" name="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button></form>` : `<section class="panel"><h2>Các lần khám đã được công bố</h2>${visits.length ? `<label>Lần khám<select id="portalVisit">${visits.map(v=>`<option value="${esc(v.uuid)}" ${v.uuid===visit ? 'selected' : ''}>${esc(new Date(v.startDatetime).toLocaleString('vi-VN'))} · ${esc(v.facilityName)}</option>`).join('')}</select></label><button id="portalRead">Xem dữ liệu đã công bố</button>` : '<p>Chưa có hồ sơ được phòng khám công bố. Lịch hẹn chỉ hiển thị khi có bản công bố được duyệt.</p>'}
    ${record ? `<h3>Lời dặn</h3>${record.instructions.items.map(i=>`<p>${esc(i.label)}: ${esc(i.text)}</p>`).join('') || '<p>Chưa có lời dặn.</p>'}<h3>Đơn thuốc đã công bố</h3>${record.prescriptions.results.map(m=>`<p>${esc(m.drugName)} ${esc(m.strength||'')} · ${esc(m.dose||'Chưa ghi liều')} · ${esc(m.frequency||'Chưa ghi số lần dùng')} · ${esc(m.instructions||'Chưa ghi hướng dẫn thêm')} · ${esc(m.status)}</p>`).join('') || '<p>Chưa có đơn thuốc.</p>'}<h3>Kết quả CLS đã duyệt</h3>${record.results.results.map(r=>`<p>${esc(r.serviceName)} · ${esc(r.numericValue ?? r.textValue ?? '')} ${esc(r.unit || '')} · ${esc(r.state)} · bản ${esc(r.version)}</p>`).join('') || '<p>Chưa có kết quả CLS được công bố.</p>'}` : ''}</section><div id="patientChat"></div>`}`;
  document.querySelector('#portalLogin')?.addEventListener('submit',async e=>{
    e.preventDefault();const data=new FormData(e.target);const button=e.target.querySelector('button');button.disabled=true;
    try {await client.login(data.get('username'),data.get('password'));session=await client.request('vinshc/portal/session',{scoped:false});await loadVisits();error='';}
    catch(ex){client.clear();session=null;error=ex.message;}finally{render();}
  });
  document.querySelector('#portalLogout')?.addEventListener('click',()=>{generation++;chat.clear();client.clear();session=null;visits=[];record=null;visit=null;error='';render();});
  document.querySelector('#portalVisit')?.addEventListener('change',e=>{generation++;visit=e.target.value;record=null;render();});
  document.querySelector('#portalRead')?.addEventListener('click',readVisit);
  if(session) chat.mount(document.querySelector('#patientChat'),'patient',{visit});
}
async function loadVisits(){const data=await client.request('vinshc/portal/visits',{scoped:false});visits=data.results;visit=visits[0]?.uuid||null;}
async function readVisit(){
  const selected=visit,token=generation;
  try {const [instructions,prescriptions,results]=await Promise.all([client.request(`vinshc/portal/visits/${selected}/instructions`,{scoped:false}),client.request(`vinshc/portal/prescriptions?visit=${selected}`,{scoped:false}),client.request(`vinshc/portal/results?visit=${selected}`,{scoped:false})]);
    if(token===generation && selected===visit){record={instructions,prescriptions,results};error='';render();}}
  catch(ex){if(token===generation){error=ex.message;if(ex.status===401){session=null;chat.clear();}render();}}
}
render();
