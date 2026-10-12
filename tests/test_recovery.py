"""Safety and integrity regression tests for the B6 recovery tooling."""

import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from recovery import (RecoveryError, checked_project, safe_extract, sha256,
                      verify_backup)


class RecoverySafetyTests(unittest.TestCase):
    def test_project_name_rejects_shell_and_ambiguous_values(self):
        for value in ("x", "UPPER", "../main", "main project", "main;down", "-main"):
            with self.subTest(value=value), self.assertRaises(Exception):
                checked_project(value)
        self.assertEqual(checked_project("ehr-vinshc-b6_restore"), "ehr-vinshc-b6_restore")

    def test_safe_extract_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "bad.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                member = tarfile.TarInfo("../outside.txt")
                payload = b"not allowed"
                member.size = len(payload)
                target.addfile(member, io.BytesIO(payload))
            with self.assertRaises(RecoveryError):
                safe_extract(archive, root / "extract")

    def test_safe_extract_rejects_external_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "link.tar.gz"
            with tarfile.open(archive, "w:gz") as target:
                member = tarfile.TarInfo("unsafe-link")
                member.type = tarfile.SYMTYPE
                member.linkname = "../../outside"
                target.addfile(member)
            with self.assertRaises(RecoveryError):
                safe_extract(archive, root / "extract")

    def test_backup_checksum_mismatch_is_rejected_before_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / "openmrs.pgdump"
            data = root / "openmrs-data.tar.gz"
            database.write_bytes(b"database")
            data.write_bytes(b"volume")
            manifest = {
                "formatVersion": 1,
                "database": {"file": database.name, "sha256": sha256(database)},
                "openmrsData": {"file": data.name, "sha256": "0" * 64},
                "configuration": [],
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch("recovery.config_evidence", return_value=[]), self.assertRaises(RecoveryError):
                verify_backup(root, [])

    def test_configuration_drift_is_rejected_before_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / "openmrs.pgdump"
            data = root / "openmrs-data.tar.gz"
            database.write_bytes(b"database")
            data.write_bytes(b"volume")
            manifest = {
                "formatVersion": 1,
                "database": {"file": database.name, "sha256": sha256(database)},
                "openmrsData": {"file": data.name, "sha256": sha256(data)},
                "configuration": [{"path": "compose.yaml", "sha256": "old"}],
            }
            (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            current = [{"path": "compose.yaml", "sha256": "new"}]
            with patch("recovery.config_evidence", return_value=current), self.assertRaises(RecoveryError):
                verify_backup(root, [])


if __name__ == "__main__":
    unittest.main()
