-- OpenMRS name matching and PostgreSQL UUID functions.
-- The official PostgreSQL entrypoint runs this in POSTGRES_DB on first startup.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
