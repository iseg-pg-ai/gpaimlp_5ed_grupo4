"""Leitura limitada e agregada dos sinais operacionais locais."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sqlite3

MAX_BYTES = 2_000_000
SEVERITIES = {"INFO", "WARNING", "ERROR", "CRITICAL"}


def _json(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def _database_state(path: Path) -> str:
    if not path.is_file():
        return "missing"
    try:
        with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True,
                             timeout=1) as database:
            return "up" if database.execute("PRAGMA quick_check").fetchone()[0] == "ok" else "down"
    except sqlite3.Error:
        return "down"


def _persistence(runtime: Path) -> dict:
    root = runtime.parents[1]
    operational = Path(os.environ.get(
        "BLU_OPERATIONAL_DIR", str(root / "exports/portal-persistence")))
    pending = {}
    for name, folder in (("catalog", "pending-catalog"), ("versions", "pending-versions"),
                         ("data_s3", "data-s3-outbox")):
        directory = operational / folder
        pending[name] = sum(1 for item in directory.glob("*.json") if item.is_file()) \
            if directory.is_dir() else 0
    sync = _json(operational / "sync-status.json") or {}
    data_root = Path(os.environ.get("BLU_DATA_DIR", str(root / "data")))
    export_root = Path(os.environ.get(
        "BLU_EXPORT_DIR", str(root / "exports/itineraries")))
    databases = {
        "catalog": _database_state(data_root / "portal/catalog.sqlite"),
        "versions": _database_state(export_root / "history.sqlite"),
    }
    return {"state": "up" if all(value == "up" for value in databases.values()) else "degraded",
            "databases": databases, "pending": pending,
            "pending_total": sum(pending.values()), "last_sync_at": sync.get("at"),
            "sync_state": sync.get("status", "unknown"),
            "sync_error_code": sync.get("errorCode")}


def _agent_metrics(runtime: Path, portal: list[dict], now: datetime) -> dict:
    """Agrega a auditoria do agente sem ler prompts, planos ou dados de clientes."""
    root = runtime.parents[1]
    export_root = Path(os.environ.get(
        "BLU_EXPORT_DIR", str(root / "exports/itineraries")))
    database_path = export_root / "history.sqlite"
    result = {"state": "unavailable", "runs": 0, "proposals": 0, "answers": 0,
              "accepted": 0, "rejected": 0, "pending": 0, "expired": 0,
              "conflicts_24h": 0, "input_tokens": 0, "output_tokens": 0,
              "average_latency_ms": None, "cost_usd": None,
              "cost_state": "not_configured", "models": []}
    result["conflicts_24h"] = sum(
        row.get("http_status") == 409 or row.get("error_code") in {
            "VERSION_CONFLICT", "AGENT_CONFLICT", "CONFLICT"}
        for row in portal
        if str(row.get("module", "")).startswith("api:assistant")
        or "assistant" in str(row.get("operation", ""))
    )
    if not database_path.is_file():
        return result
    try:
        with sqlite3.connect(database_path.resolve().as_uri() + "?mode=ro", uri=True,
                             timeout=1) as database:
            rows = database.execute(
                "SELECT status,metadata,createdAt FROM agent_runs ORDER BY createdAt DESC"
            ).fetchall()
    except sqlite3.Error:
        return result
    metadata = []
    statuses = []
    expired = 0
    for status, raw, created_at in rows:
        try:
            item = json.loads(raw)
            item = item if isinstance(item, dict) else {}
        except (TypeError, ValueError, json.JSONDecodeError):
            item = {}
        metadata.append(item)
        statuses.append(str(status))
        try:
            created = datetime.fromisoformat(str(created_at))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            expired += status == "proposed" and now - created > timedelta(minutes=30)
        except (TypeError, ValueError):
            pass
    latencies = [float(item["latencyMs"]) for item in metadata
                 if isinstance(item.get("latencyMs"), (int, float))
                 and not isinstance(item.get("latencyMs"), bool)
                 and item["latencyMs"] >= 0]
    input_tokens = sum(item.get("inputTokens", 0) for item in metadata
                       if isinstance(item.get("inputTokens"), int)
                       and not isinstance(item.get("inputTokens"), bool)
                       and item["inputTokens"] >= 0)
    output_tokens = sum(item.get("outputTokens", 0) for item in metadata
                        if isinstance(item.get("outputTokens"), int)
                        and not isinstance(item.get("outputTokens"), bool)
                        and item["outputTokens"] >= 0)
    models = sorted({str(item.get("modelId")) for item in metadata if item.get("modelId")})
    costs = None
    cost_state = "not_configured"
    try:
        rates = json.loads(os.environ.get("BLU_AGENT_RATES_JSON", "{}"))
        if not isinstance(rates, dict):
            raise ValueError
        known_cost = 0.0
        priced = bool(metadata)
        for item in metadata:
            rate = rates.get(str(item.get("modelId", "")))
            if not isinstance(rate, dict) or not all(
                    isinstance(rate.get(key), (int, float))
                    and not isinstance(rate.get(key), bool) and rate[key] >= 0
                    for key in ("input", "output")):
                priced = False
                break
            input_value = item.get("inputTokens", 0)
            output_value = item.get("outputTokens", 0)
            safe_input = input_value if isinstance(input_value, int) \
                and not isinstance(input_value, bool) and input_value >= 0 else 0
            safe_output = output_value if isinstance(output_value, int) \
                and not isinstance(output_value, bool) and output_value >= 0 else 0
            known_cost += ((safe_input * rate["input"]
                            + safe_output * rate["output"]) / 1_000_000)
        if priced:
            costs, cost_state = round(known_cost, 6), "configured"
    except (TypeError, ValueError, json.JSONDecodeError):
        cost_state = "invalid_configuration"
    return {**result, "state": "up", "runs": len(rows),
            "proposals": sum(status in {"proposed", "accepted", "rejected"} for status in statuses),
            "answers": statuses.count("answered"), "accepted": statuses.count("accepted"),
            "rejected": statuses.count("rejected"),
            "pending": sum(status == "proposed" for status in statuses) - expired,
            "expired": expired, "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "average_latency_ms": round(sum(latencies) / len(latencies)) if latencies else None,
            "cost_usd": costs, "cost_state": cost_state, "models": models}


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
    s3 = _json(runtime / "s3-backup-status.json") or {}
    data_s3 = _json(runtime / "data-s3-status.json") or {}
    backup.update(s3_state=s3.get("outcome", "not_configured"),
                  s3_last_at=s3.get("at"), s3_operation=s3.get("operation"),
                  s3_backup_id=s3.get("backup_id"),
                  data_s3_state=data_s3.get("outcome", "not_configured"),
                  data_s3_last_at=data_s3.get("at"),
                  data_s3_kind=data_s3.get("kind"),
                  data_s3_release_id=data_s3.get("release_id"))
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
        "agent_metrics": _agent_metrics(runtime, portal, now),
        "backup": backup,
        "persistence": _persistence(runtime),
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
            ("s3-backup-status.json", "Cópia remota S3",
             ("at", "outcome", "backup_id", "bytes", "error_code")),
            ("data-s3-status.json", "Publicação de dados S3",
             ("at", "outcome", "kind", "release_id", "file_count", "bytes",
              "error_code")),
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
        persistence = _persistence(runtime)
        entries.append({"at": persistence["last_sync_at"],
                        "is_error": persistence["sync_state"] == "failed",
                        "fields": {"operation": "Sincronização SQL",
                                   "outcome": persistence["sync_state"],
                                   "pending": persistence["pending_total"],
                                   "catalog_database": persistence["databases"]["catalog"],
                                   "versions_database": persistence["databases"]["versions"],
                                   **({"error_code": persistence["sync_error_code"]}
                                      if persistence["sync_error_code"] else {})}})
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
    if module not in {"portal", "observatory", "presentation", "ai", "backup", "alerts"}:
        raise ValueError("Módulo desconhecido.")
    severity = severity.upper()
    if severity and severity not in {*SEVERITIES, "ERRORS"}:
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
                "component": item.get("component"),
                "status": outcome,
                "severity": level,
                "details": item.get("details") or item.get("error_code") or "—",
                "message": item.get("message"),
                "stack": item.get("stack"),
                "http_status": item.get("http_status"),
                "duration_ms": item.get("duration_ms"),
                "error_code": item.get("error_code"),
            })
    if module in {"observatory", "presentation", "ai"}:
        service_names = {"observatory": "Observatório analítico",
                         "presentation": "Apresentação", "ai": "Agente IA"}
        for cycle in _event_family(runtime, "probes.jsonl", since):
            service = next((item for item in cycle.get("services", [])
                            if item.get("name") == service_names[module]), None)
            if not service:
                continue
            state = str(service.get("state", "unknown"))
            latency = service.get("latency_ms")
            rows.append({"timestamp": cycle.get("at"), "user": "system",
                         "action": "health_check", "module": module,
                         "component": "monitoring", "status": state,
                         "severity": "INFO" if state == "up" else "ERROR",
                         "details": "Serviço disponível" if state == "up" else "Sonda sem resposta",
                         "message": None, "stack": None,
                         "http_status": service.get("http_status"),
                         "duration_ms": latency, "error_code": None})
    if module == "backup":
        for entry in operational_details(runtime, "backup")["entries"]:
            fields = entry["fields"]
            rows.append({"timestamp": entry.get("at"), "user": "system",
                         "action": fields.get("operation", "backup"), "module": "backup",
                         "status": fields.get("outcome", "unknown"),
                         "severity": "ERROR" if entry["is_error"] else "INFO",
                         "details": fields.get("backup_id", "—")})
    elif module == "alerts":
        for entry in operational_details(runtime, "alerts")["entries"]:
            fields = entry["fields"]
            rows.append({"timestamp": entry.get("at"), "user": "system",
                         "action": fields.get("event", "incident"), "module": "alerts",
                         "status": fields.get("event", "unknown"),
                         "severity": "ERROR" if entry["is_error"] else "INFO",
                         "details": fields.get("key", "—")})
    needle = search.casefold().strip()
    if needle:
        rows = [row for row in rows if needle in " ".join(
            str(row.get(key, "")) for key in ("user", "action", "module", "status", "details", "message")
        ).casefold()]
    counts = {"all": len(rows),
              "errors": sum(row["severity"] in {"ERROR", "CRITICAL"} for row in rows)}
    if severity == "ERRORS":
        rows = [row for row in rows if row["severity"] in {"ERROR", "CRITICAL"}]
    elif severity:
        rows = [row for row in rows if row["severity"] == severity]
    rows.sort(key=lambda row: row.get("timestamp") or "", reverse=order == "desc")
    return {"module": module, "entries": rows[:limit], "total": len(rows), "counts": counts,
            "generated_at": datetime.now(timezone.utc).isoformat()}
