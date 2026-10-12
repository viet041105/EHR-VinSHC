"""Create a local Compose environment without overwriting existing credentials."""

import os
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parents[1]


def bootstrap(root=ROOT):
    target = root / ".env"
    if target.exists():
        print(".env already exists; keeping its credentials and settings.")
        return
    text = (root / ".env.example").read_text(encoding="utf-8")
    replacements = {
        "GENERATE_DB_PASSWORD": secrets.token_hex(24),
        "GENERATE_ADMIN_PASSWORD": "Vshc1!" + secrets.token_urlsafe(24),
    }
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, value)
    try:
        # Exclusive creation also protects against two members/scripts racing.
        with target.open("x", encoding="utf-8", newline="\n") as output:
            output.write(text)
        os.chmod(target, 0o600)
    except FileExistsError:
        print(".env was created by another process; keeping it.")
        return
    print("Created .env with independent random database and OpenMRS admin passwords.")
    print("Read EHR_ADMIN_USERNAME/EHR_ADMIN_PASSWORD in .env to log in locally.")
    print("Next: python scripts/check_config.py")


if __name__ == "__main__":
    try:
        bootstrap()
    except OSError as error:
        print(f"Bootstrap failed: {error}", file=sys.stderr)
        sys.exit(1)
