/** Handoff definitions, not verified REST request schemas. See docs/FRONTEND.md. */
export const BACKEND_SERVICES = [
 {id:'access',name:'Phiên & quyền',module:'Core / REST / auth',milestone:'B1 · B5',scope:'User, provider, location, privileges',status:'Chờ hợp đồng quyền'},
 {id:'patient',name:'Hành chính & định danh',module:'Core / REST / idgen / addresshierarchy',milestone:'B2',scope:'Patient, Person, Identifier',status:'Chờ hợp đồng API'},
 {id:'visit',name:'Lượt khám & sinh hiệu',module:'Core / REST / forms',milestone:'B3',scope:'Visit → Encounter → Obs',status:'Chờ metadata & API'},
 {id:'exam',name:'Khám & đơn thuốc',module:'Core / REST / emrapi',milestone:'B4',scope:'Diagnosis, Allergy, Drug Order',status:'Chờ danh mục & API'},
 {id:'appointment',name:'Lịch hẹn & hàng đợi',module:'Appointments / Queue',milestone:'B8',scope:'Provider, service, slot, queue entry',status:'Chờ kiểm chứng module'},
 {id:'result',name:'Chỉ định & kết quả CLS',module:'Test Order / Obs / Attachments',milestone:'B8',scope:'Order, assignee, result, provenance',status:'Chờ kiểm chứng luồng'},
 {id:'billing',name:'Phí & giao dịch',module:'Billing / API mở rộng nếu cần',milestone:'B8',scope:'Price snapshot, bill, VND transaction',status:'Chờ kiểm chứng module'},
 {id:'dispense',name:'Cấp thuốc',module:'Dispensing / Stock Management',milestone:'B0 · B8',scope:'Đơn đã xác nhận, bản ghi cấp',status:'Chờ hợp đồng API'},
 {id:'report',name:'Báo cáo tổng hợp',module:'Reporting / aggregate API',milestone:'B8',scope:'Chỉ số theo ngày, không bệnh án',status:'Chờ hợp đồng báo cáo'},
 {id:'audit',name:'Audit & vận hành',module:'Core / cấu hình / API vận hành',milestone:'B5 · B6',scope:'Account, config, audit, backup status',status:'Chờ hợp đồng vận hành'},
];

export const VITAL_FIELD_MAP = Object.freeze([
 {key:'pulse',code:'vitals.mach',label:'Mạch',unit:'/min'},
 {key:'systolic',code:'vitals.ha_tam_thu',label:'Huyết áp tâm thu',unit:'mm[Hg]'},
 {key:'diastolic',code:'vitals.ha_tam_truong',label:'Huyết áp tâm trương',unit:'mm[Hg]'},
 {key:'temperature',code:'vitals.nhiet_do',label:'Nhiệt độ',unit:'Cel'},
 {key:'respiratory',code:'vitals.nhip_tho',label:'Nhịp thở',unit:'/min'},
 {key:'spo2',code:'vitals.spo2',label:'SpO₂',unit:'%'},
 {key:'weight',code:'vitals.can_nang',label:'Cân nặng',unit:'kg'},
 {key:'height',code:'vitals.chieu_cao',label:'Chiều cao',unit:'cm'},
].map(Object.freeze));

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid=value=>typeof value==='string'&&uuidPattern.test(value);
const validInstant=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
/** Canonical FE command only; the adapter must also verify links and metadata on the server. */
export function buildVitalsCommand({context,values,measuredAt,metadata}){
 for(const key of ['patientUuid','visitUuid','encounterUuid','providerUuid','locationUuid','userUuid']){
  if(!validUuid(context?.[key]))throw Error('Thiếu UUID hợp lệ: '+key);
 }
 if(!validInstant(measuredAt))throw Error('Thời điểm đo cần ISO 8601 có múi giờ.');
 if(typeof metadata?.version!=='string'||!metadata.version.trim())throw Error('Cần phiên bản metadata đã bàn giao.');
 const observations=[];
 for(const field of VITAL_FIELD_MAP){
  const raw=values?.[field.key];
  if(raw===null||raw===undefined||raw==='')continue;
  const value=typeof raw==='number'?raw:typeof raw==='string'&&raw.trim()?Number(raw):NaN;
  if(!Number.isFinite(value))throw Error('Giá trị không hợp lệ: '+field.label);
  const conceptUuid=metadata.concepts?.[field.code];
  if(!validUuid(conceptUuid))throw Error('Chưa có concept UUID: '+field.code);
  observations.push({fieldCode:field.code,conceptUuid,value,unit:field.unit});
 }
 if(!observations.length)throw Error('Chưa có chỉ số sinh hiệu.');
 if(new Set(observations.map(o=>o.conceptUuid)).size!==observations.length)throw Error('Concept UUID sinh hiệu bị trùng.');
 const links=Object.fromEntries(['patientUuid','visitUuid','encounterUuid','providerUuid','locationUuid','userUuid'].map(key=>[key,context[key]]));
 return {operation:'vitals.save',context:links,measuredAt,metadataVersion:metadata.version,observations};
}
