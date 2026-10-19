"""Contratos de autenticação, isolamento e sondas com fixtures temporárias."""
from datetime import datetime, timezone, timedelta
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from unittest.mock import patch

from monitoring.admin_auth import authorize_admin
from monitoring.collector import Collector, probe, warehouse_status
from monitoring.security import Security, save_credentials
from monitoring.server import make_server

PASSWORD = "fixture-only-long-password"


class CredentialFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "private/credentials.json"
        save_credentials(self.path, "operator", PASSWORD)
        self.time = 0
        self.auth = Security(self.path, clock=lambda: self.time)


class AuthTests(CredentialFixture):
    def test_recovery_command_accepts_only_active_administrators(self):
        self.assertTrue(authorize_admin(self.path, "operator", PASSWORD))
        self.assertFalse(authorize_admin(self.path, "operator", "wrong-password"))
        token, _ = self.auth.login("operator", PASSWORD, "local")
        self.auth.manage(token, "create", {"username": "reader", "role": "viewer",
                                          "password": PASSWORD,
                                          "password_confirm": PASSWORD})
        self.assertFalse(authorize_admin(self.path, "reader", PASSWORD))
        self.auth.manage(token, "update", {"username": "reader", "role": "admin",
                                          "enabled": "false"})
        self.assertFalse(authorize_admin(self.path, "reader", PASSWORD))

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


