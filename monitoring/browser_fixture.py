# Prepara um ambiente de ensaio do Monitoring com dados controlados para os cenários de
# navegador.
"""Serve fixtures de UI isoladas; não lê credenciais nem dados operacionais."""
from datetime import datetime, timezone
import json
from pathlib import Path
import socket
import tempfile

from monitoring.security import Security, save_credentials
from monitoring.server import make_server


def main():
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "credentials.json"
        save_credentials(path, "operator", "fixture-only-long-password")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        now = datetime.now(timezone.utc).isoformat()
        runtime = Path(directory)
        portal_events = [
            {"at": now, "component": "portal", "operation": "fixture-check",
             "outcome": "success", "duration_ms": 12, "level": "info",
             "user": "sessao:fixture", "module": "catalog", "details": "GET /api/catalog"},
            {"at": now, "component": "portal", "operation": "fixture-failure",
             "outcome": "failed", "error_code": "FixtureError", "level": "error",
             "user": "server", "module": "api:catalog", "details": "POST /api/catalog",
             "message": "Falha controlada", "stack": "Error: fixture\n at catalog"},
        ]
        (runtime / "portal-events.jsonl").write_text(
            "\n".join(json.dumps(event) for event in portal_events) + "\n")
        class Fixture:
            def __init__(self):
                self.runtime = runtime

            def snapshot(self):
                services = [{"name": name, "state": state, "http_status": 200 if state == "up" else None,
                             "latency_ms": 12 if state != "disabled" else None}
                            for name, state in [("Portal BLU", "up"), ("Observatório analítico", "down"),
                                                ("Apresentação", "up"), ("Agente IA", "disabled")]]
                return {"snapshot": {"checked_at": now, "interval_seconds": 30, "services": services,
                                     "warehouse": {"state": "up", "published_at": now, "age_hours": 1,
                                                   "validation": "passed", "tables": 28, "records": 420,
                                                   "freshness": "not_configured"},
                                     "system": {"disk_free_gb": 42.2, "disk_used_pct": 34.5, "load_1m": 0.3},
                                     "alerts": {"active": 1, "external": "disabled", "recent": []},
                                     "operations": {
                                         "portal": {"events_24h": 2, "errors_24h": 1},
                                         "ai": {"calls_24h": 3, "failures_24h": 0,
                                                "tokens_reported": 180, "calls_with_tokens": 3},
                                         "agent_metrics": {"state": "up", "proposals": 4,
                                                           "accepted": 2, "rejected": 1,
                                                           "expired": 1, "conflicts_24h": 1,
                                                           "input_tokens": 150,
                                                           "output_tokens": 30,
                                                           "average_latency_ms": 120,
                                                           "cost_state": "configured",
                                                           "cost_usd": 0.0012},
                                         "backup": {"state": "up", "artifacts": 3,
                                                    "last_restore_at": now,
                                                    "s3_state": "passed",
                                                    "data_s3_state": "passed"},
                                         "persistence": {"pending_total": 0, "state": "up"}}},
                        "history": [{"at": now, "services": services} for _ in range(24)],
                        "events": [{"at": now, "component": item["name"], "state": item["state"]} for item in services]}
        url = f"http://127.0.0.1:{port}/codeeditor/default/ports/3004"
        with make_server(port, Security(path), Fixture(), url, insecure_local=True) as server:
            print(json.dumps({"url": url + "/"}), flush=True)
            server.serve_forever()


if __name__ == "__main__":
    main()
