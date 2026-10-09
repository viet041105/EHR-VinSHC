/** Demo adapter only. No patient data is sent to OpenMRS. */
const KEY='vinshc-demo-v2';
const now=new Date();
const started=new Date(now.getTime()-60*60000).toISOString();
const sampleVitals={systolic:118,diastolic:76,pulse:78,temperature:36.8,respiratory:18,spo2:98,weight:58,height:162,measured:started,author:'Điều dưỡng (dữ liệu mẫu)',note:''};
export const samplePatients=[
{id:'BN-000128',name:'Nguyễn Minh Anh',gender:'Nữ',dob:'1992-05-18',phone:'0900000128',address:'Phường Bến Thành, TP. Hồ Chí Minh',identity:'',insurance:'',allergy:'Chưa khai thác',visit:{id:'LK-000241',started,reason:'Khám sức khỏe định kỳ',status:'open',vitals:sampleVitals},history:[]},
{id:'BN-000129',name:'Trần Quốc Bảo',gender:'Nam',dob:'1985-11-02',phone:'0900000129',address:'Phường Sài Gòn, TP. Hồ Chí Minh',allergy:'Chưa khai thác',visit:{id:'LK-000242',started,reason:'Tái khám theo hẹn',status:'open'},history:[]},
{id:'BN-000130',name:'Lê Ngọc Hà',gender:'Nữ',dob:'1978-08-24',phone:'0900000130',address:'Phường Xuân Hòa, TP. Hồ Chí Minh',allergy:'Không ghi nhận dị ứng sau khai thác',visit:{id:'LK-000243',started,reason:'Khám sức khỏe định kỳ',status:'closed',orders:[{id:'order-sample-result',visitId:'LK-000243',name:'Báo cáo xét nghiệm mô phỏng',type:'Xét nghiệm',reason:'Kiểm tra hiển thị dữ liệu giả',priority:'Thường',status:'completed',created:started,author:'Bác sĩ (dữ liệu mẫu)',result:{value:'Bản ghi kiểm thử giao diện; không phải kết quả xét nghiệm thực tế.',unit:'',reference:'',state:'final',recorded:started,author:'Nguồn kết quả giả lập'}}],vitals:{...sampleVitals,weight:62},exam:{reason:'Khám sức khỏe định kỳ',history:'Không ghi nhận triệu chứng trong dữ liệu mẫu.',clinical:'Thông tin mô phỏng phục vụ kiểm tra giao diện.',diagnosis:'Khám tổng quát',icd:'Z00.0',plan:'Kế hoạch giả định, không dùng làm hướng dẫn điều trị.',allergyState:'Không ghi nhận dị ứng sau khai thác',allergyDetail:'',medications:[],author:'Bác sĩ (dữ liệu mẫu)',recorded:started}},history:[]},
{id:'BN-000131',name:'Phạm Hoàng Nam',gender:'Nam',dob:'1998-03-10',phone:'0900000131',address:'Phường Tân Định, TP. Hồ Chí Minh',allergy:'Chưa khai thác',visit:{id:'LK-000244',started,reason:'Khám lần đầu',status:'open'},history:[]},
{id:'BN-000132',name:'Nguyễn Minh Anh',gender:'Nữ',dob:'2001-09-06',phone:'0900000132',address:'Phường Chợ Quán, TP. Hồ Chí Minh',allergy:'Chưa khai thác',visit:null,history:[]},
];
const defaultWorkspace=()=>({appointments:[],audit:[],bills:[],services:[{id:'service-exam',name:'Khám ngoại trú (mẫu)',price:50000},{id:'service-cls',name:'Dịch vụ CLS (mẫu)',price:75000}],accounts:[
 {id:'demo-doctor',name:'Bác sĩ trình diễn',role:'doctor',active:true},
 {id:'demo-nurse',name:'Điều dưỡng trình diễn',role:'nurse',active:true},
 {id:'demo-reception',name:'Lễ tân trình diễn',role:'reception',active:true},
 {id:'demo-cashier',name:'Thu ngân trình diễn',role:'cashier',active:true},
 {id:'demo-lab',name:'KTV CLS trình diễn',role:'lab',active:true},
 {id:'demo-pharmacy',name:'Dược trình diễn',role:'pharmacy',active:true},
 {id:'demo-manager',name:'Quản lý trình diễn',role:'manager',active:true},
 {id:'demo-admin',name:'Quản trị trình diễn',role:'admin',active:true},
],forms:[{id:'form-outpatient',name:'Phiếu khám ngoại trú',version:1,kind:'builtin',targetRole:'doctor',fields:[]},{id:'form-vitals',name:'Phiếu sinh hiệu',version:1,kind:'builtin',targetRole:'nurse',fields:[]}]});
export class DemoRepository {
 constructor(){
  let stored;
  try{stored=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('vinshc-demo-v1'));}catch{}
  const patients=Array.isArray(stored)?stored:stored?.patients;
  this.patients=Array.isArray(patients)&&patients.every(p=>p&&p.id&&p.name&&Array.isArray(p.history))?patients:structuredClone(samplePatients);
  const defaults=defaultWorkspace();
  this.workspace=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,Array.isArray(stored?.workspace?.[k])?stored.workspace[k]:v]));
  // Old custom forms did not define an audience; migrate to doctor instead of granting both clinical roles.
  this.workspace.forms=this.workspace.forms.map(f=>({...f,targetRole:['nurse','doctor'].includes(f.targetRole)?f.targetRole:f.id==='form-vitals'?'nurse':'doctor'}));
  this.workspace.facility={name:'VinSHC Development Clinic',address:'',license:'',paymentTiming:'after',hasNurse:true,hasPharmacy:true,clsMode:'onsite',...stored?.workspace?.facility};
  for(const a of defaults.accounts)if(!this.workspace.accounts.some(existing=>existing.id===a.id))this.workspace.accounts.push(a);
  this.workspace.accounts=this.workspace.accounts.map(a=>({...a,roles:Array.isArray(a.roles)?a.roles:[a.role]}));
  this.checkpoint=JSON.stringify({patients:this.patients,workspace:this.workspace});
 }
 save(){const payload=JSON.stringify({patients:this.patients,workspace:this.workspace});localStorage.setItem(KEY,payload);this.checkpoint=payload;}
 restore(){const saved=JSON.parse(this.checkpoint);this.patients=saved.patients;this.workspace=saved.workspace;}
}
