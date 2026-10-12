import {metadata as m,active} from './metadata.js';
import {uuid,instant,money,BackendError} from './backend-client.js';
export const F=(name,label,type='text',extra={})=>({name,label,type,required:true,...extra});
export const choice=(name,label,options,extra={})=>F(name,label,'select',{options,...extra});
export const options=(records,key='uuid')=>active(records).map(r=>[r[key],r.nameVi||r.name||r.code]);
export const optional=(name,label,type='text',extra={})=>F(name,label,type,{required:false,...extra});
export const id=(name,label,required=true)=>F(name,label,'uuid',{required});
const ctx=[id('patient','Mã bệnh nhân (UUID)'),id('encounter','Mã lần khám (UUID)')];
const personVisit=[id('patient','Mã bệnh nhân (UUID)'),id('visit','Mã lượt khám (UUID)')];
const reason=F('reason','Lý do','textarea',{max:1000});
const source=()=>({source:{kind:'api'},recordedAt:new Date().toISOString()});
const pick=(d,keys)=>Object.fromEntries(keys.filter(k=>d[k]!==''&&d[k]!==undefined).map(k=>[k,d[k]]));
const body=d=>({...d});
const fieldId=id('record','Mã bản ghi (UUID)');
const numeric=(name,label,min=0.001,max)=>F(name,label,'number',{min,max,step:'any'});
const keyBody=d=>({...d,idempotencyKey:d.idempotencyKey});
const services=options(m.services.records);
const configs=m.workflow.configs.map(c=>[c.code,c.code==='STANDARD_POSTPAY'?'Có điều dưỡng, trả sau':'Tinh gọn, trả trước']);
const points=options(m.workflow.queuePoints,'code');
const stateLabels={booked:'Đã đặt',confirmed:'Đã xác nhận',arrived:'Đã đến',fulfilled:'Đã khám',cancelled:'Đã hủy',no_show:'Không đến',waiting:'Đang chờ',called:'Đã gọi',in_service:'Đang phục vụ',completed:'Hoàn tất',left:'Bỏ về',requested:'Chờ phân công',assigned:'Đã phân công',in_progress:'Đang thực hiện','entered-in-error':'Nhập nhầm',draft:'Nháp',preliminary:'Sơ bộ',final:'Chính thức',corrected:'Đính chính',unpaid:'Chưa thu',paid:'Đã thu đủ',partially_paid:'Thu một phần',pending:'Chờ xác nhận',settled:'Đã thanh toán',active:'Đang hiệu lực',discontinued:'Đã ngừng',expired:'Hết hiệu lực',not_asked:'Chưa khai thác',unknown:'Không rõ',no_known_allergy:'Không ghi nhận dị ứng',present:'Có ghi nhận',none_reported:'Không ghi nhận',recorded:'Đã ghi',refused:'Từ chối',not_applicable:'Không áp dụng',not_recorded:'Chưa ghi',unreadable:'Không đọc được'};
export const stateText=v=>stateLabels[v]||v;
const states=values=>values.map(v=>[v,stateText(v)]);
const units=kind=>options(m.units.catalogues[kind],kind==='frequencies'?'uuid':'conceptUuid');
const frequencies=active(m.units.catalogues.frequencies).map(r=>[m.map.entities['frequency.'+r.code.toLowerCase()],r.name]);
export const consultationFields=[
 F('visit.ly_do_kham','Lý do khám','textarea',{max:4000}),optional('history.benh_su','Bệnh sử','textarea',{max:4000}),
 choice('history.tien_su_ban_than_trang_thai','Tiền sử bản thân',states(['not_asked','none_reported','present','unknown'])),optional('history.tien_su_ban_than','Nội dung tiền sử bản thân','textarea',{max:4000}),
 choice('history.tien_su_gia_dinh_trang_thai','Tiền sử gia đình',states(['not_asked','none_reported','present','unknown'])),optional('history.tien_su_gia_dinh','Nội dung tiền sử gia đình','textarea',{max:4000}),
 ...[['exam.trieu_chung','Triệu chứng'],['exam.toan_than','Khám toàn thân'],['exam.bo_phan','Khám bộ phận'],['exam.tom_tat','Tóm tắt'],['exam.huong_dieu_tri','Hướng điều trị'],['exam.loi_dan','Lời dặn']].map(([k,l])=>optional(k,l,'textarea',{max:4000})),
 choice('allergy.trang_thai','Trạng thái dị ứng',states(['not_asked','unknown','no_known_allergy','present'])),optional('followup.ngay_tai_kham','Ngày tái khám','date'),optional('followup.loi_dan','Lời dặn tái khám','textarea',{max:4000})
];
export function consultationValues(d){
 const values=pick(d,consultationFields.map(f=>f.name));
 for(const prefix of ['history.tien_su_ban_than','history.tien_su_gia_dinh']){
  if(values[prefix+'_trang_thai']==='present'&&!values[prefix])throw new BackendError('Trạng thái có tiền sử cần nội dung tương ứng.');
  if(values[prefix]&&values[prefix+'_trang_thai']!=='present')throw new BackendError('Nội dung tiền sử chỉ dùng khi chọn Có ghi nhận.');
 }
 return values;
}
const action=(title,resource,permission,fields,path,build=body,extra={})=>({title,resource,permission,fields,path,build,...extra});
export const actions={
 identity:action('Đọc thông tin hành chính','patient_identity','read',[id('patient','Mã bệnh nhân (UUID)')],d=>'identity/'+uuid(d.patient),null,{method:'GET'}),
 contact:action('Thêm người liên hệ','patient_identity','update',[id('patient','Mã bệnh nhân (UUID)'),F('fullName','Họ tên người liên hệ'),choice('relationshipCode','Quan hệ',options(m.relationships.records,'code')),optional('phone','Số điện thoại'),optional('addressText','Địa chỉ'),F('priority','Thứ tự ưu tiên','number',{min:1,step:1}),choice('isPrimary','Liên hệ chính',[['false','Không'],['true','Có']]),choice('emergencyContact','Liên hệ khẩn cấp',[['false','Không'],['true','Có']])],()=> 'contact',d=>({...d,priority:Number(d.priority),isPrimary:d.isPrimary==='true',emergencyContact:d.emergencyContact==='true',...source()})),
 address:action('Lưu địa chỉ hiện tại','patient_identity','update',[id('patient','Mã bệnh nhân (UUID)'),F('addressText','Số nhà, đường','textarea'),choice('provinceCode','Tỉnh/thành phố',[]),choice('communeCode','Xã/phường',[]),optional('legacyAddressText','Địa chỉ cũ trên giấy tờ'),F('addressAsOfDate','Ngày đối chiếu','date')],()=> 'address',d=>({...d,catalogueVersion:d.catalogueVersion,...source()}),{address:true}),
 summary:action('Đọc hồ sơ lần khám','clinical_chart','read',[id('encounter','Mã lần khám (UUID)')],d=>'encounter/'+uuid(d.encounter)+'/clinical-summary',null,{method:'GET'}),
 consultation:action('Lưu phiếu khám','clinical_chart','create',[...ctx,...consultationFields],()=> 'consultation',d=>({patient:d.patient,encounter:d.encounter,values:consultationValues(d)})),
 correction:action('Đính chính phiếu khám','clinical_chart','update',[id('group','Mã phiếu khám (UUID)'),...consultationFields,reason],d=>'consultation/'+uuid(d.group),d=>({values:consultationValues(d),reason:d.reason})),
 finalize:action('Chốt phiếu khám','clinical_chart','create',[id('encounter','Mã lần khám (UUID)')],d=>'encounter/'+uuid(d.encounter)+'/finalize',()=>({}),{notice:'Backend chỉ chốt khi phiếu có lý do khám, trạng thái dị ứng và đúng một chẩn đoán chính. Chốt phiếu không kết thúc lượt khám.'}),
 diagnosis:action('Ghi chẩn đoán','diagnosis','create',[...ctx,choice('concept','Chẩn đoán ICD-10',active(m.diagnoses.records).filter(r=>r.selectable).map(r=>[r.conceptUuid,r.code+' · '+r.nameVi])),choice('rank','Loại chẩn đoán',[['primary','Chính'],['secondary','Kèm theo']]),choice('certainty','Mức chắc chắn',[['provisional','Sơ bộ'],['confirmed','Xác định']]),optional('reason','Lý do bổ sung sau khi chốt')],()=> 'diagnosis'),
 allergy:action('Ghi dị ứng','allergy','create',[...ctx,choice('allergenChoice','Tác nhân',active(m.allergies.records).filter(r=>['medication','food','environment'].includes(r.category)).map(r=>[r.conceptUuid,r.name])),choice('severity','Mức độ',options(m.allergies.severities,'conceptUuid')),choice('reaction','Phản ứng',options(m.allergies.reactions.filter(r=>r.code!=='OTHER'),'conceptUuid')),optional('comment','Ghi chú','textarea',{max:1024})],()=> 'allergy',d=>({patient:d.patient,encounter:d.encounter,allergenType:{medication:'DRUG',food:'FOOD',environment:'ENVIRONMENT'}[m.allergies.records.find(r=>r.conceptUuid===d.allergenChoice).category],allergen:{concept:d.allergenChoice},severity:d.severity,reactions:[{concept:d.reaction}],comment:d.comment})),
 prescription:action('Xác nhận một dòng thuốc','prescription','create',[...ctx,id('orderer','Mã người kê trên lần khám (UUID)'),choice('drug','Thuốc trong danh mục kiểm thử',options(m.medications.records)),numeric('dose','Liều mỗi lần'),choice('doseUnits','Đơn vị liều',units('dose')),choice('route','Đường dùng',units('routes')),choice('frequency','Tần suất',frequencies),F('duration','Thời gian dùng','number',{min:1,max:3650,step:1}),choice('durationUnits','Đơn vị thời gian',units('duration')),numeric('quantity','Số lượng'),choice('quantityUnits','Đơn vị số lượng',units('quantity')),optional('dosingInstructions','Hướng dẫn dùng','textarea',{max:1024}),optional('allergyOverrideReason','Lý do vượt cảnh báo dị ứng (chỉ khi có xung đột)')],()=> 'drug-order',d=>({...d,dose:Number(d.dose),quantity:Number(d.quantity),duration:Number(d.duration),numRefills:0,asNeeded:false}),{notice:'Gửi sẽ tạo đơn đã xác nhận trên OpenMRS. Không có trạng thái nháp phía backend; server kiểm tra đơn trùng và dị ứng.'}),
 discontinue:action('Ngừng thuốc','prescription','cancel',[fieldId,id('orderer','Mã người kê (UUID)'),reason],d=>'drug-order/'+uuid(d.record)+'/discontinue',d=>({orderer:d.orderer,reason:d.reason})),
 appointments:action('Đọc lịch hẹn','appointment','read',[fieldId],d=>'operations/appointments/'+uuid(d.record),null,{method:'GET'}),
 book:action('Đặt lịch hẹn','appointment','create',[id('patient','Mã bệnh nhân (UUID)'),id('provider','Mã bác sĩ (UUID)'),choice('service','Dịch vụ',services),choice('appointmentType','Loại lịch hẹn',options(m.workflow.appointmentTypes,'code')),F('startAt','Bắt đầu','datetime-local'),F('endAt','Kết thúc','datetime-local'),optional('note','Ghi chú','textarea',{max:1000})],()=> 'operations/appointments',d=>{if(Date.parse(d.startAt)>=Date.parse(d.endAt))throw new BackendError('Giờ kết thúc phải sau giờ bắt đầu.');return {...d,startAt:instant(d.startAt),endAt:instant(d.endAt)};},{idempotent:true,facility:true}),
 appointmentTransition:action('Cập nhật lịch hẹn','appointment','update',[fieldId,choice('status','Trạng thái tiếp theo',states(m.workflow.appointmentStates)),optional('reason','Lý do')],d=>'operations/appointments/'+uuid(d.record)+'/transition',d=>pick(d,['status','reason'])),
 queue:action('Đọc phiếu hàng đợi','queue','read',[fieldId],d=>'operations/queue/'+uuid(d.record),null,{method:'GET'}),
 enqueue:action('Thêm vào hàng đợi','queue','create',[...personVisit,choice('config','Quy trình',configs),choice('point','Điểm phục vụ',points),id('provider','Mã bác sĩ (UUID)',false)],()=> 'operations/queue',keyBody,{idempotent:true}),
 queueTransition:action('Cập nhật hàng đợi','queue','update',[fieldId,choice('state','Trạng thái tiếp theo',states(m.workflow.queueStates)),choice('exitReason','Lý do hủy / bỏ về',m.workflow.exitReasons.map(v=>[v,({patient_requested:'Người bệnh yêu cầu',duplicate_registration:'Tiếp nhận trùng',service_unavailable:'Không có dịch vụ',referred_elsewhere:'Chuyển cơ sở',other:'Khác'})[v]]),{required:false})],d=>'operations/queue/'+uuid(d.record)+'/transition',d=>{if(!['cancelled','left'].includes(d.state))delete d.exitReason;return pick(d,['state','exitReason']);}),
 advance:action('Chuyển điểm phục vụ','queue','update',[fieldId,choice('nextPoint','Điểm tiếp theo',points),id('provider','Mã bác sĩ (UUID)',false)],d=>'operations/queue/'+uuid(d.record)+'/advance',d=>pick(d,['nextPoint','provider','idempotencyKey']),{idempotent:true}),
 bills:action('Đọc phiếu phí','billing','read',[fieldId],d=>'operations/bills/'+uuid(d.record),null,{method:'GET'}),
 bill:action('Lập phiếu phí','billing','create',[...personVisit,choice('service','Dịch vụ',services),F('quantity','Số lượng','number',{min:1,max:10000,step:1}),F('discountVnd','Giảm giá (VND)','number',{min:0,step:1,value:'0'}),choice('paymentTiming','Thời điểm thu',[['postpay','Trả sau'],['prepay','Trả trước']])],()=> 'operations/bills',d=>({patient:d.patient,visit:d.visit,facility:d.facility,paymentTiming:d.paymentTiming,idempotencyKey:d.idempotencyKey,lines:[{service:d.service,quantity:Number(d.quantity),discountVnd:Number(d.discountVnd)}]}),{idempotent:true,facility:true,notice:'Giá do backend chụp từ danh mục hiện hành, FE không gửi đơn giá. Có thể lập nhiều phiếu theo dịch vụ.'}),
 receipt:action('Thu tiền','payment','create',[fieldId,F('amountVnd','Số tiền (VND)','number',{min:1,step:1}),choice('method','Phương thức',[['cash','Tiền mặt'],['bank_transfer','Chuyển khoản']])],d=>'operations/bills/'+uuid(d.record)+'/receipts',d=>({amountVnd:money(d.amountVnd),method:d.method,idempotencyKey:d.idempotencyKey}),{idempotent:true}),
 payment:action('Đọc giao dịch','payment','read',[fieldId],d=>'operations/payments/'+uuid(d.record),null,{method:'GET'}),
 settle:action('Xác nhận chuyển khoản','payment','create',[fieldId],d=>'operations/payments/'+uuid(d.record)+'/settle',()=>({})),
 refund:action('Hoàn tiền','payment','create',[fieldId,F('amountVnd','Số tiền hoàn (VND)','number',{min:1,step:1}),reason],d=>'operations/payments/'+uuid(d.record)+'/refunds',d=>({amountVnd:money(d.amountVnd),reason:d.reason,idempotencyKey:d.idempotencyKey}),{idempotent:true}),
 cancelBill:action('Hủy phiếu phí','billing','cancel',[fieldId,reason],d=>'operations/bills/'+uuid(d.record)+'/cancel',d=>({reason:d.reason})),
 order:action('Đọc chỉ định CLS','diagnostic_order','read',[fieldId],d=>'operations/service-orders/'+uuid(d.record),null,{method:'GET'}),
 createOrder:action('Tạo chỉ định CLS','diagnostic_order','create',[...ctx,id('orderer','Mã bác sĩ trên lần khám (UUID)'),choice('service','Dịch vụ',services),choice('config','Quy trình',configs),id('bill','Mã phiếu phí (bắt buộc khi trả trước)',false),optional('clinicalHistory','Thông tin lâm sàng','textarea',{max:1000})],()=> 'operations/service-orders',body,{idempotent:true,facility:true}),
 orderTransition:action('Cập nhật chỉ định CLS','diagnostic_order','update',[fieldId,choice('state','Trạng thái tiếp theo',states(['assigned','in_progress','completed','cancelled','entered-in-error'])),id('assignedProvider','Mã KTV khi phân công (UUID)',false),optional('reason','Lý do hủy / nhập nhầm')],d=>'operations/service-orders/'+uuid(d.record)+'/transition',d=>{if(d.state==='assigned'&&!d.assignedProvider)throw new BackendError('Cần chọn người được phân công.');if(['cancelled','entered-in-error'].includes(d.state)&&!d.reason)throw new BackendError('Cần lý do hủy / nhập nhầm.');if(!['cancelled','entered-in-error'].includes(d.state))delete d.reason;return pick(d,['state','assignedProvider','reason']);}),
 result:action('Đọc kết quả CLS','diagnostic_result','read',[fieldId],d=>'operations/results/'+uuid(d.record),null,{method:'GET'}),
 report:action('Báo cáo ngày','reports','read',[F('date','Ngày báo cáo','date')],d=>'operations/reports/daily?'+new URLSearchParams({date:d.date,facility:d.facility}),null,{method:'GET',facility:true}),
 clinicalConfiguration:action('Kiểm tra danh mục backend','clinical_chart','read',[],()=> 'clinical-configuration',null,{method:'GET'}),
 audit:action('Nhật ký truy cập','metadata_admin','read',[id('patient','Lọc theo bệnh nhân (UUID)',false),id('encounter','Lọc theo lần khám (UUID)',false)],d=>'authorization/audit?'+new URLSearchParams({...pick(d,['patient','encounter']),limit:200,offset:0}),null,{method:'GET'}),
 configuration:action('Kiểm tra cấu hình nghiệp vụ','metadata_admin','read',[],()=> 'operations/configuration',null,{method:'GET'})
};
const resultFields=[fieldId,choice('state','Loại kết quả',states(['draft','preliminary','final'])),optional('numericValue','Kết quả số','number',{step:'any'}),optional('unit','Đơn vị'),optional('textValue','Kết quả văn bản','textarea',{max:4000}),id('authorProvider','Mã người nhập (UUID)'),id('reviewerProvider','Mã người duyệt khi chính thức (UUID)',false),F('recordedAt','Thời điểm ghi','datetime-local'),optional('reviewedAt','Thời điểm duyệt','datetime-local')];
function resultBody(d){
 const out=pick(d,['state','unit','textValue','authorProvider','reviewerProvider','reason']);out.recordedAt=instant(d.recordedAt);
 if(d.reviewedAt)out.reviewedAt=instant(d.reviewedAt);
 if(d.numericValue!==undefined&&d.numericValue!=='')out.numericValue=Number(d.numericValue);
 if((out.numericValue===undefined)===(!out.textValue))throw new BackendError('Nhập đúng một kết quả số hoặc văn bản.');
 if(out.numericValue!==undefined&&!out.unit)throw new BackendError('Kết quả số cần đơn vị.');
 if((d.state==='final'||d.reason)&&(!out.reviewerProvider||!out.reviewedAt))throw new BackendError('Kết quả chính thức/đính chính cần người duyệt và thời điểm duyệt.');
 return out;
}
actions.saveResult=action('Ghi kết quả CLS','diagnostic_result','create',resultFields,d=>'operations/service-orders/'+uuid(d.record)+'/results',resultBody);
actions.correctResult=action('Đính chính kết quả CLS','diagnostic_result','update',[...resultFields.filter(f=>f.name!=='state'),reason],d=>'operations/results/'+uuid(d.record)+'/corrections',resultBody);
for(const [key,title,resource,path] of [['voidDiagnosis','Hủy chẩn đoán','diagnosis','diagnosis/'],['voidAllergy','Hủy ghi nhận dị ứng','allergy','allergy/']])actions[key]=action(title,resource,'void',[fieldId,reason],d=>path+uuid(d.record)+'?'+new URLSearchParams({reason:d.reason}),null,{method:'DELETE'});
export const sections=[
 {id:'identity',title:'Hành chính',resource:'patient_identity',actions:['identity','contact','address'],note:'Tìm/tạo bệnh nhân, sửa thông tin Core và mở lượt đang chờ API VinSHC có phân quyền. Không dùng mã demo để ghi backend.'},
 {id:'vitals',title:'Sinh hiệu',resource:'vitals',actions:[]},
 {id:'clinical',title:'Khám & điều trị',resource:'clinical_chart',actions:['summary','clinicalConfiguration','consultation','correction','diagnosis','allergy','prescription','finalize','discontinue','voidDiagnosis','voidAllergy']},
 {id:'appointments',title:'Lịch hẹn',resource:'appointment',actions:['appointments','book','appointmentTransition'],note:'Backend hiện hỗ trợ đọc từng lịch hẹn theo mã; chưa có API danh sách hoặc tìm kiếm lịch hẹn.'},
 {id:'queue',title:'Hàng đợi',resource:'queue',actions:['queue','enqueue','queueTransition','advance'],note:'Backend chưa cung cấp danh sách hàng đợi; đọc phiếu theo mã từ lần tạo hoặc bàn giao.'},
 {id:'billing',title:'Thu ngân',resource:'billing',actions:['bills','bill','receipt','payment','settle','refund','cancelBill']},
 {id:'orders',title:'Chỉ định & kết quả',resource:'diagnostic_order',actions:['order','createOrder','orderTransition','result','saveResult','correctResult']},
 {id:'pharmacy',title:'Quầy thuốc',resource:'dispensing',actions:[],note:'Backend hiện chưa cung cấp API danh sách đơn đã xác nhận hoặc ghi cấp thuốc. Chức năng cấp thuốc chỉ có trong bản demo, chưa được bật ở chế độ kết nối.'},
 {id:'reports',title:'Báo cáo',resource:'reports',actions:['report']},
 {id:'admin',title:'Quản trị',resource:'metadata_admin',actions:['configuration','audit'],note:'Quản lý tài khoản, cấu hình cơ sở và form chưa có API ứng dụng tương ứng. Phân công vai trò cần người quản trị backend thiết lập.'}
];
export const LABELS=Object.fromEntries(Object.values(actions).flatMap(a=>a.fields.map(f=>[f.name,f.label])).concat(consultationFields.map(f=>[f.name,f.label])));

