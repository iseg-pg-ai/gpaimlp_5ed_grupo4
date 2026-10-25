import importlib
import os
import runpy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


def load_server(**env):
    """Recarrega o serviço com o ambiente indicado, porque o CORS é lido na importação."""
    with patch.dict(os.environ, env, clear=False):
        for name in ("BLU_AI_CORS_ORIGINS", "BLU_AI_HOST", "BLU_AI_PORT"):
            if name not in env:
                os.environ.pop(name, None)
        import blu_ai.api.server as server
        return importlib.reload(server)


def preflight(client, origin):
    return client.options(
        "/api/agent/chat",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )


class AgentServerCorsTest(unittest.TestCase):
    def test_cors_is_disabled_without_configured_origins(self):
        client = TestClient(load_server().app)
        for origin in ("http://localhost:3000", "https://evil.example"):
            self.assertIsNone(preflight(client, origin).headers.get("access-control-allow-origin"))

    def test_cors_allows_only_configured_origins_without_credentials(self):
        server = load_server(BLU_AI_CORS_ORIGINS=" http://localhost:3000 , https://studio.example.test ")
        client = TestClient(server.app)
        for origin in ("http://localhost:3000", "https://studio.example.test"):
            response = preflight(client, origin)
            self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
            self.assertIsNone(response.headers.get("access-control-allow-credentials"))
        self.assertIsNone(
            preflight(client, "https://evil.example").headers.get("access-control-allow-origin")
        )


class AgentServerErrorTest(unittest.TestCase):
    def setUp(self):
        self.server = load_server()
        self.client = TestClient(self.server.app)

    def test_chat_errors_hide_internal_details(self):
        with patch.object(self.server, "chat_copilot", side_effect=RuntimeError("segredo-interno")), \
                self.assertLogs("blu_ai.api.server", level="ERROR") as logs:
            response = self.client.post("/api/agent/chat", json={"instruction": "x"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "Erro no Co-Pilot."})
        self.assertNotIn("segredo-interno", response.text)
        self.assertIn("segredo-interno", "\n".join(logs.output))

    def test_curate_errors_hide_internal_details(self):
        # Chamada direta: evita construir um briefing válido só para chegar ao erro.
        brief = self.server.CustomerBrief.model_construct()
        with patch.object(self.server, "curate_itinerary", side_effect=RuntimeError("segredo-interno")), \
                self.assertLogs("blu_ai.api.server", level="ERROR"), \
                self.assertRaises(self.server.HTTPException) as raised:
            self.server.api_curate_itinerary(brief)
        self.assertEqual(raised.exception.status_code, 500)
        self.assertEqual(raised.exception.detail, "Erro na execução do agente.")


class AgentServerBindingTest(unittest.TestCase):
    def run_main(self, **env):
        with patch.dict(os.environ, env, clear=False), patch("uvicorn.run") as run:
            for name in ("BLU_AI_HOST", "BLU_AI_PORT"):
                if name not in env:
                    os.environ.pop(name, None)
            runpy.run_module("blu_ai.api.server", run_name="__main__")
        return run.call_args

    def test_direct_run_listens_only_on_loopback_without_reload(self):
        call = self.run_main()
        self.assertEqual(call.kwargs["host"], "127.0.0.1")
        self.assertEqual(call.kwargs["port"], 8000)
        self.assertNotIn("reload", call.kwargs)

    def test_direct_run_accepts_explicit_host_and_port(self):
        call = self.run_main(BLU_AI_HOST="0.0.0.0", BLU_AI_PORT="8100")
        self.assertEqual((call.kwargs["host"], call.kwargs["port"]), ("0.0.0.0", 8100))


if __name__ == "__main__":
    unittest.main()
