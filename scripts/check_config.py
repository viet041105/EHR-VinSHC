"""Validate the resolved Compose contract without printing credentials."""

import json
import re
import subprocess
import sys

from common import ROOT, read_settings


def validate_config(config, baseline, settings):
    services = config["services"]
    if set(services) != set(baseline["images"]):
        raise ValueError("Compose services must match the reviewed baseline.")
    for name, expected_image in baseline["images"].items():
        service = services[name]
        if service.get("image") != expected_image:
            raise ValueError(f"{name}: image differs from config/baseline.json.")
        if name != "backend" and not re.search(r"@sha256:[a-f0-9]{64}$", expected_image):
            raise ValueError(f"{name}: image must be pinned by digest.")
        if service.get("privileged") or (name != "backend" and service.get("build")):
            raise ValueError(f"{name}: unexpected build or privileged container.")
        if service.get("network_mode") == "host":
            raise ValueError(f"{name}: host networking is outside the baseline.")
        if not service.get("healthcheck", {}).get("test"):
            raise ValueError(f"{name}: missing readiness check.")
        if name != "gateway" and service.get("ports"):
            raise ValueError(f"{name}: publish only the gateway to the host.")
    ports = services["gateway"].get("ports", [])
    if (len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1"
            or ports[0].get("target") != 80
            or str(ports[0].get("published")) != settings["EHR_HTTP_PORT"]):
        raise ValueError("Gateway must bind only 127.0.0.1:EHR_HTTP_PORT:80.")
    for name, target in (("db", "/var/lib/mysql"), ("backend", "/openmrs/data")):
        mounts = services[name].get("volumes", [])
        if not any(mount.get("type") == "volume" and mount.get("target") == target
                   for mount in mounts):
            raise ValueError(f"{name}: missing persistent named volume.")
    if services["backend"]["environment"]["OMRS_CONFIG_CONNECTION_PASSWORD"] != settings["OMRS_DB_PASSWORD"]:
        raise ValueError("Backend database credentials differ from .env.")
    if services["db"]["environment"]["MARIADB_PASSWORD"] != settings["OMRS_DB_PASSWORD"]:
        raise ValueError("MariaDB credentials differ from backend credentials.")
    if services["backend"]["environment"]["OMRS_CONFIG_ADMIN_USER_PASSWORD"] != settings["EHR_ADMIN_PASSWORD"]:
        raise ValueError("Backend admin initialization differs from smoke credentials.")
    expected_build = baseline["backendBuild"]
    backend_build = services["backend"].get("build", {})
    if (backend_build.get("context") != str((ROOT / expected_build["context"]).resolve())
            or backend_build.get("dockerfile") != expected_build["dockerfile"]):
        raise ValueError("Backend must build from the reviewed Dockerfile/context.")
    dockerfile = (ROOT / expected_build["context"] / expected_build["dockerfile"]).read_text(encoding="utf-8")
    from_lines = re.findall(r"(?m)^FROM\s+(.+)$", dockerfile)
    if (from_lines != [expected_build["baseImage"]]
            or not re.search(r"@sha256:[a-f0-9]{64}$", expected_build["baseImage"])):
        raise ValueError("Backend Dockerfile must use the reviewed upstream digest.")
    if services["backend"].get("pull_policy") != "build":
        raise ValueError("Backend must rebuild from the repository rather than pull an unrelated local tag.")


def main():
    settings = read_settings()
    baseline = json.loads((ROOT / "config/baseline.json").read_text(encoding="utf-8"))
    result = subprocess.run(
        ["docker", "compose", "-f", "compose.yaml", "config", "--format", "json"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    if result.returncode:
        # Never echo expanded config or errors containing interpolated credentials.
        raise ValueError("docker compose config failed. Check Docker Compose and .env.")
    validate_config(json.loads(result.stdout), baseline, settings)
    print("PASS: pinned upstream images, reviewed backend build, readiness, localhost port and volumes.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(f"Configuration check failed: {error}", file=sys.stderr)
        sys.exit(1)
