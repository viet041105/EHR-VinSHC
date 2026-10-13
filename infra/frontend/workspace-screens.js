import {metadata as m,permitted} from './metadata.js';
import {recordTypes} from './workspace-model.js';
import {F,id,choice} from './connected-actions.js';
import uiOptions from './metadata/ui-options.json' with {type:'json'};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=text=>`<span class="capability-badge pending">${esc(text||'Chờ backend')}</span>`;
const connected='<span class="capability-badge connected">Đã nối API</span>';
const money=value=>typeof value==='number'?new Intl.NumberFormat('vi-VN').format(value)+' ₫':'—';
const empty=(title,text)=>`<div class="workspace-empty"><span class="empty-symbol" aria-hidden="true">▤</span><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
const open=(section,action,label)=>`<button type="button" data-go-section="${section}" ${action?`data-go-action="${action}"`:''}>${esc(label)}</button>`;
const codeOptions=name=>uiOptions.codeLists[name].map(row=>[row.code,row.label]);
export function extraSections(role){
 return [
  {id:'overview',title:'Tổng quan công việc',actions:[]},
  ...(permitted(role,'patient_identity','read')?[{id:'patients',title:'Bệnh nhân',resource:'patient_identity',actions:[]}]:[]),
  ...(permitted(role,'visit','read')?[{id:'visits',title:'Lượt khám',resource:'visit',actions:[]}]:[]),
 ];
}
export function contextPanel({role,memory,field}){
 if(!permitted(role,'patient_identity','read'))return '';
 const canVisit=permitted(role,'visit','read')||permitted(role,'clinical_chart','read');
 const contextField=(key,label)=>field(id('care_'+key,label,false),{['care_'+key]:memory.context[key]||''});
 return `<details class="panel context-panel" ${memory.context.patient?'':'open'}><summary><span>Hồ sơ đang làm việc</span><small>${memory.context.patient?'Đã chọn mã bệnh nhân':'Chưa chọn bệnh nhân'}</small></summary><p class="readonly">Các mã được dùng chung cho biểu mẫu trong workspace này. Backend kiểm tra liên kết và quyền khi gửi.</p><form id="careContextForm"><div class="form-grid">${contextField('patient','Mã bệnh nhân (UUID)')}${canVisit?contextField('visit','Mã lượt khám (UUID)')+contextField('encounter','Mã encounter (UUID)'):''}</div><div class="form-actions"><button type="submit">Áp dụng mã hồ sơ</button><button type="button" id="clearCareContext">Bỏ chọn hồ sơ</button></div></form>${memory.context.patient?`<div class="context-links">${open('identity','identity','Đọc hành chính')}${permitted(role,'clinical_chart','read')&&memory.context.encounter?open('clinical','summary','Đọc hồ sơ lần khám'):''}</div>`:''}</details>`;
}
const pendingInfo={
 patients:'Tìm bệnh nhân theo tên, mã hồ sơ hoặc số điện thoại cần API dành cho workspace. Hiện có thể đọc hành chính bằng UUID đã có.',
 visits:'Danh sách, mở/kết thúc lượt và tạo encounter đang chờ API dành cho nhân viên.',
 appointments:'Danh sách lịch hẹn theo ngày và bác sĩ đang chờ API. Đặt lịch và đọc theo mã đã nối.',
 queue:'Danh sách hàng đợi theo điểm phục vụ đang chờ API. Cấp số và chuyển trạng thái theo mã đã nối.',
 billing:'Danh sách phiếu phí/giao dịch đang chờ API. Lập phiếu, thu/hoàn tiền và đọc theo mã đã nối.',
 orders:'Danh sách chỉ định/kết quả đang chờ API. Tạo, đọc theo mã, ghi kết quả và tệp đã nối.',
 vitals:'Lịch sử đo và sửa/hủy lần đo đang chờ API. Form ghi sinh hiệu đã nối.',
 pharmacy:'Danh sách đơn cần cấp, tồn kho và xác nhận cấp thuốc đang chờ backend.',
};
const sectionTypes={patients:['patient'],identity:['patient'],visits:['encounter'],clinical:['encounter','prescription'],appointments:['appointment'],queue:['queue'],billing:['bill','payment'],orders:['order','result','attachment'],pharmacy:['prescription']};
function recordTable(section,{memory,stateText}){
 const rows=memory.list(sectionTypes[section]||[]);
 return `<section class="panel workspace-records"><div class="workspace-heading"><div><h2>Bản ghi đã mở trong phiên</h2><p>Chỉ gồm phản hồi thật đã nhận trong workspace này; không phải danh sách toàn bộ từ server.</p></div><span class="session-count">${rows.length} bản ghi</span></div>${rows.length?`<label class="session-filter">Lọc các bản ghi đã mở<input id="sessionRecordFilter" type="search" placeholder="Mã, trạng thái, dịch vụ…" autocomplete="off"></label><div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Loại / mã</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows.map(row=>{
  const d=row.data,info=d.serviceName||d.original_name||d.queueNumber&&'Số '+d.queueNumber||d.patientUuid||d.billUuid||d.orderUuid||'Đã nhận từ backend';
  return `<tr data-session-record data-filter="${esc([row.id,info,d.status,d.state].filter(Boolean).join(' ').toLowerCase())}"><td><strong>${esc(recordTypes[row.type].label)}</strong><small class="record-id">${esc(row.id)}</small></td><td>${esc(info)}${typeof d.totalVnd==='number'||typeof d.amountVnd==='number'?`<small>${esc(money(d.totalVnd??d.amountVnd))}</small>`:''}<small>Đã nhận lúc ${esc(new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(row.openedAt)))}</small></td><td>${row.stale?pending('Cần đọc lại'):esc(stateText(d.status||d.state||'Đã đọc'))}</td><td><button type="button" data-select-type="${row.type}" data-select-id="${row.id}">Chọn</button>${recordTypes[row.type].read?`<button type="button" data-read-type="${row.type}" data-read-id="${row.id}">Đọc lại</button>`:''}</td></tr>`;
 }).join('')}</tbody></table></div><p id="sessionFilterEmpty" class="readonly" hidden>Không có bản ghi đã mở phù hợp bộ lọc.</p>`:empty('Chưa mở bản ghi nào','Đọc một mã có sẵn hoặc thực hiện nghiệp vụ được cấp quyền để xem bản ghi tại đây.')}</section>`;
}
function listPreparation(section,{field}){
 if(!pendingInfo[section])return '';
 const filters=section==='patients'?[F('query','Tên, mã hồ sơ hoặc điện thoại','search',{required:false})]:[F('date','Ngày','date',{required:false}),F('query','Tìm theo mã / nội dung','search',{required:false})];
 return `<section class="panel preparation-panel"><div class="workspace-heading"><div><h2>${section==='patients'?'Tìm bệnh nhân':section==='vitals'?'Lịch sử sinh hiệu':'Danh sách từ hệ thống'}</h2><p>${esc(pendingInfo[section])}</p></div>${pending()}</div><form data-pending-form class="pending-filters"><div class="form-grid">${filters.map(f=>field({...f,name:'preview_'+f.name})).join('')}</div><button type="submit" disabled data-unavailable>Chờ API tìm kiếm</button></form>${empty('Chưa thể tải danh sách','Kết quả sẽ được lấy từ backend khi API dành cho workspace được bổ sung.')}</section>`;
}
function preparation(title,description,fields,{field},button='Lưu lên hệ thống'){
 return `<details class="panel preparation-panel"><summary><span>${esc(title)}</span>${pending()}</summary><p class="readonly">${esc(description)} Các trường chỉ để xem trước và nhập thử, chưa lưu lên hệ thống.</p><form data-pending-form><div class="form-grid">${fields.map(f=>field({...f,name:'preview_'+f.name},{})).join('')}</div><div class="form-actions"><button type="submit" disabled data-unavailable>${esc(button)} · Chờ backend</button></div></form></details>`;
}
function patientRegistration(ctx){
 return preparation('Tiếp nhận bệnh nhân mới','Cần API đăng ký bệnh nhân và sinh mã hồ sơ có kiểm tra trùng.',[
  F('familyName','Họ và tên đệm'),F('givenName','Tên'),choice('gender','Giới tính',codeOptions('gender')),
  choice('birthPrecision','Mức đầy đủ ngày sinh',codeOptions('birth_precision')),
  F('birthdate','Ngày sinh','date',{required:false}),F('birthYear','Năm sinh (khi chưa đủ ngày)','number',{required:false,min:1,step:1}),F('birthMonth','Tháng sinh (nếu biết)','number',{required:false,min:1,max:12,step:1}),
  F('phone','Điện thoại','tel',{required:false}),choice('identifierType','Loại định danh',[
   [m.map.entities['identifier.cccd'],'CCCD'],[m.map.entities['identifier.bhxh'],'BHXH'],[m.map.entities['identifier.bhyt'],'BHYT']
  ],{required:false}),F('identifier','Số định danh','text',{required:false}),
  F('addressText','Địa chỉ nguyên văn','textarea',{required:false}),F('occupation','Nghề nghiệp','text',{required:false}),
 ],ctx,'Đăng ký bệnh nhân');
}
function visitPreparation(ctx){
 const out=[];
 if(permitted(ctx.role,'visit','create'))out.push(preparation('Mở lượt khám','Loại lượt dùng UUID metadata hiện tại; backend chưa có API mở lượt dành cho workspace.',[
  id('patient','Bệnh nhân (UUID)'),choice('visitType','Loại lượt',[[m.map.entities['visit.outpatient'],'Khám ngoại trú'],[m.map.entities['visit.followup'],'Tái khám']]),
  F('startDatetime','Thời điểm bắt đầu','datetime-local'),F('reason','Lý do đến khám','textarea'),
 ],ctx,'Mở lượt'));
 if(permitted(ctx.role,'visit','create')||ctx.role==='doctor'||ctx.role==='nurse')out.push(preparation('Tạo lần thực hiện / encounter','Quyền tạo encounter phải được backend xác nhận trong hợp đồng mới.',[
  id('patient','Bệnh nhân (UUID)'),id('visit','Lượt khám (UUID)'),
  choice('encounterType','Loại encounter',Object.entries({'encounter.administrative':'Tiếp nhận','encounter.vitals':'Sinh hiệu','encounter.consultation':'Khám','encounter.results':'Kết quả CLS'}).map(([k,v])=>[m.map.entities[k],v])),
  id('provider','Người thực hiện (UUID)'),F('encounterDatetime','Thời điểm thực hiện','datetime-local'),
 ],ctx,'Tạo encounter'));
 if(permitted(ctx.role,'visit','update'))out.push(preparation('Kết thúc lượt khám','Cần backend kiểm tra các dịch vụ, giao dịch và hồ sơ còn mở. Chốt phiếu khám không tự đóng lượt.',[
  id('visit','Lượt khám (UUID)'),F('stopDatetime','Thời điểm kết thúc','datetime-local'),choice('closeReason','Lý do kết thúc',codeOptions('visit_close_reason')),F('note','Ghi chú kết thúc','textarea',{required:false}),
 ],ctx,'Kết thúc lượt'));
 return out.join('');
}
function overview(ctx){
 const available=ctx.sections.filter(s=>!['overview','documents','identity'].includes(s.id));
 return `<section class="workspace-welcome"><div><span class="eyebrow">CÔNG VIỆC THEO VAI TRÒ</span><h2>${esc(m.permissions.roles[ctx.role].label)}</h2><p>Chọn hồ sơ, mở công việc và thực hiện các thao tác được phân quyền tại cơ sở hiện tại.</p></div><div class="workspace-stat"><strong>${ctx.memory.records.size}</strong><span>Bản ghi đã mở trong phiên</span></div></section><div class="workspace-card-grid">${available.map(s=>`<article class="panel task-card"><div class="task-icon" aria-hidden="true">${esc(({patients:'◎',visits:'↗',vitals:'♥',clinical:'✚',appointments:'▦',queue:'≡',billing:'₫',orders:'⌕',pharmacy:'✚',reports:'▥',admin:'⚙'})[s.id]||'▤')}</div><h2>${esc(s.title)}</h2><p>${esc(pendingInfo[s.id]||s.note||'Mở các chức năng được cấp quyền trong workspace hiện tại.')}</p>${['patients','visits','pharmacy'].includes(s.id)?pending():connected}<div>${open(s.id,null,'Mở công việc →')}</div></article>`).join('')}</div><section class="panel workflow-guide"><h2>Quy trình phòng khám</h2><ol>${m.workflow.configs[0].flow.map(step=>`<li>${esc(({RECEPTION:'Tiếp nhận',NURSE:'Sinh hiệu',DOCTOR:'Khám',LAB_IF_ORDERED:'CLS nếu có chỉ định',CASHIER:'Thanh toán',PHARMACY_IF_PRESCRIBED:'Cấp thuốc nếu có đơn'})[step]||step)}</li>`).join('')}</ol><p class="readonly">Các bước chưa có API vẫn cần backend bổ sung. Chuyển màn hình không tự tạo lượt, thu tiền hoặc chuyển hàng đợi.</p></section>`;
}
export function workspaceScreen(section,ctx){
 if(section==='overview')return overview(ctx);
 let content='';
 if(section==='patients')content=`<section class="panel workspace-heading"><div><h2>Hồ sơ bệnh nhân</h2><p>Đọc thông tin hành chính và tiếp tục công việc từ mã có sẵn.</p></div>${open('identity','identity','Mở hồ sơ theo mã')}</section>${listPreparation(section,ctx)}${permitted(ctx.role,'patient_identity','create')?patientRegistration(ctx):''}`;
 else if(section==='visits')content=listPreparation(section,ctx)+visitPreparation(ctx);
 else if(section==='pharmacy')content=listPreparation(section,ctx)+preparation('Xác nhận cấp thuốc','Cần API đơn thuốc cần cấp, kho/lô/tồn và giao dịch cấp thuốc.',[
  id('patient','Bệnh nhân (UUID)'),id('prescription','Dòng thuốc (UUID)'),F('warehouse','Kho xuất'),F('batch','Lô thuốc'),F('expiry','Hạn dùng','date'),F('quantity','Số lượng cấp','number',{min:1,step:1}),
 ],ctx,'Xác nhận cấp thuốc');
 else if(['appointments','queue','billing','orders','vitals'].includes(section))content=listPreparation(section,ctx);
 if(section==='vitals')content+=preparation('Sửa / hủy lần đo','Cần API đọc các nhóm đo và đính chính có lý do.',[id('record','Nhóm đo (UUID)'),F('reason','Lý do điều chỉnh','textarea')],ctx,'Gửi điều chỉnh');
 if(section==='admin')content+=`<section class="panel admin-directory"><div class="workspace-heading"><div><h2>Tài khoản và phân quyền</h2><p>Vai trò được định nghĩa trong metadata; quyền sử dụng còn phụ thuộc phân công cơ sở của từng tài khoản.</p></div>${connected}</div><div class="role-tags">${Object.values(m.permissions.roles).map(role=>`<span>${esc(role.label)}</span>`).join('')}</div><div class="context-links">${ctx.canAction('systemUsers')?open('admin','systemUsers','Tìm tài khoản'):''}${ctx.canAction('grantAppRole')?open('admin','grantAppRole','Thêm role cho tài khoản'):''}${open('admin','assignWorkspace','Phân công cơ sở')}${open('admin','workspace','Kiểm tra phân công')}${open('admin','audit','Nhật ký truy cập')}</div></section>`+preparation('Tạo tài khoản nhân viên','Chưa có luồng tạo tài khoản trên FE. Việc thêm role hiện tại chỉ áp dụng cho user đã tồn tại.',[
  F('username','Tên đăng nhập'),F('fullName','Họ tên nhân viên'),choice('role','Vai trò ứng dụng',Object.entries(m.permissions.roles).map(([k,v])=>[k,v.label])),
 ],ctx,'Tạo tài khoản');
 if(section==='admin')content+=preparation('Thiết lập cơ sở và biểu mẫu','Cấu hình hiện tại có thể đọc qua chức năng Kiểm tra cấu hình nghiệp vụ; backend chưa có API chỉnh cấu hình dành cho workspace.',[
  F('facilityName','Tên cơ sở'),F('facilityAddress','Địa chỉ cơ sở','textarea'),F('facilityPhone','Điện thoại','tel',{required:false}),choice('workflow','Quy trình',m.workflow.configs.map(c=>[c.code,c.code==='STANDARD_POSTPAY'?'Có điều dưỡng, trả sau':'Tinh gọn, trả trước'])),F('formVersion','Phiên bản biểu mẫu','text',{required:false}),
 ],ctx,'Lưu thiết lập');
 return content+(sectionTypes[section]?recordTable(section,ctx):'');
}
export function resultHighlights(result){
 if(!result||Array.isArray(result)||typeof result!=='object')return '';
 const keys={totalVnd:'Tổng phí',settledVnd:'Đã thu',outstandingVnd:'Còn phải thu',refundedVnd:'Đã hoàn',grossVnd:'Tổng thu',refundVnd:'Hoàn tiền',netVnd:'Thu ròng',openedVisits:'Lượt mở',completedVisits:'Lượt hoàn tất'};
 const entries=Object.entries(keys).filter(([key])=>typeof result[key]==='number');
 return entries.length?`<div class="result-metrics">${entries.map(([key,label])=>`<div><span>${label}</span><strong>${esc(key.endsWith('Vnd')?money(result[key]):result[key])}</strong></div>`).join('')}</div>`:'';
}
