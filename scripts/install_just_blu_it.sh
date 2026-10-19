#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Instala apenas uma ligação local; o código continua versionado no repositório.
mkdir -p "$HOME/.local/bin"
ln -sfn "$ROOT/bin/just" "$HOME/.local/bin/just"
echo "Instalado: $HOME/.local/bin/just"
echo "Comando disponível: just blu it"
