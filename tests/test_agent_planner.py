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
    compile_actions, tool_schema, validate_plan,
)
from blu_ai.providers import BedrockProvider, ProviderRequestError


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
    def test_explicit_actions_are_compiled_without_provider(self):
        cases = json.loads((Path(__file__).parent / "agent_cases.json").read_text(encoding="utf-8"))
        explicit = [case for case in cases if case["operation"] != "none"
                    and case["category"] != "refinamento"]
        self.assertEqual(len(explicit), 26)
        provider = MagicMock()
        for case in explicit:
            with self.subTest(case=case["name"]):
                result = plan_actions(case["request"], provider=provider)
                self.assertEqual(result["plan"]["actions"], case["expected"]["actions"])
                self.assertEqual(result["provider"], "deterministic")
                self.assertEqual(result["modelId"], "blu-explicit-intent-v1")
                self.assertEqual((result["inputTokens"], result["outputTokens"]), (0, 0))
        provider.propose.assert_not_called()

    def test_local_compiler_fails_closed_for_protected_and_unknown_items(self):
        cases = {case["name"]: case for case in json.loads(
            (Path(__file__).parent / "agent_cases.json").read_text(encoding="utf-8"))}
        for name in ("protecao_pt", "protecao_en", "grounding_pt", "grounding_en"):
            with self.subTest(case=name):
                result = compile_actions(cases[name]["request"])
                self.assertIsNotNone(result)
                self.assertEqual(result["plan"]["actions"], [])
                self.assertTrue(result["plan"]["warnings"])
                self.assertEqual(result["provider"], "deterministic")

    def test_known_ambiguity_is_closed_locally_without_provider(self):
        payload = {"instruction": "Qual é a segunda?", "context": {"conversationLanguage": "pt"}}
        result = compile_actions(payload)
        self.assertEqual(result["plan"]["actions"], [])
        self.assertEqual(result["provider"], "deterministic")

    def test_exact_unique_names_resolve_to_authoritative_identifiers(self):
        context = {
            "conversationLanguage": "pt",
            "itinerary": [
                {"dayNumber": 1, "items": [
                    {"id": "atracoes:feira", "title": "Feira da Ladra"},
                    {"id": "restaurantes:mercado", "title": "Time Out Market Lisboa"},
                ]},
                {"dayNumber": 2, "items": [
                    {"id": "restaurantes:canalha", "title": "Canalha"},
                ]},
                {"dayNumber": 3, "items": [
                    {"id": "atracoes:alcoa", "title": "Pastelaria Alcoa"},
                ]},
            ],
            "candidates": [
                {"dayNumber": 1, "id": "atracoes:castelo", "title": "Castelo de São Jorge"},
            ],
        }
        requests = {
            "Remove apenas Feira da Ladra do dia 1.": {
                "type": "remove_item", "dayNumber": 1, "itemId": "atracoes:feira",
            },
            "Reagenda Canalha do dia 2 para as 13:00.": {
                "type": "reschedule_item", "dayNumber": 2,
                "itemId": "restaurantes:canalha", "time": "13:00",
            },
            "Move Pastelaria Alcoa do dia 3 para o dia 2.": {
                "type": "move_item", "dayNumber": 3,
                "itemId": "atracoes:alcoa", "targetDayNumber": 2,
            },
            "Adiciona a atividade Castelo de São Jorge ao dia 1.": {
                "type": "add_catalog_item", "dayNumber": 1,
                "catalogId": "atracoes:castelo",
            },
            "Substitui Feira da Ladra por Castelo de São Jorge no dia 1.": {
                "type": "replace_item", "dayNumber": 1,
                "itemId": "atracoes:feira", "catalogId": "atracoes:castelo",
            },
            "No dia 1 coloca Time Out Market Lisboa antes de Feira da Ladra.": {
                "type": "reorder_day", "dayNumber": 1,
                "itemIds": ["restaurantes:mercado", "atracoes:feira"],
            },
        }
        for instruction, expected in requests.items():
            with self.subTest(instruction=instruction):
                result = compile_actions({"instruction": instruction, "context": context})
                self.assertEqual(result["plan"]["actions"], [expected])

    def test_duplicate_names_fail_closed_instead_of_guessing(self):
        request = {
            "instruction": "Remove Museu do dia 1.",
            "context": {
                "conversationLanguage": "pt",
                "itinerary": [{"dayNumber": 1, "items": [
                    {"id": "atracoes:museu-a", "title": "Museu"},
                    {"id": "atracoes:museu-b", "title": "Museu"},
                ]}],
            },
        }
        result = compile_actions(request)
        self.assertEqual(result["plan"]["actions"], [])
        self.assertTrue(result["plan"]["warnings"])

    def test_itinerary_explanation_is_read_only_and_uses_portal_diagnostics(self):
        request = {
            "instruction": (
                "Explica-me o itinerário atual e identifica possíveis problemas, "
                "sem fazer alterações."
            ),
            "context": {
                "conversationLanguage": "pt",
                "itinerary": [{
                    "dayNumber": 1,
                    "location": "Lisboa",
                    "items": [{"id": "atracoes:feira", "title": "Feira da Ladra"}],
                }],
                "diagnostics": [{
                    "code": "TIME_UNKNOWN",
                    "severity": "warning",
                    "message": "Horário ou duração por validar.",
                    "dayNumber": 1,
                    "itemId": "atracoes:feira",
                }],
            },
        }
        result = compile_actions(request)
        self.assertEqual(result["provider"], "deterministic")
        self.assertEqual(result["plan"]["actions"], [])
        self.assertIn("Dia 1 — Lisboa: Feira da Ladra.", result["plan"]["summary"])
        self.assertEqual(
            result["plan"]["warnings"],
            ["Dia 1 · Feira da Ladra: Horário ou duração por validar."],
        )

    def test_contract_is_itinerary_only_and_schema_copy_cannot_expand_authority(self):
        expected = {"add_catalog_item", "replace_item", "remove_item", "reschedule_item",
                    "reorder_day", "set_day_capacity", "add_free_period", "set_free_day",
                    "move_item", "optimize_route", "update_brief",
                    "update_pending_confirmation", "regenerate_day"}
        self.assertEqual(set(SCHEMA["x-action-fields"]), expected)
        self.assertEqual(
            set(SCHEMA["properties"]),
            {
                "summary", "actions", "alternatives", "ranking", "delivery",
                "warnings", "requiresConfirmation",
            },
        )
        before = copy.deepcopy(SCHEMA)
        schema = tool_schema({"requestIntent": {"kind": "rank", "dayNumber": 1}})
        schema["properties"]["actions"]["maxItems"] = 99
        self.assertEqual(SCHEMA, before)
        self.assertEqual(SCHEMA["properties"]["ranking"]["maxItems"], 3)
        confirmation_fields = set(
            SCHEMA["properties"]["actions"]["items"]["properties"]
            ["confirmationPatch"]["properties"]
        )
        self.assertEqual(confirmation_fields, {"time", "location", "price", "supplier"})
        variants = tool_schema()["properties"]["actions"]["items"]["oneOf"]
        move = next(value for value in variants
                    if value["properties"]["type"]["enum"] == ["move_item"])
        self.assertEqual(move["required"],
                         ["type", "dayNumber", "itemId", "targetDayNumber"])
        self.assertEqual(set(move["properties"]), set(move["required"]))

    def test_all_thirteen_actions_accept_exact_fields(self):
        arguments = {
            "add_catalog_item": {"catalogId": "atracoes:new"},
            "replace_item": {"itemId": "atracoes:test", "catalogId": "atracoes:new"},
            "remove_item": {"itemId": "atracoes:test"},
            "reschedule_item": {"itemId": "atracoes:test", "time": "14:30"},
            "reorder_day": {"itemIds": ["atracoes:b", "atracoes:a"]},
            "set_day_capacity": {"capacity": 3}, "add_free_period": {"period": "morning"},
            "set_free_day": {}, "move_item": {"itemId": "atracoes:test", "targetDayNumber": 366},
            "optimize_route": {},
            "update_brief": {"briefPatch": {"budget": 2500, "pace": "Balanced"}},
            "update_pending_confirmation": {
                "itemId": "atracoes:test", "confirmationPatch": {"time": "14:30"},
            },
            "regenerate_day": {},
        }
        for action, fields in arguments.items():
            with self.subTest(action=action):
                plan = {**proposal(), "actions": [{"type": action, "dayNumber": 1, **fields}]}
                self.assertEqual(validate_plan(plan), plan)

    def test_strict_contract_rejects_extra_missing_and_out_of_scope_fields(self):
        mutations = [
            lambda p: p.update(requiresConfirmation=False),
            lambda p: p.update(language="en"),
            lambda p: p.update(chainOfThought="segredo"),
            lambda p: p["actions"][0].update(
                type="update_pending_confirmation", confirmationPatch={"contact": "privado"}),
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
            {**proposal(), "ranking": [{"dayNumber": 1, "catalogIds": ["a", "a"]}]},
            {**proposal(), "ranking": [{"dayNumber": 1, "catalogIds": ["a"]}] * 2},
        ]:
            with self.assertRaises(ValueError):
                validate_plan(plan)

    def test_alternatives_use_identifiers_only(self):
        plan = {**proposal(), "alternatives": [{"dayNumber": 1, "itemId": "atracoes:test", "catalogIds": ["atracoes:new"]}]}
        self.assertEqual(validate_plan(plan), plan)
        plan["alternatives"][0]["price"] = "Inventado"
        with self.assertRaises(ValueError):
            validate_plan(plan)

    def test_delivery_prepares_only_format_locale_and_share_method(self):
        for delivery in [
            {"kind": "export_pdf", "locale": "pt"},
            {"kind": "export_prompt", "locale": "en"},
            {"kind": "share", "locale": "fr", "method": "link"},
        ]:
            plan = {**proposal(), "actions": [], "delivery": delivery}
            self.assertEqual(validate_plan(plan), plan)
        for delivery in [
            {"kind": "share", "locale": "pt"},
            {"kind": "export_pdf", "locale": "pt", "method": "document"},
        ]:
            with self.assertRaises(ValueError):
                validate_plan({**proposal(), "actions": [], "delivery": delivery})
        with self.assertRaises(ValueError):
            validate_plan({
                **proposal(),
                "actions": [{"type": "set_free_day", "dayNumber": 1}],
                "delivery": {"kind": "export_pdf", "locale": "pt"},
            })

    def test_bedrock_receives_language_and_only_public_tool_input_is_returned(self):
        for language in ("pt", "en"):
            with self.subTest(language=language):
                client = MagicMock()
                plan = proposal(language)
                client.converse.return_value = provider_response(plan)
                result = plan_actions(
                    {"instruction": "Pedido de teste", "context": {"conversationLanguage": language}},
                    provider=BedrockProvider(client, "modelo-teste"),
                )
                self.assertEqual(result["plan"], plan)
                self.assertEqual(result["inputTokens"], 12)
                self.assertNotIn("MARCADOR_PRIVADO", json.dumps(result))
                options = client.converse.call_args.kwargs
                system = options["system"][0]["text"]
                self.assertIn("DADOS NÃO FIÁVEIS", system)
                self.assertIn("targetDayNumber=2", system)
                self.assertIn("itemId=atracoes:a", system)
                self.assertIn("não acrescentes reorder_day", system)
                self.assertIn("Write summary and warnings in English" if language == "en" else "Escreve summary e warnings em português europeu", system)
                self.assertEqual(options["inferenceConfig"], {"temperature": 0, "maxTokens": 1800})
                self.assertEqual(options["toolConfig"]["toolChoice"], {"auto": {}})
                self.assertEqual(
                    {tool["toolSpec"]["name"] for tool in options["toolConfig"]["tools"]},
                    {
                        "get_trip_context", "get_itinerary", "search_approved_catalog",
                        "get_quality_signals", "search_historical_cases", "propose_actions",
                        "get_weather_observation", "get_route_observations",
                        "get_supervision_signals",
                    },
                )

    def test_bedrock_reads_authoritative_day_before_proposing_and_sums_usage(self):
        read = {
            "stopReason": "tool_use",
            "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                "toolUseId": "read-1", "name": "get_itinerary", "input": {"dayNumber": 2},
            }}]}},
            "usage": {"inputTokens": 5, "outputTokens": 3},
        }
        final = provider_response()
        final["usage"] = {"inputTokens": 7, "outputTokens": 4}
        client = MagicMock()
        client.converse.side_effect = [read, final]
        context = {
            "conversationLanguage": "pt",
            "brief": {"destination": "Porto"},
            "itinerary": [
                {"dayNumber": 1, "items": [{"id": "fora"}]},
                {"dayNumber": 2, "items": [{"id": "alvo"}]},
            ],
            "candidates": [{"dayNumber": 2, "id": "candidato"}],
        }
        result = plan_actions(
            {"instruction": "Altera o segundo dia", "context": context},
            provider=BedrockProvider(client, "modelo-teste"),
        )
        self.assertEqual((result["inputTokens"], result["outputTokens"]), (12, 7))
        self.assertEqual(client.converse.call_count, 2)
        first = client.converse.call_args_list[0].kwargs
        self.assertNotIn("Porto", json.dumps(first["messages"]))
        second = client.converse.call_args_list[1].kwargs
        tool_result = second["messages"][-1]["content"][0]["toolResult"]
        self.assertEqual(tool_result["toolUseId"], "read-1")
        self.assertEqual(tool_result["content"][0]["json"], {
            "dayNumber": 2,
            "itinerary": [{"dayNumber": 2, "items": [{"id": "alvo"}]}],
        })

    def test_text_refusal_is_forced_into_the_structured_closure_once(self):
        text = {
            "stopReason": "end_turn",
            "output": {"message": {"role": "assistant", "content": [
                {"text": "Preciso de esclarecimento."},
            ]}},
            "usage": {"inputTokens": 5, "outputTokens": 3},
        }
        client = MagicMock()
        client.converse.side_effect = [text, provider_response({
            "summary": "Indique a atividade pretendida.",
            "actions": [], "warnings": [], "requiresConfirmation": True,
        })]
        result = plan_actions(
            {"instruction": "Preciso de ajuda.", "context": {"conversationLanguage": "pt"}},
            provider=BedrockProvider(client, "modelo-teste"),
        )
        self.assertEqual(result["plan"]["actions"], [])
        self.assertEqual(result["inputTokens"], 17)
        forced = client.converse.call_args_list[1].kwargs
        self.assertEqual(
            forced["toolConfig"]["toolChoice"],
            {"tool": {"name": "propose_actions"}},
        )
        self.assertNotIn("Preciso de esclarecimento.", json.dumps(result))

    def test_bedrock_can_read_only_sanitized_simulation_feedback(self):
        read = {
            "stopReason": "tool_use",
            "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                "toolUseId": "feedback-1", "name": "get_trip_context", "input": {},
            }}]}},
            "usage": {},
        }
        client = MagicMock()
        client.converse.side_effect = [read, provider_response()]
        feedback = {"code": "CAPACITY_EXCEEDED", "instruction": "Reduz a carga do dia."}
        plan_actions({
            "instruction": "Revê o dia",
            "context": {"conversationLanguage": "pt", "simulationFeedback": feedback},
        }, provider=BedrockProvider(client, "modelo-teste"))
        result = client.converse.call_args_list[1].kwargs["messages"][-1]["content"][0]
        self.assertEqual(result["toolResult"]["content"][0]["json"], {
            "simulationFeedback": feedback,
        })

    def test_bedrock_reads_quality_and_anonymous_cases_without_private_notes(self):
        for tool, source in [
            ("get_quality_signals", "qualitySignals"),
            ("search_historical_cases", "historicalCases"),
        ]:
            with self.subTest(tool=tool):
                client = MagicMock()
                client.converse.side_effect = [{
                    "stopReason": "tool_use",
                    "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                        "toolUseId": "read-safe", "name": tool, "input": {},
                    }}]}},
                    "usage": {},
                }, provider_response()]
                context = {
                    "conversationLanguage": "pt",
                    source: [{"catalogId": "atracoes:1", "average": 4.5}],
                    "privateNotes": "NUNCA_ENVIAR",
                }
                plan_actions(
                    {"instruction": "Sugere uma opção", "context": context},
                    provider=BedrockProvider(client, "modelo-teste"),
                )
                result = client.converse.call_args_list[1].kwargs["messages"][-1]
                serialized = json.dumps(result)
                self.assertIn("atracoes:1", serialized)
                self.assertNotIn("NUNCA_ENVIAR", serialized)

    def test_bedrock_reads_only_preloaded_weather_and_routes_by_day(self):
        for tool, source in [
            ("get_weather_observation", "weatherObservations"),
            ("get_route_observations", "routes"),
        ]:
            with self.subTest(tool=tool):
                client = MagicMock()
                client.converse.side_effect = [{
                    "stopReason": "tool_use",
                    "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                        "toolUseId": "read-day", "name": tool, "input": {"dayNumber": 2},
                    }}]}},
                    "usage": {},
                }, provider_response()]
                context = {
                    "conversationLanguage": "pt",
                    source: [
                        {"dayNumber": 1, "evidence": "ignore"},
                        {"dayNumber": 2, "evidence": "forecast"},
                    ],
                }
                plan_actions(
                    {"instruction": "Consulta o dia dois", "context": context},
                    provider=BedrockProvider(client, "modelo-teste"),
                )
                result = client.converse.call_args_list[1].kwargs["messages"][-1]
                payload = result["content"][0]["toolResult"]["content"][0]["json"]
                self.assertEqual(payload, {
                    "dayNumber": 2,
                    source: [{"dayNumber": 2, "evidence": "forecast"}],
                })

    def test_bedrock_reads_supervision_signals_without_write_authority(self):
        client = MagicMock()
        client.converse.side_effect = [{
            "stopReason": "tool_use",
            "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                "toolUseId": "signals", "name": "get_supervision_signals", "input": {},
            }}]}}, "usage": {},
        }, provider_response()]
        signals = [{"code": "RAIN_REVIEW", "evidence": "observed", "dayNumber": 1}]
        plan_actions(
            {"instruction": "Revê a chuva", "context": {
                "conversationLanguage": "pt", "supervisionSignals": signals,
            }},
            provider=BedrockProvider(client, "modelo-teste"),
        )
        payload = client.converse.call_args_list[1].kwargs["messages"][-1]
        self.assertEqual(
            payload["content"][0]["toolResult"]["content"][0]["json"],
            {"supervisionSignals": signals},
        )

    def test_bedrock_refuses_unknown_read_tool_and_out_of_range_day(self):
        for name, arguments in [
            ("write_database", {}),
            ("get_itinerary", {"dayNumber": 0}),
            ("search_approved_catalog", {"dayNumber": "2"}),
        ]:
            client = MagicMock()
            client.converse.return_value = {
                "stopReason": "tool_use",
                "output": {"message": {"role": "assistant", "content": [{"toolUse": {
                    "toolUseId": "bad-1", "name": name, "input": arguments,
                }}]}},
                "usage": {},
            }
            with self.assertRaises(AgentResponseError):
                plan_actions({"instruction": "Teste", "context": {}}, client)

    def test_provider_selection_is_explicit_and_has_no_fallback(self):
        with patch.dict("os.environ", {"BLU_AGENT_PROVIDER": "unknown"}):
            with self.assertRaises(AgentConfigurationError):
                plan_actions({"instruction": "Teste", "context": {}})

    @patch("blu_ai.planner.boto3.client")
    def test_iam_client_uses_bounded_timeouts_and_no_fixed_credentials(self, factory):
        factory.return_value.converse.return_value = provider_response()
        with patch.dict("os.environ", {
            "BEDROCK_MODEL_ID": "eu.amazon.nova-pro-v1:0",
            "BLU_AGENT_PROVIDER": "bedrock",
            "BLU_AGENT_MAX_OUTPUT_TOKENS": "2048",
            "BLU_AGENT_TIMEOUT_SECONDS": "47",
        }):
            result = plan_actions({"instruction": "Teste", "context": {"conversationLanguage": "en"}})
        self.assertEqual(result["modelId"], "eu.amazon.nova-pro-v1:0")
        kwargs = factory.call_args.kwargs
        self.assertNotIn("aws_access_key_id", kwargs)
        self.assertEqual(kwargs["config"].connect_timeout, 3)
        self.assertEqual(kwargs["config"].read_timeout, 47)
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
        for timeout in ("0", "121", "bad"):
            with patch.dict("os.environ", {"BLU_AGENT_TIMEOUT_SECONDS": timeout}):
                with self.assertRaises(AgentConfigurationError):
                    plan_actions({"instruction": "x", "context": {}}, client)
        client.converse.assert_not_called()

    def test_refuses_text_truncation_unknown_tool_multiple_calls_and_invalid_structure(self):
        good = provider_response()
        responses = [None, {},
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

        client = MagicMock()
        client.converse.return_value = {
            "stopReason": "end_turn", "output": {"message": {
                "role": "assistant", "content": [{"text": "Feito"}],
            }}, "usage": {},
        }
        with self.assertRaises(AgentResponseError):
            plan_actions({"instruction": "Teste", "context": {}}, client)
        self.assertEqual(client.converse.call_count, 2)

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

    def test_compile_only_process_returns_local_plan_or_delegation_without_aws(self):
        root = Path(__file__).resolve().parents[1]
        environment = {**os.environ, "PYTHONPATH": str(root / "src"),
                       "AWS_EC2_METADATA_DISABLED": "true"}
        cases = {case["name"]: case for case in json.loads(
            (Path(__file__).parent / "agent_cases.json").read_text(encoding="utf-8"))}
        for name, expected_provider in (("move_item_pt", "deterministic"),
                                        ("injecao_pt", "deterministic")):
            result = subprocess.run(
                [sys.executable, "-X", "utf8", "-B", "-m", "blu_ai.planner",
                 "--compile-only"],
                input=json.dumps(cases[name]["request"]).encode(), capture_output=True,
                timeout=20, cwd=root, env=environment,
            )
            self.assertEqual(result.returncode, 0)
            response = json.loads(result.stdout)
            self.assertTrue(response["ok"])
            if expected_provider is None:
                self.assertIsNone(response["data"])
            else:
                self.assertEqual(response["data"]["provider"], expected_provider)
                self.assertEqual(response["data"]["inputTokens"], 0)

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
