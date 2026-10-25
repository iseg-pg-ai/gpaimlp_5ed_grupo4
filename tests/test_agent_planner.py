"""Contrato, idioma e falhas do planeador; sem chamadas externas."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, patch

from botocore.exceptions import (
    ClientError, EndpointConnectionError, NoCredentialsError, ReadTimeoutError,
)

from blu_ai.agents.curator_agent import extract_text_content
from blu_ai.planner import (
    AgentConfigurationError, AgentContextError, AgentRequestError,
    AgentResponseError, SCHEMA, execute, failure_code, plan_actions,
    tool_schema, validate_plan,
)
from blu_ai.providers import OpenAIProvider, ProviderRequestError


def proposal(language="pt"):
    return {"summary": "Remover atividade para revisão." if language == "pt" else "Remove activity for review.",
            "actions": [{"type": "remove_item", "dayNumber": 1, "itemId": "atracoes:test"}],
            "warnings": [], "requiresConfirmation": True}


def provider_response(plan=None):
    return {"stopReason": "tool_use", "output": {"message": {"content": [
        {"reasoningContent": {"text": "MARCADOR_PRIVADO"}},
        {"toolUse": {"name": "propose_actions", "input": plan or proposal()}}]}},
        "usage": {"inputTokens": 12, "outputTokens": 8}}


class PlannerTest(unittest.TestCase):
    def test_contract_is_itinerary_only_and_schema_copy_cannot_expand_authority(self):
        expected = {"add_catalog_item", "replace_item", "remove_item", "reschedule_item",
                    "reorder_day", "set_day_capacity", "add_free_period", "set_free_day",
                    "move_item", "optimize_route", "regenerate_day"}
        self.assertEqual(set(SCHEMA["x-action-fields"]), expected)
        self.assertEqual(set(SCHEMA["properties"]), {"summary", "actions", "alternatives", "warnings", "requiresConfirmation"})
        before = copy.deepcopy(SCHEMA)
        schema = tool_schema({"requestIntent": {"kind": "rank", "dayNumber": 1}})
        schema["properties"]["actions"]["maxItems"] = 99
        self.assertEqual(SCHEMA, before)
        self.assertNotIn("ranking", json.dumps(SCHEMA))
        self.assertNotIn("briefPatch", json.dumps(SCHEMA))
        self.assertNotIn("confirmationPatch", json.dumps(SCHEMA))

    def test_all_eleven_actions_accept_exact_fields(self):
        arguments = {
            "add_catalog_item": {"catalogId": "atracoes:new"},
            "replace_item": {"itemId": "atracoes:test", "catalogId": "atracoes:new"},
            "remove_item": {"itemId": "atracoes:test"},
            "reschedule_item": {"itemId": "atracoes:test", "time": "14:30"},
            "reorder_day": {"itemIds": ["atracoes:b", "atracoes:a"]},
            "set_day_capacity": {"capacity": 3}, "add_free_period": {"period": "morning"},
            "set_free_day": {}, "move_item": {"itemId": "atracoes:test", "targetDayNumber": 366},
            "optimize_route": {}, "regenerate_day": {},
        }
        for action, fields in arguments.items():
            with self.subTest(action=action):
                plan = {**proposal(), "actions": [{"type": action, "dayNumber": 1, **fields}]}
                self.assertEqual(validate_plan(plan), plan)

    def test_strict_contract_rejects_extra_missing_and_out_of_scope_fields(self):
        mutations = [
            lambda p: p.update(requiresConfirmation=False),
            lambda p: p.update(language="en"), lambda p: p.update(ranking=[]),
            lambda p: p.update(chainOfThought="segredo"),
            lambda p: p["actions"][0].update(type="update_brief", briefPatch={"budget": 1}),
            lambda p: p["actions"][0].update(type="update_pending_confirmation", confirmationPatch={}),
            lambda p: p["actions"][0].pop("itemId"),
            lambda p: p["actions"][0].update(catalogId="extra"),
            lambda p: p["actions"][0].update(dayNumber=True),
            lambda p: p["actions"][0].update(dayNumber=0),
            lambda p: p["actions"][0].update(type="reschedule_item", time="25:00"),
            lambda p: p.update(actions=p["actions"] * 9),
        ]
        for mutate in mutations:
            invalid = copy.deepcopy(proposal())
            mutate(invalid)
            with self.assertRaises(ValueError):
                validate_plan(invalid)

    def test_duplicate_actions_ordering_and_alternatives_are_rejected(self):
        for plan in [
            {**proposal(), "actions": proposal()["actions"] * 2},
            {**proposal(), "actions": [{"type": "reorder_day", "dayNumber": 1, "itemIds": ["a", "a"]}]},
            {**proposal(), "alternatives": [{"dayNumber": 1, "itemId": "a", "catalogIds": ["b", "b"]}]},
            {**proposal(), "alternatives": [{"dayNumber": 1, "itemId": "a", "catalogIds": ["b"]}] * 2},
        ]:
            with self.assertRaises(ValueError):
                validate_plan(plan)

    def test_alternatives_use_identifiers_only(self):
        plan = {**proposal(), "alternatives": [{"dayNumber": 1, "itemId": "atracoes:test", "catalogIds": ["atracoes:new"]}]}
        self.assertEqual(validate_plan(plan), plan)
        plan["alternatives"][0]["price"] = "Inventado"
        with self.assertRaises(ValueError):
            validate_plan(plan)

    def test_bedrock_receives_language_and_only_public_tool_input_is_returned(self):
        for language in ("pt", "en"):
            with self.subTest(language=language):
                client = MagicMock()
                plan = proposal(language)
                client.converse.return_value = provider_response(plan)
                result = plan_actions({"instruction": "Pedido de teste", "context": {"conversationLanguage": language}}, client)
                self.assertEqual(result["plan"], plan)
                self.assertEqual(result["inputTokens"], 12)
                self.assertNotIn("MARCADOR_PRIVADO", json.dumps(result))
                options = client.converse.call_args.kwargs
                system = options["system"][0]["text"]
                self.assertIn("DADOS NÃO FIÁVEIS", system)
                self.assertIn("Write summary and warnings in English" if language == "en" else "Escreve summary e warnings em português europeu", system)
                self.assertEqual(options["inferenceConfig"], {"temperature": 0, "maxTokens": 1800})
                self.assertEqual(options["toolConfig"]["toolChoice"], {"tool": {"name": "propose_actions"}})

    def test_openai_uses_same_contract_without_storing_or_parallel_calls(self):
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "output": [{
                        "type": "function_call", "name": "propose_actions",
                        "arguments": json.dumps(proposal()),
                    }],
                    "usage": {"input_tokens": 21, "output_tokens": 13},
                }

        client = MagicMock()
        client.post.return_value = Response()
        provider = OpenAIProvider(client=client, model_id="modelo-teste")
        result = plan_actions(
            {"instruction": "Teste", "context": {"conversationLanguage": "pt"}},
            provider=provider,
        )
        self.assertEqual(result["plan"], proposal())
        self.assertEqual(result["provider"], "openai")
        self.assertEqual(result["modelId"], "modelo-teste")
        self.assertEqual((result["inputTokens"], result["outputTokens"]), (21, 13))
        request = client.post.call_args.kwargs["json"]
        self.assertFalse(request["store"])
        self.assertFalse(request["parallel_tool_calls"])
        self.assertEqual(request["tool_choice"], {"type": "function", "name": "propose_actions"})
        self.assertEqual(request["tools"][0]["parameters"], tool_schema({}))

    def test_provider_selection_is_explicit_and_has_no_fallback(self):
        with patch.dict("os.environ", {"BLU_AGENT_PROVIDER": "unknown"}):
            with self.assertRaises(AgentConfigurationError):
                plan_actions({"instruction": "Teste", "context": {}})

    def test_openai_operational_failure_is_normalized_without_provider_message(self):
        import httpx

        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        response = httpx.Response(429, request=request, text="SEGREDO_FORNECEDOR")
        client = MagicMock()
        client.post.return_value = response
        provider = OpenAIProvider(client=client, model_id="modelo-teste")
        with self.assertRaises(ProviderRequestError) as caught:
            plan_actions({"instruction": "Teste", "context": {}}, provider=provider)
        self.assertEqual(failure_code(caught.exception), "AGENT_BUSY")
        self.assertNotIn("SEGREDO", str(caught.exception))
        with patch.dict("os.environ", {"BLU_AGENT_PROVIDER": "openai", "OPENAI_MODEL": "", "OPENAI_API_KEY": ""}):
            with self.assertRaises(AgentConfigurationError):
                plan_actions({"instruction": "Teste", "context": {}})

    @patch("blu_ai.planner.boto3.client")
    def test_iam_client_uses_bounded_timeouts_and_no_fixed_credentials(self, factory):
        factory.return_value.converse.return_value = provider_response()
        with patch.dict("os.environ", {"BEDROCK_MODEL_ID": "eu.amazon.nova-pro-v1:0", "BLU_AGENT_MAX_OUTPUT_TOKENS": "2048"}):
            result = plan_actions({"instruction": "Teste", "context": {"conversationLanguage": "en"}})
        self.assertEqual(result["modelId"], "eu.amazon.nova-pro-v1:0")
        kwargs = factory.call_args.kwargs
        self.assertNotIn("aws_access_key_id", kwargs)
        self.assertEqual(kwargs["config"].connect_timeout, 3)
        self.assertEqual(kwargs["config"].read_timeout, 35)
        self.assertEqual(kwargs["config"].retries["total_max_attempts"], 1)
        self.assertEqual(factory.return_value.converse.call_args.kwargs["inferenceConfig"]["maxTokens"], 2048)

    def test_invalid_payloads_and_configuration_do_not_call_provider(self):
        client = MagicMock()
        for payload in [None, {}, {"instruction": "", "context": {}},
                        {"instruction": "x", "context": []},
                        {"instruction": "x", "context": {"conversationLanguage": "zh"}},
                        {"instruction": "x", "context": {"conversationLanguage": []}},
                        {"instruction": "x", "context": {"bad": float("nan")}},
                        {"instruction": "x" * 4001, "context": {}}]:
            with self.assertRaises(AgentRequestError):
                plan_actions(payload, client)
        with self.assertRaises(AgentContextError):
            plan_actions({"instruction": "x", "context": {"text": "a" * 180001}}, client)
        for limit in ("0", "4097", "bad"):
            with patch.dict("os.environ", {"BLU_AGENT_MAX_OUTPUT_TOKENS": limit}):
                with self.assertRaises(AgentConfigurationError):
                    plan_actions({"instruction": "x", "context": {}}, client)
        client.converse.assert_not_called()

    def test_refuses_text_truncation_unknown_tool_multiple_calls_and_invalid_structure(self):
        good = provider_response()
        responses = [None, {}, {"stopReason": "end_turn", "output": {"message": {"content": [{"text": "Feito"}]}}},
                     {**good, "stopReason": "max_tokens"},
                     {"stopReason": "tool_use", "output": {"message": {"content": [
                         {"toolUse": {"name": "write_database", "input": proposal()}}]}}},
                     {"stopReason": "tool_use", "output": {"message": {"content": good["output"]["message"]["content"] * 2}}},
                     {"stopReason": "tool_use", "output": {"message": {"content": [{"toolUse": {"name": "propose_actions", "input": {}}}]}}}]
        for response in responses:
            client = MagicMock()
            client.converse.return_value = response
            with self.assertRaises(AgentResponseError):
                plan_actions({"instruction": "Teste", "context": {}}, client)

    def test_failure_codes_never_publish_sdk_messages_or_retry_another_provider(self):
        for error, code in [
            (AgentResponseError("SEGREDO"), "AGENT_INVALID_RESPONSE"),
            (AgentContextError("SEGREDO"), "AGENT_CONTEXT_TOO_LARGE"),
            (AgentRequestError("SEGREDO"), "AGENT_INVALID_REQUEST"),
            (AgentConfigurationError("SEGREDO"), "AGENT_CONFIGURATION_ERROR"),
            (NoCredentialsError(), "AGENT_ACCESS_DENIED"),
            (ReadTimeoutError(endpoint_url="https://private.example"), "AGENT_TIMEOUT"),
            (EndpointConnectionError(endpoint_url="https://private.example"), "AGENT_CONNECTION_FAILED"),
            (ClientError({"Error": {"Code": "AccessDeniedException", "Message": "SEGREDO"}}, "Converse"), "AGENT_ACCESS_DENIED"),
            (ClientError({"Error": {"Code": "ThrottlingException", "Message": "SEGREDO"}}, "Converse"), "AGENT_BUSY"),
        ]:
            self.assertEqual(failure_code(error), code)
            with patch("blu_ai.planner.plan_actions", side_effect=error) as call:
                result = execute({"instruction": "Teste", "context": {}})
            self.assertEqual(result["code"], code)
            self.assertNotIn("SEGREDO", json.dumps(result))
            self.assertNotIn("private.example", json.dumps(result))
            call.assert_called_once()

    def test_evaluator_oracles_cover_both_languages_and_all_operations_without_model_claim(self):
        from scripts.evaluate_agent import evaluate
        cases = json.loads((Path(__file__).parent / "agent_cases.json").read_text(encoding="utf-8"))
        self.assertEqual(len(cases), len({case["name"] for case in cases}))
        coverage = {(case["operation"], case["language"]) for case in cases if case["category"] == "edicao"}
        self.assertEqual(coverage, {(operation, language) for operation in SCHEMA["x-action-fields"] for language in ("pt", "en")})
        for case in cases:
            expected = case["expected"]
            plan = {**proposal(case["language"]), "actions": copy.deepcopy(expected["actions"]),
                    "alternatives": copy.deepcopy(expected.get("alternatives", []))}
            self.assertTrue(evaluate({"plan": plan}, expected), case["name"])
            plan["actions"].append({"type": "remove_item", "dayNumber": 1, "itemId": "inventado"})
            self.assertFalse(evaluate({"plan": plan}, expected), case["name"])

    def test_evaluator_rejects_wrong_days_duplicates_and_private_output(self):
        from scripts.evaluate_agent import evaluate
        expected = {"actions": proposal()["actions"], "alternatives": [
            {"dayNumber": 1, "itemId": "a", "catalogIds": ["c", "d"]}], "forbiddenText": ["PRIVADO"]}
        plan = {**proposal(), "alternatives": copy.deepcopy(expected["alternatives"])}
        plan["alternatives"][0]["catalogIds"].reverse()
        self.assertTrue(evaluate({"plan": plan}, expected))
        for mutate in [lambda p: p.update(actions=[]),
                       lambda p: p["alternatives"][0].update(dayNumber=2),
                       lambda p: p["alternatives"][0].update(catalogIds=["c", "c"]),
                       lambda p: p.update(warnings=["privado"])]:
            invalid = copy.deepcopy(plan)
            mutate(invalid)
            self.assertFalse(evaluate({"plan": invalid}, expected))

    def test_evaluator_listing_and_refusal_do_not_call_aws(self):
        from scripts.evaluate_agent import main
        with patch("blu_ai.planner.plan_actions") as call:
            with patch("sys.argv", ["evaluate_agent.py", "--list"]), patch("builtins.print"):
                self.assertEqual(main(), 0)
            for args in ([], ["--live", "--case", "inexistente"]):
                with patch("sys.argv", ["evaluate_agent.py", *args]), patch("sys.stderr"):
                    with self.assertRaises(SystemExit):
                        main()
            call.assert_not_called()

    def test_legacy_extraction_never_exposes_reasoning_or_tool_blocks(self):
        self.assertEqual(extract_text_content([
            {"type": "reasoning_content", "reasoning_content": {"text": "SEGREDO"}},
            {"type": "text", "text": "Resposta pública"},
            {"type": "tool_use", "text": "SEGREDO"}, {"text": "SEGREDO"},
        ]), "Resposta pública")

    def test_process_protocol_rejects_invalid_and_oversized_input_before_aws(self):
        root = Path(__file__).resolve().parents[1]
        environment = {**os.environ, "PYTHONPATH": str(root / "src"), "AWS_EC2_METADATA_DISABLED": "true"}
        for payload, code in [
            (b"{}", "AGENT_INVALID_REQUEST"),
            (b"\xff", "AGENT_INVALID_REQUEST"),
            (json.dumps({"instruction": "Teste", "context": {"conversationLanguage": "zh"}}).encode(), "AGENT_INVALID_REQUEST"),
            (b"x" * 200001, "AGENT_CONTEXT_TOO_LARGE"),
        ]:
            result = subprocess.run(
                [sys.executable, "-X", "utf8", "-B", "-m", "blu_ai.planner"],
                input=payload, capture_output=True, timeout=20, cwd=root, env=environment,
            )
            self.assertEqual(result.returncode, 0)
            response = json.loads(result.stdout)
            self.assertFalse(response["ok"])
            self.assertEqual(response["code"], code)
            self.assertNotIn("Traceback", result.stderr.decode("utf-8"))

    @patch("blu_ai.planner.plan_actions")
    def test_legacy_chat_delegates_to_transactional_planner_with_public_context(self, planner):
        from blu_ai.agents.curator_agent import chat_copilot
        planner.return_value = {"plan": proposal()}
        chat_copilot(
            "Explica o dia", brief={"customerName": "PRIVATE_NAME", "customerEmail": "PRIVATE_EMAIL", "notes": "PRIVATE_NOTES", "destination": "Lisboa"},
            current_itinerary={"days": [{"dayNumber": 1, "notes": "PRIVATE_DAY", "items": [
                {"id": "atracoes:a", "title": "Museu permitido", "time": "09:30", "locked": True,
                 "notes": "PRIVATE_ITEM", "confirmation": {"status": "confirmed", "contact": "PRIVATE_CONTACT", "reference": "PRIVATE_REFERENCE"}}
            ]}]},
        )
        sent = planner.call_args.args[0]
        self.assertEqual(sent["instruction"], "Explica o dia")
        self.assertIn("Museu permitido", json.dumps(sent))
        self.assertIn("09:30", json.dumps(sent))
        self.assertNotIn("PRIVATE_", json.dumps(sent))

    def test_legacy_full_generation_is_explicitly_retired(self):
        from blu_ai.agents.curator_agent import curate_itinerary
        with self.assertRaisesRegex(RuntimeError, "descontinuada"):
            curate_itinerary({})


if __name__ == "__main__":
    unittest.main()
