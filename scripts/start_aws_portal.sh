#!/usr/bin/env bash
set -euo pipefail

PORTAL_PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PORTAL_PROJECT_ROOT"

# Preservar uma versão compatível já selecionada; usar NVM só se necessário.
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major<22 || major>24 || (major===22 && minor<13) ? 1 : 0)' 2>/dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent 24 || nvm use --silent 22
fi
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major<22 || major>24 || (major===22 && minor<13) ? 1 : 0)' 2>/dev/null; then
    echo "Instalar Node 24 LTS (ou Node >=22.13 e <25) antes de iniciar o portal." >&2
    exit 1
fi

: "${PORTAL_PUBLIC_ORIGIN:?Set PORTAL_PUBLIC_ORIGIN to the HTTPS origin of SageMaker Studio}"
export PORTAL_PUBLIC_ORIGIN
export PORT="${PORT:-3001}"
export PORTAL_ASSET_PREFIX="${PORTAL_ASSET_PREFIX:-/codeeditor/default/ports/$PORT}"
node --input-type=module -e 'import {awsConfig} from "./dmc-workspace/scripts/aws-config.mjs"; awsConfig(process.env, [])'
if [ ! -d dmc-workspace/node_modules/next ]; then
    echo "Dependências ausentes. Executar npm ci em dmc-workspace antes do arranque." >&2
    exit 1
fi
# Detetar uma porta ocupada antes de recompilar um portal que está em execução.
node --input-type=module -e 'import {createServer} from "node:net"; const s=createServer(); s.on("error",()=>{console.error("Porta indisponível. Encerrar o servidor anterior ou definir PORT com outra porta.");process.exit(1)});s.listen(Number(process.env.PORT),"0.0.0.0",()=>s.close())'

PORTAL_AGENT_PID=""
PORTAL_SERVER_PID=""
stop_portal_services() {
    if [ -n "$PORTAL_SERVER_PID" ]; then kill "$PORTAL_SERVER_PID" 2>/dev/null || true; fi
    if [ -n "$PORTAL_AGENT_PID" ]; then kill "$PORTAL_AGENT_PID" 2>/dev/null || true; fi
}
trap stop_portal_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# O agente é opcional; ativar apenas quando o ambiente Python estiver preparado.
if [ "${BLU_START_AGENT:-0}" = "1" ] && ! curl --fail --silent --max-time 3 http://127.0.0.1:8000/api/health >/dev/null; then
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
node scripts/start-aws.mjs -p "$PORT" &
PORTAL_SERVER_PID=$!
wait "$PORTAL_SERVER_PID"
