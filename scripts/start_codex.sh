#!/usr/bin/env bash
set -euo pipefail

# Nunca ocupar o Bash de origem, nem abrir terminais em execuções automáticas.
if [ "${BLU_CODEX_AUTO:-1}" = "0" ] || [ ! -t 0 ] || [ ! -t 1 ]; then
    exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! python3 -B "$ROOT/scripts/vscode_terminal.py"; then
    printf '\nNão foi possível abrir o split; os serviços BLU continuam ativos.\n' >&2
fi
