#!/usr/bin/env bash
# Repair frontend/backend anon-key mismatch for this OrganicSMM installation only.
# Does not touch other projects, databases, users, passwords, or wallet data.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

# 1. PREFER CURRENT DIRECTORY: Prevent stale bundle by using the repo we are running from.
if [ -f "package.json" ] && [ -d "deploy" ]; then
  CURRENT_DIR="$(pwd)"
  if [ "$CURRENT_DIR" != "${APP_DIR:-}" ]; then
    log "Using current directory as APP_DIR: $CURRENT_DIR"
    APP_DIR="$CURRENT_DIR"
  fi
fi

STACK_ENV="$SUPABASE_DIR/docker/.env"
[ -f "$STACK_ENV" ] || die "stack env missing: $STACK_ENV"

# 2. INHERIT FROM SERVICE: If a service is already running elsewhere, we MUST know.
SERVICE_APP_DIR=$(systemctl show smmpanel -p WorkingDirectory --value 2>/dev/null || true)
if [ -n "$SERVICE_APP_DIR" ] && [ "$SERVICE_APP_DIR" != "[not set]" ] && [ -d "$SERVICE_APP_DIR" ]; then
  # If the service path differs from our detected APP_DIR, the service wins (it's the active one).
  # Unless the user explicitly wanted to move the app by running from a new dir.
  # For repair, we stay with the active service to ensure we are actually repairing the live site.
  APP_DIR="$SERVICE_APP_DIR"
fi
[ -f "$APP_DIR/package.json" ] || die "OrganicSMM app not found at APP_DIR: $APP_DIR"

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

# Auth can briefly look healthy while its DB connection is still unavailable,
# then Kong starts returning 502 on the real login route. Start and verify the
# database first; this never recreates the DB or its volume.
docker compose up -d db
DB_READY=0
for _ in $(seq 1 45); do
  if docker compose exec -T db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; then
    DB_READY=1
    break
  fi
  sleep 2
done
[ "$DB_READY" = "1" ] || die "database did not become ready; auth was not restarted"
ok "database ready"

docker compose up -d --force-recreate kong auth rest functions

AUTH_CODE="000"
AUTH_STABLE=0
for _ in $(seq 1 45); do
  AUTH_CODE=$(curl -sS --max-time 10 -o /tmp/organicsmm-auth-local.json -w '%{http_code}' \
    -X POST "http://127.0.0.1:8000/auth/v1/token?grant_type=password" \
    -H "apikey: $STACK_ANON_KEY" -H 'Content-Type: application/json' \
    --data '{"email":"login-health-probe@invalid.example","password":"not-a-real-password"}' || true)
  if [ "$AUTH_CODE" = "400" ] && grep -q 'invalid_credentials' /tmp/organicsmm-auth-local.json 2>/dev/null; then
    AUTH_STABLE=$((AUTH_STABLE + 1))
    [ "$AUTH_STABLE" -ge 3 ] && break
  else
    AUTH_STABLE=0
  fi
  sleep 2
done
if [ "$AUTH_STABLE" -lt 3 ]; then
  printf '%s\n' "--- auth service logs ---"
  docker compose logs --tail=50 auth || true
  rm -f /tmp/organicsmm-auth-local.json
  die "password-login backend unhealthy after restart (HTTP $AUTH_CODE)"
fi
rm -f /tmp/organicsmm-auth-local.json
ok "backend password-login route stable and key accepted"

# Password login depends on healthy legacy user/identity rows too. Repair them
# when the original migration export is available; do not fail fresh installs.
if [ -s /opt/migration/06_auth_users.json ]; then
  log "legacy login records repair"
  SECRETS_FILE="$SECRETS_FILE" OUT=/opt/migration bash "$APP_DIR/deploy/repair-old-user-login.sh"
else
  log "legacy auth export not present; skipping old-user row repair"
fi

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

# Vite gives already-exported shell variables higher priority than .env.
export VITE_SUPABASE_URL="https://$APP_DOMAIN"
export VITE_SUPABASE_PUBLISHABLE_KEY="$STACK_ANON_KEY"
export VITE_SUPABASE_PROJECT_ID="selfhosted"

