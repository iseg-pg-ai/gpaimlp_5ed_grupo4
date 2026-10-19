#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Tudo o que é volátil fica fora do Git, dentro do runtime privado do monitoring.
RUNTIME="$ROOT/monitoring/runtime/recovery"
LOG="$RUNTIME/just-blu-it.log"
SERVICES="$ROOT/monitoring/runtime/services"
mkdir -p "$RUNTIME" "$SERVICES"
: > "$LOG"

# Preferir as versões Node suportadas pelo portal quando o NVM estiver disponível.
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a<22||a>24||(a===22&&b<13)?1:0)' 2>/dev/null \
        && [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent 24 >/dev/null 2>&1 || nvm use --silent 22 >/dev/null
fi

CURRENT_TASK="Preparação"
bar() {
    local percent="$1" label="$2" width=30 filled empty
    filled=$((percent * width / 100))
    empty=$((width - filled))
    printf '\n%-34s [' "$label"
    printf '%*s' "$filled" '' | tr ' ' '#'
    printf '%*s' "$empty" '' | tr ' ' '-'
    printf '] %3d%%\n' "$percent"
}
fail() {
    printf '\nFalhou: %s\nÚltimas mensagens:\n' "$CURRENT_TASK" >&2
    tail -40 "$LOG" >&2 || true
    printf '\nO sistema anterior foi preservado sempre que estava válido.\n' >&2
}
trap fail ERR

run_task() {
    local percent="$1" label="$2"
    shift 2
    CURRENT_TASK="$label"
    bar "$percent" "$label"
    printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$label" >> "$LOG"
    "$@" >> "$LOG" 2>&1
    printf '  ✓ concluída\n'
}

wait_http() {
    # Dar até um minuto a cada serviço para concluir o respetivo arranque.
    local name="$1" url="$2"
    for _ in {1..60}; do
        if curl --fail --silent --max-time 3 "$url" >/dev/null; then
            printf '  ✓ %s responde\n' "$name"
            return 0
        fi
        sleep 1
    done
    printf '%s não respondeu em %s\n' "$name" "$url" >> "$LOG"
    return 1
}

stop_port() {
    local port="$1"
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${port}/tcp" >> "$LOG" 2>&1 || true
    fi
}

