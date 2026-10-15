#!/usr/bin/env bash
# Build frontend + backend, apply pending Sequelize migrations, then
# start or reload PM2: pdr-staging-api (loopback :5001) and
# pdr-staging-web (loopback :5000). Nginx (sites-available/frontend-staging)
# proxies the staging host to pdr-staging-web.
#
# Uses .env.staging (not .env) so production env, database, and JWT stay untouched.
#
#   ./scripts/deploy-staging.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-5001}"
WEB_PORT="${WEB_PORT:-5000}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.staging}"
export ENV_FILE

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null && command -v npm >/dev/null || fail "Node and npm are required"
command -v pm2 >/dev/null || fail "PM2 is required"
[ -f "$ENV_FILE" ] || fail ".env.staging is missing. Copy .env.example to .env.staging and set APP_ENV=staging, a separate DATABASE_URL, JWT_SECRET, APP_URL, and DATA_DIR=./data-staging"

install_deps() {
  local dir="$1"
  shift
  (
    cd "$dir"
    if [ -f package-lock.json ]; then npm ci "$@"; else npm install "$@"; fi
  )
}

echo "[deploy-staging] env $ENV_FILE"
echo "[deploy-staging] installing dependencies"
install_deps "$ROOT/server" --omit=dev
install_deps "$ROOT/client"

echo "[deploy-staging] sequelize migrate"
node "$ROOT/server/migrate.js"

echo "[deploy-staging] frontend build"
(
  cd "$ROOT/client"
  NODE_ENV=production npm run build
)
[ -f "$ROOT/client/dist/index.html" ] || fail "Frontend build failed (client/dist/index.html missing)"

mkdir -p "$ROOT/data-staging/files" "$ROOT/data-staging/logs"

if pm2 describe pdr-staging-api >/dev/null 2>&1 && pm2 describe pdr-staging-web >/dev/null 2>&1; then
  echo "[deploy-staging] reloading PM2 apps"
  pm2 reload "$ROOT/ecosystem.staging.config.cjs" --update-env
else
  echo "[deploy-staging] starting PM2 apps"
  pm2 delete pdr-staging-api pdr-staging-web >/dev/null 2>&1 || true
  pm2 start "$ROOT/ecosystem.staging.config.cjs"
fi

pm2 save

echo "[deploy-staging] health check"
sleep 2
curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null || fail "API did not start. Check: pm2 logs pdr-staging-api"
curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health" >/dev/null || fail "Frontend did not start. Check: pm2 logs pdr-staging-web"

echo "[deploy-staging] done"
echo "  pdr-staging-api  http://127.0.0.1:${API_PORT}  (internal, not public)"
echo "  pdr-staging-web  http://127.0.0.1:${WEB_PORT}  (nginx proxies staging here)"
echo "  public           staging host via nginx (not :5000)"
echo "  production apps  pdr-api / pdr-web on :4001 / :4000 are left running"
