"""Create and restore a verified VinSHC backup on isolated Docker Compose projects."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone

from common import ROOT, read_settings


FORMAT_VERSION = 1
PROJECT_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")
CONFIG_PATHS = (
    "compose.yaml",
    "config/baseline.json",
    "infra/backend/Dockerfile",
)


class RecoveryError(RuntimeError):
    pass


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checked_project(value):
    if not PROJECT_PATTERN.fullmatch(value or ""):
        raise argparse.ArgumentTypeError("project must use 2-63 lowercase letters, digits, '_' or '-'")
    return value


def compose_command(project, compose_files, *arguments):
    command = ["docker", "compose", "-p", project]
    for path in compose_files:
        command.extend(("-f", str(path)))
    command.extend(arguments)
    return command


def run(command, *, input_file=None, output_file=None, timeout=1200, env=None):
    stdin = input_file.open("rb") if input_file else None
    stdout = output_file.open("wb") if output_file else subprocess.PIPE
    try:
        result = subprocess.run(command, cwd=ROOT, stdin=stdin, stdout=stdout,
                                stderr=subprocess.PIPE, timeout=timeout, env=env, check=False)
    finally:
        if stdin:
            stdin.close()
        if output_file:
            stdout.close()
    if result.returncode:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise RecoveryError(f"command failed ({command[0]} {command[1]}): {detail[-1000:]}")
    return b"" if output_file else result.stdout


def compose_config(project, compose_files):
    raw = run(compose_command(project, compose_files, "config", "--format", "json"))
    return json.loads(raw.decode("utf-8"))


def container_id(project, compose_files, service):
    value = run(compose_command(project, compose_files, "ps", "-aq", service)).decode().strip()
    if not value:
        raise RecoveryError(f"{project}: service {service} has no container")
    return value


def service_state(container):
    raw = run(["docker", "inspect", "--format", "{{json .State}}", container])
    return json.loads(raw.decode("utf-8"))


def require_healthy(project, compose_files):
    for service in ("db", "backend", "frontend", "gateway"):
        state = service_state(container_id(project, compose_files, service))
        health = state.get("Health", {}).get("Status")
        if not state.get("Running") or health != "healthy":
            raise RecoveryError(f"{project}: {service} must be running and healthy, got {health or 'no health'}")


def resolved_files(values):
    files = [Path(value).resolve() for value in (values or [ROOT / "compose.yaml"])]
    for path in files:
        if not path.is_file():
            raise RecoveryError(f"Compose file does not exist: {path}")
    return files


def config_evidence(compose_files):
    paths = [ROOT / path for path in CONFIG_PATHS]
    paths.extend(path for path in compose_files if path not in paths)
    unique = []
    for path in paths:
        path = path.resolve()
        if path not in unique:
            unique.append(path)
    return [{"path": str(path.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(path)}
            for path in unique]


def image_evidence(project, compose_files):
    evidence = {}
    for service in ("db", "backend", "frontend", "gateway"):
        container = container_id(project, compose_files, service)
        raw = run(["docker", "inspect", "--format",
                   "{{json .Config.Image}}|{{json .Image}}", container]).decode().strip()
        configured, image_id = raw.split("|", 1)
        evidence[service] = {"configured": json.loads(configured), "imageId": json.loads(image_id)}
    return evidence


def validate_archive_paths(archive, destination):
    destination = Path(destination).resolve()
    with tarfile.open(archive, "r:gz") as source:
        for member in source.getmembers():
            target = (destination / member.name).resolve()
            if target != destination and destination not in target.parents:
                raise RecoveryError("OpenMRS data archive contains an unsafe path")
            if member.issym() or member.islnk():
                if Path(member.linkname).is_absolute():
                    raise RecoveryError("OpenMRS data archive contains an unsafe link")
                link = (target.parent / member.linkname).resolve()
                if link != destination and destination not in link.parents:
                    raise RecoveryError("OpenMRS data archive contains an unsafe link")


def safe_extract(archive, destination):
    validate_archive_paths(archive, destination)
    destination = Path(destination).resolve()
    with tarfile.open(archive, "r:gz") as source:
        source.extractall(destination, filter="data")


def archive_openmrs_data(volume, image, destination):
    run(["docker", "run", "--rm", "--user", "0:0", "--entrypoint", "tar",
         "-v", f"{volume}:/source:ro", image, "-C", "/source", "-czf", "-", "."],
        output_file=destination)


def backup(args):
    started = time.monotonic()
    compose_files = resolved_files(args.compose_file)
    destination = args.output.resolve()
    if destination.exists():
        raise RecoveryError(f"backup destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir()
    require_healthy(args.project, compose_files)
    config = compose_config(args.project, compose_files)
    stopped = False
    try:
        snapshot_started = time.monotonic()
        run(compose_command(args.project, compose_files, "stop", "gateway", "frontend", "backend"))
        stopped = True
        dump = destination / "openmrs.pgdump"
        run(compose_command(args.project, compose_files, "exec", "-T", "db", "sh", "-c",
                            'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" '
                            "--format=custom --compress=9 --no-owner --no-acl"), output_file=dump)
        data_archive = destination / "openmrs-data.tar.gz"
        volume = config["volumes"]["openmrs-pg-data"]["name"]
        image = config["services"]["db"]["image"]
        archive_openmrs_data(volume, image, data_archive)
        manifest = {
            "formatVersion": FORMAT_VERSION,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceProject": args.project,
            "consistency": "application services stopped; PostgreSQL custom-format snapshot",
            "snapshotSeconds": round(time.monotonic() - snapshot_started, 3),
            "database": {"file": dump.name, "sha256": sha256(dump), "bytes": dump.stat().st_size},
            "openmrsData": {"file": data_archive.name, "sha256": sha256(data_archive),
                             "bytes": data_archive.stat().st_size},
            "configuration": config_evidence(compose_files),
            "images": image_evidence(args.project, compose_files),
            "volumes": config.get("volumes", {}),
        }
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise
    finally:
        if stopped:
            run(compose_command(args.project, compose_files, "up", "-d", "--wait",
                                "--wait-timeout", str(args.wait_timeout)), timeout=args.wait_timeout + 60)
    elapsed = round(time.monotonic() - started, 3)
    report = {"passed": True, "operation": "backup", "project": args.project,
              "backup": str(destination), "elapsedSeconds": elapsed}
    report_path = ROOT / ".runtime/reports" / f"b6-{args.project}-backup.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


def verify_backup(directory, compose_files):
    manifest_path = directory / "manifest.json"
    if not manifest_path.is_file():
        raise RecoveryError("backup manifest is missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("formatVersion") != FORMAT_VERSION:
        raise RecoveryError("unsupported backup format version")
    for key in ("database", "openmrsData"):
        artifact = directory / manifest[key]["file"]
        if not artifact.is_file() or sha256(artifact) != manifest[key]["sha256"]:
            raise RecoveryError(f"{key} artifact is missing or has a checksum mismatch")
    current = {item["path"]: item["sha256"] for item in config_evidence(compose_files)}
    recorded = {item["path"]: item["sha256"] for item in manifest["configuration"]}
    if current != recorded:
        raise RecoveryError("current Compose/configuration files do not match the backup")
    return manifest


def assert_empty_project(project, compose_files):
    containers = run(compose_command(project, compose_files, "ps", "-aq")).decode().split()
    config = compose_config(project, compose_files)
    volumes = [value["name"] for value in config.get("volumes", {}).values()]
    existing = []
    for volume in volumes:
        result = subprocess.run(["docker", "volume", "inspect", volume], cwd=ROOT,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        if result.returncode == 0:
            existing.append(volume)
    if containers or existing:
        raise RecoveryError("restore target is not empty; choose a new Compose project name")
    return config


def restore_openmrs_data(project, volume, image, archive):
    validate_archive_paths(archive, Path("/openmrs/data"))
    run(["docker", "volume", "create", "--label", f"com.docker.compose.project={project}",
         "--label", "com.docker.compose.volume=openmrs-pg-data", volume])
    run(["docker", "run", "--rm", "--user", "0:0", "--entrypoint", "tar",
         "-i", "-v", f"{volume}:/target", image, "-C", "/target", "-xzf", "-"],
        input_file=archive)


def cleanup_project(project, compose_files):
    subprocess.run(compose_command(project, compose_files, "down", "-v", "--remove-orphans"),
                   cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def restore(args):
    started = time.monotonic()
    compose_files = resolved_files(args.compose_file)
    directory = args.input.resolve()
    manifest = verify_backup(directory, compose_files)
    if args.project == manifest.get("sourceProject"):
        raise RecoveryError("restore target must differ from the source project")
    config = assert_empty_project(args.project, compose_files)
    environment = os.environ.copy()
    environment["COMPOSE_PROJECT_NAME"] = args.project
    environment["EHR_HTTP_PORT"] = str(args.http_port)
    try:
        run(compose_command(args.project, compose_files, "up", "-d", "--wait", "--wait-timeout",
                            str(args.wait_timeout), "db"), timeout=args.wait_timeout + 60, env=environment)
        dump = directory / manifest["database"]["file"]
        run(compose_command(args.project, compose_files, "exec", "-T", "db", "sh", "-c",
                            'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" '
                            "--clean --if-exists --no-owner --no-acl --exit-on-error"),
            input_file=dump, env=environment)
        volume = config["volumes"]["openmrs-pg-data"]["name"]
        image = config["services"]["db"]["image"]
        archive = directory / manifest["openmrsData"]["file"]
        restore_openmrs_data(args.project, volume, image, archive)
        run(compose_command(args.project, compose_files, "up", "-d", "--wait", "--wait-timeout",
                            str(args.wait_timeout)), timeout=args.wait_timeout + 60, env=environment)
        database_report = ROOT / ".runtime/reports" / f"b6-{args.project}-database.json"
        environment["VINSHC_DATABASE_REPORT"] = str(database_report)
        run([sys.executable, str(ROOT / "scripts/check_database.py")], env=environment)
        smoke_report = None
        if args.fixture:
            smoke_report = ROOT / ".runtime/reports" / f"b6-{args.project}-smoke.json"
            run([sys.executable, str(ROOT / "scripts/smoke.py"), "--base-url",
                 f"http://127.0.0.1:{args.http_port}", "--require-fixture", "--fixture",
                 str(args.fixture.resolve()), "--report", str(smoke_report)], env=environment)
        elapsed = round(time.monotonic() - started, 3)
        report = {"passed": True, "operation": "restore", "sourceProject": manifest["sourceProject"],
                  "targetProject": args.project, "elapsedSeconds": elapsed,
                  "databaseReport": str(database_report),
                  "smokeReport": str(smoke_report) if smoke_report else None}
        destination = ROOT / ".runtime/reports" / f"b6-{args.project}-recovery.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report))
    except Exception:
        if args.cleanup_on_failure:
            cleanup_project(args.project, compose_files)
        raise


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest="command", required=True)
    backup_parser = commands.add_parser("backup", help="Back up a healthy Compose project")
    backup_parser.add_argument("--project", required=True, type=checked_project)
    backup_parser.add_argument("--output", required=True, type=Path)
    backup_parser.add_argument("--compose-file", action="append", type=Path)
    backup_parser.add_argument("--wait-timeout", type=int, default=1200)
    backup_parser.set_defaults(handler=backup)
    restore_parser = commands.add_parser("restore", help="Restore into a new, empty Compose project")
    restore_parser.add_argument("--project", required=True, type=checked_project)
    restore_parser.add_argument("--input", required=True, type=Path)
    restore_parser.add_argument("--compose-file", action="append", type=Path)
    restore_parser.add_argument("--http-port", required=True, type=int)
    restore_parser.add_argument("--fixture", type=Path)
    restore_parser.add_argument("--wait-timeout", type=int, default=1200)
    restore_parser.add_argument("--cleanup-on-failure", action="store_true")
    restore_parser.set_defaults(handler=restore)
    return result


def main():
    arguments = parser().parse_args()
    if arguments.wait_timeout <= 0:
        raise RecoveryError("wait timeout must be positive")
    if getattr(arguments, "http_port", 1) not in range(1, 65536):
        raise RecoveryError("HTTP port must be between 1 and 65535")
    read_settings()
    arguments.handler(arguments)


if __name__ == "__main__":
    try:
        main()
    except (RecoveryError, ValueError, OSError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired, tarfile.TarError) as error:
        print(f"Recovery failed: {error}", file=sys.stderr)
        sys.exit(1)
