#!/usr/bin/env bash
# Build frontend + backend, run pending migrations, then create or restart
# two PM2 processes: pdr-api (Node API) and pdr-web (built React).
#
#   ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_ENV="${NODE_ENV:-production}"
API_PORT="${API_PORT:-4001}"
WEB_PORT="${WEB_PORT:-4000}"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
log() { printf '\n→ %s\n' "$*"; }

ensure_pm2() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env
    printf 'Restarted %s\n' "$name"
  else
    pm2 start "$ROOT/ecosystem.config.cjs" --only "$name"
    printf 'Created %s\n' "$name"
  fi
}

command -v node >/dev/null && command -v npm >/dev/null || fail "Node and npm are required"
command -v pm2 >/dev/null || fail "PM2 is required"
[ -f "$ROOT/.env" ] || fail ".env is missing"

install_deps() {
  local dir="$1"
  shift
  (
    cd "$dir"
    if [ -f package-lock.json ]; then npm ci "$@"; else npm install "$@"; fi
  )
}

log "Install backend dependencies"
install_deps "$ROOT/server" --omit=dev

log "Install frontend dependencies"
install_deps "$ROOT/client"

log "Build frontend"
(
  cd "$ROOT/client"
  NODE_ENV=production npm run build
)
[ -f "$ROOT/client/dist/index.html" ] || fail "Frontend build failed (client/dist/index.html missing)"

log "Check backend and frontend servers"
node --check "$ROOT/server/index.js"
node --check "$ROOT/server/frontend.js"
node --check "$ROOT/server/migrate.js"

mkdir -p "$ROOT/data/files" "$ROOT/data/logs"

log "Run migrations if needed"
node "$ROOT/server/migrate.js"

log "Create or restart PM2 processes"
export NODE_ENV
pm2 delete pdr-system >/dev/null 2>&1 || true
ensure_pm2 pdr-api
ensure_pm2 pdr-web
pm2 save

log "Health check"
sleep 2
curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null || fail "API did not start. Check: pm2 logs pdr-api"
curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null || fail "Frontend did not start. Check: pm2 logs pdr-web"
printf '\nDeploy complete.\n  pdr-api  http://127.0.0.1:%s  (Node API)\n  pdr-web  http://127.0.0.1:%s  (frontend, proxies /api to the API)\n' "$API_PORT" "$WEB_PORT"
