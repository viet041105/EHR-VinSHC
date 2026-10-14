# P0 — Release and authorization bootstrap (14/10/2026)

## Scope and release policy

Release `0.3.0` is shared by the VinSHC Maven OMOD, metadata pack, frontend root package/lockfile and print contract. Pinned OpenMRS 3.7.1 / Core 2.8.8 / PostgreSQL 16.15 stay unchanged.

`config/baseline.json` contains `vinshcRelease` and requires module `vinshc: 0.3.0`. Expected runtime count: 30 started modules (29 reviewed upstream modules plus VinSHC).

**Do not rename** existing Liquibase `vinshc-0.4.0-*` identifiers. These are already-published changeset IDs, not the current application release; changing them could cause migrations to re-run.

## Authorization ownership

- Production Initializer CSVs live at `infra/backend/configuration/privileges/vinshc/metadata.csv` and `infra/backend/configuration/roles/vinshc/metadata.csv`. Dockerfile bakes them into `/openmrs/distribution/openmrs_config/`.
- The test overlay `tests/integration/compose.b4-metadata.yaml` **does not mount role/privilege CSVs**. Other test catalogues remain under `metadata/vinshc/initializer-test/` and are used only by synthetic B1–B11 integration tests.
- Eight roles have stable UUIDs and no inherited roles. Exactly 69 explicitly allowed privileges; the 896 permission-matrix cells default deny all unspecified combinations.
- On any matrix change, update production CSVs and verify with the checker. Do not introduce broad Core privileges to role CSVs. Fixture user accounts are created only in test scripts and are not baked into the image.

## Checks

Static, without OpenMRS:

```powershell
python scripts/check_p0.py
python -m unittest -v tests.test_p0_config
python scripts/check_config.py
python tools/metadata.py
npm --prefix infra/frontend test
```

Clean-database acceptance (dedicated project; **never** delete existing main project volumes):

```powershell
$env:COMPOSE_PROJECT_NAME = 'ehr-p0-local'
$env:EHR_HTTP_PORT = '18083'
docker compose -f compose.yaml build backend
docker compose -f compose.yaml up -d --wait --wait-timeout 2400
python scripts/check_p0.py --runtime --report .runtime/reports/p0-clean.json
python scripts/check_database.py
python scripts/smoke.py
```

The `--runtime` verifier checks the exact module versions/count, eight actual OpenMRS roles, their privilege sets and the 69 imported privilege records. B5 additionally checks denied direct Core REST/FHIR paths using synthetic employee accounts. Runtime checks require an isolated stack and its `EHR_HTTP_PORT` set in the invoking shell.

CI jobs:
- `configuration`: release/role static checks and unit tests.
- `p0_clean`: clean backend/database with **no** test metadata overlay, runtime import check and smoke.
- `smoke`: synthetic B1–B11 integration tests with necessary separate catalogue fixtures; those fixtures are not part of production role provisioning.

## Boundaries and approvals

- This phase is a **technical production-configuration bootstrap**, not approval to process real patient data.
- `metadata/vinshc/contracts/printing-reporting.json` is still `testOnly: true`; form/legal signature and clinical catalogue approvals remain P7 gates.
- Keep the conclusion `NOT APPROVED FOR REAL DATA` until the gates in `docs/PILOT_READINESS.md` have owners and evidence.
- No fixture accounts/passwords are included in production role/privilege CSVs; changes to stored patient data require new Liquibase changesets.

## Evidence

Local clean-stack verification on 14/10/2026 (isolated project `ehr-p0-local`, port `18083`): 30/30 modules started including `vinshc: 0.3.0`; 8/8 production roles; 69/69 privileges; role sets exactly match the 896-cell permission matrix; PostgreSQL 16.15 and smoke REST/FHIR passed. Source base commit `d0d28f2` (working tree có thay đổi chưa commit); backend image ID được xác nhận từ container đang chạy: `sha256:4f9fdb67749a608779e4d666c8cd8d26ec02f77639a19256ba4ef6a41b762849`. These are local working-tree results; CI run and approval remain separate.

Regression evidence (project `ehr-p0-local`, synthetic fixtures isolated): B1 4/4, B2 5/5, B3 6/6, B23 5/5, B4a 6/6, B4b 9/9, B5 5/5, B7 6/6, B8 7/7, B9 restart 4/4, B10 16/16, B11 12/12. Real user-account matrix tests in B5 include denial of direct Core REST/FHIR bypass attempts. Local Python/tooling tests, Maven build/unit tests, FE `npm test` and metadata validation also passed. The project used PostgreSQL 16.15 with 257 OpenMRS tables and 118 stock-management foreign keys. B7 was made repeatable after B8 by checking ownership of existing ServiceRequests instead of requiring zero orders.

Regression tests can be run with `VINSHC_TEST_FIXTURE_DIR=.runtime/p0-ehr-p0-local/fixtures` and `VINSHC_TEST_REPORT_DIR=.runtime/p0-ehr-p0-local/reports` to prevent stale UUIDs from another Compose project being reused. The default CI paths remain unchanged. B7 ServiceRequest tests validate patient scoping even when B8 has already created an order.

Backup/restore cũng đã kiểm chứng trên project độc lập `ehr-p0-restore` (port `18089`): backup PostgreSQL và `/openmrs/data` có manifest/checksum; restore thành công; 30/30 module, 8/8 role và 69/69 privilege vẫn hợp lệ; REST/FHIR fixture đọc lại; B9 restore **4/4** (gồm đối chiếu SHA-256 của tệp attachment). Sau B10–B11, báo cáo tổng hợp tăng từ 7 lên 11 lượt khám; B9 được so với snapshot read-only của database nguồn tại cùng mốc restore, không so với snapshot B8 cũ. Kết quả so sánh nguồn/restore: `openedVisits=11` ở cả hai. B8 report gốc được giữ nguyên; bản sao snapshot phục vụ kiểm chứng nằm trong `.runtime/p0-ehr-p0-restore/reports/`. Biên bản phục hồi: `.runtime/reports/b6-ehr-p0-restore-recovery.json`; B9: `.runtime/p0-ehr-p0-restore/reports/b9-restore.json`. Image ID của container restore: `sha256:f29ef6283b3fb12ad620646ecee0e37fdd4033a13f02685ee620129c1ec04d07`.

Runtime results should be saved to `.runtime/reports/p0-clean.json` (ignored by Git). The report includes release, module inventory, role counts and source versions; no password or patient payload.

For the run that actually completes the P0 checklist, record the commit, tested image digest and actual result counts in a review note. Static passing tests alone are not sufficient to mark runtime acceptance.
