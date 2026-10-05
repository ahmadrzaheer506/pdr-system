#!/usr/bin/env bash
# ============================================================
# First-time DigitalOcean droplet setup (Ubuntu 22.04 / 24.04).
# Safe to re-run: anything already present is skipped, not replaced.
#
#   sudo ./scripts/setup-digitalocean.sh
#
# Then copy the repo + .env onto the droplet and run:
#   ./scripts/deploy.sh
# ============================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

ok() { printf '  skip  %s\n' "$*"; }
did() { printf '  done  %s\n' "$*"; }

echo "→ Apt packages (already-installed packages are left as-is)"
apt-get update -y
apt-get install -y curl git build-essential nginx python3-certbot-nginx ca-certificates gnupg
did "curl, git, nginx, certbot"

if swapon --show | grep -q . || [ -f /swapfile ]; then
  ok "Swap already exists"
else
  echo "→ 2GB swap (Vite production builds need RAM on small droplets)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  did "2GB /swapfile"
fi

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
fi
if [ "$NODE_MAJOR" -ge 18 ]; then
  ok "Node $(node -v) already installed"
else
  echo "→ Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  did "Node $(node -v)"
fi

if command -v pm2 >/dev/null 2>&1; then
  ok "PM2 $(pm2 -v) already installed"
else
  echo "→ PM2"
  npm install -g pm2
  did "PM2 $(pm2 -v)"
fi
pm2 startup systemd -u "${SUDO_USER:-root}" --hp "$(eval echo "~${SUDO_USER:-root}")" >/dev/null || true

SITE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx-pdr.conf.example"
if [ -f /etc/nginx/sites-available/pdr-system ]; then
  ok "Nginx site /etc/nginx/sites-available/pdr-system already exists (not overwritten)"
elif [ -f "$SITE_SRC" ]; then
  echo "→ Nginx site (edit server_name, then: certbot --nginx -d your-domain)"
  cp "$SITE_SRC" /etc/nginx/sites-available/pdr-system
  ln -sfn /etc/nginx/sites-available/pdr-system /etc/nginx/sites-enabled/pdr-system
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  did "Nginx site pdr-system"
fi

echo
echo "Setup complete. Existing Node / PM2 / Nginx / Certbot / swap were left in place."
echo "Next:"
echo "  1. Clone the repo (or rsync) onto this droplet"
echo "  2. Copy .env.example to .env and set JWT_SECRET, DATABASE_URL, APP_URL=https://your-domain"
echo "  3. ./scripts/deploy.sh"
echo "  4. If TLS is not set up yet: edit server_name, then certbot --nginx -d your-domain"
echo
