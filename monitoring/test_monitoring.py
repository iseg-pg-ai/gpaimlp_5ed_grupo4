"""Contratos de autenticação, isolamento e sondas com fixtures temporárias."""
from datetime import datetime, timezone, timedelta
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from monitoring.collector import Collector, probe, warehouse_status
from monitoring.security import Security, save_credentials
from monitoring.server import make_server

PASSWORD = "fixture-only-long-password"


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "private/credentials.json"
        save_credentials(self.path, "operator", PASSWORD)
        self.time = 0
        self.auth = Security(self.path, clock=lambda: self.time)

    def test_hash_and_permissions(self):
        self.assertNotIn(PASSWORD, self.path.read_text())
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.path.parent.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.auth.login("operator", PASSWORD, "local")[1], 200)
        self.assertEqual(self.auth.login("wrong", PASSWORD, "local")[1], 401)

    def test_rate_limit_and_recovery(self):
        for _ in range(5):
            self.assertEqual(self.auth.login("operator", "wrong", "local")[1], 401)
        self.assertEqual(self.auth.login("operator", PASSWORD, "local")[1], 429)
        self.time = 301
        self.assertEqual(self.auth.login("operator", PASSWORD, "local")[1], 200)

    def test_expiry_rotation_and_logout(self):
        first, _ = self.auth.login("operator", PASSWORD, "local")
        second, _ = self.auth.login("operator", PASSWORD, "local")
        self.assertNotEqual(first, second)
        self.assertIsNotNone(self.auth.session(first))
        self.time = 1801
        self.assertIsNone(self.auth.session(first))
        token, _ = self.auth.login("operator", PASSWORD, "local")
        for _ in range(16):
            self.time += 1700
            self.assertIsNotNone(self.auth.session(token))
        self.time += 1700
        self.assertIsNone(self.auth.session(token))
        token, _ = self.auth.login("operator", PASSWORD, "local")
        self.auth.logout(token)
        self.assertIsNone(self.auth.session(token))


class CollectorTests(unittest.TestCase):
    def test_metadata_unknown_failed_stale_and_no_personal_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(warehouse_status(root)["state"], "unknown")
            (root / "manifest.json").write_text(json.dumps({
                "ran_at_utc": (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat(),
                "source": {"private": "CLIENT CONTACT"}}))
            report = {"status": "passed", "tables": {"secret": {"record_count": 3}}}
            (root / "validation_report.json").write_text(json.dumps(report))
            result = warehouse_status(root)
            self.assertEqual(result["state"], "up")
            self.assertEqual(result["freshness"], "not_configured")
            self.assertEqual(result["records"], 3)
            self.assertNotIn("CLIENT CONTACT", json.dumps(result))
            self.assertNotIn("secret", json.dumps(result))
            self.assertEqual(warehouse_status(root, 24)["state"], "degraded")
            report["status"] = "failed"
            (root / "validation_report.json").write_text(json.dumps(report))
            self.assertEqual(warehouse_status(root)["state"], "down")
            (root / "validation_report.json").write_text("broken")
            self.assertEqual(warehouse_status(root)["state"], "unknown")

    def test_disabled_probe_and_connection_failure(self):
        with patch("monitoring.collector.build_opener") as opener:
            self.assertEqual(probe("Agent", "http://unused", False)["state"], "disabled")
            opener.assert_not_called()
            opener.return_value.open.side_effect = OSError("private detail")
            result = probe("Portal", "http://unused")
            self.assertEqual(result["state"], "down")
            self.assertNotIn("private detail", json.dumps(result))

    def test_http_redirects_are_not_followed(self):
        class Redirect(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", "http://127.0.0.1:1/private")
                self.end_headers()

            def log_message(self, *args):
                pass
        with ThreadingHTTPServer(("127.0.0.1", 0), Redirect) as server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                result = probe("Redirect", f"http://127.0.0.1:{server.server_port}/")
                self.assertEqual(result["state"], "down")
                self.assertEqual(result["http_status"], 302)
            finally:
                server.shutdown()

    def test_rotation_history_and_transitions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            collector = Collector(root, root / "logs", {"interval_seconds": 30,
                                  "warehouse_max_age_hours": None, "agent_enabled": False})
            self.addCleanup(lambda: [handler.close() for handler in collector.logger.handlers])
            with patch("monitoring.collector.probe", side_effect=lambda name, url, enabled: {
                "name": name, "state": "up" if enabled else "disabled", "latency_ms": 2,
                "http_status": 200 if enabled else None}):
                collector.collect()
                collector.collect()
            data = collector.snapshot()
            self.assertEqual(len(data["history"]), 2)
            self.assertEqual(len(data["events"]), 5)
            handler = collector.logger.handlers[0]
            self.assertEqual(handler.maxBytes, 1_000_000)
            self.assertEqual(handler.backupCount, 3)
            self.assertEqual(collector.samples.maxlen, 240)
            self.assertEqual(collector.events.maxlen, 100)


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        path = Path(self.temp.name) / "credentials.json"
        save_credentials(path, "operator", PASSWORD)
        self.auth = Security(path)
        class FakeCollector:
            def snapshot(self):
                return {"snapshot": {"sentinel": "protected"}, "history": [], "events": []}
        self.server = make_server(0, self.auth, FakeCollector(), "https://example.test/codeeditor/default/ports/3004")
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.prefix = "/codeeditor/default/ports/3004"

    def request(self, path, method="GET", body=None, cookie=None, origin="https://example.test"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"Origin": origin}
        if cookie:
            headers["Cookie"] = cookie
        if body:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        connection.request(method, self.prefix + path, body, headers)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read().decode()
        connection.close()
        return result

    def login(self):
        status, headers, body = self.request("/login", "POST", f"username=operator&password={PASSWORD}")
        self.assertEqual(status, 303)
        self.assertEqual(headers["Location"], "https://example.test" + self.prefix + "/")
        return headers["Set-Cookie"]

    def test_gate_assets_api_and_files(self):
        self.assertEqual(self.request("/")[0], 303)
        self.assertEqual(self.request("/api/status")[0], 401)
        self.assertEqual(self.request("/app.js")[0], 303)
        self.assertEqual(self.request("/login")[0], 200)
        cookie = self.login()
        for path in ["/runtime/credentials.json", "/../runtime/credentials.json", "/%2e%2e/.aws/config", "/config.json"]:
            self.assertEqual(self.request(path, cookie=cookie)[0], 404)
        status, headers, body = self.request("/api/status", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertIn("protected", body)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])

    def test_origin_cookie_csrf_and_logout(self):
        self.assertEqual(self.request("/login", "POST", f"username=operator&password={PASSWORD}", origin="https://evil.test")[0], 403)
        cookie = self.login()
        for flag in ["Secure", "HttpOnly", "SameSite=Strict", f"Path={self.prefix}/"]:
            self.assertIn(flag, cookie)
        self.assertEqual(self.request("/logout", "POST", "csrf=wrong", cookie)[0], 403)
        token = cookie.split(";", 1)[0].split("=", 1)[1]
        csrf = self.auth.session(token)["csrf"]
        self.assertEqual(self.request("/logout", "POST", f"csrf={csrf}", cookie)[0], 303)
        self.assertEqual(self.request("/api/status", cookie=cookie)[0], 401)

    def test_insecure_public_origin_refused(self):
        with self.assertRaises(ValueError):
            make_server(0, self.auth, None, "http://example.test")


if __name__ == "__main__":
    unittest.main()
