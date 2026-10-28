"""Orquestração da cache S3 sem chamadas externas nem dados do projeto."""
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from etl.cloud_runtime import rebuild


def database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE state(value TEXT)")
        if path.name == "catalog.sqlite":
            connection.execute("CREATE TABLE catalog_records(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL)")
            connection.execute("INSERT INTO catalog_records VALUES ('cat-test', '{}')")


class CloudRuntimeTests(unittest.TestCase):
    def test_recovered_checkpoint_is_republished_before_cache_promotion(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            recovered = root / "recovered"
            database(recovered / "data/portal/catalog.sqlite")
            database(recovered / "exports/itineraries/history.sqlite")
            destination = root / "runtime"

            def materialize(target, *_):
                database(target / "data/portal/catalog.sqlite")
                database(target / "exports/itineraries/history.sqlite")
                return {"release_id": "operational-1"}

            def pipeline(_data, warehouse):
                warehouse.mkdir(parents=True)
                database(warehouse / "blu_etl.sqlite")
                (warehouse / "validation_report.json").write_text('{"status":"passed"}')
                (warehouse / "manifest.json").write_text(
                    '{"validation":{"status":"passed"}}'
                )
                return {"validation": {"status": "passed"}}

            with patch("etl.cloud_runtime._configuration", return_value=("bucket", "test")), \
                    patch("etl.cloud_runtime.ROOT", root), \
                    patch("etl.cloud_runtime.publish", return_value={"release_id": "operational-2"}) as operational, \
                    patch("etl.cloud_runtime.materialize", side_effect=materialize), \
                    patch("etl.cloud_runtime.restore_missing", return_value={"release_id": "sources-1"}), \
                    patch("etl.cloud_runtime.run", side_effect=pipeline), \
                    patch("etl.cloud_runtime.publish_delivery", return_value={"release_id": "warehouse-1"}):
                result = rebuild(recovered, destination, object())

            operational.assert_called_once()
            self.assertEqual(result["operational_release"], "operational-2")
            self.assertGreaterEqual(result["recovery_seconds"], 0)
            self.assertTrue((destination / "data/portal/catalog.sqlite").is_file())
            self.assertTrue((destination / "warehouse/blu_etl.sqlite").is_file())

    def test_current_release_can_bootstrap_without_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "runtime"

            def materialize(target, *_):
                database(target / "data/portal/catalog.sqlite")
                database(target / "exports/itineraries/history.sqlite")

            def pipeline(_data, warehouse):
                warehouse.mkdir(parents=True)
                database(warehouse / "blu_etl.sqlite")
                (warehouse / "validation_report.json").write_text('{"status":"passed"}')
                return {"validation": {"status": "passed"}}

            with patch("etl.cloud_runtime._configuration", return_value=("bucket", "test")), \
                    patch("etl.cloud_runtime.ROOT", root), \
                    patch("etl.cloud_runtime.publish") as operational, \
                    patch("etl.cloud_runtime.materialize", side_effect=materialize), \
                    patch("etl.cloud_runtime.restore_missing", return_value={"release_id": "sources-1"}), \
                    patch("etl.cloud_runtime.run", side_effect=pipeline), \
                    patch("etl.cloud_runtime.publish_delivery", return_value={"release_id": "warehouse-1"}):
                result = rebuild(None, destination, object())

            operational.assert_not_called()
            self.assertEqual(result["operational_release"], "current")
            self.assertGreaterEqual(result["recovery_seconds"], 0)

    def test_empty_checkpoint_cannot_replace_remote_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            recovered = root / "recovered"
            catalog = recovered / "data/portal/catalog.sqlite"
            database(catalog)
            database(recovered / "exports/itineraries/history.sqlite")
            with sqlite3.connect(catalog) as connection:
                connection.execute("DELETE FROM catalog_records")
            with patch("etl.cloud_runtime._configuration", return_value=("bucket", "test")), \
                    patch("etl.cloud_runtime.publish") as publish, \
                    patch("etl.cloud_runtime.materialize") as materialize:
                with self.assertRaisesRegex(ValueError, "release ativa foi preservada"):
                    rebuild(recovered, root / "runtime", object())
            publish.assert_not_called()
            materialize.assert_not_called()

    def test_empty_active_release_does_not_publish_or_replace_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "runtime"
            destination.mkdir()
            marker = destination / "preserved"
            marker.write_text("cache anterior")

            def empty_materialize(target, *_):
                catalog = target / "data/portal/catalog.sqlite"
                database(catalog)
                with sqlite3.connect(catalog) as connection:
                    connection.execute("DELETE FROM catalog_records")

            with patch("etl.cloud_runtime._configuration", return_value=("bucket", "test")), \
                    patch("etl.cloud_runtime.materialize", side_effect=empty_materialize), \
                    patch("etl.cloud_runtime.restore_missing") as sources, \
                    patch("etl.cloud_runtime.run") as pipeline, \
                    patch("etl.cloud_runtime.publish_delivery") as publish:
                with self.assertRaisesRegex(ValueError, "backup aprovado"):
                    rebuild(None, destination, object())
            sources.assert_not_called()
            pipeline.assert_not_called()
            publish.assert_not_called()
            self.assertEqual(marker.read_text(), "cache anterior")


if __name__ == "__main__":
    unittest.main()
