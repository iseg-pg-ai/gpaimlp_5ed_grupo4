"""Persistência, deduplicação e repetição das notificações externas."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from monitoring.notifications import NotificationDispatcher


TOPIC = "arn:aws:sns:eu-west-1:123456789012:blu-monitoring"


class FakeSNS:
    def __init__(self, failures=0):
        self.failures = failures
        self.messages = []

    def publish(self, **message):
        if self.failures:
            self.failures -= 1
            raise ConnectionError("offline")
        self.messages.append(message)
        return {"MessageId": f"message-{len(self.messages)}"}


def config(enabled=True):
    return {"notifications": {
        "external_enabled": enabled,
        "channel": "sns",
        "topic_arn_env": "BLU_MONITORING_SNS_TOPIC_ARN",
        "retry_initial_seconds": 10,
        "retry_max_seconds": 60,
    }}


class NotificationTests(unittest.TestCase):
    def dispatcher(self, runtime: Path, client: FakeSNS, enabled=True):
        environment = {"BLU_MONITORING_SNS_TOPIC_ARN": TOPIC}
        with patch.dict(os.environ, environment, clear=False), patch.dict(
                os.environ, {"BLU_MONITORING_NOTIFICATIONS_ENABLED": "true" if enabled else "false"}):
            return NotificationDispatcher(runtime, config(enabled), client, "test")

    def test_disabled_delivery_does_not_create_external_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            result = self.dispatcher(runtime, FakeSNS(), False).flush([{
                "at": "2026-10-24T12:00:00+00:00", "key": "service:Portal",
                "event": "opened",
            }])
            self.assertEqual(result["external"], "disabled")
            self.assertFalse((runtime / "external-notifications.jsonl").exists())

    def test_open_and_recovery_are_delivered_once_without_private_content(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            client = FakeSNS()
            dispatcher = self.dispatcher(runtime, client)
            opened = {"at": "2026-10-24T12:00:00+00:00",
                      "key": "service:Portal BLU", "event": "opened"}
            result = dispatcher.flush([opened])
            dispatcher.flush([opened])
            recovered = {**opened, "at": "2026-10-24T12:05:00+00:00",
                         "event": "recovered"}
            result = dispatcher.flush([recovered])
            self.assertEqual(len(client.messages), 2)
            self.assertEqual(result["external_delivered"], 2)
            self.assertEqual(result["external_pending"], 0)
            payload = " ".join(message["Message"] for message in client.messages)
            self.assertNotIn("prompt", payload.lower())
            self.assertNotIn("cliente", payload.lower())
            self.assertEqual({json.loads(message["Message"])["transition"]
                              for message in client.messages}, {"opened", "recovered"})

    def test_failure_is_persisted_and_retried_after_backoff(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            client = FakeSNS(failures=1)
            dispatcher = self.dispatcher(runtime, client)
            now = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
            event = {"at": now.isoformat(), "key": "backup", "event": "opened"}
            failed = dispatcher.flush([event], now)
            self.assertEqual(failed["external"], "degraded")
            self.assertEqual(failed["external_pending"], 1)
            dispatcher.flush(now=now + timedelta(seconds=9))
            self.assertEqual(client.messages, [])
            recovered = dispatcher.flush(now=now + timedelta(seconds=10))
            self.assertEqual(recovered["external"], "ready")
            self.assertEqual(recovered["external_pending"], 0)
            self.assertEqual(len(client.messages), 1)
            state = json.loads((runtime / "notification-delivery.json").read_text())
            self.assertEqual(next(iter(state["events"].values()))["attempts"], 2)

    def test_invalid_or_implicit_configuration_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {
                    "BLU_MONITORING_NOTIFICATIONS_ENABLED": "true",
                    "BLU_MONITORING_SNS_TOPIC_ARN": "not-an-arn"}):
                with self.assertRaisesRegex(ValueError, "tópico SNS válido"):
                    NotificationDispatcher(Path(directory), config())
            with patch.dict(os.environ, {"BLU_MONITORING_NOTIFICATIONS_ENABLED": "yes"}):
                with self.assertRaisesRegex(ValueError, "true ou false"):
                    NotificationDispatcher(Path(directory), config(False))

    def test_corrupt_delivery_state_fails_closed_without_republishing(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            (runtime / "notification-delivery.json").write_text("not-json")
            client = FakeSNS()
            dispatcher = self.dispatcher(runtime, client)
            with self.assertRaisesRegex(ValueError, "Estado de entrega"):
                dispatcher.flush()
            self.assertEqual(client.messages, [])


if __name__ == "__main__":
    unittest.main()
