#!/usr/bin/env bash
set -euo pipefail

PORTAL_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PORTAL_PROJECT_ROOT"

# Studio's default Node can be older than the project's supported version.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent 22.13.0
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || major>24 || (major===22 && minor<13)) throw Error("Use Node >=22.13 and <25")'

: "${PORTAL_PUBLIC_ORIGIN:?Set PORTAL_PUBLIC_ORIGIN to the HTTPS origin of SageMaker Studio}"
export PORTAL_PUBLIC_ORIGIN
export PORTAL_ASSET_PREFIX="${PORTAL_ASSET_PREFIX:-/codeeditor/default/ports/3001}"

PORTAL_AGENT_PID=""
PORTAL_SERVER_PID=""
stop_portal_services() {
    if [ -n "$PORTAL_SERVER_PID" ]; then kill "$PORTAL_SERVER_PID" 2>/dev/null || true; fi
    if [ -n "$PORTAL_AGENT_PID" ]; then kill "$PORTAL_AGENT_PID" 2>/dev/null || true; fi
}
trap stop_portal_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! curl --fail --silent --max-time 3 http://127.0.0.1:8000/api/health >/dev/null; then
    bash scripts/start_ai_agent.sh &
    PORTAL_AGENT_PID=$!
    for attempt in {1..30}; do
        if curl --fail --silent --max-time 2 http://127.0.0.1:8000/api/health >/dev/null; then break; fi
        if ! kill -0 "$PORTAL_AGENT_PID" 2>/dev/null; then exit 1; fi
        sleep 1
    done
    curl --fail --silent --max-time 3 http://127.0.0.1:8000/api/health >/dev/null
fi

cd dmc-workspace
npm run build
node scripts/start-aws.mjs -p 3001 &
PORTAL_SERVER_PID=$!
wait "$PORTAL_SERVER_PID"
