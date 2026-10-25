"""Adaptadores de fornecedor para o mesmo contrato transacional BLU."""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
import time
from typing import Any, Protocol

import httpx


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


class BedrockProvider:
    """Adaptador para Bedrock Converse com uma única ferramenta forçada."""

    def __init__(self, client: Any, model_id: str):
        if not isinstance(model_id, str) or not model_id.strip():
            raise ProviderConfigurationError("Modelo Bedrock não configurado.")
        self.client = client
        self.model_id = model_id

    def propose(self, serialized: str, system: str, schema: dict, max_tokens: int) -> ProviderResult:
        started = time.monotonic()
        response = self.client.converse(
            modelId=self.model_id,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": serialized}]}],
            inferenceConfig={"temperature": 0, "maxTokens": max_tokens},
            toolConfig={
                "tools": [{"toolSpec": {
                    "name": "propose_actions",
                    "description": "Propor ações para revisão humana; nunca executa alterações.",
                    "inputSchema": {"json": schema},
                }}],
                "toolChoice": {"tool": {"name": "propose_actions"}},
            },
        )
        try:
            blocks = response["output"]["message"]["content"]
            calls = [block["toolUse"] for block in blocks if isinstance(block, dict) and "toolUse" in block]
            if response.get("stopReason") != "tool_use" or len(calls) != 1 or calls[0].get("name") != "propose_actions":
                raise ProviderResponseError("Proposta estruturada incompleta.")
            plan = calls[0]["input"]
        except (KeyError, TypeError, AttributeError) as error:
            raise ProviderResponseError("Resposta Bedrock fora do contrato.") from error
        usage = response.get("usage", {})
        if not isinstance(usage, dict):
            usage = {}
        return ProviderResult(
            plan=plan,
            provider="bedrock",
            model_id=self.model_id,
            latency_ms=round((time.monotonic() - started) * 1000),
            input_tokens=_metric(usage.get("inputTokens")),
            output_tokens=_metric(usage.get("outputTokens")),
        )


class OpenAIProvider:
    """Adaptador stateless para Responses API; as chamadas reais são opt-in."""

    endpoint = "https://api.openai.com/v1/responses"

    def __init__(self, client: Any | None = None, model_id: str | None = None,
                 api_key: str | None = None, timeout: float = 35.0):
        self.model_id = (model_id or os.getenv("OPENAI_MODEL", "")).strip()
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        if not self.model_id:
            raise ProviderConfigurationError("OPENAI_MODEL não configurado.")
        if client is None and not self.api_key:
            raise ProviderConfigurationError("OPENAI_API_KEY não configurada.")
        self.client = client or httpx.Client(timeout=httpx.Timeout(timeout, connect=3.0))

    def propose(self, serialized: str, system: str, schema: dict, max_tokens: int) -> ProviderResult:
        started = time.monotonic()
        response = self.client.post(
            self.endpoint,
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": self.model_id,
                "instructions": system,
                "input": serialized,
                "max_output_tokens": max_tokens,
                "store": False,
                "parallel_tool_calls": False,
                "tools": [{
                    "type": "function",
                    "name": "propose_actions",
                    "description": "Propor ações para revisão humana; nunca executa alterações.",
                    "parameters": schema,
                    # O contrato contém argumentos dependentes do tipo de ação;
                    # a validação exata continua obrigatoriamente no backend.
                    "strict": False,
                }],
                "tool_choice": {"type": "function", "name": "propose_actions"},
            },
        )
        try:
            response.raise_for_status()
            body = response.json()
            calls = [item for item in body["output"] if item.get("type") == "function_call"]
            if len(calls) != 1 or calls[0].get("name") != "propose_actions":
                raise ProviderResponseError("Proposta estruturada incompleta.")
            plan = json.loads(calls[0]["arguments"])
        except ProviderResponseError:
            raise
        except httpx.TimeoutException as error:
            raise ProviderRequestError("AGENT_TIMEOUT") from error
        except httpx.ConnectError as error:
            raise ProviderRequestError("AGENT_CONNECTION_FAILED") from error
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            if status in (401, 403):
                code = "AGENT_ACCESS_DENIED"
            elif status == 429:
                code = "AGENT_BUSY"
            elif status in (408, 504):
                code = "AGENT_TIMEOUT"
            else:
                code = "AGENT_UNAVAILABLE"
            raise ProviderRequestError(code) from error
        except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError) as error:
            raise ProviderResponseError("Resposta OpenAI fora do contrato.") from error
        usage = body.get("usage", {})
        if not isinstance(usage, dict):
            usage = {}
        return ProviderResult(
            plan=plan,
            provider="openai",
            model_id=self.model_id,
            latency_ms=round((time.monotonic() - started) * 1000),
            input_tokens=_metric(usage.get("input_tokens")),
            output_tokens=_metric(usage.get("output_tokens")),
        )
