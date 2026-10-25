"""Adaptadores de fornecedor para o mesmo contrato transacional BLU."""

from __future__ import annotations

from dataclasses import dataclass
import json
import time
from typing import Any, Protocol

class ProviderResponseError(ValueError):
    """O fornecedor não devolveu exatamente uma chamada ``propose_actions``."""


class ProviderConfigurationError(ValueError):
    """A configuração do fornecedor está ausente ou é inválida."""


class ProviderRequestError(RuntimeError):
    """Falha operacional normalizada, sem detalhes privados do fornecedor."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ProviderResult:
    """Resposta normalizada antes da validação de domínio do plano."""

    plan: Any
    provider: str
    model_id: str
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0


class ActionPlanProvider(Protocol):
    """Interface mínima: fornecedores propõem, mas nunca executam ações."""

    def propose(self, serialized: str, system: str, schema: dict, max_tokens: int) -> ProviderResult:
        """Devolver uma proposta normalizada, sem alterar estado operacional."""


def _metric(value: Any) -> int:
    return value if type(value) is int and value >= 0 else 0


_EMPTY_OBJECT = {"type": "object", "properties": {}, "additionalProperties": False}
_DAY_QUERY = {
    "type": "object",
    "properties": {"dayNumber": {"type": "integer", "minimum": 1, "maximum": 366}},
    "required": ["dayNumber"],
    "additionalProperties": False,
}


def _tool(name: str, description: str, schema: dict) -> dict:
    return {"toolSpec": {"name": name, "description": description,
                         "inputSchema": {"json": schema}}}


def _read_context(name: str, arguments: Any, context: dict) -> Any:
    """Executar apenas leituras sobre o contexto autoritativo já minimizado."""
    if not isinstance(arguments, dict):
        raise ProviderResponseError("Argumentos de ferramenta inválidos.")
    if name == "get_trip_context":
        if arguments:
            raise ProviderResponseError("Argumentos de ferramenta inválidos.")
        return {
            key: context[key] for key in (
                "brief", "currentView", "requestIntent", "conversation",
                "conversationSummary", "pendingPlan", "diagnostics",
                "simulationFeedback",
            ) if key in context
        }
    if name in {"get_quality_signals", "search_historical_cases", "get_supervision_signals"}:
        if arguments:
            raise ProviderResponseError("Argumentos de ferramenta inválidos.")
        source = {
            "get_quality_signals": "qualitySignals",
            "search_historical_cases": "historicalCases",
            "get_supervision_signals": "supervisionSignals",
        }[name]
        rows = context.get(source, [])
        if not isinstance(rows, list):
            raise ProviderResponseError("Contexto de ferramenta inválido.")
        return {source: rows}
    if name in {"get_itinerary", "search_approved_catalog", "get_weather_observation",
                "get_route_observations"}:
        if set(arguments) != {"dayNumber"} or type(arguments["dayNumber"]) is not int:
            raise ProviderResponseError("Argumentos de ferramenta inválidos.")
        day_number = arguments["dayNumber"]
        if not 1 <= day_number <= 366:
            raise ProviderResponseError("Dia fora do limite.")
        source = {
            "get_itinerary": "itinerary",
            "search_approved_catalog": "candidates",
            "get_weather_observation": "weatherObservations",
            "get_route_observations": "routes",
        }[name]
        rows = context.get(source, [])
        if not isinstance(rows, list):
            raise ProviderResponseError("Contexto de ferramenta inválido.")
        return {
            "dayNumber": day_number,
            source: [row for row in rows if isinstance(row, dict)
                     and row.get("dayNumber") == day_number],
            **({"truncated": bool(context.get("candidatesTruncated"))}
               if source == "candidates" else {}),
        }
    raise ProviderResponseError("Ferramenta não autorizada.")


class BedrockProvider:
    """Adaptador Converse com ciclo limitado de leitura antes da proposta."""

    def __init__(self, client: Any, model_id: str):
        if not isinstance(model_id, str) or not model_id.strip():
            raise ProviderConfigurationError("Modelo Bedrock não configurado.")
        self.client = client
        self.model_id = model_id

    def propose(self, serialized: str, system: str, schema: dict, max_tokens: int) -> ProviderResult:
        started = time.monotonic()
        try:
            payload = json.loads(serialized)
            context = payload["context"]
            instruction = payload["instruction"]
            if not isinstance(context, dict) or not isinstance(instruction, str):
                raise ProviderResponseError("Pedido interno inválido.")
        except (KeyError, TypeError, ValueError) as error:
            raise ProviderResponseError("Pedido interno inválido.") from error
        tools = [
            _tool("get_trip_context", "Ler briefing minimizado e contexto recente da viagem.",
                  _EMPTY_OBJECT),
            _tool("get_itinerary", "Ler o estado atual de um dia do itinerário.", _DAY_QUERY),
            _tool("search_approved_catalog",
                  "Ler candidatos já considerados elegíveis pelo portal para um dia.",
                  _DAY_QUERY),
            _tool("get_quality_signals",
                  "Ler agregados numéricos e etiquetas de qualidade, sem comentários.",
                  _EMPTY_OBJECT),
            _tool("search_historical_cases",
                  "Ler casos semelhantes aprovados e anonimizados pelo portal.",
                  _EMPTY_OBJECT),
            _tool("get_weather_observation",
                  "Ler meteorologia já consultada no portal para um dia; nunca consulta a rede.",
                  _DAY_QUERY),
            _tool("get_route_observations",
                  "Ler percursos já guardados no itinerário, distinguindo medição de estimativa.",
                  _DAY_QUERY),
            _tool("get_supervision_signals",
                  "Ler sinais determinísticos de perturbação ou conteúdo que exigem revisão.",
                  _EMPTY_OBJECT),
            _tool("propose_actions",
                  "Devolver a proposta final para simulação e revisão humana; nunca escreve.",
                  schema),
        ]
        messages = [{"role": "user", "content": [{"text": json.dumps({
            "instruction": instruction,
            "conversationLanguage": context.get("conversationLanguage", "pt"),
        }, ensure_ascii=False)}]}]
        input_tokens = output_tokens = tool_calls = 0
        force_proposal = False
        try:
            for _round in range(6):
                response = self.client.converse(
                    modelId=self.model_id,
                    system=[{"text": system}],
                    messages=messages,
                    inferenceConfig={"temperature": 0, "maxTokens": max_tokens},
                    toolConfig={
                        "tools": tools,
                        "toolChoice": ({"tool": {"name": "propose_actions"}}
                                       if force_proposal else {"auto": {}}),
                    },
                )
                usage = response.get("usage", {})
                if isinstance(usage, dict):
                    input_tokens += _metric(usage.get("inputTokens"))
                    output_tokens += _metric(usage.get("outputTokens"))
                message = response["output"]["message"]
                blocks = message["content"]
                calls = [block["toolUse"] for block in blocks
                         if isinstance(block, dict) and "toolUse" in block]
                if response.get("stopReason") == "end_turn" and not calls and not force_proposal:
                    # Nova pode responder em texto ao recusar ou pedir esclarecimento. Esse
                    # texto nunca sai do adaptador: uma ronda final obriga o mesmo conteúdo
                    # a cumprir o contrato tipado, normalmente com ``actions`` vazio.
                    messages.append(message)
                    messages.append({"role": "user", "content": [{"text":
                        "Termina agora exclusivamente através de propose_actions. "
                        "Se recusaste ou pediste esclarecimento, usa actions vazio e coloca "
                        "a explicação em summary ou warnings."}]})
                    force_proposal = True
                    continue
                if response.get("stopReason") != "tool_use" or not calls:
                    raise ProviderResponseError("Proposta estruturada incompleta.")
                tool_calls += len(calls)
                if tool_calls > 8:
                    raise ProviderResponseError("Limite de ferramentas excedido.")
                proposals = [call for call in calls if call.get("name") == "propose_actions"]
                if proposals:
                    if len(proposals) != 1:
                        raise ProviderResponseError("Proposta misturada com outras ferramentas.")
                    if len(calls) == 1:
                        plan = proposals[0]["input"]
                        break
                    # Uma proposta emitida juntamente com leituras ainda não pode usar os
                    # respetivos resultados. Descartá-la, responder às leituras e exigir
                    # que a proposta revista venha sozinha preserva a fronteira de autoridade.
                    messages.append(message)
                    results = []
                    for call in calls:
                        tool_use_id = call.get("toolUseId")
                        if not isinstance(tool_use_id, str) or not tool_use_id:
                            raise ProviderResponseError("Identificador de ferramenta inválido.")
                        if call.get("name") == "propose_actions":
                            results.append({"toolResult": {
                                "toolUseId": tool_use_id,
                                "content": [{"text": "Proposta prematura: devolve-a novamente, isolada, após considerar as leituras."}],
                                "status": "error",
                            }})
                        else:
                            result = _read_context(call.get("name"), call.get("input"), context)
                            results.append({"toolResult": {
                                "toolUseId": tool_use_id,
                                "content": [{"json": result}], "status": "success",
                            }})
                    messages.append({"role": "user", "content": results})
                    force_proposal = True
                    continue
                if force_proposal:
                    raise ProviderResponseError("Encerramento estruturado inválido.")
                messages.append(message)
                results = []
                for call in calls:
                    result = _read_context(call.get("name"), call.get("input"), context)
                    tool_use_id = call.get("toolUseId")
                    if not isinstance(tool_use_id, str) or not tool_use_id:
                        raise ProviderResponseError("Identificador de ferramenta inválido.")
                    results.append({"toolResult": {
                        "toolUseId": tool_use_id,
                        "content": [{"json": result}],
                        "status": "success",
                    }})
                messages.append({"role": "user", "content": results})
            else:
                raise ProviderResponseError("Limite de iterações excedido.")
        except ProviderResponseError:
            raise
        except (KeyError, TypeError, AttributeError) as error:
            raise ProviderResponseError("Resposta Bedrock fora do contrato.") from error
        return ProviderResult(
            plan=plan,
            provider="bedrock",
            model_id=self.model_id,
            latency_ms=round((time.monotonic() - started) * 1000),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
