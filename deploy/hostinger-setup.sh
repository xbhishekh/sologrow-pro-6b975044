#!/usr/bin/env bash
# PHASE 1 — VPS bootstrap. Idempotent. Run as root on Ubuntu 22.04/24.04.
#   bash deploy/hostinger-setup.sh
set -euo pipefail
SECRETS_FILE="${SECRETS_FILE:-/etc/smmpanel.secrets}"
. "$(dirname "$0")/_common.sh"

[ "$(id -u)" = "0" ] || die "root ke roop me chalao (sudo -i)"

log "base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget git ca-certificates gnupg lsb-release ufw jq unzip \
  postgresql-client debian-keyring debian-archive-keyring apt-transport-https
ok "curl/wget/git/jq/psql installed"

log "docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
ok "docker $(docker --version)"

log "node 22 + pnpm"
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1 || echo 0)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# pnpm latest needs node >= 22.13; pin a version that always works
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@9.15.4 --activate >/dev/null 2>&1 || npm i -g pnpm@9.15.4
ok "node $(node -v), pnpm $(pnpm -v)"

log "caddy"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
systemctl enable caddy >/dev/null 2>&1 || true
ok "caddy $(caddy version | head -1)"

log "firewall"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true
ok "ufw: 22/80/443 open (Postgres/Kong sirf localhost)"

# secrets bootstrap
if [ ! -f "$SECRETS_FILE" ]; then
  cp "$(dirname "$0")/secrets.example" "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  die "$SECRETS_FILE bana diya — usko edit karke values bharo, phir ye script dobara chalao"
fi
load_secrets
[ -n "${REPO_URL:-}" ] || die "REPO_URL set karo $SECRETS_FILE me"

log "repo clone/pull -> $APP_DIR"
CLONE_URL="$REPO_URL"
if [ -n "${GITHUB_TOKEN:-}" ]; then
  CLONE_URL="$(printf '%s' "$REPO_URL" | sed -E "s#https://#https://${GITHUB_TOKEN}@#")"
fi
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" remote set-url origin "$CLONE_URL"
  git -C "$APP_DIR" fetch --all --prune
  git -C "$APP_DIR" reset --hard "origin/${REPO_BRANCH:-main}"
else
  git clone -b "${REPO_BRANCH:-main}" "$CLONE_URL" "$APP_DIR"
fi
git -C "$APP_DIR" config --local credential.helper "" || true
ok "repo ready"

log "frontend deps + build"
cd "$APP_DIR"
[ -f .env ] || printf 'VITE_SUPABASE_URL=https://%s\nVITE_SUPABASE_PUBLISHABLE_KEY=\nVITE_SUPABASE_PROJECT_ID=selfhosted\n' "${APP_DOMAIN:-localhost}" > .env
pnpm install --frozen-lockfile || pnpm install
pnpm run build
ok "build done ($(du -sh dist | cut -f1))"

log "systemd service (static server on :3000)"
npm i -g serve >/dev/null 2>&1 || true
cat > /etc/systemd/system/smmpanel.service <<UNIT
[Unit]
Description=SMM Panel frontend (static)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$(command -v serve) -s dist -l 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now smmpanel
sleep 2
systemctl is-active --quiet smmpanel && ok "smmpanel service running on :3000" || die "smmpanel service start nahi hua: journalctl -u smmpanel -n 50"

log "PHASE 1 complete. Next: bash deploy/supabase-selfhost.sh"