for(const [key,title,resource,template] of [
 ['printReceipt','Xem phiếu thu','billing','receipt'],['printRefund','Xem phiếu hoàn','billing','refund'],['printAppointment','Xem giấy hẹn','appointment','appointment'],['printOrder','Xem phiếu chỉ định','diagnostic_order','order'],['printResult','Xem phiếu kết quả','diagnostic_order','result'],['printPrescription','Xem đơn thuốc','diagnostic_order','prescription']
])actions[key]=action(title,resource,'print',[fieldId],d=>'operations/documents/'+template+'/'+uuid(d.record),null,{method:'GET',document:true});
sections.push({id:'documents',title:'Chứng từ & mẫu in',resource:'billing',actions:['printReceipt','printRefund','printAppointment','printOrder','printResult','printPrescription'],note:'Mẫu in lấy số chứng từ và nội dung từ backend; chưa có chữ ký điện tử. Backend hiện kiểm tra quyền diagnostic_order print cả với đơn thuốc và kết quả, nên một số vai trò chưa được mở mẫu in.'});
actions.upload=action('Đính kèm báo cáo CLS','diagnostic_result','update',[fieldId,id('result','Mã kết quả liên quan (UUID)',false),F('file','Tệp PDF/JPEG/PNG (tối đa 20 MiB)','file')],d=>'operations/service-orders/'+uuid(d.record)+'/attachments'+(d.result?'?'+new URLSearchParams({result:d.result}):''),null,{upload:true});
actions.attachment=action('Đọc thông tin tệp CLS','diagnostic_result','read',[fieldId],d=>'operations/attachments/'+uuid(d.record),null,{method:'GET'});
actions.download=action('Tải tệp CLS','diagnostic_result','download',[fieldId],d=>'operations/attachments/'+uuid(d.record)+'/content',null,{method:'GET',binary:true});
sections.find(s=>s.id==='orders').actions.push('upload','attachment','download');
