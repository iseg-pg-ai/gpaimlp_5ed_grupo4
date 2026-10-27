"""Fronteiras do smoke: configuração exata, isolamento e limpeza do ensaio."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts.run_image_smoke import run_smoke
from scripts.smoke_curation_image import wait_ready


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.delivery = self.root / "delivery.json"
        self.delivery.write_text(json.dumps({"config_digest": "sha256:" + "a" * 64, "smoke_verified": False}))
        self.commands = []
        self.config = "sha256:" + "a" * 64
        self.checks = ["portal", "monitoring", "presentation", "observatory", "portal-javascript",
                       "portal-python", "foreign-origin", "monitoring-auth"]

    def command(self, args, **kwargs):
        self.commands.append(args)
        if args[:3] == ["docker", "image", "inspect"]:
            value = {"Id": self.config, "Config": {"User": "blu"}}
        elif args[:2] == ["docker", "run"]:
            value = {"checks": self.checks, "external_network": False, "synthetic_data": True,
                     "cloud_identity_tested": False}
        else:
            value = {}
        return SimpleNamespace(stdout=json.dumps(value))

    def test_execution_is_isolated_and_success_is_recorded(self):
        with patch("scripts.run_image_smoke.command", side_effect=self.command):
            run_smoke(self.root / "image.tar", self.delivery, self.root / "smoke.json")
        command = next(c for c in self.commands if c[:2] == ["docker", "run"])
        self.assertEqual(command[command.index("--network") + 1], "none")
        self.assertIn("--read-only", command)
        self.assertNotIn("--privileged", command)
        self.assertNotIn("--volume", command)
        self.assertEqual(command[command.index("--user") + 1], "1000:1000")
        self.assertTrue(json.loads(self.delivery.read_text())["smoke_verified"])
        self.assertEqual(self.commands[-2][:3], ["docker", "rm", "-f"])
        self.assertEqual(self.commands[-1][:4], ["docker", "image", "rm", "-f"])

    def test_different_configuration_never_executes_the_image(self):
        self.config = "sha256:other"
        with patch("scripts.run_image_smoke.command", side_effect=self.command), self.assertRaises(ValueError):
            run_smoke(self.root / "image.tar", self.delivery, self.root / "smoke.json")
        self.assertFalse(any(c[:2] == ["docker", "run"] for c in self.commands))
        self.assertFalse(json.loads(self.delivery.read_text())["smoke_verified"])

    def test_incomplete_smoke_does_not_mark_delivery_as_ready(self):
        self.checks.remove("portal-python")
        with patch("scripts.run_image_smoke.command", side_effect=self.command), self.assertRaises(ValueError):
            run_smoke(self.root / "image.tar", self.delivery, self.root / "smoke.json")
        self.assertFalse(json.loads(self.delivery.read_text())["smoke_verified"])

    def test_exited_process_cannot_pass_readiness(self):
        process = SimpleNamespace(poll=lambda: 1)
        with self.assertRaises(RuntimeError):
            wait_ready(process, "http://127.0.0.1:1/", timeout=1)


if __name__ == "__main__":
    unittest.main()
