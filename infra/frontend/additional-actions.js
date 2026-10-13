import {metadata as m,active} from './metadata.js';
import policies from './metadata/field-policies.json' with {type:'json'};
import {BackendError,uuid} from './backend-client.js';
import {actions,sections,F,choice,id,optional} from './connected-actions.js';
const act=(title,resource,permission,fields,path,build,extra={})=>({title,resource,permission,fields,path,build,...extra});
export const fieldPolicies=policies.fields;
const record=id('record','Mã bản ghi (UUID)'),patient=id('patient','Mã bệnh nhân (UUID)');
const reason=F('reason','Lý do','textarea',{max:1000});
const provenance=()=>({source:{kind:'manual'},recordedAt:new Date().toISOString()});
const omit=(data,keys)=>Object.fromEntries(Object.entries(data).filter(([k])=>!keys.includes(k)));
const contactFields=actions.contact.fields.filter(f=>f.name!=='patient').map(f=>({...f,required:false}));
export function contactPatch(d){
 const out=omit(d,['record','clearPhone','clearAddress']);
 if(out.priority!==undefined)out.priority=Number(out.priority);
 for(const k of ['isPrimary','emergencyContact'])if(out[k]!==undefined)out[k]=out[k]==='true';
 if(d.clearPhone==='true'){if(d.phone)throw new BackendError('Chọn xóa hoặc nhập số điện thoại.');out.phone=null;}
 if(d.clearAddress==='true'){if(d.addressText)throw new BackendError('Chọn xóa hoặc nhập địa chỉ.');out.addressText=null;}
 if(!Object.keys(out).length)throw new BackendError('Cần nhập ít nhất một trường muốn sửa.');
 return out;
}
actions.identity.fields.push(choice('includeHistory','Lịch sử',[['false','Chỉ hiện hành'],['true','Gồm lịch sử']],{required:false}));
actions.identity.path=d=>'identity/'+uuid(d.patient)+'?includeHistory='+(d.includeHistory==='true');
actions.updateContact=act('Sửa người liên hệ','patient_identity','update',[record,...contactFields,choice('clearPhone','Xóa số điện thoại',[['true','Xóa giá trị hiện tại']],{required:false}),choice('clearAddress','Xóa địa chỉ liên hệ',[['true','Xóa giá trị hiện tại']],{required:false})],d=>'contact/'+uuid(d.record),contactPatch,{notice:'Chỉ nhập trường muốn thay đổi. Bỏ trống giữ nguyên; chọn Xóa để gửi null. Backend lưu phiên bản mới.'});
actions.updateAddress=act('Sửa địa chỉ đã lưu','patient_identity','update',[record,...actions.address.fields.filter(f=>f.name!=='patient').map(f=>({...f,required:false}))],d=>'address/'+uuid(d.record),d=>{const out=omit(d,['record']);if(!Object.keys(out).length)throw new BackendError('Cần nhập trường muốn sửa.');if(Boolean(d.provinceCode)!==Boolean(d.communeCode))throw new BackendError('Cần chọn đủ tỉnh và xã khi đổi địa chỉ mã hóa.');return out;},{address:true,notice:'Bỏ trống để giữ giá trị hiện tại. Đổi mã địa chỉ cần chọn đủ tỉnh và xã.'});
for(const [key,title,path] of [['voidContact','Hủy người liên hệ','contact/'],['voidAddress','Hủy địa chỉ đã lưu','address/']])actions[key]=act(title,'patient_identity','update',[record,reason],d=>path+uuid(d.record)+'?'+new URLSearchParams({reason:d.reason}),null,{method:'DELETE'});
const missingFields=[patient,choice('fieldCode','Trường thông tin',policies.fields.map(f=>[f.code,f.label])),id('rowKey','Mã dòng liên hệ/địa chỉ (UUID)',false)];
export function missingContext(d){
 const policy=policies.fields.find(f=>f.code===d.fieldCode);if(!policy)throw new BackendError('Trường chưa có policy thông tin thiếu.');
 if(policy.rowKeyRequired&&!d.rowKey)throw new BackendError('Trường này cần mã dòng liên hệ/địa chỉ.');
 if(!policy.rowKeyRequired&&d.rowKey)throw new BackendError('Trường này không dùng mã dòng.');
 return {patient:uuid(d.patient),fieldCode:d.fieldCode,context:policy.context,...(d.rowKey?{rowKey:uuid(d.rowKey)}:{})};
}
const states=[...new Set(policies.fields.flatMap(f=>f.allowedStates))];
actions.fieldState=act('Ghi trạng thái thông tin thiếu','patient_identity','update',[...missingFields,choice('dataStatus','Trạng thái thiếu',states.map(v=>[v,({unknown:'Không rõ',not_asked:'Chưa hỏi',refused:'Từ chối',unreadable:'Không đọc được',not_recorded:'Chưa ghi',not_applicable:'Không áp dụng',masked:'Đã che'})[v]||v]))],()=> 'field-state',d=>{const policy=policies.fields.find(f=>f.code===d.fieldCode);if(!policy?.allowedStates.includes(d.dataStatus))throw new BackendError('Trạng thái này không được phép cho trường đã chọn.');return {...missingContext(d),dataStatus:d.dataStatus,...provenance()};});
actions.clearFieldState=act('Xóa trạng thái thông tin thiếu','patient_identity','update',missingFields,d=>'field-state?'+new URLSearchParams(missingContext(d)),null,{method:'DELETE'});
actions.identityConfiguration=act('Kiểm tra danh mục hành chính','patient_identity','read',[],()=> 'configuration-status',null,{method:'GET'});
actions.allergies=act('Đọc các dị ứng hiện tại','allergy','read',[patient],d=>'allergy?'+new URLSearchParams({patient:uuid(d.patient)}),null,{method:'GET'});
actions.replaceDiagnosis=act('Thay chẩn đoán có lý do','diagnosis','update',[record,...actions.diagnosis.fields.filter(f=>!['patient','encounter','reason'].includes(f.name)),reason],d=>'diagnosis/'+uuid(d.record),d=>omit(d,['record']));
actions.prescription.fields.push(optional('reason','Lý do kê thêm sau khi chốt phiếu'));
const roleChoices=Object.entries(m.permissions.roles).map(([k,v])=>[k,v.label]);
const assignmentFields=[id('user','Mã tài khoản (UUID)'),choice('role','Vai trò ứng dụng',roleChoices),choice('facility','Cơ sở được phân công',active(m.facilities.records).map(f=>[f.locationUuid,f.name]))];
actions.assignWorkspace=act('Gán vai trò và cơ sở','metadata_admin','update',assignmentFields,()=> 'authorization/assignment',d=>({...d}),{notice:'User phải có role ứng dụng tương ứng. Chọn cơ sở cấp cho user, có thể khác cơ sở đang mở.'});
actions.revokeWorkspace=act('Thu hồi phân công workspace','metadata_admin','void',assignmentFields,()=> 'authorization/assignment',d=>({...d}),{method:'DELETE',notice:'Thu hồi phân công đã chọn. Không xóa tài khoản hoặc role.'});
actions.workspace=act('Kiểm tra workspace hiện tại','metadata_admin','read',[],()=> 'authorization/workspace',null,{method:'GET'});
actions.evaluate=act('Kiểm tra quyền trong workspace','metadata_admin','read',[choice('resource','Nhóm nghiệp vụ',[...new Set(m.permissions.matrix.map(r=>r.resource))].map(v=>[v,v])),choice('action','Thao tác',['read','create','update','void','cancel','print','download'].map(v=>[v,v]))],d=>'authorization/evaluate?'+new URLSearchParams(d),null,{method:'GET',notice:'Backend trả 403 nếu workspace hiện tại không được phép thực hiện thao tác đã chọn.'});
actions.audit.fields.push(F('limit','Số dòng mỗi lần','number',{min:1,max:1000,step:1,value:'200'}),F('offset','Bỏ qua số dòng','number',{min:0,step:1,value:'0'}));
actions.audit.path=d=>'authorization/audit?'+new URLSearchParams(d);
const userView='custom:(uuid,username,systemId,display,retired,roles:(uuid,name))';
actions.systemUsers=act('Tìm tài khoản OpenMRS','metadata_admin','read',[optional('query','Tên đăng nhập cần tìm'),F('startIndex','Bỏ qua số tài khoản','number',{min:0,step:1,value:'0'})],d=>'user?'+new URLSearchParams({v:userView,limit:'50',startIndex:d.startIndex,...(d.query?{q:d.query}:{})}),null,{method:'GET',adminCore:true,systemOnly:true,notice:'Chỉ System Developer có quyền đọc tài khoản Core. Dùng UUID trả về để cấp role và phân công workspace.'});
actions.grantAppRole=act('Thêm role ứng dụng cho tài khoản','metadata_admin','update',[id('user','Mã tài khoản (UUID)'),choice('role','Role ứng dụng cần thêm',roleChoices)],d=>'user/'+uuid(d.user),null,{adminCore:true,systemOnly:true,grantRole:true,notice:'Chỉ System Developer. Giữ nguyên mọi role đang có, thêm role ứng dụng; sau đó dùng Gán vai trò và cơ sở.'});
sections.find(s=>s.id==='identity').actions.push('updateContact','voidContact','updateAddress','voidAddress','fieldState','clearFieldState','identityConfiguration');
sections.find(s=>s.id==='clinical').actions.push('allergies','replaceDiagnosis');
sections.find(s=>s.id==='admin').actions.push('workspace','evaluate','assignWorkspace','revokeWorkspace','systemUsers','grantAppRole');
sections.find(s=>s.id==='admin').note='Quản lý phân công dùng API VinSHC. Tìm tài khoản và cấp role Core chỉ hiện cho System Developer; tài khoản quản trị ứng dụng vẫn bị backend kiểm tra quyền.';
