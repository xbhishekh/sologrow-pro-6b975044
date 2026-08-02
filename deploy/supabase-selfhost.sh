#!/usr/bin/env bash
# PHASE 2 — Self-hosted Supabase stack (docker compose). Idempotent.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
need docker

log "supabase repo -> $SUPABASE_DIR"
if [ ! -d "$SUPABASE_DIR/docker" ]; then
  mkdir -p "$(dirname "$SUPABASE_DIR")"
  git clone --depth 1 https://github.com/supabase/supabase "$SUPABASE_DIR.src"
  mkdir -p "$SUPABASE_DIR"
  cp -r "$SUPABASE_DIR.src/docker/." "$SUPABASE_DIR/docker/" 2>/dev/null || { mkdir -p "$SUPABASE_DIR/docker"; cp -r "$SUPABASE_DIR.src/docker/." "$SUPABASE_DIR/docker/"; }
  rm -rf "$SUPABASE_DIR.src"
fi
cd "$SUPABASE_DIR/docker"

# ---- JWT keys: generate ANON/SERVICE_ROLE automatically from JWT_SECRET ----
if [ -z "${ANON_KEY:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  log "ANON_KEY / SERVICE_ROLE_KEY generate kar raha hoon"
  KEYS_JSON=$(JWT_SECRET="$JWT_SECRET" node -e '
    const c=require("crypto");
    const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const sign=(role)=>{const h=b({alg:"HS256",typ:"JWT"});
      const iat=Math.floor(Date.now()/1000), exp=iat+60*60*24*365*10;
      const p=b({role,iss:"supabase",iat,exp});
      const s=c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url");
      return h+"."+p+"."+s;};
    console.log(JSON.stringify({anon:sign("anon"),service:sign("service_role")}));')
  ANON_KEY=$(echo "$KEYS_JSON" | jq -r .anon)
  SERVICE_ROLE_KEY=$(echo "$KEYS_JSON" | jq -r .service)
  sed -i "/^ANON_KEY=/d;/^SERVICE_ROLE_KEY=/d" "$SECRETS_FILE"
  printf 'ANON_KEY=%s\nSERVICE_ROLE_KEY=%s\n' "$ANON_KEY" "$SERVICE_ROLE_KEY" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  ok "keys generated + $SECRETS_FILE me save"
fi

log ".env for supabase stack"
[ -f .env ] || cp .env.example .env
setenv() { grep -q "^$1=" .env && sed -i "s|^$1=.*|$1=$2|" .env || echo "$1=$2" >> .env; }
setenv POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
setenv POSTGRES_PORT     "5432"          # inside docker network
setenv JWT_SECRET        "$JWT_SECRET"
setenv ANON_KEY          "$ANON_KEY"
setenv SERVICE_ROLE_KEY  "$SERVICE_ROLE_KEY"
setenv SITE_URL          "${SITE_URL:-https://$APP_DOMAIN}"
setenv API_EXTERNAL_URL  "${API_EXTERNAL_URL:-https://$APP_DOMAIN}"
setenv SUPABASE_PUBLIC_URL "${API_EXTERNAL_URL:-https://$APP_DOMAIN}"
setenv KONG_HTTP_PORT    "8000"
setenv KONG_HTTPS_PORT   "8443"
setenv ENABLE_EMAIL_AUTOCONFIRM "true"
setenv DISABLE_SIGNUP    "false"
setenv ADDITIONAL_REDIRECT_URLS "https://$APP_DOMAIN,https://$APP_DOMAIN/**"

# CRITICAL: host 5432 conflict -> map Postgres to $POSTGRES_PORT (default 5433)
log "postgres host port -> $POSTGRES_PORT (5432 conflict avoid)"
mkdir -p .
cat > docker-compose.override.yml <<YML
services:
  db:
    ports:
      - "127.0.0.1:${POSTGRES_PORT}:5432"
  kong:
    ports: !override
      - "127.0.0.1:8000:8000/tcp"
      - "127.0.0.1:8443:8443/tcp"
YML

log "docker compose pull + up"
docker compose pull
docker compose up -d
ok "stack up"

log "health wait"
for i in $(seq 1 60); do
  if vpsql -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 2
done
vpsql -c 'select version();' >/dev/null || die "Postgres reachable nahi hai (container: ${DB_CONTAINER:-supabase-db})"
ok "Postgres OK (via db container)"
curl -fsS -o /dev/null "http://127.0.0.1:8000/rest/v1/" -H "apikey: $ANON_KEY" && ok "Kong+PostgREST OK :8000" || log "Kong warm-up ho raha hai, 30s baad dobara check karna"

log "frontend .env update"
cd "$APP_DIR"
cat > .env <<ENV
VITE_SUPABASE_URL=https://$APP_DOMAIN
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=selfhosted
ENV
ok "$APP_DIR/.env written (anon key auto)"

log "PHASE 2 complete. Next: bash deploy/import-all.sh"
