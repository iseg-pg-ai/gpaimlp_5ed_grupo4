#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Carregar apenas chaves operacionais conhecidas do ficheiro local, sem executar
# o seu conteúdo como código shell. Variáveis já exportadas têm prioridade.
if [ -f "$ROOT/.env" ]; then
    while IFS='=' read -r key value; do
        case "$key" in
            BLU_BACKUP_DIR|BLU_BACKUP_S3_BUCKET|BLU_BACKUP_S3_PREFIX|BLU_BACKUP_S3_KMS_KEY_ID|BLU_DATA_S3_BUCKET|BLU_ENVIRONMENT|BLU_MONITORING_NOTIFICATIONS_ENABLED|BLU_MONITORING_SNS_TOPIC_ARN|BLU_PDF_FONT|BLU_PDF_CJK_FONT|BLU_PDF_CJK_FACE|BLU_CONVERSATION_TABLE|BLU_INTELLIGENCE_TABLE|AWS_REGION|AWS_DEFAULT_REGION)
                if [ -z "${!key+x}" ]; then
                    export "$key=$value"
                fi
                ;;
        esac
    done < <(sed -n '/^[A-Z][A-Z0-9_]*=[A-Za-z0-9._:\/@-]*$/p' "$ROOT/.env")
fi
# O repositório contém código; os serviços consomem apenas esta cache efémera.
CACHE_ROOT="${BLU_RUNTIME_ROOT:-/tmp/blu-runtime-${UID}}"
export BLU_RUNTIME_ROOT="$CACHE_ROOT"
export BLU_DATA_DIR="$CACHE_ROOT/data"
export BLU_WAREHOUSE_DIR="$CACHE_ROOT/warehouse"
export BLU_EXPORT_DIR="$CACHE_ROOT/exports/itineraries"
export BLU_OPERATIONAL_DIR="$CACHE_ROOT/exports/portal-persistence"
export BLU_BACKUP_DIR="${BLU_BACKUP_DIR:-$(dirname "$ROOT")/blu-system-backups/$(basename "$ROOT")}"
export BLU_MONITORING_RUNTIME="${BLU_MONITORING_RUNTIME:-$ROOT/monitoring/runtime}"
# Tudo o que é volátil fica fora do Git, dentro do runtime privado do monitoring.
RUNTIME="$ROOT/monitoring/runtime/recovery"
LOG="$RUNTIME/just-blu-it.log"
SERVICES="$ROOT/monitoring/runtime/services"
COMMAND_STARTED_AT="$(date +%s)"

# Identidade visual do terminal; NO_COLOR e saídas redirecionadas mantêm texto simples.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    GOLD=$'\033[38;5;180m' CYAN=$'\033[38;5;81m' GREEN=$'\033[38;5;114m'
    RED=$'\033[38;5;210m' MUTED=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
    GOLD='' CYAN='' GREEN='' RED='' MUTED='' BOLD='' RESET=''
fi

