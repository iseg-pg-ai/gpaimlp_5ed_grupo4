#!/usr/bin/env bash
# Prepara as dependências locais necessárias aos ensaios de navegador.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME="$ROOT/monitoring/runtime/browser-libs"
LIB_ROOT="$RUNTIME/root"
LIB_PATH="$LIB_ROOT/usr/lib/x86_64-linux-gnu:$LIB_ROOT/lib/x86_64-linux-gnu:/opt/conda/lib"
FONT_CONFIG="$RUNTIME/fonts.conf"

write_font_config() {
    mkdir -p "$RUNTIME/font-cache"
    cat > "$FONT_CONFIG" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$LIB_ROOT/usr/share/fonts</dir>
  <cachedir>$RUNTIME/font-cache</cachedir>
</fontconfig>
EOF
}

browser_path() {
    find "$HOME/.cache/ms-playwright" -path '*/chrome-headless-shell-linux64/chrome-headless-shell' \
        -type f -print 2>/dev/null | sort -V | tail -1
}

browser_ready() {
    local browser="$1"
    [ -n "$browser" ] && [ -x "$browser" ] && \
        ! LD_LIBRARY_PATH="$LIB_PATH" ldd "$browser" 2>/dev/null | grep -q 'not found'
}

BROWSER="$(browser_path)"
if browser_ready "$BROWSER"; then
    write_font_config
    exit 0
fi

command -v apt-get >/dev/null
command -v dpkg-deb >/dev/null
mkdir -p "$RUNTIME/packages" "$LIB_ROOT"

# Dependências publicadas pelo Playwright para Chromium em Ubuntu 24.04. São
# extraídas sem privilégios; nada é instalado globalmente na máquina SageMaker.
packages=(
    at-spi2-common fontconfig fontconfig-config fonts-liberation fonts-noto-color-emoji
    libasound2-data libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64
    libatspi2.0-0t64 libavahi-client3 libavahi-common-data libavahi-common3 libcairo2
    libcups2t64 libdatrie1 libdbus-1-3 libdrm-amdgpu1 libdrm-common libdrm-intel1
    libdrm2 libelf1t64 libfontconfig1 libfontenc1 libfreetype6 libfribidi0 libgbm1
    libgl1 libgl1-mesa-dri libglib2.0-0t64 libglvnd0 libglx-mesa0 libglx0
    libgraphite2-3 libharfbuzz0b libice6 libicu74 libllvm20 libnspr4 libnss3
    libpango-1.0-0 libpciaccess0 libpixman-1-0 libpng16-16t64 libsensors-config
    libsensors5 libsm6 libthai-data libthai0 libunwind8 libvulkan1 libx11-6
    libx11-data libx11-xcb1 libxau6 libxcb-dri3-0 libxcb-glx0 libxcb-present0
    libxcb-randr0 libxcb-render0 libxcb-shm0 libxcb-sync1 libxcb-xfixes0 libxcb1
    libxcomposite1 libxdamage1 libxdmcp6 libxext6 libxfixes3 libxi6 libxkbcommon0
    libxrandr2 libxrender1 libxshmfence1 libxxf86vm1 mesa-libgallium x11-common
    xkb-data
)

(
    cd "$RUNTIME/packages"
    rm -f ./*.deb
    # Um mirror pode mudar entre a atualização dos índices e o download. Extrair o
    # conjunto disponível e deixar que a verificação ldd abaixo decida o resultado.
    apt-get download "${packages[@]}" || true
    compgen -G './*.deb' >/dev/null || {
        echo "Não foi possível descarregar bibliotecas do Chromium." >&2
        exit 1
    }
    for archive in ./*.deb; do
        dpkg-deb -x "$archive" "$LIB_ROOT"
    done
    rm -f ./*.deb
)

BROWSER="$(browser_path)"
if ! browser_ready "$BROWSER"; then
    LD_LIBRARY_PATH="$LIB_PATH" ldd "$BROWSER" | grep 'not found' >&2 || true
    echo "As dependências locais do Chromium continuam incompletas." >&2
    exit 1
fi
write_font_config
