#!/usr/bin/env bash
# Build and start only the Next.js DMC Workspace portal.

set -euo pipefail

PORT="${PORT:-3001}"
PORTAL_HOST="${PORTAL_HOST:-0.0.0.0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY_ROOT="$(dirname "$SCRIPT_DIR")"
PORTAL_ROOT="$REPOSITORY_ROOT/dmc-workspace"

if [[ ! -f "$PORTAL_ROOT/package.json" ]]; then
    echo "Error: portal package not found at $PORTAL_ROOT/package.json" >&2
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed. The portal requires Node.js 22.13 or newer." >&2
    exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major < 22 || major >= 25 || (major === 22 && minor < 13) ? 1 : 0)'; then
    echo "Error: unsupported Node.js $(node --version). Use a version from 22.13 up to 24.x." >&2
    exit 1
fi

cd "$PORTAL_ROOT"

if [[ "${SKIP_INSTALL:-false}" != "true" ]]; then
    npm ci
fi

if [[ "${SKIP_BUILD:-false}" != "true" ]]; then
    rm -rf .next
    npm run build
fi

if [[ ! -f ".next/BUILD_ID" || ! -d ".next/static" ]]; then
    echo "Error: incomplete Next.js build. .next/BUILD_ID and .next/static are required." >&2
    exit 1
fi

echo "Starting DMC Workspace from $PORTAL_ROOT on http://$PORTAL_HOST:$PORT"
exec npm run start -- --hostname "$PORTAL_HOST" --port "$PORT"
