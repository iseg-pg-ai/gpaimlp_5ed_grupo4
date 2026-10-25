"""Ensaios de backup e recuperação exclusivamente com dados temporários."""
import json
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from monitoring.checkpoint import backup_home, create, restore_missing
from monitoring.s3_checkpoint import S3Config, upload


class FakeS3:
    def __init__(self, fail_upload=False):
        self.objects = {}
        self.fail_upload = fail_upload

    def put_object(self, **values):
        if self.fail_upload:
            raise ConnectionError("rede indisponível")
        body = values["Body"].read()
        key = (values["Bucket"], values["Key"])
        if key in self.objects:
            raise ValueError("objeto existente")
        self.objects[key] = {"Body": body, "Metadata": values["Metadata"],
                             "LastModified": datetime.now(timezone.utc)}

    def head_object(self, Bucket, Key):
        item = self.objects[(Bucket, Key)]
        return {"ContentLength": len(item["Body"]), "Metadata": item["Metadata"]}

    def list_objects_v2(self, Bucket, Prefix):
        return {"Contents": [
            {"Key": key, "LastModified": value["LastModified"]}
            for (bucket, key), value in self.objects.items()
            if bucket == Bucket and key.startswith(Prefix)
        ]}

    def download_file(self, bucket, key, filename):
        Path(filename).write_bytes(self.objects[(bucket, key)]["Body"])


class CheckpointTests(unittest.TestCase):
    def test_execution_identifier_names_the_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            root.mkdir()
            snapshot = create(root, store, "blu-up-test-123")
            self.assertEqual(snapshot.name, "blu-up-test-123")
            self.assertEqual(json.loads((snapshot / "manifest.json").read_text())["backup_id"],
                             "blu-up-test-123")

    def test_s3_roundtrip_recovers_when_local_store_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            (root / "data").mkdir(parents=True)
            source = root / "data/source.txt"
            source.write_text("persistente")
            snapshot = create(root, store)
            client = FakeS3()
            config = S3Config("existing-bucket", "blu", "test")
            result = upload(root, snapshot, config, client)
            self.assertEqual(result["outcome"], "passed")
            shutil.rmtree(store)
            source.unlink()
            with patch.dict("os.environ", {"BLU_BACKUP_S3_BUCKET": "existing-bucket",
                                            "BLU_BACKUP_S3_PREFIX": "blu",
                                            "BLU_ENVIRONMENT": "test"}, clear=False):
                self.assertEqual(restore_missing(root, store, s3_client=client), 1)
            self.assertEqual(source.read_text(), "persistente")
            status = json.loads((root / "monitoring/runtime/s3-backup-status.json").read_text())
            self.assertEqual(status["operation"], "download")
            self.assertNotIn("existing-bucket", json.dumps(status))

    def test_s3_network_failure_preserves_verified_local_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            root.mkdir()
            snapshot = create(root, store)
            with self.assertRaises(ConnectionError):
                upload(root, snapshot, S3Config("bucket", "blu", "test"),
                       FakeS3(fail_upload=True))
            self.assertTrue((snapshot / "manifest.json").is_file())
            status = json.loads((root / "monitoring/runtime/s3-backup-status.json").read_text())
            self.assertEqual(status["outcome"], "failed")

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
            manifest = json.loads((snapshot / "manifest.json").read_text())
            self.assertEqual(manifest["schema_version"], 2)
            self.assertEqual(manifest["state"], "complete")
            self.assertTrue(all(item["state"] in {"present", "absent"}
                                for item in manifest["resources"]))
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

    def test_corrupt_latest_falls_back_and_records_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            (root / "data").mkdir(parents=True)
            source = root / "data/source.txt"
            source.write_text("versão válida")
            older = create(root, store)
            source.write_text("versão recente")
            latest = create(root, store)
            (latest / "files/data/source.txt").write_text("corrompido")
            source.unlink()
            self.assertEqual(restore_missing(root, store), 1)
            self.assertEqual(source.read_text(), "versão válida")
            events = (root / "monitoring/runtime/recovery/checkpoint-events.jsonl").read_text()
            self.assertIn(latest.name, events)
            self.assertNotEqual(older.name, latest.name)

    def test_specific_backup_and_private_runtime_exclusion(self):
        with tempfile.TemporaryDirectory() as directory:
            root, store = Path(directory) / "project", Path(directory) / "backups"
            runtime = root / "monitoring/runtime"
            runtime.mkdir(parents=True)
            (runtime / "credentials.json").write_text('{"secret":"never"}')
            (runtime / "operational.json").write_text('{"state":"safe"}')
            snapshot = create(root, store)
            manifest = json.loads((snapshot / "manifest.json").read_text())
            paths = {item["path"] for item in manifest["files"]}
            self.assertNotIn("monitoring/runtime/credentials.json", paths)
            self.assertIn("monitoring/runtime/operational.json", paths)
            (runtime / "operational.json").unlink()
            self.assertEqual(restore_missing(root, store, snapshot.name), 1)
            self.assertEqual(json.loads((runtime / "operational.json").read_text())["state"],
                             "safe")


if __name__ == "__main__":
    unittest.main()