class UsersTests(CredentialFixture):
    def create(self, token, name="reader", role="viewer"):
        self.auth.manage(token, "create", {"username": name, "role": role, "password": PASSWORD,
                                          "password_confirm": PASSWORD})

    def test_legacy_migration_and_persistence(self):
        record = json.loads(self.path.read_text())["users"]["operator"]
        legacy = {field: record[field] for field in ("username", "salt", "hash", "iterations")}
        self.path.write_text(json.dumps(legacy))
        self.auth = Security(self.path)
        token, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(token)
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved["version"], 2)
        self.assertEqual(saved["users"]["operator"]["hash"], legacy["hash"])
        restored = Security(self.path)
        self.assertEqual(restored.login("reader", PASSWORD, "local")[1], 200)
        listing = self.auth.list_users(token)
        self.assertNotIn("hash", json.dumps(listing))
        self.assertNotIn("salt", json.dumps(listing))

    def test_reader_cannot_list_or_manage_users(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(admin)
        viewer, _ = self.auth.login("reader", PASSWORD, "local")
        with self.assertRaises(PermissionError):
            self.auth.list_users(viewer)
        with self.assertRaises(PermissionError):
            self.create(viewer, "intruder", "admin")

    def test_account_changes_revoke_sessions(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(admin)
        viewer, _ = self.auth.login("reader", PASSWORD, "local")
        new_password = "fixture-reset-password"
        self.auth.manage(admin, "password", {"username": "reader", "password": new_password,
                                            "password_confirm": new_password})
        self.assertIsNone(self.auth.session(viewer))
        self.assertEqual(self.auth.login("reader", PASSWORD, "local")[1], 401)
        viewer, _ = self.auth.login("reader", new_password, "local")
        self.auth.manage(admin, "update", {"username": "reader", "role": "admin", "enabled": "true"})
        self.assertIsNone(self.auth.session(viewer))
        viewer, _ = self.auth.login("reader", new_password, "local")
        self.auth.manage(admin, "update", {"username": "reader", "role": "viewer", "enabled": "false"})
        self.assertIsNone(self.auth.session(viewer))
        self.assertEqual(self.auth.login("reader", new_password, "local")[1], 401)
        self.auth.manage(admin, "update", {"username": "reader", "role": "viewer", "enabled": "true"})
        viewer, _ = self.auth.login("reader", new_password, "local")
        self.auth.manage(admin, "delete", {"username": "reader", "confirm": "delete"})
        self.assertIsNone(self.auth.session(viewer))
        self.assertEqual(self.auth.login("reader", new_password, "local")[1], 401)

    def test_last_admin_self_protection_and_duplicates(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        for action, fields in [("update", {"username": "operator", "role": "viewer", "enabled": "true"}),
                               ("update", {"username": "operator", "role": "admin", "enabled": "false"}),
                               ("delete", {"username": "operator", "confirm": "delete"})]:
            with self.assertRaises(ValueError):
                self.auth.manage(admin, action, fields)
        self.create(admin)
        with self.assertRaises(ValueError):
            self.create(admin, "READER")
        with self.assertRaises(ValueError):
            self.create(admin, "<script>")
        with self.assertRaises(ValueError):
            self.auth.manage(admin, "delete", {"username": "reader"})

    def test_disk_error_does_not_publish_partial_changes(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(admin)
        viewer, _ = self.auth.login("reader", PASSWORD, "local")
        original = self.path.read_bytes()
        with patch("monitoring.security.write_users", side_effect=OSError("fixture")):
            with self.assertRaises(OSError):
                self.auth.manage(admin, "delete", {"username": "reader", "confirm": "delete"})
        self.assertEqual(self.path.read_bytes(), original)
        self.assertIsNotNone(self.auth.session(viewer))

    def test_two_admins_cannot_concurrently_remove_both_roles(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(admin, "second-admin", "admin")
        second, _ = self.auth.login("second-admin", PASSWORD, "local")
        def demote(values):
            token, username = values
            try:
                self.auth.manage(token, "update", {"username": username, "role": "viewer", "enabled": "true"})
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(demote, [(admin, "operator"), (second, "second-admin")]))
        self.assertEqual(sum(results), 1)
        self.assertEqual(sum(user["role"] == "admin" and user["enabled"] for user in self.auth.users.values()), 1)

    def test_cli_recovery_preserves_other_accounts(self):
        admin, _ = self.auth.login("operator", PASSWORD, "local")
        self.create(admin)
        save_credentials(self.path, "operator", "fixture-recovery-password")
        restored = Security(self.path)
        self.assertEqual(restored.login("reader", PASSWORD, "local")[1], 200)
        self.assertEqual(restored.login("operator", "fixture-recovery-password", "local")[1], 200)


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
            cleanup_runs = 0
            def snapshot(self):
                return {"snapshot": {"sentinel": "protected"}, "history": [], "events": []}
            def cleanup_now(self):
                self.cleanup_runs += 1
                return {"outcome": "passed"}
        self.collector = FakeCollector()
        self.collector.runtime = Path(self.temp.name)
        self.server = make_server(0, self.auth, self.collector, "https://example.test/codeeditor/default/ports/3004")
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
        self.assertEqual(self.request("/health")[0], 200)
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

    def test_operational_details_require_login_and_reject_unknown_signal(self):
        self.assertEqual(self.request("/api/operations?kind=portal")[0], 401)
        cookie = self.login()
        status, _, body = self.request("/api/operations?kind=portal", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["kind"], "portal")
        self.assertEqual(self.request("/api/operations?kind=unknown", cookie=cookie)[0], 400)

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

    def test_management_requires_admin_and_csrf(self):
        admin = self.login()
        token = admin.split(";", 1)[0].split("=", 1)[1]
        csrf = self.auth.session(token)["csrf"]
        fields = {"action": "create", "username": "viewer", "role": "viewer",
                  "password": PASSWORD, "password_confirm": PASSWORD}
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields))[0], 401)
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields), admin)[0], 403)
        fields["csrf"] = "inválido"
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields), admin)[0], 403)
        fields["csrf"] = csrf
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields), admin, origin="https://evil.test")[0], 403)
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields), admin)[0], 303)
        _, _, body = self.request("/users", cookie=admin)
        self.assertIn("viewer", body)
        self.assertNotIn(PASSWORD, body)
        self.assertNotIn(self.auth.users["operator"]["hash"], body)
        status, headers, _ = self.request("/login", "POST", f"username=viewer&password={PASSWORD}")
        self.assertEqual(status, 303)
        viewer = headers["Set-Cookie"]
        self.assertEqual(self.request("/api/status", cookie=viewer)[0], 200)
        self.assertEqual(self.request("/users", cookie=viewer)[0], 403)
        viewer_token = viewer.split(";", 1)[0].split("=", 1)[1]
        fields["csrf"] = self.auth.session(viewer_token)["csrf"]
        self.assertEqual(self.request("/users/manage", "POST", urlencode(fields), viewer)[0], 403)
        self.assertNotIn("Gerir utilizadores", self.request("/", cookie=viewer)[2])

    def test_insecure_public_origin_refused(self):
        with self.assertRaises(ValueError):
            make_server(0, self.auth, None, "http://example.test")

    def test_cleanup_requires_admin_and_csrf(self):
        admin = self.login()
        token = admin.split(";", 1)[0].split("=", 1)[1]
        csrf = self.auth.session(token)["csrf"]
        self.assertEqual(self.request("/maintenance/cleanup", "POST", "csrf=wrong", admin)[0], 403)
        self.assertEqual(self.collector.cleanup_runs, 0)
        self.assertEqual(self.request("/maintenance/cleanup", "POST", f"csrf={csrf}", admin)[0], 303)
        self.assertEqual(self.collector.cleanup_runs, 1)
        fields = {"action": "create", "username": "viewer", "role": "viewer",
                  "password": PASSWORD, "password_confirm": PASSWORD, "csrf": csrf}
        self.request("/users/manage", "POST", urlencode(fields), admin)
        _, headers, _ = self.request("/login", "POST", f"username=viewer&password={PASSWORD}")
        viewer = headers["Set-Cookie"]
        viewer_token = viewer.split(";", 1)[0].split("=", 1)[1]
        viewer_csrf = self.auth.session(viewer_token)["csrf"]
        self.assertEqual(self.request("/maintenance/cleanup", "POST", f"csrf={viewer_csrf}", viewer)[0], 403)
        self.assertEqual(self.collector.cleanup_runs, 1)


if __name__ == "__main__":
    unittest.main()
