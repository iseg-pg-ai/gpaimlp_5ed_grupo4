"""Outbox S3 operacional com confirmação antes da remoção local."""
from pathlib import Path
import hashlib
import json
import tempfile
import unittest

from etl.s3_outbox import flush


class FakeS3:
    def __init__(self, fail=False):
        self.objects = {}
        self.fail = fail

    def put_object(self, **values):
        if self.fail:
            raise ConnectionError("offline")
        key = (values["Bucket"], values["Key"])
        if values.get("IfNoneMatch") == "*" and key in self.objects:
            raise RuntimeError("PreconditionFailed")
        body = values["Body"].read()
        self.objects[key] = {
            "body": body, "metadata": values["Metadata"],
            "encryption": values["ServerSideEncryption"]}

    def head_object(self, Bucket, Key):
        item = self.objects[(Bucket, Key)]
        return {"ContentLength": len(item["body"]), "Metadata": item["metadata"],
                "ServerSideEncryption": item["encryption"]}

    def get_object(self, Bucket, Key):
        from io import BytesIO
        item = self.objects[(Bucket, Key)]
        return {"Body": BytesIO(item["body"]), "Metadata": item["metadata"]}


class S3OutboxTests(unittest.TestCase):
    def event(self, root: Path) -> Path:
        directory = root / "data-s3-outbox"
        directory.mkdir()
        operation = "a" * 64
        path = directory / f"{operation}.json"
        path.write_text(json.dumps({"schemaVersion": 1, "operationId": operation,
                                    "operationType": "catalog.save", "entity": "cat-1",
                                    "occurredAt": "2026-10-23T10:00:00+00:00",
                                    "syncState": "pending", "payload": {"revision": 1}}) + "\n")
        return path

    def test_confirmed_upload_removes_event_and_repeat_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.event(root)
            client = FakeS3()
            result = flush(root, "bucket", "test", client)
            self.assertEqual(result, {"outcome": "passed", "uploaded": 1, "pending": 0})
            self.assertFalse(path.exists())
            self.assertEqual(flush(root, "bucket", "test", client)["uploaded"], 0)

    def test_network_failure_preserves_event(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.event(root)
            with self.assertRaises((ConnectionError, KeyError)):
                flush(root, "bucket", "test", FakeS3(fail=True))
            self.assertTrue(path.exists())

    def test_restored_duplicate_with_new_transport_timestamp_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.event(root)
            restored = json.loads(path.read_text())
            client = FakeS3()
            flush(root, "bucket", "test", client)
            restored["occurredAt"] = "2026-10-24T15:25:00+00:00"
            path.write_text(json.dumps(restored) + "\n")
            result = flush(root, "bucket", "test", client)
            self.assertEqual(result, {"outcome": "passed", "uploaded": 1, "pending": 0})
            self.assertFalse(path.exists())

    def test_existing_object_with_different_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = self.event(root)
            changed = json.loads(path.read_text())
            client = FakeS3()
            flush(root, "bucket", "test", client)
            changed["payload"] = {"revision": 2}
            path.write_text(json.dumps(changed) + "\n")
            with self.assertRaises(RuntimeError):
                flush(root, "bucket", "test", client)
            self.assertTrue(path.exists())


if __name__ == "__main__":
    unittest.main()
