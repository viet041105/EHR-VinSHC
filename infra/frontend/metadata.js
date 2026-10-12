import map from './metadata/frontend-map.json' with {type:'json'};
import permissions from './metadata/permissions.json' with {type:'json'};
import diagnoses from './metadata/catalogues/icd10-mvp.json' with {type:'json'};
import medications from './metadata/catalogues/medications.json' with {type:'json'};
import units from './metadata/catalogues/medication-units.json' with {type:'json'};
import allergies from './metadata/catalogues/allergies.json' with {type:'json'};
import services from './metadata/catalogues/services.json' with {type:'json'};
import facilities from './metadata/catalogues/facilities.json' with {type:'json'};
import relationships from './metadata/catalogues/contact-relationships.json' with {type:'json'};
import workflow from './metadata/contracts/workflow.json' with {type:'json'};
export const metadata={map,permissions,diagnoses,medications,units,allergies,services,facilities,relationships,workflow};
export const active=records=>(records||[]).filter(r=>r.active!==false&&!r.retired);
export function permitted(role,resource,action){return Boolean(permissions.matrix.find(r=>r.role===role&&r.resource===resource)?.actions[action]);}
export function assignedRoles(user){
 const names=new Set((user.roles||[]).map(r=>typeof r==='string'?r:r.name||r.display));
 return Object.entries(permissions.roles).filter(([,r])=>names.has(r.openmrs.name)).map(([id])=>id);
}
// Business facility UUID and OpenMRS location UUID are different identities.
export function facilityForLocation(location){return active(facilities.records).find(f=>f.locationUuid===location);}
