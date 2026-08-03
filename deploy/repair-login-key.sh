#!/usr/bin/env bash
# Repair frontend/backend anon-key mismatch for this OrganicSMM installation only.
# Does not touch other projects, databases, users, passwords, or wallet data.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

STACK_ENV="$SUPABASE_DIR/docker/.env"
[ -f "$STACK_ENV" ] || die "stack env missing: $STACK_ENV"

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
systemctl restart smmpanel
systemctl is-active --quiet smmpanel || die "smmpanel failed to restart"

PUBLIC_CODE=$(curl -sS -o /tmp/organicsmm-public-auth-health.json -w '%{http_code}' \
  -H "apikey: $STACK_ANON_KEY" "https://$APP_DOMAIN/auth/v1/health" || true)
[ "$PUBLIC_CODE" = "200" ] || die "public auth health failed after repair (HTTP $PUBLIC_CODE)"

ok "LOGIN KEY REPAIRED — users/passwords/data unchanged"
echo "Ab browser me hard refresh karke login test karo (Ctrl+Shift+R)."