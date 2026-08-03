#!/usr/bin/env bash
# ATOMIC UPDATE — git pull -> dist-new me build -> success pe hi dist swap -> restart.
# Zero downtime, stale/broken bundle kabhi serve nahi hoga.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
# Prefer current directory if it contains package.json and we are not already in it
if [ -f "package.json" ] && [ -d "deploy" ]; then
  CURRENT_DIR="$(pwd)"
  if [ "$CURRENT_DIR" != "${APP_DIR:-}" ]; then
    log "Using current directory as APP_DIR: $CURRENT_DIR"
    APP_DIR="$CURRENT_DIR"
  fi
fi
cd "$APP_DIR"

log "git pull"
git fetch --all --prune
git reset --hard "origin/${REPO_BRANCH:-main}"
ok "$(git log -1 --oneline)"

log "deps"
pnpm install --frozen-lockfile || pnpm install

log "build -> dist-new (atomic)"
rm -rf dist-new dist-old
if ! pnpm exec vite build --outDir dist-new --emptyOutDir; then
  rm -rf dist-new
  die "BUILD FAIL — purana dist chalu hai, site down nahi hui"
fi
[ -f dist-new/index.html ] || { rm -rf dist-new; die "dist-new/index.html missing — swap abort"; }
ok "build ok ($(du -sh dist-new | cut -f1))"

log "swap"
[ -d dist ] && mv dist dist-old
mv dist-new dist
rm -rf dist-old
ok "dist swapped"

log "edge functions sync"
bash "$(dirname "$0")/deploy-edge-functions.sh" >/dev/null 2>&1 && ok "functions redeployed" || log "functions sync skip"

log "restart"
systemctl restart smmpanel
sleep 2
systemctl is-active --quiet smmpanel || die "service down: journalctl -u smmpanel -n 50"
curl -s -o /dev/null -w "  https://${APP_DOMAIN} -> %{http_code}\n" "https://${APP_DOMAIN}" || true
ok "UPDATE COMPLETE"
