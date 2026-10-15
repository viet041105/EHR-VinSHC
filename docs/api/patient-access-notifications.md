# Patient account handoff and notifications

The workflow is **reception registers the existing patient and hands the visit to a doctor → doctor requests an account → system administrator creates it**. Reception does not issue credentials. The administrator confirms the clinic record in the same account form; there is no separate verification screen. Accounts use the existing `VinSHC Portal: patient` role and the patient's original Person. Creating an account never creates a second patient or publishes clinical records.

Backend prefix: `/openmrs/ws/rest/v1/vinshc`. FE same-origin prefix: `/api/vinshc`.

## Authorization

- Staff endpoints require an authenticated user and a valid role/facility workspace. A doctor may request only for a visit with their explicit provider link in a non-voided encounter or an assigned waiting/called/in-service queue entry. A facility visit alone does not prove that relationship.
- Doctors list/read their own requests. Administrators list/read requests for their current facility. Fulfill/reject additionally require System Developer. Application admin without that privilege sees the inbox with write capabilities disabled.
- Patient identities and recipients are derived on the server. A request cannot inject roles, recipients, Core user IDs or a different patient at fulfillment time.
- Notifications belong to one user, role and workspace facility. Portal accounts additionally require an active verified link; they can read/mark only their own notices. The portal allowlist still blocks staff, request, Core REST and FHIR APIs.

## Requests

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/patient-access/requests` | Optional `status=pending\|fulfilled\|rejected`, `patientUuid`, `limit` (1–100), `offset` (0–100000). `{results,hasMore,limit,offset,capabilities:{request,fulfill,reject}}` |
| GET | `/patient-access/requests/{uuid}` | One authorized request |
| POST | `/patient-access/requests` | `{type,patientUuid,visitUuid,note?,idempotencyKey}` → 201; `type=patient_account_create\|patient_password_reset` |
| POST | `/patient-access/requests/{uuid}/fulfill` | `{username?,password,verificationMethod,idempotencyKey}`; username required only for creation |
| POST | `/patient-access/requests/{uuid}/reject` | `{reason}` |

Safe request projection: `{uuid,type,status,patientUuid,patientName,patientIdentifier,visitUuid,requesterName,createdAt,processedAt,note,reason,username}`. Password/hash/salt never appear in it.

FE sends `verificationMethod=verified_clinic_record` only after the administrator explicitly confirms the record in the create/reset form. The existing methods `in_person_document` and `verified_eid` remain valid for API callers who actually performed those checks. An API method name does not claim integration with electronic identity providers.

Username follows the existing staff/Core format: 3–50 ASCII letters/digits/`.`/`_`/`-`, starts with a letter/digit. Portal creation/reset requires 12–256 password characters and rejects leading/trailing whitespace. A reset requires exactly one active, verified, non-retired patient account without staff/System Developer roles. It does not reactivate a revoked link or rename a user.

### Atomicity and replay

- Creating a request locks the actor/idempotency key and patient. Replaying the same actor/key with the same patient/visit/type/note returns the original request. Reusing it for another payload returns 409. A partial unique index allows one pending request per patient/type.
- Fulfillment/rejection share the patient lock. A fulfillment transaction creates the Core user, adds the portal role, links and verifies the original patient, completes the request, appends audit records and writes notifications together. Failure rolls it all back.
- An existing non-retired user for this Person prevents duplicate creation. Linking an existing manual Core account remains available through the existing portal administration APIs.
- Replaying a fulfilled request with its original fulfillment key returns the saved projection and does not create another user or reset the password again. A different key or conflicting username returns 409. No plaintext password or password fingerprint is retained for replay.
- A repeated rejection with the same reason is idempotent. A processed request cannot be fulfilled/rejected again with a different action.

## Notifications

| Method | Path | Result |
| --- | --- | --- |
| GET | `/notifications?limit=&offset=` | `{results,hasMore,limit,offset,unreadCount}` in newest-first order |
| POST | `/notifications/{uuid}/read` | Idempotent mark-read for the current recipient; `{uuid,read,unreadCount}` |
| POST | `/notifications/read-all` | Marks through a server-side notification ID watermark; later events remain unread |

Each notice is `{uuid,type,title,message,createdAt,readAt,target}`. Targets are allowlisted objects (`patient_access_request/requestUuid`, `visit/visitUuid`, `portal_visit/visitUuid`) or null, never arbitrary URLs. Notices use generic text without patient history, notes, credentials or tokens.

Events are written when an assigned queue entry is created/advanced, a doctor submits an account/reset request, an administrator completes/rejects it, and a portal account is created/reset. Doctor recipients come from the active provider link plus active workspace assignment, including ancestor facilities of the queue location. Administrator recipients come from active admin assignments at the request facility. Event keys make delivery idempotent. An expired/revoked assignment cannot read a previous workspace's inbox.

## Migration and validation

Changeset `vinshc-20261016-patient-access-notifications` adds `vinshc_patient_access_request` and `vinshc_notification`, constraints and indexes. Existing changesets, clinical data and volumes are preserved. Back up before updating an existing local stack.

Synthetic acceptance lives in `tests/integration/test_patient_access_notifications.py`. It refuses every origin except the dedicated test backend `http://127.0.0.1:17888`; do not run its writes against the user's local clinic. `tests/integration/compose.patient-access.yaml` is an override for `compose.yaml` with project name `vinshc-patient-access-test`. Start only its `db` and `backend` services, with a separate test volume and environment file; the image is `vinshc-patient-access:dev`.

Run acceptance after that test backend is ready:

```sh
VINSHC_PATIENT_ACCESS_TEST_BASE=http://127.0.0.1:17888 \
python3 -m unittest -v tests.integration.test_patient_access_notifications
```

The suite covers reception/doctor/admin/patient handoff, isolation, persistent read state, reset/reject, concurrent replay, validation/rollback and real FE browser flows at 1440/390 px. Its browser script forwards API traffic to the isolated backend instead of mocking responses. Credentials stay in environment/memory; fixtures are confined to the test DB.

Validation on 2026-10-16: all 8 acceptance tests passed on the final image, including an injected database failure that rolls back the new user/link and permits retry. The real browser handoff passed at both widths. Backend build passed 22 unit tests; FE passed 39 unit tests, build and 135 API mappings. The updated local clinic passed the read-only browser smoke and returned HTTP 200 for both new GET endpoints through FE. Its original 3 users and zero patients/visits/encounters were preserved; the new tables remained empty. The dedicated test stack was stopped after verification, with its volumes retained.
