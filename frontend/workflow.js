/** Frontend demo workflow invariants; replace IDs and mutations with reviewed API calls. */
export const ROLE_PERMISSIONS={
 reception:['register','appointments','queue'],
 nurse:['vitals','notes','documents','results'],
 doctor:['exam','notes','orders','documents'],
 admin:['register','appointments','queue','vitals','exam','notes','orders','documents','results','admin','forms'],
};
export const permitted=(role,action)=>ROLE_PERMISSIONS[role]?.includes(action)===true;
export function canWriteVisit(patient){return !!patient?.visit&&patient.visit.status!=='closed';}
export function createOrder(patient,input,author){
 if(!canWriteVisit(patient))throw Error('Cần lượt khám đang mở để tạo chỉ định.');
 if(!input.name?.trim()||!input.reason?.trim())throw Error('Cần tên dịch vụ và lý do chỉ định.');
 const order={id:crypto.randomUUID(),visitId:patient.visit.id,name:input.name.trim(),type:input.type,reason:input.reason.trim(),priority:input.priority||'Thường',status:'requested',created:new Date().toISOString(),author};
 (patient.visit.orders??=[]).push(order);return order;
}
export function recordResult(order,input,author){
 if(order.status==='cancelled')throw Error('Không thể nhập kết quả cho chỉ định đã hủy.');
 if(!input.value?.trim())throw Error('Cần nhập kết quả hoặc báo cáo.');
 if(input.state==='final'&&!input.confirmed)throw Error('Cần xác nhận đối chiếu kết quả trước khi đánh dấu hoàn tất.');
 order.result={value:input.value.trim(),unit:input.unit||'',reference:input.reference||'',state:input.state,recorded:new Date().toISOString(),author};
 order.status=input.state==='final'?'completed':'in-progress';return order;
}
export function validateAppointment(appointments,input){
 if(!input.patientId||!input.time||!input.service||!input.provider)throw Error('Cần bệnh nhân, thời gian, dịch vụ và người khám.');
 if(new Date(input.time).getTime()<Date.now()-60000)throw Error('Thời gian hẹn phải ở hiện tại hoặc tương lai.');
 if(appointments.some(a=>a.status==='scheduled'&&a.time===input.time&&(a.patientId===input.patientId||a.provider===input.provider)))throw Error('Bệnh nhân hoặc người khám đã có lịch ở thời điểm này.');
}
export function validateFormDefinition(fields){
 if(!fields.length)throw Error('Cần ít nhất một trường.');
 if(new Set(fields.map(f=>f.key)).size!==fields.length)throw Error('Mã trường không được trùng.');
 for(const f of fields){if(!/^[a-z][a-z0-9_]*$/.test(f.key)||!f.label.trim())throw Error('Mã trường dùng chữ thường/số/gạch dưới; nhãn không được trống.');if(f.concept&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.concept))throw Error('Concept UUID không đúng định dạng.');}
}
