"""Configuration management for BLU AI Agent."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
ROOT_DIR = Path(__file__).resolve().parents[2]

# Load root .env
load_dotenv(ROOT_DIR / ".env")
WAREHOUSE_DIR = Path(os.getenv("BLU_WAREHOUSE_DIR", ROOT_DIR / "warehouse")).resolve()
DATABASE_PATH = WAREHOUSE_DIR / "blu_etl.sqlite"

# AWS Bedrock configuration
AWS_REGION = os.getenv("AWS_REGION", "eu-north-1")

# Modelo Bedrock configurável.
BEDROCK_MODEL_ID = os.getenv(
    "BEDROCK_MODEL_ID",
    "eu.amazon.nova-pro-v1:0"
)

# Agent settings
TEMPERATURE = float(os.getenv("AGENT_TEMPERATURE", "0.2"))
MAX_TOKENS = int(os.getenv("AGENT_MAX_TOKENS", "4096"))
