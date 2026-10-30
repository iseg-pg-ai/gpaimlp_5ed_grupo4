"""Transporte S3 do ETL, sempre com armazenamento simulado e temporário."""
from pathlib import Path
import json
import tempfile
import unittest

from openpyxl import Workbook

from etl.s3_transport import fetch_latest, inventory_releases, publish, restore_missing


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, **values):
        key = (values["Bucket"], values["Key"])
        if key in self.objects:
            raise ValueError("objeto existente")
        self.objects[key] = {"body": values["Body"].read(),
                             "metadata": values["Metadata"],
                             "encryption": values["ServerSideEncryption"]}

    def head_object(self, Bucket, Key):
        item = self.objects[(Bucket, Key)]
        return {"ContentLength": len(item["body"]), "Metadata": item["metadata"],
                "ServerSideEncryption": item["encryption"]}

    def list_objects_v2(self, Bucket, Prefix, **_):
        return {"Contents": [{"Key": key} for (bucket, key) in self.objects
                             if bucket == Bucket and key.startswith(Prefix)],
                "IsTruncated": False}

    def download_file(self, bucket, key, filename):
        Path(filename).write_bytes(self.objects[(bucket, key)]["body"])


class S3TransportTests(unittest.TestCase):
    def test_inventory_identifies_active_superseded_and_invalid_without_deleting(self):
        with tempfile.TemporaryDirectory() as directory:
            warehouse = Path(directory)
            (warehouse / "validation_report.json").write_text('{"status":"passed"}')
            (warehouse / "manifest.json").write_text(
                '{"validation":{"status":"passed"}}')
            client = FakeS3()
            first = publish("warehouse", warehouse, "bucket", "test", client)
            second = publish("warehouse", warehouse, "bucket", "test", client)
            manifests = sorted(key for bucket, key in client.objects
                               if bucket == "bucket" and key.endswith("/manifest.json"))
            client.objects[("bucket", manifests[-1])]["body"] = b"corrompido"
            before = set(client.objects)

            inventory = inventory_releases("warehouse", "bucket", "test", client)

            self.assertEqual(set(client.objects), before)
            self.assertEqual(inventory["release_count"], 2)
            states = {item.get("release_id"): item["retention_state"]
                      for item in inventory["releases"]}
            self.assertEqual(states[first["release_id"]], "active")
            self.assertNotIn(second["release_id"], states)
            self.assertEqual(sum(item["retention_state"] == "invalid"
                                 for item in inventory["releases"]), 1)

    def test_validated_warehouse_roundtrip_is_immutable_and_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            warehouse = root / "warehouse"
            warehouse.mkdir()
            (warehouse / "validation_report.json").write_text('{"status":"passed"}')
            (warehouse / "manifest.json").write_text(
                '{"validation":{"status":"passed"}}')
            (warehouse / "rows.jsonl").write_text('{"id":1}\n')
            client = FakeS3()
            result = publish("warehouse", warehouse, "bucket", "test", client)
            self.assertEqual(result["file_count"], 3)
            manifests = [key for (_, key), value in client.objects.items()
                         if value["metadata"].get("state") == "complete"]
            self.assertEqual(len(manifests), 1)
            self.assertEqual(client.objects[("bucket", manifests[0])]["metadata"]["state"],
                             "complete")
            destination = root / "restored"
            restored = fetch_latest("warehouse", destination, "bucket", "test", client)
            self.assertEqual(restored["release_id"], result["release_id"])
            self.assertEqual((destination / "rows.jsonl").read_text(), '{"id":1}\n')
            with self.assertRaisesRegex(ValueError, "vazio"):
                fetch_latest("warehouse", destination, "bucket", "test", client)

    def test_invalid_warehouse_is_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            warehouse = Path(directory)
            (warehouse / "validation_report.json").write_text('{"status":"failed"}')
            (warehouse / "manifest.json").write_text(
                '{"validation":{"status":"failed"}}')
            client = FakeS3()
            with self.assertRaisesRegex(ValueError, "não passou"):
                publish("warehouse", warehouse, "bucket", "test", client)
            self.assertEqual(client.objects, {})

    def test_sources_exclude_operational_catalog_and_restore_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "data"
            source.mkdir()
            workbook = Workbook()
            workbook.active.title = "ATRACOES"
            workbook.create_sheet("REGRAS_CURADORIA")
            workbook.save(source / "catalog.xlsx")
            (source / "proposals").mkdir()
            (source / "proposals/example.pdf").write_bytes(b"%PDF-test")
            (source / "portal").mkdir()
            (source / "portal/catalog.sqlite").write_bytes(b"private operational data")
            client = FakeS3()
            result = publish("sources", source, "bucket", "test", client)
            self.assertEqual(result["file_count"], 2)
            keys = [key for (_, key) in client.objects]
            self.assertFalse(any("portal/catalog.sqlite" in key for key in keys))
            destination = root / "sources"
            fetch_latest("sources", destination, "bucket", "test", client)
            self.assertTrue((destination / "catalog.xlsx").is_file())
            self.assertFalse((destination / "portal").exists())

            partial = root / "partial"
            partial.mkdir()
            (partial / "catalog.xlsx").write_bytes(b"newer-local")
            recovered = restore_missing("sources", partial, "bucket", "test", client)
            self.assertEqual(recovered["restored"], 1)
            self.assertEqual((partial / "catalog.xlsx").read_bytes(), b"newer-local")
            self.assertTrue((partial / "proposals/example.pdf").is_file())


if __name__ == "__main__":
    unittest.main()
