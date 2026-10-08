"""Verify the real local PostgreSQL version, OpenMRS extensions and schema."""

import json
import subprocess
import sys

from common import ROOT, read_settings


REQUIRED_TABLES = {"person", "patient", "patient_identifier", "visit", "encounter",
                   "obs", "concept", "drug", "location", "orders", "liquibasechangelog"}
SQL = """
SELECT json_build_object(
  'version', current_setting('server_version'),
  'database', current_database(),
  'encoding', current_setting('server_encoding'),
  'extensions', ARRAY(SELECT extname FROM pg_extension ORDER BY extname),
  'stockForeignKeyCount', (SELECT count(*) FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public' AND t.relname LIKE 'stockmgmt_%'),
  'moduleBinaryColumnCount', (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND udt_name = 'bytea'
      AND (table_name, column_name) IN (('openconceptlab_item', 'hashed_url'),
                                       ('reporting_report_design_resource', 'contents'))),
  'tables', ARRAY(SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename)
);
"""


def verify_snapshot(snapshot, baseline):
    expected = baseline["database"]
    version = snapshot.get("version", "").split()
    if expected["engine"] != "postgresql" or not version or version[0] != expected["version"]:
        raise ValueError("Database is not the reviewed PostgreSQL version.")
    if snapshot.get("database") != "openmrs" or snapshot.get("encoding") != "UTF8":
        raise ValueError("OpenMRS must use its UTF8 PostgreSQL database.")
    if not set(expected["extensions"]).issubset(snapshot.get("extensions", [])):
        raise ValueError("PostgreSQL is missing required OpenMRS extensions.")
    if not REQUIRED_TABLES.issubset(snapshot.get("tables", [])):
        raise ValueError("OpenMRS schema initialization is incomplete.")
    if snapshot.get("stockForeignKeyCount") != expected["stockForeignKeyCount"]:
        raise ValueError("Stock Management foreign-key migrations are incomplete.")
    if snapshot.get("moduleBinaryColumnCount") != 2:
        raise ValueError("Module binary columns do not match the PostgreSQL Hibernate dialect.")


def main():
    read_settings()
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "db", "sh", "-c",
         'exec psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-psqlrc '
         '--set=ON_ERROR_STOP=1 --tuples-only --no-align --command="$1"', "check-schema", SQL],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
    )
    if result.returncode:
        raise ValueError("Cannot inspect PostgreSQL. Check this Compose project's database service.")
    snapshot = json.loads(result.stdout)
    baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
    verify_snapshot(snapshot, baseline)
    report = {"passed": True, "engine": "postgresql", "version": snapshot["version"],
              "encoding": snapshot["encoding"], "extensions": snapshot["extensions"],
              "tableCount": len(snapshot["tables"]),
              "stockForeignKeyCount": snapshot["stockForeignKeyCount"],
              "moduleBinaryColumnCount": snapshot["moduleBinaryColumnCount"]}
    destination = ROOT / ".runtime/reports/database.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: PostgreSQL {baseline['database']['version']}, UTF8, OpenMRS extensions "
          f"and {report['tableCount']} tables; {report['stockForeignKeyCount']} Stock Management foreign keys.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, IndexError, subprocess.TimeoutExpired) as error:
        print(f"Database check failed: {error}", file=sys.stderr)
        sys.exit(1)
