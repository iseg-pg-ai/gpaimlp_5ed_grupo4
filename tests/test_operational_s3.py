"""Snapshot operacional S3 com armazenamento integralmente simulado."""
from io import BytesIO
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from etl.operational_s3 import materialize, publish


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, **values):
        key = (values["Bucket"], values["Key"])
        if values.get("IfNoneMatch") == "*" and key in self.objects:
            raise ValueError("objeto existente")
        body = values["Body"]
        self.objects[key] = {
            "body": body.read() if hasattr(body, "read") else body,
            "metadata": values["Metadata"],
            "encryption": values["ServerSideEncryption"],
        }

    def head_object(self, Bucket, Key):
        item = self.objects[(Bucket, Key)]
        return {"ContentLength": len(item["body"]), "Metadata": item["metadata"],
                "ServerSideEncryption": item["encryption"]}

    def get_object(self, Bucket, Key):
        return {"Body": BytesIO(self.objects[(Bucket, Key)]["body"])}

    def download_file(self, bucket, key, filename):
        Path(filename).write_bytes(self.objects[(bucket, key)]["body"])


def database(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE state(value TEXT)")
        connection.execute("INSERT INTO state VALUES (?)", (value,))


class OperationalS3Tests(unittest.TestCase):
    def test_publish_and_materialize_complete_operational_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog = root / "data/portal/catalog.sqlite"
            exports = root / "exports/itineraries"
            pending = root / "exports/portal-persistence"
            database(catalog, "catálogo")
            database(exports / "history.sqlite", "histórico")
            (exports / "trip-1").mkdir()
            (exports / "trip-1/proposta.pdf").write_bytes(b"%PDF-BLU")
            pending.mkdir(parents=True)
            (pending / "operation.json").write_text('{"state":"pending"}\n')
            client = FakeS3()

            release = publish(catalog, exports, pending, "data-bucket", "test", client,
                              release_id="release-1")
            self.assertEqual(release["state"], "complete")
            self.assertEqual(len(release["artifacts"]), 4)
            pointer = json.loads(client.objects[
                ("data-bucket", "test/operational/current.json")]["body"])
            self.assertEqual(pointer["release_id"], "release-1")

            cache = root / "runtime/cache"
            restored = materialize(cache, "data-bucket", "test", client)
            self.assertEqual(restored["release_id"], "release-1")
            self.assertEqual((cache / "exports/itineraries/trip-1/proposta.pdf").read_bytes(), b"%PDF-BLU")
            with sqlite3.connect(cache / "data/portal/catalog.sqlite") as connection:
                self.assertEqual(connection.execute("SELECT value FROM state").fetchone()[0],
                                 "catálogo")

    def test_new_snapshot_removes_deleted_item_from_active_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalog = root / "catalog.sqlite"
            exports = root / "exports"
            pending = root / "pending"
            database(catalog, "catálogo")
            database(exports / "history.sqlite", "histórico")
            (exports / "deleted.pdf").write_bytes(b"old")
            client = FakeS3()
            publish(catalog, exports, pending, "bucket", "test", client, "before-delete")
            (exports / "deleted.pdf").unlink()
            publish(catalog, exports, pending, "bucket", "test", client, "after-delete")

            cache = root / "cache"
            materialize(cache, "bucket", "test", client)
            self.assertFalse((cache / "exports/itineraries/deleted.pdf").exists())
            self.assertIn(("bucket", "test/operational/releases/before-delete/files/exports/itineraries/deleted.pdf"),
                          client.objects)


if __name__ == "__main__":
    unittest.main()
