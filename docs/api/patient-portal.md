# Patient portal MVP contract

The patient uses an OpenMRS login. The server binds that account to the same Person/Patient; there is no patient selector or user-supplied patient UUID in self-service reads. Contact/relative records do not grant access.

## Account setup

An administrator first creates an ordinary OpenMRS user with the existing patient's Person UUID and a password through the administrator UI/Core user API. Do not give this account staff roles or System Developer. Credentials stay outside Git.

- POST /openmrs/ws/rest/v1/vinshc/portal/accounts with {userUuid, patientUuid}: requires metadata_admin update (or System Developer). Confirms identical Person IDs, adds the dedicated VinSHC Portal: patient role, and activates a unique user–patient link. Repeating the same link is idempotent; a different patient is rejected.
- DELETE /portal/accounts/{userUuid}: revokes the link. The account keeps its restrictive portal role; subsequent self-service reads are denied.
- GET /portal/session: {persona: "patient", patientUuid}. Authentication and active link are checked on every request, including agent requests.

The web portal is /portal.html. Basic credentials live only in browser memory and are forwarded through the same-origin proxy. There is no shared staff/admin account for patient reads.

## Publication by a doctor

POST /portal/visits/{visitUuid}/publication with {encounterUuid} requires an authenticated doctor workspace and finalization authorization. The encounter must belong to the visit and current facility and already be finalized.

Publication is explicit: finalization alone does not expose a chart. The server copies only exam.loi_dan, followup.ngay_tai_kham, followup.loi_dan and confirmed encounter prescriptions (name/strength/dose/units/frequency/route/duration/instructions/status). History, examinations, internal notes, diagnoses and raw staff DTOs are excluded.

Each publication has a new version, timestamp, author and source revision. Previous versions remain stored but inactive. A clinical event changing that encounter hides its current publication until the doctor republishes. Publishing uses the same encounter/medication transaction locks as clinical writes. DELETE /portal/visits/{visitUuid}/publication withdraws the current publication.

## Self-service GET endpoints

All bodies include patientUuid resolved from the authenticated account:

- /portal/visits: results[{uuid,startDatetime,facilityName,serviceName,publishedAt,version}]; only currently valid publications, newest first, at most 100.
- /portal/visits/{uuid}/instructions: {visitUuid,publishedAt,version,items[{field,label,text}]}.
- /portal/prescriptions?visit={uuid}: results of published prescriptions, retaining status and confirmedAt. Without visit, the current published snapshots are listed.
- /portal/appointments: own appointments only, {uuid,startAt,serviceName,status}; no staff notes or other identities, at most 100.

Foreign/unpublished/revoked instructions return 403. Revoked/unlinked accounts return 403; invalid credentials return 401. A dedicated MVC interceptor plus a servlet filter on the authenticated HAPI forward restrict portal accounts to these GET routes and the session endpoint, blocking staff, Core REST and FHIR routes. Reads are audited; agent reads carry an agent: origin marker. This marker does not grant permission.

## Agent scope

VINSHC_AGENT_PATIENT_PORTAL=http enables the real API adapter. The optional visitUuid in POST /v1/patient/chat is checked against the patient's published instructions before any model call. The four tools can only read this account's published data; they never use staff credentials.

The doctor agent additionally requires a provider–patient encounter relationship plus the normal workspace/facility scope. A clinician without that relationship receives a limited answer with a forbidden source error.

## Verification

The B12 integration suite uses a fresh synthetic clinic, two patient accounts and assigned/unassigned doctors. It checks publication/finalization, forbidden cross-patient/Core/FHIR access, real backend reads through the web proxy, redaction, audit, revision invalidation, republishing, publication withdrawal and account revocation. Clinical language/model quality evaluation is deferred.
