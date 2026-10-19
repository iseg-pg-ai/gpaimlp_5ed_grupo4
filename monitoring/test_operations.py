import json
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import tempfile
import unittest

from monitoring.alerts import AlertStore
from monitoring.backup import create_backup, verify_backup
from monitoring.signals import operational_signals
from blu_ai.telemetry import invoke_with_telemetry, usage_from_messages


class OperationsTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
