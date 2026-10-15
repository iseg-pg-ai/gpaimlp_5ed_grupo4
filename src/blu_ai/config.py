"""Configuration management for BLU AI Agent."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
ROOT_DIR = Path(__file__).resolve().parents[2]
WAREHOUSE_DIR = ROOT_DIR / "warehouse"
DATABASE_PATH = WAREHOUSE_DIR / "blu_etl.sqlite"

# Load root .env
load_dotenv(ROOT_DIR / ".env")

# AWS Bedrock configuration
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "eu-west-1"

# Modelo Bedrock configurável.
BEDROCK_MODEL_ID = os.getenv(
    "BEDROCK_MODEL_ID",
    "eu.amazon.nova-pro-v1:0"
)

# Optional OpenAI key if available
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL_ID = os.getenv("OPENAI_MODEL_ID", "gpt-4o-mini")

# Agent settings
TEMPERATURE = float(os.getenv("AGENT_TEMPERATURE", "0.2"))
MAX_TOKENS = int(os.getenv("AGENT_MAX_TOKENS", "4096"))
