set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Recupera todo o sistema ou inicia apenas os serviços parados.
blu action:
    @case "{{action}}" in \
        it) bash scripts/just_blu_it.sh ;; \
        up) BLU_MODE=up bash scripts/just_blu_it.sh ;; \
        *) echo 'Utilização: just blu it | just blu up' >&2; exit 2 ;; \
    esac