box_row() {
    local left="$1" right="${2:-}" inner=62 gap
    gap=$((inner - 4 - ${#left} - ${#right}))
    [ "$gap" -lt 1 ] && gap=1
    printf '│  %s%*s%s  │\n' "$left" "$gap" '' "$right"
}

ui_header() {
    local protocol="$1" mode="$2"
    printf '\n%s╭──────────────────────────────────────────────────────────────╮%s\n' "$GOLD" "$RESET"
    printf '%s' "$GOLD"
    box_row "BLU SYSTEMS · $protocol" "$mode"
    printf '%s' "$RESET"
    printf '%s╰──────────────────────────────────────────────────────────────╯%s\n\n' "$GOLD" "$RESET"
}

elapsed_time() {
    local seconds=$(( $(date +%s) - COMMAND_STARTED_AT ))
    printf '%02dm %02ds' $((seconds / 60)) $((seconds % 60))
}

ui_footer() {
    local title="$1" detail="$2"
    printf '\n%s╭──────────────────────────────────────────────────────────────╮%s\n' "$GREEN" "$RESET"
    printf '%s' "$GREEN"
    box_row "◈  $title"
    box_row "$detail · $(elapsed_time)"
    printf '%s╰──────────────────────────────────────────────────────────────╯%s\n' "$GREEN" "$RESET"
}

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
    printf '\n  %s✗ PROTOCOLO INTERROMPIDO%s · %s\n' "$RED" "$RESET" "$CURRENT_TASK" >&2
    printf '  %sÚltimas mensagens do diagnóstico:%s\n' "$MUTED" "$RESET" >&2
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

open_service_pages() {
    local status
    if python3 -B scripts/open_dashboards.py --quiet; then
        printf '  %s✓%s  5 interfaces abertas no Code Editor web\n' "$GREEN" "$RESET"
    else
        status=$?
        if [ "$status" -ne 3 ]; then
            return "$status"
        fi
        printf '  %s!%s  Serviços ativos; abertura no navegador pendente de sessão Code Editor web.\n' "$GOLD" "$RESET"
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
    pkill -TERM -f 'vite .*--port 5173' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'streamlit run .*dashboard/app.py.*8501' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'presentation/serve.py --port 3003' >> "$LOG" 2>&1 || true
    pkill -TERM -f 'python .*monitoring.server' >> "$LOG" 2>&1 || true
}

port_is_open() {
    # A abertura TCP basta para detetar qualquer processo, mesmo sem uma rota HTTP válida.
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

stop_all_services() {
    local attempt port open
    stop_known_services
    for port in 3001 3003 3004 5173 8501; do stop_port "$port"; done

    # Aguardar até 15 segundos para garantir indisponibilidade antes da recuperação.
    for attempt in {1..30}; do
        open=0
        for port in 3001 3003 3004 5173 8501; do
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
    start_service observatory bash scripts/start_dashboard.sh
    start_service presentation .venv/bin/python -B presentation/serve.py --port 3003
    start_service monitoring env PYTHONPATH=src \
        .venv/bin/python -B -m monitoring.server
    start_service portal bash -c 'cd dmc-workspace && exec node scripts/start-aws.mjs -p 3001'
    start_service leads env \
        BLU_SAGEMAKER_PROXY=1 \
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${PORTAL_PUBLIC_ORIGIN#https://}" \
        bash -c 'cd frontend/blu-cloud-site && exec npm run dev -- --host 127.0.0.1 --port 5173'
}

start_missing_service() {
    local name="$1" port="$2"
    shift 2
    if port_is_open "$port"; then
        return
    fi
    start_service "$name" "$@"
}

start_missing_services() {
    start_missing_service observatory 8501 bash scripts/start_dashboard.sh
    start_missing_service presentation 3003 .venv/bin/python -B presentation/serve.py --port 3003
    start_missing_service monitoring 3004 env PYTHONPATH=src \
        .venv/bin/python -B -m monitoring.server
    start_missing_service portal 3001 bash -c 'cd dmc-workspace && exec node scripts/start-aws.mjs -p 3001'
    start_missing_service leads 5173 env \
        BLU_SAGEMAKER_PROXY=1 \
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${PORTAL_PUBLIC_ORIGIN#https://}" \
        bash -c 'cd frontend/blu-cloud-site && exec npm run dev -- --host 127.0.0.1 --port 5173'
}

verify_environment() {
    command -v uv >/dev/null
    command -v node >/dev/null
    command -v npm >/dev/null
    command -v curl >/dev/null
    if [ "${SAGEMAKER_APP_TYPE:-}" = "CodeEditor" ]; then
        python3 -B scripts/install_code_editor_links.py
    fi
    python3 -c 'import sys; assert (3,12) <= sys.version_info[:2] < (3,14)'
    node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a<22||a>24||(a===22&&b<13)?1:0)'
}

confirm_services() {
    wait_http "Portal" "http://127.0.0.1:3001/catalog"
    wait_http "Apresentação" "http://127.0.0.1:3003/"
    wait_http "Monitoring" "http://127.0.0.1:3004/health"
    wait_http "Observatório" "http://127.0.0.1:8501/_stcore/health"
    wait_http "Leads / Concierge" "http://127.0.0.1:5173/"
    # Uma resposta HTTP pode vir de um processo antigo; confirmar também os novos PID.
    for pid_file in "$SERVICES"/*.pid; do
        kill -0 "$(cat "$pid_file")" 2>/dev/null || {
            printf 'Processo terminou: %s\n' "$pid_file" >> "$LOG"
            return 1
        }
    done
}

confirm_service_endpoints() {
    wait_http "Portal" "http://127.0.0.1:3001/catalog"
    wait_http "Apresentação" "http://127.0.0.1:3003/"
    wait_http "Monitoring" "http://127.0.0.1:3004/health"
    wait_http "Observatório" "http://127.0.0.1:8501/_stcore/health"
    wait_http "Leads / Concierge" "http://127.0.0.1:5173/"
}

service_line() {
    local number="$1" label="$2" port="$3" url="$4" measurement code seconds latency padding
    wait_http "$label" "$url"
    measurement="$(curl --silent --output /dev/null --max-time 3 --write-out '%{http_code} %{time_total}' "$url")"
    read -r code seconds <<< "$measurement"
    latency="$(awk -v value="$seconds" 'BEGIN { printf "%d", value * 1000 }')"
    padding=$((20 - ${#label}))
    [ "$padding" -lt 1 ] && padding=1
    printf '  %02d  %s%*s %s● ONLINE%s    %-5s %6s ms\n' \
        "$number" "$label" "$padding" '' "$GREEN" "$RESET" "$port" "$latency"
}

quick_start_status() {
    printf '  %s◈  INITIALIZING OPERATIONAL NETWORK%s\n\n' "$CYAN" "$RESET"
    service_line 1 "OBSERVATÓRIO" 8501 "http://127.0.0.1:8501/_stcore/health"
    service_line 2 "APRESENTAÇÃO" 3003 "http://127.0.0.1:3003/"
    service_line 3 "MONITORING" 3004 "http://127.0.0.1:3004/health"
    service_line 4 "CURATION STUDIO" 3001 "http://127.0.0.1:3001/catalog"
    service_line 5 "LEADS / CONCIERGE" 5173 "http://127.0.0.1:5173/"
    printf '\n  NETWORK READINESS      %s━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s  100%%\n' "$GREEN" "$RESET"
}

cd "$ROOT"
if [ "${BLU_MODE:-it}" = "up" ]; then
    ui_header "QUICK START" "NODE AWS"
    mkdir -p "$RUNTIME" "$SERVICES"
    : >> "$LOG"
    trap fail ERR
    printf '[%s] just blu up · preparação persistente\n' "$(date -u +%FT%TZ)" >> "$LOG"
    if [ ! -f monitoring/runtime/credentials.json ]; then
        printf 'Falta configurar o acesso ao Monitoring: python -B -m monitoring.setup\n' >&2
        exit 1
    fi
    if [ ! -f "$BLU_DATA_DIR/portal/catalog.sqlite" ] \
            || [ ! -f "$BLU_WAREHOUSE_DIR/blu_etl.sqlite" ] \
            || [ ! -f "$BLU_EXPORT_DIR/history.sqlite" ]; then
        printf 'Cache S3 ausente ou incompleta. Executar primeiro: just blu it\n' >&2
        exit 1
    fi
    verify_environment
    PORTAL_PUBLIC_ORIGIN="$(python3 -B scripts/studio_urls.py --origin)"
    export PORTAL_PUBLIC_ORIGIN PORTAL_ASSET_PREFIX="$(python3 -B scripts/studio_urls.py --port 3001 | python3 -c 'import sys; from urllib.parse import urlsplit; print(urlsplit(sys.stdin.read().strip()).path.rstrip("/"))')"
    start_missing_services
    confirm_service_endpoints
    quick_start_status
    open_service_pages
    printf '\n  %s✓%s  5 serviços operacionais\n' "$GREEN" "$RESET"
    printf '  %s✓%s  5 endpoints validados\n' "$GREEN" "$RESET"
    printf '  %s↗%s  Portal AWS: %s\n' "$CYAN" "$RESET" \
        "$(python3 -B scripts/studio_urls.py --port 3001)"
    ui_footer "SYSTEM READY" "just blu up · completed"
    trap - ERR
    exit 0
fi

ui_header "RECOVERY PROTOCOL" "ADMIN MODE"
printf '  %s◈  AUTHORIZATION REQUIRED%s\n\n' "$CYAN" "$RESET"
python3 -B -m monitoring.admin_auth
printf '\n  %s✓%s  Autenticação administrativa confirmada\n\n' "$GREEN" "$RESET"

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

EXECUTION_ID="blu-it-$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')"
export EXECUTION_ID
SOURCE_ROOT="$ROOT"
if [ -f "$CACHE_ROOT/data/portal/catalog.sqlite" ] \
        && [ -f "$CACHE_ROOT/exports/itineraries/history.sqlite" ]; then
    SOURCE_ROOT="$CACHE_ROOT"
fi
run_task "Guardar checkpoint da execução" \
    python3 -B -m monitoring.checkpoint create --root "$SOURCE_ROOT" \
        --execution-id "$EXECUTION_ID" --remote-required
run_task "0. Parar todo o sistema" stop_all_services
run_task "1. Verificar ambiente" verify_environment
run_task "2. Preparar Python" uv sync --locked --all-groups
RECOVERED_ROOT="/tmp/blu-recovered-$EXECUTION_ID"
rm -rf "$RECOVERED_ROOT"
if python3 -B -m monitoring.checkpoint restore-missing \
        --root "$RECOVERED_ROOT" --backup-id "$EXECUTION_ID" >> "$LOG" 2>&1 \
        && [ -f "$RECOVERED_ROOT/data/portal/catalog.sqlite" ] \
        && [ -f "$RECOVERED_ROOT/exports/itineraries/history.sqlite" ]; then
    complete_task "Recuperar checkpoint da execução"
    run_task "Materializar dados e executar ETL" \
        .venv/bin/python -B -m etl.cloud_runtime \
            --recovered "$RECOVERED_ROOT" --destination "$CACHE_ROOT"
else
    run_task "Recuperar estado ativo e executar ETL" \
        .venv/bin/python -B -m etl.cloud_runtime --destination "$CACHE_ROOT"
fi
rm -rf "$RECOVERED_ROOT"
run_task "3. Preparar portal" bash -euo pipefail -c '
    npm --prefix dmc-workspace ci
    npm --prefix frontend/blu-cloud-site ci
    npm --prefix dmc-workspace exec playwright install chromium
    bash scripts/prepare_browser_runtime.sh
'

# Uma recuperação nunca deve substituir utilizadores ou palavras-passe existentes.
if [ ! -f monitoring/runtime/credentials.json ]; then
    run_task "4. Criar acesso de monitoring" .venv/bin/python -B -m monitoring.setup --generate
else
    complete_task "4. Preservar acesso de monitoring"
fi

run_task "5. Validar ou recuperar dados" bash -euo pipefail -c '
    PYTHONPATH=src .venv/bin/python -B -m monitoring.recovery ensure --root "$BLU_RUNTIME_ROOT"
    cd dmc-workspace
    node --experimental-strip-types scripts/sync-persistence.mjs
    cd ..
    .venv/bin/python -B -m etl.s3_outbox
'
run_task "6. Testar Python e monitoring" bash -euo pipefail -c '
    # Apenas os processos de teste: os serviços mantêm a configuração SNS real.
    export BLU_MONITORING_NOTIFICATIONS_ENABLED=false
    PYTHONPATH=src .venv/bin/python -B -m unittest discover -s tests -v
    PYTHONPATH=src .venv/bin/python -B -m unittest monitoring.test_monitoring monitoring.test_operations -v
    .venv/bin/python -B -m unittest translations.test_worker -v
'
run_task "7. Testar e construir portal" npm --prefix dmc-workspace run check
run_task "8. Construir entrega" bash -euo pipefail -c '
    npm --prefix dmc-workspace run build
    npm --prefix frontend/blu-cloud-site run build
    npm --prefix frontend/blu-cloud-site run test:sites
'

PORTAL_PUBLIC_ORIGIN="$(python3 -B scripts/studio_urls.py --origin)"
export PORTAL_PUBLIC_ORIGIN PORTAL_ASSET_PREFIX="$(python3 -B scripts/studio_urls.py --port 3001 | python3 -c 'import sys; from urllib.parse import urlsplit; print(urlsplit(sys.stdin.read().strip()).path.rstrip("/"))')"
run_task "9. Iniciar serviços" start_all_services
run_task "10. Confirmar serviços e portas" confirm_services

run_task "11. Testes finais dos dashboards" bash -euo pipefail -c '
    export LD_LIBRARY_PATH="$PWD/monitoring/runtime/browser-libs/root/usr/lib/x86_64-linux-gnu:$PWD/monitoring/runtime/browser-libs/root/lib/x86_64-linux-gnu:/opt/conda/lib"
    export FONTCONFIG_FILE="$PWD/monitoring/runtime/browser-libs/fonts.conf"
    node monitoring/test-browser.mjs
    node presentation/test-browser.mjs
'

python3 -B scripts/studio_urls.py >> "$LOG"
run_task "12. Confirmar abertura das interfaces" open_service_pages
printf '  %s↗%s  Portal AWS: %s\n' "$CYAN" "$RESET" \
    "$(python3 -B scripts/studio_urls.py --port 3001)"
ui_footer "BLU SYSTEM RESTORED" "12 tarefas · 5 serviços validados"
