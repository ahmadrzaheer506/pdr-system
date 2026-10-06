#!/usr/bin/env bash
# Build frontend + backend, apply pending Sequelize migrations, then
# start or reload PM2: pdr-api (loopback :4001) and pdr-web (loopback :4000).
# Nginx (sites-available/frontend) proxies public :80 to pdr-web.
#
#   ./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-4001}"
WEB_PORT="${WEB_PORT:-4000}"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

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

echo "[deploy] installing dependencies"
install_deps "$ROOT/server" --omit=dev
install_deps "$ROOT/client"

echo "[deploy] sequelize migrate"
node "$ROOT/server/migrate.js"

echo "[deploy] frontend build"
(
  cd "$ROOT/client"
  NODE_ENV=production npm run build
)
[ -f "$ROOT/client/dist/index.html" ] || fail "Frontend build failed (client/dist/index.html missing)"

mkdir -p "$ROOT/data/files" "$ROOT/data/logs"

if pm2 describe pdr-api >/dev/null 2>&1 && pm2 describe pdr-web >/dev/null 2>&1; then
  echo "[deploy] reloading PM2 apps"
  pm2 reload "$ROOT/ecosystem.config.cjs" --update-env
else
  echo "[deploy] starting PM2 apps"
  pm2 delete pdr-api pdr-web pdr-system >/dev/null 2>&1 || true
  pm2 start "$ROOT/ecosystem.config.cjs"
fi

pm2 save

echo "[deploy] health check"
sleep 2
curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null || fail "API did not start. Check: pm2 logs pdr-api"
curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null || fail "Frontend did not start. Check: pm2 logs pdr-web"

echo "[deploy] done"
echo "  pdr-api  http://127.0.0.1:${API_PORT}  (internal, not public)"
echo "  pdr-web  http://127.0.0.1:${WEB_PORT}  (nginx proxies :80 here)"
echo "  public   http://<droplet-ip>/  (nginx, not :4000)"
