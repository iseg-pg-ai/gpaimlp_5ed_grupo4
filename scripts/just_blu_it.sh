#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Tudo o que é volátil fica fora do Git, dentro do runtime privado do monitoring.
RUNTIME="$ROOT/monitoring/runtime/recovery"
LOG="$RUNTIME/just-blu-it.log"
SERVICES="$ROOT/monitoring/runtime/services"

# Preferir as versões Node suportadas pelo portal quando o NVM estiver disponível.
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a<22||a>24||(a===22&&b<13)?1:0)' 2>/dev/null \
        && [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use --silent 24 >/dev/null 2>&1 || nvm use --silent 22 >/dev/null
fi

CURRENT_TASK="Preparação"
render_task() {
    local percent="$1" label="$2" width=30 label_width=38 filled empty padding
    local full_part empty_part
    filled=$((percent * width / 100))
    empty=$((width - filled))
    printf -v full_part '%*s' "$filled" ''
    printf -v empty_part '%*s' "$empty" ''
    full_part="${full_part// /━}"
    empty_part="${empty_part// /─}"
    padding=$((label_width - ${#label}))
    [ "$padding" -lt 1 ] && padding=1

    # Durante a execução, atualizar a mesma linha; em pipes mostrar apenas o resultado.
    if [ -t 1 ]; then
        if [ "$percent" -eq 100 ]; then
            printf '\r\033[2K%s%*s [\033[32m%s\033[0m\033[2m%s\033[0m] %3d%%' \
                "$label" "$padding" '' "$full_part" "$empty_part" "$percent"
        else
            printf '\r\033[2K%s%*s [\033[36m%s\033[0m\033[2m%s\033[0m] %3d%%' \
                "$label" "$padding" '' "$full_part" "$empty_part" "$percent"
        fi
    elif [ "$percent" -eq 100 ]; then
        printf '%s%*s [%s%s] %3d%%' \
            "$label" "$padding" '' "$full_part" "$empty_part" "$percent"
    fi
}

complete_task() {
    render_task 100 "$1"
    printf '\n'
}
fail() {
    printf '\n  ✗ Falhou: %s\n' "$CURRENT_TASK" >&2
    printf '  Últimas mensagens:\n' >&2
    tail -40 "$LOG" >&2 || true
    printf '\nO sistema anterior foi preservado sempre que estava válido.\n' >&2
}
run_task() {
    local label="$1" pid progress=0 status
    shift
    CURRENT_TASK="$label"
    printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$label" >> "$LOG"
    render_task 0 "$label"
    "$@" >> "$LOG" 2>&1 &
    pid=$!
    while kill -0 "$pid" 2>/dev/null; do
        render_task "$progress" "$label"
        sleep 0.25
        if [ "$progress" -lt 90 ]; then
            progress=$((progress + 2))
        fi
    done
    if wait "$pid"; then
        complete_task "$label"
    else
        status=$?
        render_task "$progress" "$label"
        return "$status"
    fi
}

wait_http() {
    # Dar até um minuto a cada serviço para concluir o respetivo arranque.
    local name="$1" url="$2"
    for _ in {1..60}; do
        if curl --fail --silent --max-time 3 "$url" >/dev/null; then
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

port_is_open() {
    # A abertura TCP basta para detetar qualquer processo, mesmo sem uma rota HTTP válida.
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

stop_all_services() {
    local attempt port open
    stop_known_services
    for port in 3001 3003 3004 8000 8501; do stop_port "$port"; done

    # Aguardar até 15 segundos para garantir indisponibilidade antes da recuperação.
    for attempt in {1..30}; do
        open=0
        for port in 3001 3003 3004 8000 8501; do
            if port_is_open "$port"; then open=1; fi
        done
        if [ "$open" -eq 0 ]; then
            rm -f "$SERVICES"/*.pid
            return 0
        fi
        sleep 0.5
    done
    printf 'Persistem serviços ativos nas portas BLU após a paragem.\n' >> "$LOG"
    return 1
}

start_service() {
    # Os PID e logs permitem diagnóstico e uma paragem controlada na execução seguinte.
    local name="$1"
    shift
    nohup "$@" > "$SERVICES/$name.log" 2>&1 &
    echo "$!" > "$SERVICES/$name.pid"
}

start_all_services() {
    start_service agent bash scripts/start_ai_agent.sh
    start_service observatory bash scripts/start_dashboard.sh
    start_service presentation .venv/bin/python -B presentation/serve.py --port 3003
    start_service monitoring env PYTHONPATH=src BLU_MONITOR_AGENT_ENABLED=1 \
        .venv/bin/python -B -m monitoring.server
    start_service portal bash -c 'cd dmc-workspace && exec node scripts/start-aws.mjs -p 3001'
}

verify_environment() {
    command -v uv >/dev/null
    command -v node >/dev/null
    command -v npm >/dev/null
    command -v curl >/dev/null
    python3 -c 'import sys; assert (3,12) <= sys.version_info[:2] < (3,14)'
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a<22||a>24||(a===22&&b<13)?1:0)'
}

confirm_services() {
    wait_http "Portal" "http://127.0.0.1:3001/catalog"
    wait_http "Apresentação" "http://127.0.0.1:3003/"
    wait_http "Monitoring" "http://127.0.0.1:3004/health"
    wait_http "Agente IA" "http://127.0.0.1:8000/api/health"
    wait_http "Observatório" "http://127.0.0.1:8501/_stcore/health"
    # Uma resposta HTTP pode vir de um processo antigo; confirmar também os novos PID.
    for pid_file in "$SERVICES"/*.pid; do
        kill -0 "$(cat "$pid_file")" 2>/dev/null || {
            printf 'Processo terminou: %s\n' "$pid_file" >> "$LOG"
            return 1
        }
    done
}

cd "$ROOT"
printf '\njust blu it\nRecuperação ponta a ponta do sistema BLU\n'
python3 -B -m monitoring.admin_auth

# Só criar logs ou alterar processos depois de confirmar um administrador ativo.
mkdir -p "$RUNTIME" "$SERVICES"
: > "$LOG"
trap fail ERR

# Modo rápido usado para validar o orquestrador sem instalar nem iniciar serviços.
if [ "${BLU_IT_VALIDATE_ONLY:-0}" = "1" ]; then
    run_task "1. Verificar ambiente" verify_environment
    run_task "2. Inspecionar recuperação" env PYTHONPATH=src .venv/bin/python -B -m monitoring.recovery inspect
    run_task "3. Validar estrutura" python3 scripts/check_project.py
    run_task "4. Validar orquestrador" bash -n scripts/just_blu_it.sh
    exit 0
fi

run_task "0. Parar todo o sistema" stop_all_services
run_task "1. Verificar ambiente" verify_environment
run_task "2. Preparar Python" uv sync --locked --all-groups
run_task "3. Preparar portal" npm --prefix dmc-workspace ci

# Uma recuperação nunca deve substituir utilizadores ou palavras-passe existentes.
if [ ! -f monitoring/runtime/credentials.json ]; then
    run_task "4. Criar acesso de monitoring" .venv/bin/python -B -m monitoring.setup --generate
else
    complete_task "4. Preservar acesso de monitoring"
fi

run_task "5. Validar ou recuperar dados" env PYTHONPATH=src .venv/bin/python -B -m monitoring.recovery ensure
run_task "6. Testar Python e monitoring" bash -c '
    PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
    PYTHONPATH=src .venv/bin/python -B -m unittest monitoring.test_monitoring monitoring.test_operations -v
    .venv/bin/python -B -m unittest translations.test_worker -v
'
run_task "7. Testar e construir portal" npm --prefix dmc-workspace run check
run_task "8. Construir entrega" npm --prefix dmc-workspace run build

PORTAL_PUBLIC_ORIGIN="$(python3 -B scripts/studio_urls.py --origin)"
export PORTAL_PUBLIC_ORIGIN PORTAL_ASSET_PREFIX="/codeeditor/default/ports/3001"
run_task "9. Iniciar serviços" start_all_services
run_task "10. Confirmar serviços e portas" confirm_services

run_task "11. Testes finais dos dashboards" bash -c '
    export LD_LIBRARY_PATH=/tmp/blu-browser-libs/root/usr/lib/x86_64-linux-gnu:/opt/conda/lib
    export FONTCONFIG_FILE=/tmp/blu-browser-libs/fonts.conf
    node monitoring/test-browser.mjs
    node presentation/test-browser.mjs
'

python3 -B scripts/studio_urls.py >> "$LOG"
run_task "12. Sistema BLU recuperado" true
