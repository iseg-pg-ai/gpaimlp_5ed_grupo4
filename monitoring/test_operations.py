import json
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from monitoring.alerts import AlertStore
from monitoring.backup import BackupScheduler, create_backup, verify_backup
from monitoring.cleanup import CleanupManager
from monitoring.signals import operational_signals
from blu_ai.telemetry import invoke_with_telemetry, usage_from_messages


class OperationsTest(unittest.TestCase):
    def test_backup_scheduler_runs_once_per_interval_and_records_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "monitoring/runtime"
            (root / "warehouse").mkdir(parents=True)
            (root / "warehouse/item.json").write_text("{}")
            scheduler = BackupScheduler(root, runtime, {"backup": {
                "enabled": True, "interval_hours": 24}})
            first = scheduler.maybe_run()
            second = scheduler.maybe_run()
            self.assertEqual(first["outcome"], "passed")
            self.assertEqual(second["backup_id"], first["backup_id"])
            self.assertEqual(len(list((runtime / "backups").iterdir())), 1)

    def test_cleanup_removes_only_regenerable_content_and_retains_recent_backups(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "monitoring/runtime"
            cache = root / "dmc-workspace/.next/cache"
            cache.mkdir(parents=True)
            (cache / "large.bin").write_bytes(b"x" * 128)
            protected = root / "data/portal/catalog.sqlite"
            protected.parent.mkdir(parents=True)
            protected.write_bytes(b"authoritative")
            backups = runtime / "backups"
            for index in range(3):
                path = backups / f"backup-{index}"
                path.mkdir(parents=True)
                (path / "payload").write_bytes(bytes([index]))
                (path / "manifest.json").write_text(json.dumps({
                    "created_at": f"2025-01-0{index + 1}T00:00:00+00:00", "state": "complete"}))
            manager = CleanupManager(root, runtime, {"cleanup": {
                "enabled": True, "trigger_disk_pct": 85, "backup_retention_count": 2,
                "backup_min_age_hours": 24}})
            result = manager.run("manual")
            self.assertFalse(cache.exists())
            self.assertEqual(protected.read_bytes(), b"authoritative")
            self.assertEqual(len([path for path in backups.iterdir() if not path.name.startswith(".")]), 2)
            self.assertGreater(result["freed_bytes"], 0)
            self.assertEqual(result["last_trigger"], "manual")

    def test_automatic_cleanup_respects_threshold_and_interval(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cache = root / "dmc-workspace/.next/cache"
            cache.mkdir(parents=True)
            (cache / "item").write_text("cache")
            manager = CleanupManager(root, root / "monitoring/runtime", {"cleanup": {
                "enabled": True, "trigger_disk_pct": 85, "minimum_interval_hours": 24}})
            self.assertEqual(manager.maybe_run(84)["outcome"], "never")
            self.assertTrue(cache.exists())
            self.assertEqual(manager.maybe_run(86)["last_trigger"], "automatic")
            cache.mkdir(parents=True)
            (cache / "new-item").write_text("cache")
            manager.maybe_run(90)
            self.assertTrue(cache.exists())

    def test_ai_usage_uses_reported_counters_only(self):
        class Message:
            usage_metadata = {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10}
            response_metadata = {}
        self.assertEqual(usage_from_messages([Message()]),
                         {"input_tokens": 4, "output_tokens": 6, "total_tokens": 10})

    def test_ai_telemetry_excludes_inputs_and_outputs(self):
        class Agent:
            def invoke(self, inputs):
                return {"messages": []}
        with tempfile.TemporaryDirectory() as directory:
            import os
            previous = os.environ.get("BLU_TELEMETRY_DIR")
            os.environ["BLU_TELEMETRY_DIR"] = directory
            try:
                invoke_with_telemetry(Agent(), {"secret": "cliente privado"}, "chat")
            finally:
                if previous is None:
                    os.environ.pop("BLU_TELEMETRY_DIR", None)
                else:
                    os.environ["BLU_TELEMETRY_DIR"] = previous
            content = (Path(directory) / "ai-usage.jsonl").read_text()
            self.assertNotIn("cliente privado", content)
            self.assertNotIn("secret", content)

    def test_ai_telemetry_rotates_instead_of_stopping(self):
        with tempfile.TemporaryDirectory() as directory:
            import os
            previous = os.environ.get("BLU_TELEMETRY_DIR")
            os.environ["BLU_TELEMETRY_DIR"] = directory
            try:
                with patch("blu_ai.telemetry.MAX_BYTES", 1):
                    from blu_ai.telemetry import record_ai_usage
                    record_ai_usage("first", "success", 1)
                    record_ai_usage("second", "success", 1)
            finally:
                if previous is None:
                    os.environ.pop("BLU_TELEMETRY_DIR", None)
                else:
                    os.environ["BLU_TELEMETRY_DIR"] = previous
            self.assertTrue((Path(directory) / "ai-usage.jsonl.1").exists())
            self.assertIn("second", (Path(directory) / "ai-usage.jsonl").read_text())

    def test_backup_is_copied_hashed_and_restored_in_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            runtime = root / "monitoring/runtime"
            (root / "data/portal").mkdir(parents=True)
            (root / "warehouse").mkdir()
            (root / "warehouse/manifest.json").write_text('{"ok":true}')
            with sqlite3.connect(root / "data/portal/catalog.sqlite") as connection:
                connection.execute("create table items (id integer primary key)")
                connection.execute("insert into items values (1)")
            backup = create_backup(root, runtime)
            evidence = verify_backup(backup, runtime)
            self.assertEqual(evidence["outcome"], "passed")
            self.assertGreaterEqual(evidence["artifact_count"], 2)
            self.assertFalse((root / "data/portal/restored.sqlite").exists())

    def test_signals_and_alerts_are_aggregated_and_deduplicated(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            now = datetime.now(timezone.utc)
            rows = [{"at": now.isoformat(), "outcome": "failed", "message": "não expor"}]
            (runtime / "portal-events.jsonl").write_text("\n".join(map(json.dumps, rows)))
            signals = operational_signals(runtime, now)
            self.assertEqual(signals["portal"]["errors_24h"], 1)
            self.assertNotIn("message", json.dumps(signals))
            store = AlertStore(runtime)
            self.assertEqual(store.reconcile({"portal-errors": True})["queued"], 1)
            self.assertEqual(store.reconcile({"portal-errors": True})["queued"], 0)
            result = store.reconcile({"portal-errors": False})
            self.assertEqual(result["queued"], 1)
            events = [json.loads(line) for line in (runtime / "notifications.jsonl").read_text().splitlines()]
            self.assertEqual([item["event"] for item in events], ["opened", "recovered"])

    def test_signals_include_rotated_event_files(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            now = datetime.now(timezone.utc)
            (runtime / "portal-events.jsonl.1").write_text(json.dumps({
                "at": now.isoformat(), "outcome": "failed"}) + "\n")
            (runtime / "portal-events.jsonl").write_text(json.dumps({
                "at": now.isoformat(), "outcome": "success"}) + "\n")
            result = operational_signals(runtime, now)
            self.assertEqual(result["portal"]["events_24h"], 2)
            self.assertEqual(result["portal"]["errors_24h"], 1)


if __name__ == "__main__":
    unittest.main()
