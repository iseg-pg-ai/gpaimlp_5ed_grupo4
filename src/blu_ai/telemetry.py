"""Telemetria operacional reduzida, sem prompts nem respostas de modelos."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time
from typing import Any

MAX_BYTES = 2_000_000
ROTATED_FILES = 3


def _clean(value: object, maximum: int = 80) -> str:
    return re.sub(r"[^A-Za-z0-9_.:/-]", "_", str(value))[:maximum]


def _runtime() -> Path:
    configured = os.environ.get("BLU_TELEMETRY_DIR")
    return Path(configured) if configured else Path(__file__).resolve().parents[2] / "monitoring/runtime"


def _rotate(path: Path) -> None:
    for index in range(ROTATED_FILES, 0, -1):
        source = path if index == 1 else Path(f"{path}.{index - 1}")
        destination = Path(f"{path}.{index}")
        destination.unlink(missing_ok=True)
        if source.exists():
            os.replace(source, destination)


def usage_from_messages(messages: list[Any]) -> dict[str, int | None]:
    """Soma apenas contadores reportados pelo fornecedor."""
    totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    found = set()
    for message in messages:
        candidates = [getattr(message, "usage_metadata", None)]
        metadata = getattr(message, "response_metadata", None)
        if isinstance(metadata, dict):
            candidates.extend([metadata.get("usage"), metadata.get("usage_metadata")])
        for usage in candidates:
            if not isinstance(usage, dict):
                continue
            aliases = {"input_tokens": ("input_tokens", "inputTokens"),
                       "output_tokens": ("output_tokens", "outputTokens"),
                       "total_tokens": ("total_tokens", "totalTokens")}
            for target, keys in aliases.items():
                value = next((usage.get(key) for key in keys if usage.get(key) is not None), None)
                if isinstance(value, int) and value >= 0:
                    totals[target] += value
                    found.add(target)
    return {key: value if key in found else None for key, value in totals.items()}


def record_ai_usage(operation: str, outcome: str, duration_ms: float,
                    messages: list[Any] | None = None, error_code: str | None = None) -> None:
    try:
        directory = _runtime()
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = directory / "ai-usage.jsonl"
        if path.exists() and path.stat().st_size >= MAX_BYTES:
            _rotate(path)
        record = {"at": datetime.now(timezone.utc).isoformat(), "component": "ai-agent",
                  "operation": _clean(operation), "outcome": _clean(outcome),
                  "duration_ms": max(0, round(duration_ms)),
                  **usage_from_messages(messages or [])}
        if error_code:
            record["error_code"] = _clean(error_code)
        with path.open("a", encoding="utf-8") as output:
            output.write(json.dumps(record, separators=(",", ":")) + "\n")
        os.chmod(path, 0o600)
    except OSError:
        pass


def invoke_with_telemetry(agent: Any, inputs: dict[str, Any], operation: str) -> dict[str, Any]:
    started = time.monotonic()
    try:
        result = agent.invoke(inputs)
    except Exception as error:
        record_ai_usage(operation, "failed", (time.monotonic() - started) * 1000,
                        error_code=type(error).__name__)
        raise
    record_ai_usage(operation, "success", (time.monotonic() - started) * 1000,
                    result.get("messages", []))
    return result
