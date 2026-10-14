"""Configure repo metadata on the isolated Docker stack; no clinical fixtures."""
from pathlib import Path
import sys

runtime = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(runtime / "scripts"), str(runtime / "tests" / "integration")]
from api_client import Client
from b4_metadata_catalogue import ensure

settings = {}
for line in (runtime / ".env").read_text(encoding="utf-8").splitlines():
    if line and not line.startswith("#") and "=" in line:
        key, value = line.split("=", 1)
        settings[key] = value
client = Client("http://127.0.0.1:" + settings.get("EHR_HTTP_PORT", "8080"), settings["EHR_ADMIN_USERNAME"], settings["EHR_ADMIN_PASSWORD"])
ensure(client)
print("Configured repository metadata links on vinshc-fe-local; no patient/user/transaction fixtures.")
