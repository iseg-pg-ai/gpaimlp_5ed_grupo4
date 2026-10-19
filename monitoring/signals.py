"""Leitura limitada e agregada dos sinais operacionais locais."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

MAX_BYTES = 2_000_000


def _events(path: Path, since: datetime) -> list[dict]:
    try:
        if path.stat().st_size > MAX_BYTES:
            return []
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines()[-2000:]:
            item = json.loads(line)
            at = datetime.fromisoformat(item["at"])
            if at.tzinfo and at >= since:
                rows.append(item)
        return rows
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return []


def operational_signals(runtime: Path, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    portal = _events(runtime / "portal-events.jsonl", since)
    ai = _events(runtime / "ai-usage.jsonl", since)
    backup = {"state": "unknown", "last_backup_at": None, "last_restore_at": None,
              "artifacts": None}
    try:
        evidence = json.loads((runtime / "restore-evidence.json").read_text())
        backup.update(state="up" if evidence["outcome"] == "passed" else "down",
                      last_backup_at=evidence["backup_created_at"],
                      last_restore_at=evidence["checked_at"], artifacts=evidence["artifact_count"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    token_rows = [row for row in ai if isinstance(row.get("total_tokens"), int)]
    return {
        "portal": {"state": "degraded" if any(row.get("outcome") != "success" for row in portal) else "up",
                   "events_24h": len(portal),
                   "errors_24h": sum(row.get("outcome") != "success" for row in portal),
                   "last_event_at": portal[-1]["at"] if portal else None},
        "ai": {"state": "degraded" if any(row.get("outcome") != "success" for row in ai) else "up",
               "calls_24h": len(ai), "failures_24h": sum(row.get("outcome") != "success" for row in ai),
               "tokens_reported": sum(row["total_tokens"] for row in token_rows),
               "calls_with_tokens": len(token_rows)},
        "backup": backup,
    }
