#!/usr/bin/env bash
# ============================================================
# First-time DigitalOcean droplet setup (Ubuntu 22.04 / 24.04).
# Installs Node 22, PM2, Nginx, Certbot, and a 2GB swap file.
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

echo "→ Apt packages"
apt-get update -y
apt-get install -y curl git build-essential nginx python3-certbot-nginx ca-certificates gnupg

if [ ! -f /swapfile ]; then
  echo "→ 2GB swap (Vite production builds need RAM on small droplets)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 18 ]; then
  echo "→ Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "→ PM2"
npm install -g pm2
pm2 startup systemd -u "${SUDO_USER:-root}" --hp "$(eval echo "~${SUDO_USER:-root}")" >/dev/null || true

SITE_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx-pdr.conf.example"
if [ -f "$SITE_SRC" ] && [ ! -f /etc/nginx/sites-available/pdr-system ]; then
  echo "→ Nginx site (edit server_name, then: certbot --nginx -d your-domain)"
  cp "$SITE_SRC" /etc/nginx/sites-available/pdr-system
  ln -sfn /etc/nginx/sites-available/pdr-system /etc/nginx/sites-enabled/pdr-system
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
fi

echo
echo "Setup complete. Next:"
echo "  1. Clone the repo (or rsync) onto this droplet"
echo "  2. Copy .env.example to .env and set JWT_SECRET, DATABASE_URL, APP_URL=https://your-domain"
echo "  3. ./scripts/deploy.sh"
echo "  4. Edit /etc/nginx/sites-available/pdr-system server_name, then:"
echo "       certbot --nginx -d your-domain"
echo
