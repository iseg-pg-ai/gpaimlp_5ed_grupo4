"""Proteções do serviço legado com FastAPI TestClient e fornecedores simulados."""
import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from blu_ai.api.server import create_app


class LegacyServiceTest(unittest.TestCase):
    def client(self, origins=""):
        with patch.dict("os.environ", {"BLU_AGENT_ALLOWED_ORIGINS": origins}):
            return TestClient(create_app())

    def test_missing_token_fails_closed_except_health(self):
        with patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": ""}), self.client() as client:
            self.assertEqual(client.get("/api/health").status_code, 200)
            self.assertEqual(client.post("/api/agent/chat", json={"instruction": "Teste"}).status_code, 503)
            self.assertEqual(client.get("/api/tools/catalog").status_code, 503)

    def test_bearer_is_required_for_every_protected_route(self):
        with patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": "token-sintetico"}), self.client() as client:
            for method, path in (("post", "/api/agent/chat"), ("post", "/api/agent/curate"),
                                 ("get", "/api/tools/catalog"), ("get", "/api/tools/weather")):
                response = getattr(client, method)(path)
                self.assertEqual(response.status_code, 401)
                self.assertNotIn("access-control-allow-origin", response.headers)

    def test_exact_origin_and_bearer_allow_server_configured_client(self):
        with patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": "token-sintetico"}), self.client("https://portal.example") as client:
            with patch("blu_ai.api.server.chat_copilot", return_value={"reply": "Teste"}) as chat:
                headers = {"Authorization": "Bearer token-sintetico", "Origin": "https://portal.example"}
                response = client.post("/api/agent/chat", headers=headers, json={"instruction": "Teste"})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["access-control-allow-origin"], "https://portal.example")
                self.assertEqual(chat.call_count, 1)
                headers["Origin"] = "https://portal.example.attacker.test"
                response = client.post("/api/agent/chat", headers=headers, json={"instruction": "Teste"})
                self.assertEqual(response.status_code, 403)
                self.assertEqual(chat.call_count, 1)

    def test_unconfigured_or_wildcard_origin_cannot_enable_public_cors(self):
        for origins in ("", "*", "https://portal.example/path"):
            with patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": "token-sintetico"}), self.client(origins) as client:
                response = client.post("/api/agent/chat", headers={"Authorization": "Bearer token-sintetico", "Origin": "https://portal.example"}, json={"instruction": "Teste"})
                self.assertEqual(response.status_code, 403)
                self.assertNotIn("access-control-allow-origin", response.headers)

    def test_preflight_only_allows_exact_configured_origin(self):
        with self.client("https://portal.example") as client:
            headers = {"Origin": "https://portal.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Authorization,Content-Type"}
            response = client.options("/api/agent/chat", headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["access-control-allow-origin"], "https://portal.example")
            headers["Origin"] = "https://other.example"
            response = client.options("/api/agent/chat", headers=headers)
            self.assertNotIn("access-control-allow-origin", response.headers)

    def test_sdk_and_validation_errors_do_not_echo_private_input(self):
        with patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": "token-sintetico"}), self.client() as client:
            headers = {"Authorization": "Bearer token-sintetico"}
            with patch("blu_ai.api.server.chat_copilot", side_effect=RuntimeError("SEGREDO_SDK")):
                response = client.post("/api/agent/chat", headers=headers, json={"instruction": "SEGREDO_PEDIDO"})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("SEGREDO", response.text)
            response = client.post("/api/agent/chat", headers=headers, json={"instruction": {"texto": "SEGREDO_PEDIDO"}})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json(), {"detail": "Pedido inválido."})


if __name__ == "__main__":
    unittest.main()
