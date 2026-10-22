#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Instala apenas uma ligação local; o código continua versionado no repositório.
mkdir -p "$HOME/.local/bin"
ln -sfn "$ROOT/bin/just" "$HOME/.local/bin/just"
echo "Instalado: $HOME/.local/bin/just"
echo "Comandos disponíveis: just blu it | just blu up"

# Instalar a integração do editor quando a CLI estiver disponível, sem impedir o launcher.
if command -v code >/dev/null 2>&1; then
    if ! python3 -B "$ROOT/scripts/vscode_terminal.py" --install; then
        echo "Launcher instalado; integração de terminal pendente no VS Code." >&2
    fi
fi
