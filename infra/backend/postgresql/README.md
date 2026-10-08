# PostgreSQL compatibility for the pinned OpenMRS release

Reference Application 3.7.1 / Core 2.8.8 needs compatibility repairs on a fresh PostgreSQL 16 database: Appointments 2.1.0 uses MySQL-only migration SQL, Hibernate reads metadata `TEXT` columns as PostgreSQL large-object OIDs (`Bad value for type long`), native ID generation references an absent `hibernate_sequence`, explicit seed IDs leave sequences behind, and two module binary columns use OIDs instead of bytes. Stock Management also performs expensive schema-wide checks. Switching only the Compose database image is insufficient.

## Appointments migration resources

`appointments/liquibase.xml` and `patientPastAppointmentsPostgreSql.sql` backport [Bahmni PR #162](https://github.com/Bahmni/openmrs-module-appointments/pull/162), pinned to commit `8bcacb87dd8eea27a6a8e3ae108b23d4cb00a80d`. The upstream patch applies to the resources embedded in Appointments 2.1.0; its four subsequent changesets are retained. The Docker build verifies the original OMOD SHA-256 (`602e16960918893ca9b54b9b23e0a0cd0cc59c078b9d19189cf2f430b3082acd`) and replaces resources in both the OMOD and nested API JAR. Java application code is unchanged. Upstream license is included in `appointments/LICENSE`.

This is a local backport of an upstream proposal, not an official new Appointments release. Its declared module version remains 2.1.0. Read `docs/VALIDATION.md` for the tested scope.

## Hibernate dialect

`VinSHCPostgreSQLDialect.java` extends the Hibernate 5.6 PostgreSQL dialect already bundled with Core. It maps CLOB reads/writes to JDBC strings and BLOB reads/writes to bytes, matching `TEXT` / `BYTEA` columns instead of PostgreSQL OID large objects. Native ID generation uses the per-table identity columns created by Liquibase, rather than a missing shared `hibernate_sequence`. The class is compiled against the pinned WAR during the Docker build and inserted as a separate JAR. Compose selects it through the upstream `OMRS_EXTRA_HIBERNATE_DIALECT` configuration hook.

The PostgreSQL-only changesets in `vinshc-reporting-bytea.xml` and `vinshc-openconceptlab-bytea.xml` convert Reporting's `contents` and Open Concept Lab's `hashed_url` from OID to BYTEA before module startup. They use [lo_get](https://www.postgresql.org/docs/16/lo-funcs.html) to preserve existing bytes and NULLs, retaining the old large objects. A missing/unreadable large object fails the migration instead of discarding its contents. Columns already using BYTEA are left unchanged. The build updates both OMOD and nested API resources after checking original SHA-256: Reporting `acb5c6ce4041c1ebe1a66818fb91435c81fc87fca98b74584822c36a4f33ce28`, Open Concept Lab `f45b04b30cc296bf23b92ec9bec3716c346d11337a23e0dbebaf4692795f00c6`.

When upgrading the upstream distro, review whether these workarounds are still necessary and rerun fresh database, module, REST/FHIR and persistence checks before removing them. Do not deploy this development baseline as a production configuration.

## Core seed IDs and PostgreSQL sequences

Core's fresh installation inserts explicit IDs into identity columns. PostgreSQL does not advance the associated sequences for those inserts, so later module migrations and API writes can fail with duplicate primary keys. `vinshc-postgresql-sequences.xml` adds one PostgreSQL-only changeset after Core's 2.8 updates, before modules start. It finds owned serial/identity sequences and advances only those behind an existing row ID. It leaves empty tables and sequences already ahead unchanged, and never rewinds a sequence. The build checks the original Core API JAR SHA-256 (`5d5c613488d44bbc947615bb500721ffcc4acb2d8e24864170f977dbe4f305fd`) before adding this resource and its include; existing Core changesets are retained.

See PostgreSQL's [sequence functions](https://www.postgresql.org/docs/16/functions-sequence.html) and [pg_get_serial_sequence](https://www.postgresql.org/docs/16/functions-info.html) documentation. This startup repair covers the pinned baseline's seed data; later imports that supply explicit IDs must also account for sequences.

## Stock Management migration performance

Stock Management 3.0.0 has 113 foreign-key preconditions without a target table. Each can snapshot the whole schema, making a fresh installation take tens of minutes. `ScopedStockPreconditions.java` runs only during the image build and replaces those checks with PostgreSQL catalog queries scoped to the actual table and constraint. It preserves the enclosing conditions, changeset IDs and migration operations; it does not skip creating tables or foreign keys. It handles PostgreSQL's 63-byte identifier limit for the module's ASCII names and rejects unexpected resources.

The original OMOD SHA-256 is checked (`110f8dc3f5b6483547f1d82795c12d21914e5293ee3dfd5ee7fa162501c71568`). Only the nested API JAR's migration resource is updated; no Stock Management Java code is changed. CI also checks the resulting 118 Stock Management foreign keys, which include older constraints outside the 113 rewritten preconditions. The build helper is not included in the running application. Catalog fields are documented in [pg_constraint](https://www.postgresql.org/docs/16/catalog-pg-constraint.html).
