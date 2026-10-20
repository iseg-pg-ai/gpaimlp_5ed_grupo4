"""LLM Factory for BLU AI Agent using LangChain and AWS Bedrock."""

from __future__ import annotations

import logging
from typing import Any, Optional
import boto3
from langchain_core.language_models.chat_models import BaseChatModel

from blu_ai.config import (
    AWS_REGION,
    BEDROCK_MODEL_ID,
    TEMPERATURE,
    MAX_TOKENS,
    OPENAI_API_KEY,
    OPENAI_MODEL_ID,
)

logger = logging.getLogger(__name__)


def get_llm(model_id: Optional[str] = None, temperature: Optional[float] = None) -> BaseChatModel:
    """Instancia o modelo de linguagem configurado via LangChain.
    Prioriza AWS Bedrock (Claude / Nova / Titan) e permite fallback.
    """
    temp = temperature if temperature is not None else TEMPERATURE
    target_model = model_id or BEDROCK_MODEL_ID

    # 1. Tentativa com AWS Bedrock
    session = boto3.Session(region_name=AWS_REGION)
    if session.get_credentials():
        try:
            from langchain_aws import ChatBedrockConverse

            client = session.client(
                service_name="bedrock-runtime",
                region_name=AWS_REGION,
            )
            llm = ChatBedrockConverse(
                client=client,
                model_id=target_model,
                temperature=temp,
                max_tokens=MAX_TOKENS,
            )
            return llm
        except Exception as e:
            logger.warning(f"Erro ao instanciar ChatBedrock: {e}. A verificar alternativas.")

    # 2. Fallback OpenAI se configurado
    if OPENAI_API_KEY:
        try:
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=OPENAI_MODEL_ID,
                temperature=temp,
                api_key=OPENAI_API_KEY
            )
        except Exception as e:
            logger.warning(f"Erro ao instanciar ChatOpenAI: {e}")

    raise RuntimeError(
        "Modelo de IA indisponível. Configure um papel IAM com acesso ao Bedrock "
        "ou credenciais válidas; confirme a região e BEDROCK_MODEL_ID."
    )
