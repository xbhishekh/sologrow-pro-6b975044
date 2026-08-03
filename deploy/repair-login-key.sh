#!/usr/bin/env bash
# Repair frontend/backend anon-key mismatch for this OrganicSMM installation only.
# Does not touch other projects, databases, users, passwords, or wallet data.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

STACK_ENV="$SUPABASE_DIR/docker/.env"
[ -f "$STACK_ENV" ] || die "stack env missing: $STACK_ENV"

# Build exactly where the running OrganicSMM systemd service serves from.
# A stale/wrong APP_DIR was the reason an apparently successful rebuild could
# leave the public website on the old bundle.
SERVICE_APP_DIR=$(systemctl show smmpanel -p WorkingDirectory --value 2>/dev/null || true)
if [ -n "$SERVICE_APP_DIR" ] && [ -d "$SERVICE_APP_DIR" ]; then
  APP_DIR="$SERVICE_APP_DIR"
fi
[ -f "$APP_DIR/package.json" ] || die "OrganicSMM app not found at service WorkingDirectory: $APP_DIR"

# Generate both API keys from this stack's actual JWT secret. This repairs the
# case where docker/.env contains a stale ANON_KEY after JWT_SECRET changed.
STACK_JWT_SECRET=$(sed -n 's/^JWT_SECRET=//p' "$STACK_ENV" | tail -n 1)
[ -n "$STACK_JWT_SECRET" ] || die "JWT_SECRET missing in $STACK_ENV"
KEYS_JSON=$(JWT_SECRET="$STACK_JWT_SECRET" node -e '
  const c=require("crypto");
  const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
  const sign=(role)=>{const h=b({alg:"HS256",typ:"JWT"});
    const iat=Math.floor(Date.now()/1000), exp=iat+60*60*24*365*10;
    const p=b({role,iss:"supabase",iat,exp});
    const s=c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url");
    return h+"."+p+"."+s;};
  console.log(JSON.stringify({anon:sign("anon"),service:sign("service_role")}));')
STACK_ANON_KEY=$(printf '%s' "$KEYS_JSON" | jq -r .anon)
STACK_SERVICE_KEY=$(printf '%s' "$KEYS_JSON" | jq -r .service)
[ -n "$STACK_ANON_KEY" ] && [ -n "$STACK_SERVICE_KEY" ] || die "key generation failed"

log "OrganicSMM secrets + frontend env sync"
tmp_secrets=$(mktemp)
awk '!/^(ANON_KEY|SERVICE_ROLE_KEY)=/' "$SECRETS_FILE" > "$tmp_secrets"
printf 'ANON_KEY=%s\nSERVICE_ROLE_KEY=%s\n' "$STACK_ANON_KEY" "$STACK_SERVICE_KEY" >> "$tmp_secrets"
cat "$tmp_secrets" > "$SECRETS_FILE"
rm -f "$tmp_secrets"
chmod 600 "$SECRETS_FILE"

tmp_stack=$(mktemp)
awk '!/^(ANON_KEY|SERVICE_ROLE_KEY)=/' "$STACK_ENV" > "$tmp_stack"
printf 'ANON_KEY=%s\nSERVICE_ROLE_KEY=%s\n' "$STACK_ANON_KEY" "$STACK_SERVICE_KEY" >> "$tmp_stack"
cat "$tmp_stack" > "$STACK_ENV"
rm -f "$tmp_stack"

log "OrganicSMM auth services recreate"
cd "$SUPABASE_DIR/docker"
# load_secrets exported the previous values before we regenerated them.
# Docker Compose gives exported shell variables precedence over docker/.env,
# so explicitly replace them or Kong/Auth would restart with the old keys.
export JWT_SECRET="$STACK_JWT_SECRET"
export ANON_KEY="$STACK_ANON_KEY"
export SERVICE_ROLE_KEY="$STACK_SERVICE_KEY"
# Compose labels isolate this operation to this Supabase stack. No other
# website's compose project or containers are selected.
docker compose up -d --force-recreate kong auth rest functions

AUTH_CODE="000"
for _ in $(seq 1 30); do
  AUTH_CODE=$(curl -sS -o /tmp/organicsmm-auth-health.json -w '%{http_code}' \
    -H "apikey: $STACK_ANON_KEY" "http://127.0.0.1:8000/auth/v1/health" || true)
  [ "$AUTH_CODE" = "200" ] && break
  sleep 2
done
[ "$AUTH_CODE" = "200" ] || die "regenerated key still rejected locally (HTTP $AUTH_CODE)"
ok "backend key regenerated and accepted"

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

# Replace the globally-installed `serve` process with our dependency-free
# static server. Global npm packages can disappear/change after Node upgrades,
# which was causing intermittent port 3000 failures and public 502 responses.
NODE_BIN=$(command -v node)
[ -x "$NODE_BIN" ] || die "node executable not found"
cat > /etc/systemd/system/smmpanel.service <<UNIT
[Unit]
Description=OrganicSMM frontend (static)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/deploy/static-server.mjs $APP_DIR/dist 3000
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable smmpanel >/dev/null 2>&1
systemctl restart smmpanel
systemctl is-active --quiet smmpanel || die "smmpanel failed to restart"

# The frontend server needs a moment to bind 127.0.0.1:3000 after restart.
# Until it does, Caddy answers 502 — so wait instead of failing instantly.
FRONT_CODE="000"
for _ in $(seq 1 30); do
  FRONT_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/" || true)
  [ "$FRONT_CODE" = "200" ] && break
  sleep 2
done
if [ "$FRONT_CODE" != "200" ]; then
  printf '%s\n' "--- smmpanel service status ---"
  systemctl status smmpanel --no-pager -n 30 || true
  journalctl -u smmpanel -n 40 --no-pager || true
  die "frontend not serving on 127.0.0.1:3000 (HTTP $FRONT_CODE) — Caddy will return 502"
fi
ok "frontend up on 127.0.0.1:3000"

# It must remain alive, not merely answer once and then crash.
sleep 3
systemctl is-active --quiet smmpanel || {
  journalctl -u smmpanel -n 50 --no-pager || true
  die "frontend crashed after startup"
}
STABLE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/" || true)
[ "$STABLE_CODE" = "200" ] || die "frontend became unavailable after startup (HTTP $STABLE_CODE)"

PUBLIC_CODE=$(curl -sS -o /tmp/organicsmm-public-auth-health.json -w '%{http_code}' \
  -H "apikey: $STACK_ANON_KEY" "https://$APP_DOMAIN/auth/v1/health" || true)
[ "$PUBLIC_CODE" = "200" ] || die "public auth health failed after repair (HTTP $PUBLIC_CODE)"

# Prove that the public HTML references the freshly-built bundle and that its
# embedded browser key is accepted. Never print either key.
PUBLIC_HTML=$(curl -fsS -H 'Cache-Control: no-cache' "https://$APP_DOMAIN/?login-repair=$(date +%s)" || true)
[ -n "$PUBLIC_HTML" ] || die "public site unreachable (Caddy 502?) — check: systemctl status smmpanel"
PUBLIC_JS_PATH=$(printf '%s' "$PUBLIC_HTML" | grep -oE 'src="[^"]+\.js[^"]*"' | tail -n 1 | cut -d'"' -f2)
[ -n "$PUBLIC_JS_PATH" ] || die "public JS bundle not found"
case "$PUBLIC_JS_PATH" in
  http*) PUBLIC_JS_URL="$PUBLIC_JS_PATH" ;;
  /*) PUBLIC_JS_URL="https://$APP_DOMAIN$PUBLIC_JS_PATH" ;;
  *) PUBLIC_JS_URL="https://$APP_DOMAIN/$PUBLIC_JS_PATH" ;;
esac
PUBLIC_JS=$(curl -fsS -H 'Cache-Control: no-cache' "$PUBLIC_JS_URL")
printf '%s' "$PUBLIC_JS" | grep -Fq "$STACK_ANON_KEY" || die "public site still serves stale bundle; check Caddy upstream and smmpanel WorkingDirectory"
ok "public bundle contains current accepted key"

ok "LOGIN KEY REPAIRED — users/passwords/data unchanged"
echo "Ab browser me hard refresh karke login test karo (Ctrl+Shift+R)."