#!/usr/bin/env bash
# Disponibiliza o launcher BLU no ambiente local sem duplicar a lógica do protocolo de
# recuperação.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Instala apenas uma ligação local; o código continua versionado no repositório.
mkdir -p "$HOME/.local/bin"
ln -sfn "$ROOT/bin/just" "$HOME/.local/bin/just"
echo "Instalado: $HOME/.local/bin/just"
echo "Comandos disponíveis: just blu it | just blu up"
