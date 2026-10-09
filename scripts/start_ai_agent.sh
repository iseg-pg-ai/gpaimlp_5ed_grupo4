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
exec "$PYTHON_EXEC" -m uvicorn blu_ai.api.server:app --host 127.0.0.1 --port 8000 --reload
