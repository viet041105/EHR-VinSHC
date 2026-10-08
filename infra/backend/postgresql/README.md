# PostgreSQL compatibility for the pinned OpenMRS release

Reference Application 3.7.1 / Core 2.8.8 has three issues reproduced on a fresh PostgreSQL 16 database: Appointments 2.1.0 uses MySQL-only migration SQL, Hibernate reads metadata `TEXT` columns as PostgreSQL large-object OIDs (`Bad value for type long`), and native ID generation references an absent `hibernate_sequence`. Switching only the Compose database image is insufficient.

## Appointments migration resources

`appointments/liquibase.xml` and `patientPastAppointmentsPostgreSql.sql` backport [Bahmni PR #162](https://github.com/Bahmni/openmrs-module-appointments/pull/162), pinned to commit `8bcacb87dd8eea27a6a8e3ae108b23d4cb00a80d`. The upstream patch applies to the resources embedded in Appointments 2.1.0; its four subsequent changesets are retained. The Docker build verifies the original OMOD SHA-256 (`602e16960918893ca9b54b9b23e0a0cd0cc59c078b9d19189cf2f430b3082acd`) and replaces resources in both the OMOD and nested API JAR. Java application code is unchanged. Upstream license is included in `appointments/LICENSE`.

This is a local backport of an upstream proposal, not an official new Appointments release. Its declared module version remains 2.1.0. Read `docs/VALIDATION.md` for the tested scope.

## Hibernate dialect

`VinSHCPostgreSQLDialect.java` extends the Hibernate 5.6 PostgreSQL dialect already bundled with Core. It maps CLOB reads/writes to JDBC strings and BLOB reads/writes to bytes, matching OpenMRS Liquibase `TEXT` / `BYTEA` columns instead of PostgreSQL OID large objects. Native ID generation uses the per-table identity columns created by Liquibase, rather than a missing shared `hibernate_sequence`. No application tables are converted to OIDs. The class is compiled against the pinned WAR during the Docker build and inserted as a separate JAR. Compose selects it through the upstream `OMRS_EXTRA_HIBERNATE_DIALECT` configuration hook.

When upgrading the upstream distro, review whether these workarounds are still necessary and rerun fresh database, module, REST/FHIR and persistence checks before removing them. Do not deploy this development baseline as a production configuration.
