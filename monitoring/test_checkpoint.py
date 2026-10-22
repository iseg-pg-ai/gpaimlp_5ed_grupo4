"""Ensaios de backup e recuperação exclusivamente com dados temporários."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from monitoring.checkpoint import backup_home, create, restore_missing


class CheckpointTests(unittest.TestCase):
    def test_roundtrip_preserves_current_files_and_empty_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            (root / "exports/itineraries").mkdir(parents=True)
            (root / "data").mkdir()
            source = root / "data/source.txt"
            source.write_text("original")
            database = root / "data/catalog.sqlite"
            with sqlite3.connect(database) as connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("CREATE TABLE test (value TEXT)")
                connection.execute("INSERT INTO test VALUES ('confirmado')")
                connection.commit()
                snapshot = create(root, store)
            source.write_text("mais recente")
            database.unlink()
            (root / "exports/itineraries").rmdir()
            self.assertEqual(restore_missing(root, store), 1)
            self.assertEqual(source.read_text(), "mais recente")
            self.assertTrue((root / "exports/itineraries").is_dir())
            with sqlite3.connect(database) as connection:
                self.assertEqual(connection.execute("SELECT value FROM test").fetchone()[0],
                                 "confirmado")
            self.assertEqual(snapshot.stat().st_mode & 0o777, 0o700)
            self.assertEqual(restore_missing(root, store), 0)

    def test_corruption_aborts_before_restoring_anything(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            (root / "data").mkdir(parents=True)
            source = root / "data/source.txt"
            source.write_text("original")
            snapshot = create(root, store)
            source.unlink()
            (snapshot / "files/data/source.txt").write_text("adulterado")
            with self.assertRaises(ValueError):
                restore_missing(root, store)
            self.assertFalse(source.exists())

    def test_rejects_unsafe_manifest_and_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            root.mkdir()
            snapshot = create(root, store)
            manifest = snapshot / "manifest.json"
            content = json.loads(manifest.read_text())
            content["directories"] = ["../escape"]
            manifest.write_text(json.dumps(content))
            with self.assertRaises(ValueError):
                restore_missing(root, store)
            with patch.dict("os.environ", {"BLU_BACKUP_DIR": str(root / "backups")}):
                with self.assertRaises(ValueError):
                    backup_home(root)

    def test_failure_does_not_publish_incomplete_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            (root / "data").mkdir(parents=True)
            (root / "data/bad.sqlite").write_text("inválido")
            with self.assertRaises(sqlite3.DatabaseError):
                create(root, store)
            self.assertEqual(list(store.glob("*/manifest.json")), [])


if __name__ == "__main__":
    unittest.main()
