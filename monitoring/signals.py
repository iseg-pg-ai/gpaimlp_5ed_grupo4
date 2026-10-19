"""Leitura limitada e agregada dos sinais operacionais locais."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

MAX_BYTES = 2_000_000
SEVERITIES = {"INFO", "WARNING", "ERROR", "CRITICAL"}


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


def _event_family(runtime: Path, name: str, since: datetime) -> list[dict]:
    rows = []
    for suffix in (".3", ".2", ".1", ""):
        rows.extend(_events(runtime / f"{name}{suffix}", since))
    return sorted(rows, key=lambda row: row["at"])


def operational_signals(runtime: Path, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(hours=24)
    portal = _event_family(runtime, "portal-events.jsonl", since)
    ai = _event_family(runtime, "ai-usage.jsonl", since)
    backup = {"state": "unknown", "last_backup_at": None, "last_restore_at": None,
              "artifacts": None}
    try:
        evidence = json.loads((runtime / "restore-evidence.json").read_text())
        backup.update(state="up" if evidence["outcome"] == "passed" else "down",
                      last_backup_at=evidence["backup_created_at"],
                      last_restore_at=evidence["checked_at"], artifacts=evidence["artifact_count"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    try:
        scheduled = json.loads((runtime / "backup-schedule.json").read_text())
        backup["last_attempt_at"] = scheduled["at"]
        if scheduled["outcome"] != "passed":
            backup["state"] = "down"
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        backup["last_attempt_at"] = None
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


def operational_details(runtime: Path, kind: str) -> dict:
    """Devolve diagnóstico recente usando apenas campos técnicos permitidos."""
    if kind not in {"portal", "ai", "backup", "alerts"}:
        raise ValueError("Sinal operacional desconhecido.")
    if kind in {"portal", "ai"}:
        name = "portal-events.jsonl" if kind == "portal" else "ai-usage.jsonl"
        rows = _event_family(runtime, name, datetime.now(timezone.utc) - timedelta(hours=24))[-100:]
        allowed = ("component", "operation", "outcome", "level", "duration_ms",
                   "error_code", "http_status", "input_tokens", "output_tokens",
                   "total_tokens")
        return {"kind": kind, "entries": [
            {"at": row.get("at"),
             "is_error": row.get("outcome") not in {None, "success"},
             "fields": {key: row[key] for key in allowed if key in row}}
            for row in reversed(rows)
        ]}
    if kind == "backup":
        entries = []
        for name, label, allowed in (
            ("backup-schedule.json", "Execução automática",
             ("at", "outcome", "backup_id", "artifact_count")),
            ("restore-evidence.json", "Ensaio de restauro",
             ("checked_at", "outcome", "backup_id", "backup_created_at", "artifact_count")),
        ):
            try:
                row = json.loads((runtime / name).read_text())
                at = row.get("at") or row.get("checked_at")
                entries.append({"at": at, "is_error": row.get("outcome") != "passed",
                                "fields": {"operation": label, **{
                    key: row[key] for key in allowed if key in row and key not in {"at", "checked_at"}
                }}})
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                continue
        return {"kind": kind, "entries": entries}
    rows = _events(runtime / "notifications.jsonl", datetime.min.replace(tzinfo=timezone.utc))[-100:]
    return {"kind": kind, "entries": [
        {"at": row.get("at"), "is_error": row.get("event") == "opened",
         "fields": {key: row[key] for key in ("key", "event") if key in row}}
        for row in reversed(rows)
    ]}


def query_logs(runtime: Path, module: str = "portal", severity: str = "",
               search: str = "", order: str = "desc", limit: int = 200) -> dict:
    """Normaliza fontes persistentes para uma tabela técnica, sem conteúdo livre."""
    if module not in {"portal", "ai", "backup", "alerts"}:
        raise ValueError("Módulo desconhecido.")
    severity = severity.upper()
    if severity and severity not in SEVERITIES:
        raise ValueError("Severidade desconhecida.")
    if order not in {"asc", "desc"} or not 1 <= limit <= 500 or len(search) > 80:
        raise ValueError("Consulta inválida.")
    since = datetime.now(timezone.utc) - timedelta(days=7)
    rows = []
    if module in {"portal", "ai"}:
        source = "portal-events.jsonl" if module == "portal" else "ai-usage.jsonl"
        for item in _event_family(runtime, source, since):
            outcome = str(item.get("outcome", "unknown"))
            raw_level = str(item.get("level", "info" if outcome == "success" else "error")).upper()
            level = raw_level if raw_level in SEVERITIES else "ERROR"
            rows.append({
                "timestamp": item.get("at"),
                "user": item.get("user", "system"),
                "action": item.get("operation", "unknown"),
                "module": item.get("module", item.get("component", module)),
                "status": outcome,
                "severity": level,
                "details": item.get("details") or item.get("error_code") or "—",
                "message": item.get("message"),
                "stack": item.get("stack"),
                "http_status": item.get("http_status"),
                "duration_ms": item.get("duration_ms"),
            })
    elif module == "backup":
        for entry in operational_details(runtime, "backup")["entries"]:
            fields = entry["fields"]
            rows.append({"timestamp": entry.get("at"), "user": "system",
                         "action": fields.get("operation", "backup"), "module": "backup",
                         "status": fields.get("outcome", "unknown"),
                         "severity": "ERROR" if entry["is_error"] else "INFO",
                         "details": fields.get("backup_id", "—")})
    else:
        for entry in operational_details(runtime, "alerts")["entries"]:
            fields = entry["fields"]
            rows.append({"timestamp": entry.get("at"), "user": "system",
                         "action": fields.get("event", "incident"), "module": "alerts",
                         "status": fields.get("event", "unknown"),
                         "severity": "ERROR" if entry["is_error"] else "INFO",
                         "details": fields.get("key", "—")})
    needle = search.casefold().strip()
    if severity:
        rows = [row for row in rows if row["severity"] == severity]
    if needle:
        rows = [row for row in rows if needle in " ".join(
            str(row.get(key, "")) for key in ("user", "action", "module", "status", "details", "message")
        ).casefold()]
    rows.sort(key=lambda row: row.get("timestamp") or "", reverse=order == "desc")
    return {"module": module, "entries": rows[:limit], "total": len(rows),
            "generated_at": datetime.now(timezone.utc).isoformat()}
