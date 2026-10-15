#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

if [ -f ".venv/bin/python" ]; then
    PYTHON_EXEC=".venv/bin/python"
else
    PYTHON_EXEC="python3"
fi

echo "Starting BLU AI Agent Service on http://127.0.0.1:8000..."
export PYTHONPATH="$ROOT_DIR/src:$PYTHONPATH"
AGENT_ARGS=(--host 127.0.0.1 --port 8000)
if [ "${BLU_AGENT_RELOAD:-0}" = "1" ]; then
    AGENT_ARGS+=(--reload --reload-dir "$ROOT_DIR/src")
fi
exec "$PYTHON_EXEC" -m uvicorn blu_ai.api.server:app "${AGENT_ARGS[@]}"
