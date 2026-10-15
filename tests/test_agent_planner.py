"""Contrato e falhas do planeador, sem fornecedores externos por defeito."""
import copy
import json
import unittest
from unittest.mock import MagicMock, patch

from blu_ai.planner import plan_actions, validate_plan, execute, failure_code, AgentResponseError, AgentContextError
from botocore.exceptions import ClientError, ReadTimeoutError
from blu_ai.agents.curator_agent import extract_text_content


def proposal():
    return {"summary": "Remover atividade para revisão.", "actions": [
        {"type": "remove_item", "dayNumber": 1, "itemId": "atracoes:test"}],
        "warnings": [], "requiresConfirmation": True}


class PlannerTest(unittest.TestCase):
    def test_failures_distinguish_contract_permissions_and_timeout_without_raw_details(self):
        for error, expected in [
            (AgentResponseError("conteúdo privado"), "AGENT_INVALID_RESPONSE"),
            (AgentContextError("conteúdo privado"), "AGENT_CONTEXT_TOO_LARGE"),
            (ReadTimeoutError(endpoint_url="https://private.example"), "AGENT_TIMEOUT"),
            (ClientError({"Error": {"Code": "AccessDeniedException", "Message": "segredo"}}, "Converse"), "AGENT_ACCESS_DENIED"),
            (ClientError({"Error": {"Code": "ThrottlingException", "Message": "segredo"}}, "Converse"), "AGENT_BUSY"),
        ]:
            self.assertEqual(failure_code(error), expected)
            with patch("blu_ai.planner.plan_actions", side_effect=error), patch.dict("os.environ", {"BLU_AGENT_LAMBDA_FUNCTION": ""}):
                result = execute({"instruction": "teste", "context": {}})
                self.assertEqual(result["code"], expected)
                self.assertNotIn("privado", json.dumps(result))
                self.assertNotIn("segredo", json.dumps(result))

    def test_bedrock_receives_contract_and_returns_only_tool_input(self):
        client = MagicMock()
        plan = proposal()
        client.converse.return_value = {"stopReason": "tool_use", "output": {"message": {"content": [
            {"reasoningContent": {"text": "privado"}},
            {"toolUse": {"name": "propose_actions", "input": plan}}]}},
            "usage": {"inputTokens": 12, "outputTokens": 8}}
        result = plan_actions({"instruction": "Alivia o dia", "context": {"candidates": []}}, client)
        self.assertEqual(result["plan"], plan)
        self.assertEqual(result["inputTokens"], 12)
        self.assertNotIn("privado", json.dumps(result))
        args = client.converse.call_args.kwargs
        self.assertEqual(args["inferenceConfig"]["temperature"], 0)
        self.assertIn("DADOS NÃO FIÁVEIS", args["system"][0]["text"])
        self.assertEqual(args["toolConfig"]["toolChoice"], {"tool": {"name": "propose_actions"}})

    def test_refuses_text_only_truncation_and_unsupported_tool(self):
        for response in [
            {"stopReason": "end_turn", "output": {"message": {"content": [{"text": "Feito"}]}}},
            {"stopReason": "max_tokens", "output": {"message": {"content": [{"toolUse": {"name": "propose_actions", "input": proposal()}}]}}},
            {"stopReason": "tool_use", "output": {"message": {"content": [{"toolUse": {"name": "write_database", "input": proposal()}}]}}},
        ]:
            client = MagicMock()
            client.converse.return_value = response
            with self.assertRaises(ValueError):
                plan_actions({"instruction": "teste", "context": {}}, client)

    def test_strict_shared_schema_rejects_invented_fields_and_missing_arguments(self):
        for transform in [
            lambda p: p.update(requiresConfirmation=False),
            lambda p: p["actions"][0].update(type="delete_catalog"),
            lambda p: p["actions"][0].pop("itemId"),
            lambda p: p["actions"][0].update(dayNumber=True),
            lambda p: p["actions"][0].update(catalogId="extra"),
            lambda p: p.update(chainOfThought="segredo"),
        ]:
            p = copy.deepcopy(proposal())
            transform(p)
            with self.assertRaises(ValueError):
                validate_plan(p)

    def test_legacy_extraction_never_exposes_reasoning(self):
        self.assertEqual(extract_text_content([
            {"type": "reasoning_content", "reasoning_content": {"text": "segredo"}},
            {"type": "text", "text": "Resposta pública"},
            {"type": "tool_use", "text": "privado"},
        ]), "Resposta pública")

    def test_legacy_service_requires_token_and_has_no_wildcard_cors(self):
        from fastapi.testclient import TestClient
        from blu_ai.api.server import app
        with TestClient(app) as client, patch.dict("os.environ", {"BLU_AGENT_API_TOKEN": "test-token"}):
            response = client.post("/api/agent/chat", json={"instruction": "test"})
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("access-control-allow-origin", response.headers)
            with patch("blu_ai.api.server.chat_copilot", return_value={"reply": "teste"}):
                response = client.post("/api/agent/chat", headers={"Authorization": "Bearer test-token"}, json={"instruction": "test"})
                self.assertEqual(response.status_code, 200)