log "frontend rebuild (only smmpanel service will restart)"
cd "$APP_DIR"
# VPS currently runs Node 20. pnpm 11 requires Node 22 and crashes while
# loading node:sqlite, so use the committed npm lockfile for a reproducible
# Node 20-compatible build instead of relying on the globally selected pnpm.
npm ci --legacy-peer-deps
rm -rf dist-new dist-old
npm exec -- vite build --outDir dist-new --emptyOutDir
[ -f dist-new/index.html ] || die "build output missing; old site unchanged"
[ -d dist ] && mv dist dist-old
mv dist-new dist
rm -rf dist-old

# Ensure any stale process on port 3000 is killed before restart
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp >/dev/null 2>&1 || true
fi

NODE_BIN=$(command -v node)
[ -x "$NODE_BIN" ] || die "node executable not found"

# Smoke-test the static server in the foreground first, so a crash shows the
# real error instead of hiding behind systemd's restart loop.
log "static server smoke test (node $("$NODE_BIN" -v 2>/dev/null || echo unknown))"
SMOKE_LOG=$(mktemp)
"$NODE_BIN" "$APP_DIR/deploy/static-server.mjs" "$APP_DIR/dist" 3000 >"$SMOKE_LOG" 2>&1 &
SMOKE_PID=$!
SMOKE_OK=0
for _ in $(seq 1 10); do
  if curl -sS -o /dev/null "http://127.0.0.1:3000/" 2>/dev/null; then SMOKE_OK=1; break; fi
  kill -0 "$SMOKE_PID" 2>/dev/null || break
  sleep 1
done
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
if [ "$SMOKE_OK" != "1" ]; then
  printf '%s\n' "--- static-server output ---"
  cat "$SMOKE_LOG" || true
  printf '%s\n' "--- port 3000 holders ---"
  (ss -ltnp 2>/dev/null | grep ':3000' || echo "nothing listening on 3000")
  rm -f "$SMOKE_LOG"
  die "static server cannot bind/serve on port 3000 (see output above)"
fi
rm -f "$SMOKE_LOG"
ok "static server smoke test passed"

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
PrivateTmp=false

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable smmpanel >/dev/null 2>&1
systemctl restart smmpanel || true

# Wait for bind
FRONT_CODE="000"
for i in $(seq 1 20); do
  FRONT_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/" 2>/dev/null || true)
  [ "$FRONT_CODE" = "200" ] && break
  if [ "$i" = "5" ]; then
    printf '%s\n' "--- early smmpanel logs ---"
    journalctl -u smmpanel -n 30 --no-pager || true
  fi
  sleep 2
done
if [ "$FRONT_CODE" != "200" ]; then
  printf '%s\n' "--- smmpanel service status ---"
  systemctl status smmpanel --no-pager -n 30 || true
  journalctl -u smmpanel -n 40 --no-pager || true
  die "frontend not serving on 127.0.0.1:3000 (HTTP $FRONT_CODE) — Caddy will return 502"
fi
ok "frontend up on 127.0.0.1:3000"

# Stability check
sleep 3
systemctl is-active --quiet smmpanel || {
  journalctl -u smmpanel -n 50 --no-pager || true
  die "frontend crashed after startup"
}

# Prove the build itself contains the accepted key before touching Caddy.
grep -FRlq -- "$STACK_ANON_KEY" "$APP_DIR/dist/assets" || die "fresh local build does not contain accepted backend key"
ok "fresh local build contains accepted key"

# Repair ONLY this domain's Caddy block. Preserve every other hosted website.
CADDY_FILE=/etc/caddy/Caddyfile
[ -f "$CADDY_FILE" ] || die "Caddyfile missing: $CADDY_FILE"
cp "$CADDY_FILE" "${CADDY_FILE}.before-login-repair"
APP_DOMAIN="$APP_DOMAIN" python3 - "$CADDY_FILE" <<'PY'
import os, re, sys
from pathlib import Path

path = Path(sys.argv[1])
domain = os.environ["APP_DOMAIN"]
text = path.read_text()
replacement = f'''{domain} {{
\tencode zstd gzip
\t@organicsmm_api path /rest/v1/* /auth/v1/* /functions/v1/* /storage/v1/* /realtime/v1/* /graphql/v1/*
\thandle @organicsmm_api {{
\t\treverse_proxy 127.0.0.1:8000
\t}}
\thandle {{
\t\treverse_proxy 127.0.0.1:3000
\t}}
}}'''

