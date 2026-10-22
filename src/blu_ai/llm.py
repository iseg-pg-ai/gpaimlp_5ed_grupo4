"""Modelo legado Bedrock com IAM normal e falha explícita, sem fallback."""

from __future__ import annotations

from typing import Optional

import boto3
from botocore.config import Config
from langchain_core.language_models.chat_models import BaseChatModel

from blu_ai.config import AWS_REGION, BEDROCK_MODEL_ID, MAX_TOKENS, TEMPERATURE


def get_llm(model_id: Optional[str] = None, temperature: Optional[float] = None) -> BaseChatModel:
    """Instanciar apenas o modelo Bedrock configurado; não publicar erros do SDK."""
    try:
        session = boto3.Session(region_name=AWS_REGION)
        if session.get_credentials() is None:
            raise RuntimeError("Credenciais indisponíveis.")
        from langchain_aws import ChatBedrockConverse

        client = session.client(
            service_name="bedrock-runtime", region_name=AWS_REGION,
            config=Config(connect_timeout=3, read_timeout=35, retries={"total_max_attempts": 1}),
        )
        return ChatBedrockConverse(
            client=client, model_id=model_id or BEDROCK_MODEL_ID,
            temperature=temperature if temperature is not None else TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )
    except Exception:
        raise RuntimeError(
            "Modelo de IA indisponível. Verifique IAM, região e BEDROCK_MODEL_ID."
        ) from None
