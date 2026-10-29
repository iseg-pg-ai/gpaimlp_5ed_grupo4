# Entrega notificações operacionais e mantém o estado das tentativas para permitir reenvio
# controlado.
"""Entrega externa persistente de transições de incidentes, sem dados de clientes."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re


TOPIC_ARN = re.compile(r"^arn:(aws|aws-us-gov|aws-cn):sns:([a-z0-9-]+):(\d{12}):([A-Za-z0-9_-]{1,256})$")


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def _event_id(event: dict) -> str:
    payload = {key: event[key] for key in ("at", "key", "event")}
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class NotificationDispatcher:
    """Publica em SNS com repetição; a fila local permanece como evidência."""

    def __init__(self, runtime: Path, config: dict, client=None, environment="development"):
        settings = config.get("notifications", {})
        self.enabled = settings.get("external_enabled", False)
        enabled_env = os.environ.get("BLU_MONITORING_NOTIFICATIONS_ENABLED")
        if enabled_env is not None:
            if enabled_env.lower() not in {"true", "false"}:
                raise ValueError("BLU_MONITORING_NOTIFICATIONS_ENABLED deve ser true ou false.")
            self.enabled = enabled_env.lower() == "true"
        self.channel = settings.get("channel")
        self.topic_env = settings.get("topic_arn_env", "BLU_MONITORING_SNS_TOPIC_ARN")
        self.initial_delay = settings.get("retry_initial_seconds", 60)
        self.max_delay = settings.get("retry_max_seconds", 3600)
        if not isinstance(self.enabled, bool):
            raise ValueError("Configuração de notificações inválida.")
        if (not isinstance(self.initial_delay, int) or self.initial_delay < 10
                or not isinstance(self.max_delay, int) or self.max_delay < self.initial_delay):
            raise ValueError("Política de repetição das notificações inválida.")
        self.topic_arn = os.environ.get(self.topic_env, "").strip() if self.enabled else ""
        match = TOPIC_ARN.fullmatch(self.topic_arn) if self.topic_arn else None
        if self.enabled and (self.channel != "sns" or not match):
            raise ValueError("Ativar notificações exige um tópico SNS válido.")
        self.region = match.group(2) if match else None
        self.runtime = runtime
        self.queue_path = runtime / "external-notifications.jsonl"
        self.state_path = runtime / "notification-delivery.json"
        self.client = client
        self.environment = environment

    def _load_state(self) -> dict:
        try:
            value = json.loads(self.state_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {"schema_version": 1, "events": {}}
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
            raise ValueError("Estado de entrega das notificações inválido.") from error
        if value.get("schema_version") != 1 or not isinstance(value.get("events"), dict):
            raise ValueError("Estado de entrega das notificações inválido.")
        return value

    def _load_queue(self) -> list[dict]:
        try:
            if self.queue_path.stat().st_size > 2_000_000:
                raise ValueError("Fila externa excede o limite permitido.")
            rows = []
            for line in self.queue_path.read_text(encoding="utf-8").splitlines():
                item = json.loads(line)
                if (item.get("schema_version") != 1
                        or not re.fullmatch(r"[a-f0-9]{64}", item.get("id", ""))
                        or item.get("transition") not in {"opened", "recovered"}
                        or not isinstance(item.get("incident"), str)
                        or len(item["incident"]) > 160):
                    raise ValueError("Evento de notificação inválido.")
                datetime.fromisoformat(item["at"])
                rows.append(item)
            return rows
        except FileNotFoundError:
            return []

    def _enqueue(self, events: list[dict], state: dict) -> None:
        known = {item["id"] for item in self._load_queue()}
        records = []
        for event in events:
            identifier = _event_id(event)
            if identifier in known:
                continue
            records.append({"schema_version": 1, "id": identifier, "at": event["at"],
                            "incident": event["key"], "transition": event["event"]})
            state["events"].setdefault(identifier, {"status": "pending", "attempts": 0})
            known.add(identifier)
        if records:
            self.queue_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with self.queue_path.open("a", encoding="utf-8") as output:
                for record in records:
                    output.write(json.dumps(record, separators=(",", ":")) + "\n")
            os.chmod(self.queue_path, 0o600)

    def _sns(self):
        if self.client is None:
            import boto3
            self.client = boto3.client("sns", region_name=self.region)
        return self.client

    def flush(self, events: list[dict] | None = None, now: datetime | None = None) -> dict:
        if not self.enabled:
            return {"external": "disabled", "external_channel": None,
                    "external_pending": 0, "external_delivered": 0,
                    "external_last_attempt_at": None, "external_error_code": None}
        now = now or datetime.now(timezone.utc)
        state = self._load_state()
        self._enqueue(events or [], state)
        queue = self._load_queue()
        for record in queue:
            delivery = state["events"].setdefault(
                record["id"], {"status": "pending", "attempts": 0})
            if delivery.get("status") == "delivered":
                continue
            retry_at = delivery.get("next_attempt_at")
            if retry_at and datetime.fromisoformat(retry_at) > now:
                continue
            delivery["last_attempt_at"] = now.isoformat()
            try:
                message = json.dumps({
                    "schema_version": 1,
                    "event_id": record["id"],
                    "environment": self.environment,
                    "occurred_at": record["at"],
                    "incident": record["incident"],
                    "transition": record["transition"],
                }, separators=(",", ":"))
                self._sns().publish(
                    TopicArn=self.topic_arn,
                    Subject=f"BLU {record['transition']}: {record['incident']}"[:100],
                    Message=message,
                )
                delivery.update(status="delivered", delivered_at=now.isoformat(),
                                next_attempt_at=None, error_code=None)
            except Exception as error:
                attempts = int(delivery.get("attempts", 0)) + 1
                delay = min(self.max_delay, self.initial_delay * (2 ** min(attempts - 1, 10)))
                delivery.update(status="retrying", attempts=attempts,
                                next_attempt_at=(now + timedelta(seconds=delay)).isoformat(),
                                error_code=type(error).__name__)
            else:
                delivery["attempts"] = int(delivery.get("attempts", 0)) + 1
            _atomic_json(self.state_path, state)
        _atomic_json(self.state_path, state)
        deliveries = list(state["events"].values())
        pending = [item for item in deliveries if item.get("status") != "delivered"]
        attempted = [item for item in deliveries if item.get("last_attempt_at")]
        latest = max(attempted, key=lambda item: item["last_attempt_at"]) if attempted else {}
        return {
            "external": "degraded" if pending and latest.get("error_code") else "ready",
            "external_channel": "sns",
            "external_pending": len(pending),
            "external_delivered": len(deliveries) - len(pending),
            "external_last_attempt_at": latest.get("last_attempt_at"),
            "external_error_code": latest.get("error_code"),
        }
