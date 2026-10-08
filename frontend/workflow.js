/** Frontend demo workflow invariants; replace IDs and mutations with reviewed API calls. */
export const ROLE_PERMISSIONS={
 reception:['register','updatePatient','openVisit','appointments','queue'],
 nurse:['vitals','notes','documents','fillNurseForm'],
 doctor:['exam','notes','orders','documents','closeVisit','fillDoctorForm','appointments','prescriptions'],
 cashier:['billing','receipts'],
 lab:['results'],
 pharmacy:['dispense'],
 manager:['reports'],
 admin:['admin','forms','configuration','prices','connection','audit'],
};
// Proposed FE matrix, grounded in current PROJECT_PLAN and CLINIC_WORKFLOW; BE-05/DATA-04 remain open.
export const ROLE_DEFINITIONS={
 reception:{label:'Tiếp đón',title:'Không gian tiếp nhận',description:'Đối chiếu định danh, tiếp nhận và điều phối người bệnh.',
  pages:[['workspace','Tổng quan'],['patients','Tiếp nhận & hồ sơ'],['appointments','Lịch hẹn'],['queue','Điều phối'],['active','Lượt đang mở'],['history','Lịch sử tiếp nhận']],
  tabs:['overview','history'],defaultTab:'overview',noteTypes:[]},
 nurse:{label:'Điều dưỡng',title:'Không gian điều dưỡng',description:'Ghi sinh hiệu, theo dõi chăm sóc và bàn giao cho bác sĩ.',
  pages:[['workspace','Tổng quan'],['vitals','Đo sinh hiệu'],['active','Lượt đang mở'],['queue','Hàng đợi'],['patients','Hồ sơ chăm sóc'],['history','Lịch sử chăm sóc'],['templates','Biểu mẫu điều dưỡng']],
  tabs:['overview','vitals','allergies','meds','notes','orders','tests','documents','forms','exam','conditions','history'],defaultTab:'vitals',noteTypes:['Ghi chú điều dưỡng','Bàn giao chăm sóc']},
 doctor:{label:'Bác sĩ',title:'Không gian khám bệnh',description:'Thăm khám, ghi nhận chẩn đoán, điều trị và hoàn tất lượt khám.',
  pages:[['workspace','Tổng quan'],['active','Danh sách khám'],['patients','Hồ sơ bệnh nhân'],['queue','Hàng đợi'],['appointments','Lịch khám'],['history','Lịch sử khám'],['templates','Biểu mẫu khám']],
  tabs:['overview','exam','vitals','conditions','allergies','meds','notes','orders','tests','documents','forms','history'],defaultTab:'exam',noteTypes:['Ghi chú lâm sàng','Dặn dò']},
 cashier:{label:'Thu ngân',title:'Không gian thu ngân',description:'Lập phí, thu tiền, hoàn / hủy và đối chiếu phiếu thu.',
  pages:[['workspace','Tổng quan'],['billing','Thu phí dịch vụ'],['receipts','Phiếu thu'],['prices','Bảng giá']],tabs:[],defaultTab:null,noteTypes:[]},
 lab:{label:'Kỹ thuật viên CLS',title:'Không gian cận lâm sàng',description:'Thực hiện chỉ định được giao, ghi kết quả và đính kèm báo cáo.',
  pages:[['workspace','Tổng quan'],['lab','Chỉ định được giao']],tabs:[],defaultTab:null,noteTypes:[]},
 pharmacy:{label:'Dược / quầy thuốc',title:'Không gian quầy thuốc',description:'Đối chiếu đơn đã xác nhận và ghi nhận cấp thuốc theo đơn.',
  pages:[['workspace','Tổng quan'],['dispensing','Đơn chờ cấp thuốc']],tabs:[],defaultTab:null,noteTypes:[]},
 manager:{label:'Quản lý phòng khám',title:'Không gian quản lý',description:'Theo dõi lượt khám, doanh thu và công suất ở mức tổng hợp.',
  pages:[['workspace','Tổng quan'],['reports','Báo cáo hoạt động']],tabs:[],defaultTab:null,noteTypes:[]},
 admin:{label:'Quản trị',title:'Không gian quản trị',description:'Quản lý tài khoản, cấu hình và biểu mẫu của cơ sở.',
  pages:[['workspace','Tổng quan'],['admin','Tài khoản & quyền'],['templates','Quản lý biểu mẫu'],['settings','Cấu hình cơ sở'],['prices','Bảng giá cơ sở'],['audit','Nhật ký'],['connection','Kết nối OpenMRS']],
  tabs:[],defaultTab:null,noteTypes:[]},
};
const roleDefinition=role=>Object.hasOwn(ROLE_DEFINITIONS,role)?ROLE_DEFINITIONS[role]:undefined;
export const permitted=(role,action)=>Object.hasOwn(ROLE_PERMISSIONS,role)&&ROLE_PERMISSIONS[role].includes(action);
export const canOpenPage=(role,page)=>roleDefinition(role)?.pages.some(([id])=>id===page)===true;
export const canOpenTab=(role,tab)=>roleDefinition(role)?.tabs.includes(tab)===true;
export const canFillForm=(role,form)=>['nurse','doctor'].includes(role)&&form?.targetRole===role&&permitted(role,role==='nurse'?'fillNurseForm':'fillDoctorForm');
export const accountRoles=account=>[...new Set((Array.isArray(account?.roles)?account.roles:[account?.role]).filter(r=>typeof r==='string'&&Object.hasOwn(ROLE_DEFINITIONS,r)))];
export function demoAccount(accounts,id){return accounts.find(a=>a.id===id&&a.active===true&&accountRoles(a).length)||null;}
export function accountPermitted(account,action,facility={}){return !!account?.active&&(accountRoles(account).some(role=>permitted(role,action))||(action==='vitals'&&facility.hasNurse===false&&accountRoles(account).includes('doctor')));}
export function billTotal(bill){return bill.items.reduce((sum,item)=>sum+item.price*item.quantity,0);}
export function addPayment(bill,input,author){
 if(['cancelled','refunded'].includes(bill.status))throw Error('Phiếu phí đã hủy hoặc hoàn.');
 const total=billTotal(bill),paid=(bill.transactions||[]).reduce((sum,t)=>sum+t.amount,0),amount=Number(input.amount);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>total-paid)throw Error('Số tiền VND phải là số nguyên dương và không vượt số còn phải thu.');
 const transaction={id:crypto.randomUUID(),amount,method:input.method,created:new Date().toISOString(),author};
 (bill.transactions??=[]).push(transaction);bill.status=paid+amount===total?'paid':'partial';return transaction;
}
export function refundBill(bill,reason,author){
 if(!reason?.trim()||!['paid','partial'].includes(bill.status))throw Error('Cần phiếu đã thu tiền và lý do hoàn.');
 const paid=bill.transactions.reduce((sum,t)=>sum+t.amount,0);
 if(paid<=0)throw Error('Không có số tiền để hoàn.');
 bill.transactions.push({id:crypto.randomUUID(),amount:-paid,reason:reason.trim(),method:'Hoàn tiền',created:new Date().toISOString(),author});bill.status='refunded';
}
export function canWriteVisit(patient){return !!patient?.visit&&patient.visit.status!=='closed';}
export function createOrder(patient,input,author){
 if(!canWriteVisit(patient))throw Error('Cần lượt khám đang mở để tạo chỉ định.');
 if(!input.name?.trim()||!input.reason?.trim())throw Error('Cần tên dịch vụ và lý do chỉ định.');
 const order={id:crypto.randomUUID(),visitId:patient.visit.id,name:input.name.trim(),type:input.type,reason:input.reason.trim(),priority:input.priority||'Thường',status:'requested',created:new Date().toISOString(),author};
 (patient.visit.orders??=[]).push(order);return order;
}
export function recordResult(order,input,author){
 if(order.status==='cancelled')throw Error('Không thể nhập kết quả cho chỉ định đã hủy.');
 if(order.result?.state==='final')throw Error('Kết quả hoàn tất cần quy trình đính chính, không được ghi đè.');
 if(!['preliminary','final'].includes(input.state))throw Error('Trạng thái kết quả không hợp lệ.');
 if(!input.value?.trim())throw Error('Cần nhập kết quả hoặc báo cáo.');
 if(input.state==='final'&&input.confirmed!==true)throw Error('Cần xác nhận đối chiếu kết quả trước khi đánh dấu hoàn tất.');
 order.result={value:input.value.trim(),unit:input.unit||'',reference:input.reference||'',state:input.state,recorded:new Date().toISOString(),author};
 order.status=input.state==='final'?'completed':'in-progress';return order;
}
export function validateAppointment(appointments,input){
 if(!input.patientId||!input.time||!input.service||!input.provider)throw Error('Cần bệnh nhân, thời gian, dịch vụ và người khám.');
 if(new Date(input.time).getTime()<Date.now()-60000)throw Error('Thời gian hẹn phải ở hiện tại hoặc tương lai.');
 if(appointments.some(a=>a.status==='scheduled'&&a.time===input.time&&(a.patientId===input.patientId||(a.providerId||a.provider)===(input.providerId||input.provider))))throw Error('Bệnh nhân hoặc người khám đã có lịch ở thời điểm này.');
}
export function validateFormDefinition(fields){
 if(!fields.length)throw Error('Cần ít nhất một trường.');
 if(new Set(fields.map(f=>f.key)).size!==fields.length)throw Error('Mã trường không được trùng.');
 for(const f of fields){if(!/^[a-z][a-z0-9_]*$/.test(f.key)||!f.label.trim())throw Error('Mã trường dùng chữ thường/số/gạch dưới; nhãn không được trống.');if(f.concept&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.concept))throw Error('Concept UUID không đúng định dạng.');}
}