stop_known_services() {
    # Limitar a paragem aos processos pertencentes aos serviços BLU conhecidos.
    for pid_file in "$SERVICES"/*.pid; do
        [ -f "$pid_file" ] || continue
        kill "$(cat "$pid_file")" >> "$LOG" 2>&1 || true
    done
    pkill -TERM -f 'node .*start-aws.mjs -p 3001' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'streamlit run .*dashboard/app.py.*8501' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'presentation/serve.py --port 3003' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'python .*monitoring.server' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'uvicorn blu_ai.api.server:app.*8000' >> "$LOG" 2>&1 || true
}

start_service() {
    # Os PID e logs permitem diagnóstico e uma paragem controlada na execução seguinte.
    local name="$1"
    shift
    nohup "$@" > "$SERVICES/$name.log" 2>&1 &
    echo "$!" > "$SERVICES/$name.pid"
}

cd "$ROOT"
printf '\njust blu it\nRecuperação ponta a ponta do sistema BLU\n'

run_task 5 "1. Verificar ambiente" bash -c '
    command -v uv >/dev/null
    command -v node >/dev/null
    command -v npm >/dev/null
    command -v curl >/dev/null
    python3 -c "import sys; assert (3,12) <= sys.version_info[:2] < (3,14)"
    node -e '\''const [a,b]=process.versions.node.split(".").map(Number);process.exit(a<22||a>24||(a===22&&b<13)?1:0)'\''
'

# Modo rápido usado para validar o orquestrador sem instalar nem iniciar serviços.
if [ "${BLU_IT_VALIDATE_ONLY:-0}" = "1" ]; then
    run_task 35 "2. Inspecionar recuperação" env PYTHONPATH=src .venv/bin/python -B -m monitoring.recovery inspect
    run_task 70 "3. Validar estrutura" python3 scripts/check_project.py
    run_task 100 "4. Validar orquestrador" bash -n scripts/just_blu_it.sh
    printf '\njust blu it ✓ validação concluída\n'
    exit 0
fi

run_task 15 "2. Preparar Python" uv sync --locked --all-groups
run_task 25 "3. Preparar portal" npm --prefix dmc-workspace ci

# Uma recuperação nunca deve substituir utilizadores ou palavras-passe existentes.
if [ ! -f monitoring/runtime/credentials.json ]; then
    run_task 30 "4. Criar acesso de monitoring" .venv/bin/python -B -m monitoring.setup --generate
else
    bar 30 "4. Preservar acesso de monitoring"
    printf '  ✓ credenciais existentes preservadas\n'
fi

run_task 38 "5. Validar ou recuperar dados" env PYTHONPATH=src .venv/bin/python -B -m monitoring.recovery ensure
run_task 50 "6. Testar Python e monitoring" bash -c '
    PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
    PYTHONPATH=src .venv/bin/python -B -m unittest monitoring.test_monitoring monitoring.test_operations -v
    .venv/bin/python -B -m unittest translations.test_worker -v
'
run_task 65 "7. Testar e construir portal" npm --prefix dmc-workspace run check
run_task 73 "8. Construir entrega" npm --prefix dmc-workspace run build

CURRENT_TASK="9. Iniciar serviços"
bar 82 "$CURRENT_TASK"
# Evitar duas instâncias a escrever no mesmo catálogo ou a disputar a mesma porta.
stop_known_services
for port in 3001 3003 3004 8000 8501; do stop_port "$port"; done
sleep 2
start_service agent bash scripts/start_ai_agent.sh
start_service observatory bash scripts/start_dashboard.sh
start_service presentation .venv/bin/python -B presentation/serve.py --port 3003
start_service monitoring env PYTHONPATH=src BLU_MONITOR_AGENT_ENABLED=1 .venv/bin/python -B -m monitoring.server
PORTAL_PUBLIC_ORIGIN="$(python3 -B scripts/studio_urls.py --origin)"
export PORTAL_PUBLIC_ORIGIN PORTAL_ASSET_PREFIX="/codeeditor/default/ports/3001"
start_service portal bash -c 'cd dmc-workspace && exec node scripts/start-aws.mjs -p 3001'
printf '  ✓ processos iniciados\n'

CURRENT_TASK="10. Confirmar serviços e portas"
bar 92 "$CURRENT_TASK"
wait_http "Portal" "http://127.0.0.1:3001/catalog"
wait_http "Apresentação" "http://127.0.0.1:3003/"
wait_http "Monitoring" "http://127.0.0.1:3004/health"
wait_http "Agente IA" "http://127.0.0.1:8000/api/health"
wait_http "Observatório" "http://127.0.0.1:8501/_stcore/health"
# Uma resposta HTTP pode vir de um processo antigo; confirmar também os novos PID.
for pid_file in "$SERVICES"/*.pid; do
    kill -0 "$(cat "$pid_file")" 2>/dev/null || {
        printf 'Processo terminou: %s\n' "$pid_file" >> "$LOG"
        exit 1
    }
done

run_task 97 "11. Testes finais dos dashboards" bash -c '
    export LD_LIBRARY_PATH=/tmp/blu-browser-libs/root/usr/lib/x86_64-linux-gnu:/opt/conda/lib
    export FONTCONFIG_FILE=/tmp/blu-browser-libs/fonts.conf
    node monitoring/test-browser.mjs
    node presentation/test-browser.mjs
'

bar 100 "12. Sistema BLU recuperado"
python3 -B scripts/studio_urls.py
printf 'Agente IA: http://127.0.0.1:8000/api/health\n'
printf '\njust blu it ✓\nTodo o sistema está disponível. Log: %s\n' "$LOG"
