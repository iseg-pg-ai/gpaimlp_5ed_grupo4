#!/usr/bin/env bash
#
# Starts the local Streamlit dashboard after confirming a warehouse exists.

set -euo pipefail

# Default port (can be overridden: PORT=8502 ./scripts/start_dashboard.sh)
PORT="${PORT:-8501}"

# Resolve the script's directory and the repository root reliably.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(dirname "$SCRIPT_DIR")"

# Locate the project-local interpreter and its dashboard source.
PYTHON="$REPOSITORY_ROOT/.venv/bin/python"
APPLICATION="$REPOSITORY_ROOT/dashboard/app.py"
WAREHOUSE="$REPOSITORY_ROOT/warehouse/blu_etl.sqlite"

cd "$REPOSITORY_ROOT"

# A dashboard without a warehouse would only show an error state.
if [[ ! -f "$WAREHOUSE" ]]; then
    echo "Error: Warehouse missing. Run ./scripts/run_full_pipeline.sh first." >&2
    exit 1
fi

# Sanity check: ensure the virtualenv interpreter actually exists.
if [[ ! -x "$PYTHON" ]]; then
    echo "Error: Python interpreter not found at $PYTHON" >&2
    echo "Create it with: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
fi

# Start Streamlit in the foreground so the operator sees logs and can stop it with Ctrl+C.
exec "$PYTHON" -m streamlit run "$APPLICATION" \
    --server.headless true \
    --server.port "$PORT"