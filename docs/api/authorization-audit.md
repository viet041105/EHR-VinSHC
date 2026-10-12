# Authorization and audit (B5)

The VinSHC 0.3.0 module enforces the versioned eight-role matrix from `metadata/vinshc/permissions.json`. OpenMRS roles and the 69 scoped privileges are loaded by Initializer, while the backend binds each account to one or more server-side role/facility workspaces.

## Active workspace

Every scoped VinSHC request made by an application account sends:

```http
X-VinSHC-Workspace-Role: doctor
X-VinSHC-Workspace-Facility: <facility-location-uuid>
```

The headers select a workspace; they do not grant one. The backend verifies all of the following:

- the authenticated account holds the exact `VinSHC App: <role>` OpenMRS role;
- an active `vinshc_workspace_assignment` row binds that user, role and facility;
- the exact role—not the union of all roles on the account—contains the requested matrix privilege;
- patient/encounter data belongs to the assigned facility or one of its child locations.

Missing, forged or inactive workspace values return HTTP 403. This prevents a multi-role account operating in the admin workspace from inheriting its doctor workspace actions.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /vinshc/authorization/assignment` | Add or replace a user/role/facility assignment; protected by system administration or `metadata_admin update` |
| `DELETE /vinshc/authorization/assignment` | Revoke an assignment; protected by system administration or `metadata_admin void` |
| `GET /vinshc/authorization/workspace` | Validate and return the active workspace selected by the two headers |
| `GET /vinshc/authorization/evaluate?resource=...&action=...` | Evaluate one cell of the role matrix; allowed returns 200, denied returns 403 |
| `GET /vinshc/authorization/audit?patient=...&encounter=...` | Read append-only VinSHC access-audit rows |

Accounts and passwords are provisioned outside Git. Integration tests generate random local credentials in memory and void the accounts afterward.

## Core REST and FHIR boundary

Application roles do not receive broad Core privileges such as `Get Patients` or `Get Observations`. The VinSHC adapter temporarily proxies only the Core service privileges required after its own role/facility checks; this proxy applies only under `/vinshc/**`. Direct Core REST calls remain HTTP 403. FHIR2 4.2.0 may return HTTP 500 `OperationOutcome` instead of 403 for a missing privilege; this is the recorded upstream defect, not an authorization success.

## Audit coverage and limits

- B2 extension rows retain creator/time/version and append-only history.
- B4 writes create `vinshc_clinical_event` rows with actor, time, action, target, reason and bounded detail; native OpenMRS objects retain create/change/void provenance.
- VinSHC patient-identity, clinical-summary and allergy reads create append-only `vinshc_access_event` rows with actor, time, action and target.
- Direct Core REST/FHIR is denied to the eight app roles, so it cannot bypass the VinSHC access audit.

System administrators still have emergency Core access. OpenMRS does not provide record-level read audit for those direct administrator calls in this module. Before production, the operator must centralize gateway/application logs, restrict break-glass accounts, define retention and alerting, and test that an administrator's direct patient read can be reconstructed. This is a production compliance gate, not a claim that B5 application audit covers every infrastructure access path.

Runtime evidence: `tests/integration/test_b5_authorization.py`; report `.runtime/reports/b5-authorization.json`.
