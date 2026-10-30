# Mantém o ciclo de vida dos incidentes e a evidência técnica necessária para acompanhar a
# recuperação.
"""Fila local de incidentes deduplicados e respetivas recuperações."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path


class AlertStore:
    def __init__(self, runtime: Path):
        self.state_path = runtime / "alert-state.json"
        self.queue_path = runtime / "notifications.jsonl"

    def reconcile(self, conditions: dict[str, bool]) -> dict:
        try:
            active = json.loads(self.state_path.read_text()).get("active", {})
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            active = {}
        now = datetime.now(timezone.utc).isoformat()
        emitted = []
        for key, failing in conditions.items():
            if failing and key not in active:
                active[key] = {"opened_at": now}
                emitted.append({"at": now, "key": key, "event": "opened"})
            elif not failing and key in active:
                emitted.append({"at": now, "key": key, "event": "recovered"})
                del active[key]
        self.state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.state_path.with_suffix(".tmp")
        temporary.write_text(json.dumps({"active": active}, separators=(",", ":")))
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.state_path)
        if emitted:
            with self.queue_path.open("a", encoding="utf-8") as queue:
                for event in emitted:
                    queue.write(json.dumps(event, separators=(",", ":")) + "\n")
            os.chmod(self.queue_path, 0o600)
        return {"active": len(active), "queued": len(emitted),
                "external": "disabled", "recent": emitted[-10:]}
