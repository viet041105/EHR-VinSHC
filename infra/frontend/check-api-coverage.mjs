// Compare FE callers against every VinSHC controller mapping from the pinned main snapshot.
import './additional-actions.js';
import {actions} from './connected-actions.js';
import policies from './metadata/field-policies.json' with {type:'json'};
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.runtime/backend/infra/backend/vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/',import.meta.url));
const id='11111111-1111-4111-8111-111111111111',field=policies.fields[0];
const sample={patient:id,encounter:id,record:id,group:id,user:id,facility:id,role:'admin',fieldCode:field.code,...(field.rowKeyRequired?{rowKey:id}:{}),date:'2026-10-12',reason:'Contract check',includeHistory:'true',resource:'metadata_admin',action:'read',limit:'200',offset:'0'};
const callers=Object.entries(actions).filter(([,a])=>!a.adminCore).map(([name,a])=>({name,method:a.method||'POST',path:'/vinshc/'+a.path(sample).split('?')[0]}));
callers.push({name:'login',method:'GET',path:'/session'},{name:'submitVitals',method:'POST',path:'/vinshc/vitals'},{name:'loadProvinces',method:'GET',path:'/vinshc/address-catalogue'});
let total=0;const missing=[];
for(const file of readdirSync(dir).filter(f=>f.endsWith('Controller.java'))){
 const source=readFileSync(dir+file,'utf8'),base=source.match(/@RequestMapping\("\/rest\/v1([^"\n]+)"\)/)?.[1];if(!base)continue;
 for(const match of source.matchAll(/@(Get|Post|Delete|Put|Patch)Mapping\((?:path\s*=\s*)?"([^"]+)"/g)){
  total++;const method=match[1].toUpperCase(),path=base+match[2],pattern=new RegExp('^'+path.replace(/\{[^}]+\}/g,'[^/]+')+'$');
  if(!callers.some(c=>c.method===method&&pattern.test(c.path)))missing.push(method+' '+path);
 }
}
if(missing.length){console.error('Missing FE callers:',missing);process.exit(1);}
console.log('PASS: FE callers cover all '+total+' VinSHC controller mappings. This verifies route coverage, not runtime success of all writes or missing backend features.');
