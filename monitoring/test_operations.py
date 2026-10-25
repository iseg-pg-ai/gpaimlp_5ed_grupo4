import json
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from monitoring.alerts import AlertStore
from monitoring.backup import BackupScheduler, create_backup, verify_backup
from monitoring.cleanup import CleanupManager
from monitoring.recovery import ensure_recovery
from monitoring.signals import operational_details, operational_signals, query_logs
from blu_ai.telemetry import invoke_with_telemetry, usage_from_messages


class OperationsTest(unittest.TestCase):
    @staticmethod
    def valid_warehouse(root: Path, rows: dict[str, list[dict]] | None = None) -> None:
        warehouse = root / "warehouse"
        warehouse.mkdir(parents=True)
        (warehouse / "manifest.json").write_text(json.dumps({
            "ran_at_utc": datetime.now(timezone.utc).isoformat()}))
        (warehouse / "validation_report.json").write_text('{"status":"passed"}')
        for category in ("atracoes", "restaurantes", "experiencias"):
            values = (rows or {}).get(category, [])
            (warehouse / f"{category}.jsonl").write_text(
                "".join(json.dumps(value) + "\n" for value in values))

    def test_fresh_install_initializes_catalog_and_itineraries_from_warehouse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.valid_warehouse(root, {"atracoes": [{
                "id": 7, "nome_da_atracao": "Museu", "cidade": "Lisboa",
                "_source_sheet": "ATRAÇÕES", "_source_row": 2,
            }]})

            result = ensure_recovery(root, root / "monitoring/runtime")

            self.assertEqual(result["outcome"], "initialized")
            self.assertEqual(result["initialized"], ["catalog", "itineraries"])
            self.assertTrue((root / "exports/itineraries").is_dir())
            with sqlite3.connect(root / "data/portal/catalog.sqlite") as connection:
                record = json.loads(connection.execute(
                    "select snapshot from catalog_records").fetchone()[0])
            self.assertEqual(record["fields"]["name"], "Museu")
            self.assertEqual(record["status"], "review")

    def test_partial_install_without_backup_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.valid_warehouse(root)
            catalog = root / "data/portal/catalog.sqlite"
            catalog.parent.mkdir(parents=True)
            catalog.write_bytes(b"base-invalida")

            with self.assertRaisesRegex(ValueError, "Não existe backup local"):
                ensure_recovery(root, root / "monitoring/runtime")
            self.assertEqual(catalog.read_bytes(), b"base-invalida")

    def test_operational_details_expose_only_allowed_technical_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            event = {"at": datetime.now(timezone.utc).isoformat(), "component": "portal",
                     "operation": "save", "outcome": "failed", "error_code": "Timeout",
                     "message": "conteúdo privado", "prompt": "não expor"}
            (runtime / "portal-events.jsonl").write_text(json.dumps(event) + "\n")
            result = operational_details(runtime, "portal")
            encoded = json.dumps(result)
            self.assertTrue(result["entries"][0]["is_error"])
            self.assertIn("Timeout", encoded)
            self.assertNotIn("conteúdo privado", encoded)
            self.assertNotIn("não expor", encoded)

    def test_recovery_preserves_valid_data_and_restores_missing_sets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "monitoring/runtime"
            (root / "data/portal").mkdir(parents=True)
            with sqlite3.connect(root / "data/portal/catalog.sqlite") as connection:
                connection.execute("create table catalog_records (id integer primary key)")
                connection.execute("create table catalog_history (id integer primary key)")
            (root / "warehouse").mkdir()
            (root / "warehouse/manifest.json").write_text(json.dumps({
                "ran_at_utc": datetime.now(timezone.utc).isoformat()}))
            (root / "warehouse/validation_report.json").write_text('{"status":"passed"}')
            (root / "exports/itineraries").mkdir(parents=True)
            (root / "exports/itineraries/item.pdf").write_bytes(b"pdf")
            (root / "exports/portal-persistence/pending-versions").mkdir(parents=True)
            (root / "exports/portal-persistence/pending-versions/item.json").write_text("{}")
            create_backup(root, runtime)
            preserved = ensure_recovery(root, runtime)
            self.assertEqual(preserved["outcome"], "preserved")
            (root / "data/portal/catalog.sqlite").unlink()
            (root / "exports/itineraries/item.pdf").unlink()
            (root / "exports/itineraries").rmdir()
            shutil.rmtree(root / "exports/portal-persistence")
            restored = ensure_recovery(root, runtime)
            self.assertEqual(restored["outcome"], "restored")
            self.assertEqual(set(restored["restored"]),
                             {"catalog", "itineraries", "portal-persistence"})
            self.assertTrue((root / "exports/itineraries/item.pdf").is_file())
            self.assertTrue((root / "exports/portal-persistence/pending-versions/item.json").is_file())

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

    def test_signals_report_s3_sql_and_pending_operations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "monitoring/runtime"
            runtime.mkdir(parents=True)
            (root / "data/portal").mkdir(parents=True)
            (root / "exports/itineraries").mkdir(parents=True)
            for database_path in (root / "data/portal/catalog.sqlite",
                                  root / "exports/itineraries/history.sqlite"):
                with sqlite3.connect(database_path) as database:
                    database.execute("create table state (id integer primary key)")
            pending = root / "exports/portal-persistence/pending-catalog"
            pending.mkdir(parents=True)
            (pending / "operation.json").write_text("{}")
            (root / "exports/portal-persistence/sync-status.json").write_text(json.dumps({
                "at": datetime.now(timezone.utc).isoformat(), "status": "ready"}))
            (runtime / "s3-backup-status.json").write_text(json.dumps({
                "at": datetime.now(timezone.utc).isoformat(), "outcome": "passed",
                "operation": "upload", "backup_id": "safe-id"}))
            (runtime / "data-s3-status.json").write_text(json.dumps({
                "at": datetime.now(timezone.utc).isoformat(), "outcome": "passed",
                "operation": "publish", "kind": "warehouse", "release_id": "release-id"}))
            with patch.dict(os.environ, {
                "BLU_OPERATIONAL_DIR": str(root / "exports/portal-persistence"),
                "BLU_DATA_DIR": str(root / "data"),
                "BLU_EXPORT_DIR": str(root / "exports/itineraries"),
            }):
                result = operational_signals(runtime)
                details = operational_details(runtime, "backup")
            self.assertEqual(result["persistence"]["state"], "up")
            self.assertEqual(result["persistence"]["pending_total"], 1)
            self.assertEqual(result["backup"]["s3_state"], "passed")
            self.assertEqual(result["backup"]["data_s3_state"], "passed")
            self.assertTrue(any(entry["fields"].get("operation") == "Cópia remota S3"
                                for entry in details["entries"]))

    def test_signals_consolidate_agent_audit_without_prompts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "monitoring/runtime"
            exports = root / "exports/itineraries"
            runtime.mkdir(parents=True)
            exports.mkdir(parents=True)
            now = datetime.now(timezone.utc)
            with sqlite3.connect(exports / "history.sqlite") as database:
                database.execute("CREATE TABLE agent_runs(status TEXT,metadata TEXT,createdAt TEXT)")
                database.executemany(
                    "INSERT INTO agent_runs VALUES(?,?,?)",
                    [("accepted", json.dumps({"modelId": "nova", "inputTokens": 100,
                                               "outputTokens": 20, "latencyMs": 120}),
                      now.isoformat()),
                     ("rejected", json.dumps({"modelId": "nova", "inputTokens": 50,
                                               "outputTokens": 10, "latencyMs": 80}),
                      now.isoformat()),
                     ("proposed", json.dumps({"modelId": "nova"}),
                      (now - timedelta(hours=1)).isoformat())])
            (runtime / "portal-events.jsonl").write_text(json.dumps({
                "at": now.isoformat(), "operation": "assistant_decision",
                "module": "api:assistant", "outcome": "failed", "http_status": 409,
            }) + "\n")
            with patch.dict(os.environ, {
                "BLU_EXPORT_DIR": str(exports),
                "BLU_AGENT_RATES_JSON": json.dumps({"nova": {"input": 1, "output": 2}}),
            }, clear=False):
                agent = operational_signals(runtime, now)["agent_metrics"]
            self.assertEqual(agent["proposals"], 3)
            self.assertEqual((agent["accepted"], agent["rejected"], agent["expired"]), (1, 1, 1))
            self.assertEqual(agent["conflicts_24h"], 1)
            self.assertEqual((agent["input_tokens"], agent["output_tokens"]), (150, 30))
            self.assertEqual(agent["average_latency_ms"], 100)
            self.assertAlmostEqual(agent["cost_usd"], 0.00021)
            self.assertNotIn("plan", json.dumps(agent))

    def test_log_query_normalizes_filters_and_orders_persistent_events(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            now = datetime.now(timezone.utc)
            rows = [
                {"at": (now - timedelta(minutes=1)).isoformat(), "user": "sessao:a1",
                 "operation": "navigation", "module": "catalog", "outcome": "success",
                 "level": "info", "details": "push"},
                {"at": now.isoformat(), "user": "server", "operation": "catalog_update",
                 "module": "api:catalog", "outcome": "failed", "level": "error",
                 "details": "POST /api/catalog", "message": "Falha controlada",
                 "stack": "Error: Falha controlada"},
                {"at": now.isoformat(), "user": "server", "operation": "uncaught_error",
                 "module": "portal", "outcome": "failed", "level": "critical",
                 "details": "window.error"},
            ]
            (runtime / "portal-events.jsonl").write_text(
                "\n".join(map(json.dumps, rows)) + "\n")
            (runtime / "probes.jsonl").write_text(json.dumps({
                "at": now.isoformat(), "services": [
                    {"name": "Observatório analítico", "state": "up",
                     "latency_ms": 12, "http_status": 200},
                    {"name": "Apresentação", "state": "down",
                     "latency_ms": None, "http_status": 503},
                    {"name": "Agente IA", "state": "up",
                     "latency_ms": 8, "http_status": 200},
                ]}) + "\n")
            result = query_logs(runtime, "portal", "ERROR", "catalog", "desc", 20)
            self.assertEqual(result["total"], 1)
            self.assertEqual(result["entries"][0]["severity"], "ERROR")
            self.assertEqual(result["entries"][0]["user"], "server")
            self.assertIn("stack", result["entries"][0])
            errors = query_logs(runtime, "portal", "ERRORS")
            self.assertEqual(errors["total"], 2)
            self.assertEqual(errors["counts"], {"all": 3, "errors": 2})
            self.assertEqual({entry["severity"] for entry in errors["entries"]},
                             {"ERROR", "CRITICAL"})
            observatory = query_logs(runtime, "observatory")
            self.assertEqual(observatory["entries"][0]["duration_ms"], 12)
            presentation = query_logs(runtime, "presentation", "ERRORS")
            self.assertEqual(presentation["total"], 1)
            self.assertEqual(presentation["entries"][0]["http_status"], 503)
            self.assertEqual(query_logs(runtime, "ai")["entries"][0]["status"], "up")
            ascending = query_logs(runtime, "portal", order="asc")
            self.assertEqual(ascending["entries"][0]["action"], "navigation")
            with self.assertRaises(ValueError):
                query_logs(runtime, "unknown")


if __name__ == "__main__":
    unittest.main()
