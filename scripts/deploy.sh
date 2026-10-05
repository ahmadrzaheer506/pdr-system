#!/usr/bin/env bash
# ============================================================
# Deploy Paul Douglas Roofing CRM on a DigitalOcean droplet.
#
# Run from the repo root, on the server:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# First-time droplet setup (Node, PM2, Nginx):
#   sudo ./scripts/setup-digitalocean.sh
#
# The script:
#   1. Checks Node, .env, and Postgres
#   2. Installs server + client dependencies
#   3. Builds the frontend and verifies the bundle
#   4. Syntax-checks the backend
#   5. Runs pending database migrations
#   6. Starts PM2 if the process is missing, otherwise restarts it
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="${APP_NAME:-pdr-system}"
NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-4000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

npm_ci_or_install() {
  local dir="$1"
  shift
  (
    cd "$dir"
    if [ -f package-lock.json ]; then
      npm ci "$@"
    else
      npm install "$@"
    fi
  )
}

bold "Paul Douglas Roofing — DigitalOcean deploy"
printf '  Repo: %s\n' "$ROOT"

step "Preflight"
need_cmd node
need_cmd npm
need_cmd curl
NODE_VER="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_VER" -lt 18 ]; then
  fail "Node 18+ required (found $(node -v)). Install Node 22 on the droplet."
fi
ok "Node $(node -v)"

if [ ! -f "$ROOT/.env" ]; then
  fail ".env is missing. Copy .env.example to .env and set JWT_SECRET, DATABASE_URL, APP_URL."
fi
ok ".env present"

JWT_SECRET="$(grep -E '^JWT_SECRET=' "$ROOT/.env" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
APP_URL="$(grep -E '^APP_URL=' "$ROOT/.env" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"

if [ -z "$JWT_SECRET" ] || [[ "$JWT_SECRET" == change-me* ]]; then
  fail "JWT_SECRET in .env is empty or still the placeholder."
fi
ok "JWT_SECRET set"

if [ -z "$DATABASE_URL" ]; then
  fail "DATABASE_URL is not set in .env."
fi
ok "DATABASE_URL set"

if [ -z "$APP_URL" ]; then
  fail "APP_URL is not set in .env (use https://your-domain)."
fi
ok "APP_URL=$APP_URL"

if [ "${DEPLOY_PULL:-0}" = "1" ] && [ -d "$ROOT/.git" ]; then
  step "git pull"
  git pull --ff-only
  ok "Repository updated"
fi

step "Install backend dependencies"
npm_ci_or_install "$ROOT/server" --omit=dev
ok "server node_modules ready"

step "Install frontend dependencies"
npm_ci_or_install "$ROOT/client"
ok "client node_modules ready"

step "Build frontend"
(
  cd "$ROOT/client"
  NODE_ENV=production npm run build
)
if [ ! -f "$ROOT/client/dist/index.html" ]; then
  fail "Frontend build did not produce client/dist/index.html"
fi
ok "client/dist/index.html exists"

step "Check backend"
node --check "$ROOT/server/index.js"
node --check "$ROOT/server/migrate.js"
ok "Backend syntax OK"

step "Data directory"
mkdir -p "$ROOT/data/files" "$ROOT/data/logs"
ok "data/files and data/logs ready"

step "Database migrations"
node "$ROOT/server/migrate.js"
ok "Migrations applied (or already up to date)"

step "Process manager (PM2)"
if ! command -v pm2 >/dev/null 2>&1; then
  fail "PM2 is not installed. Run: sudo ./scripts/setup-digitalocean.sh   (or npm install -g pm2)"
fi

export NODE_ENV
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
  ok "Restarted existing process: $APP_NAME"
else
  pm2 start "$ROOT/ecosystem.config.cjs" --name "$APP_NAME"
  ok "Created process: $APP_NAME"
fi
pm2 save
ok "PM2 process list saved"

step "Health check"
sleep 2
ATTEMPTS=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 15 ]; then
    fail "App did not become healthy at $HEALTH_URL. Check: pm2 logs $APP_NAME"
  fi
  sleep 1
done
ok "Health OK — $HEALTH_URL"

printf '\n'
bold "Deploy complete."
printf '  App is served by Node (API + built React) on 127.0.0.1:%s\n' "$PORT"
printf '  Put Nginx in front (see scripts/nginx-pdr.conf.example) and point APP_URL at https://your-domain.\n'
printf '  Status: pm2 status    Logs: pm2 logs %s\n\n' "$APP_NAME"
