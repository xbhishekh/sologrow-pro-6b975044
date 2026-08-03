#!/usr/bin/env bash
# Repair frontend/backend anon-key mismatch for this OrganicSMM installation only.
# Does not touch other projects, databases, users, passwords, or wallet data.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

STACK_ENV="$SUPABASE_DIR/docker/.env"
[ -f "$STACK_ENV" ] || die "stack env missing: $STACK_ENV"

# The running backend stack is the source of truth. Never print the key.
STACK_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$STACK_ENV" | tail -n 1)
[ -n "$STACK_ANON_KEY" ] || die "ANON_KEY missing in $STACK_ENV"

log "OrganicSMM auth gateway key verify"
AUTH_CODE=$(curl -sS -o /tmp/organicsmm-auth-health.json -w '%{http_code}' \
  -H "apikey: $STACK_ANON_KEY" \
  "http://127.0.0.1:8000/auth/v1/health" || true)
[ "$AUTH_CODE" = "200" ] || die "running backend rejected its stack key (HTTP $AUTH_CODE); no changes made"
ok "backend key valid"

log "OrganicSMM secrets + frontend env sync"
tmp_secrets=$(mktemp)
awk '!/^ANON_KEY=/' "$SECRETS_FILE" > "$tmp_secrets"
printf 'ANON_KEY=%s\n' "$STACK_ANON_KEY" >> "$tmp_secrets"
cat "$tmp_secrets" > "$SECRETS_FILE"
rm -f "$tmp_secrets"
chmod 600 "$SECRETS_FILE"

mkdir -p "$APP_DIR"
tmp_env=$(mktemp)
if [ -f "$APP_DIR/.env" ]; then
  grep -vE '^VITE_SUPABASE_(URL|PUBLISHABLE_KEY|PROJECT_ID)=' "$APP_DIR/.env" > "$tmp_env" || true
fi
printf 'VITE_SUPABASE_URL=https://%s\n' "$APP_DOMAIN" >> "$tmp_env"
printf 'VITE_SUPABASE_PUBLISHABLE_KEY=%s\n' "$STACK_ANON_KEY" >> "$tmp_env"
printf 'VITE_SUPABASE_PROJECT_ID=selfhosted\n' >> "$tmp_env"
cat "$tmp_env" > "$APP_DIR/.env"
rm -f "$tmp_env"

log "frontend rebuild (only smmpanel service will restart)"
cd "$APP_DIR"
pnpm install --frozen-lockfile || pnpm install
rm -rf dist-new dist-old
pnpm exec vite build --outDir dist-new --emptyOutDir
[ -f dist-new/index.html ] || die "build output missing; old site unchanged"
[ -d dist ] && mv dist dist-old
mv dist-new dist
rm -rf dist-old
systemctl restart smmpanel
systemctl is-active --quiet smmpanel || die "smmpanel failed to restart"

PUBLIC_CODE=$(curl -sS -o /tmp/organicsmm-public-auth-health.json -w '%{http_code}' \
  -H "apikey: $STACK_ANON_KEY" "https://$APP_DOMAIN/auth/v1/health" || true)
[ "$PUBLIC_CODE" = "200" ] || die "public auth health failed after repair (HTTP $PUBLIC_CODE)"

ok "LOGIN KEY REPAIRED — users/passwords/data unchanged"
echo "Ab browser me hard refresh karke login test karo (Ctrl+Shift+R)."