# Find an exact site-address line, then replace its balanced block.
match = re.search(r"(?m)^\s*" + re.escape(domain) + r"\s*\{", text)
if match:
    start = match.start()
    brace = text.find("{", match.start(), match.end())
    depth = 0
    end = None
    for index in range(brace, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise SystemExit(f"unbalanced Caddy block for {domain}")
    text = text[:start] + replacement + text[end:]
else:
    text = text.rstrip() + "\n\n" + replacement + "\n"
path.write_text(text)
PY

caddy fmt --overwrite "$CADDY_FILE"
if ! caddy validate --config "$CADDY_FILE"; then
  cp "${CADDY_FILE}.before-login-repair" "$CADDY_FILE"
  die "OrganicSMM Caddy route invalid; original config restored"
fi
systemctl reload caddy
ok "OrganicSMM Caddy route pinned to ports 3000/8000; other sites preserved"

# Install a lightweight recurring guard. It only performs the expensive repair
# when stack secrets, running auth, and the frontend bundle stop matching.
if [ "${AUTH_GUARD_INSTALL:-1}" = "1" ]; then
  chmod 750 "$APP_DIR/deploy/auth-key-guard.sh"
  cat > /etc/systemd/system/organicsmm-auth-key-guard.service <<UNIT
[Unit]
Description=OrganicSMM auth key consistency guard
After=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env bash $APP_DIR/deploy/auth-key-guard.sh
UNIT
  cat > /etc/systemd/system/organicsmm-auth-key-guard.timer <<'UNIT'
[Unit]
Description=Check OrganicSMM auth keys every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
RandomizedDelaySec=20

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now organicsmm-auth-key-guard.timer >/dev/null
  ok "permanent auth-key guard enabled (every 5 minutes)"
fi

# Verify this VPS directly, bypassing public DNS/CDN. Comparing the asset name
# is more reliable than grepping one guessed public script.
EXPECTED_JS=$(grep -oE 'src="[^"]+\.js[^"]*"' "$APP_DIR/dist/index.html" | tail -n 1 | cut -d'"' -f2)
[ -n "$EXPECTED_JS" ] || die "fresh build JS reference missing"
LOCAL_CADDY_HTML=$(curl -kfsS --resolve "$APP_DOMAIN:443:127.0.0.1" \
  -H 'Cache-Control: no-cache' "https://$APP_DOMAIN/?login-repair=$(date +%s)" || true)
printf '%s' "$LOCAL_CADDY_HTML" | grep -Fq "$EXPECTED_JS" || die "local Caddy is not serving the fresh OrganicSMM build"
ok "local Caddy serves fresh OrganicSMM bundle"

# Verify the exact public password-login path. Invalid dummy credentials must
# reach GoTrue and return 400; 401/500/502 means login infrastructure is broken.
LOGIN_CODE=$(curl -sS -o /tmp/organicsmm-login-probe.json -w '%{http_code}' \
  -X POST "https://$APP_DOMAIN/auth/v1/token?grant_type=password" \
  -H "apikey: $STACK_ANON_KEY" -H 'Content-Type: application/json' \
  --data '{"email":"login-health-probe@invalid.example","password":"not-a-real-password"}' || true)
[ "$LOGIN_CODE" = "400" ] || die "public password-login route unhealthy (HTTP $LOGIN_CODE)"
grep -q 'invalid_credentials' /tmp/organicsmm-login-probe.json \
  || die "public password-login route returned an unexpected response"
rm -f /tmp/organicsmm-login-probe.json
ok "public password-login route healthy"

# Public DNS may be proxied/cached or point at another VPS. Report that clearly
# without falsely claiming that this server or port 3000 failed.
PUBLIC_HTML=$(curl -fsS -H 'Cache-Control: no-cache' "https://$APP_DOMAIN/?login-repair=$(date +%s)" || true)
if printf '%s' "$PUBLIC_HTML" | grep -Fq "$EXPECTED_JS"; then
  ok "public domain serves fresh bundle"
else
  printf '\033[1;33m[WARN]\033[0m VPS is repaired, but public domain is reaching another/cached server. Check this domain A record points to this VPS IP.\n'
fi

ok "LOGIN KEY REPAIRED — users/passwords/data unchanged"
echo "Ab browser me hard refresh karke login test karo (Ctrl+Shift+R)."
