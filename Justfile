set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Recupera, valida e inicia todo o sistema BLU.
blu action:
    @test "{{action}}" = "it" || { echo 'Utilização: just blu it' >&2; exit 2; }
    @bash scripts/just_blu_it.sh
