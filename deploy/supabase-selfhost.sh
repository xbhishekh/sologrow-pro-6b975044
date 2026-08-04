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
# Never silently reuse keys that were signed by a different JWT secret.
KEYS_MATCH_JWT=0
if [ -n "${ANON_KEY:-}" ] && [ -n "${SERVICE_ROLE_KEY:-}" ]; then
  if JWT_SECRET_TO_CHECK="$JWT_SECRET" ANON_TO_CHECK="$ANON_KEY" SERVICE_TO_CHECK="$SERVICE_ROLE_KEY" node -e '
    const c=require("crypto");
    const valid=(token,role)=>{const p=token.split("."); if(p.length!==3)return false;
      const s=c.createHmac("sha256",process.env.JWT_SECRET_TO_CHECK).update(p[0]+"."+p[1]).digest("base64url");
      const a=Buffer.from(s),b=Buffer.from(p[2]); if(a.length!==b.length||!c.timingSafeEqual(a,b))return false;
      return JSON.parse(Buffer.from(p[1],"base64url").toString()).role===role;};
    if(!valid(process.env.ANON_TO_CHECK,"anon")||!valid(process.env.SERVICE_TO_CHECK,"service_role"))process.exit(1);' >/dev/null 2>&1; then
    KEYS_MATCH_JWT=1
  fi
fi
if [ "$KEYS_MATCH_JWT" != "1" ]; then
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

# Payment/provider variables must survive every ordinary stack recreation.
# Compose reads these values even when deployment is run outside this script.
ZAPUPI_EFFECTIVE_KEY="${ZAPUPI_ZAP_KEY:-${ZAPUPI_TOKEN:-${ZAPUPI_API_KEY:-${ZAPUPI_KEY:-${ZAPUPI_SECRET:-}}}}}"
[ -n "$ZAPUPI_EFFECTIVE_KEY" ] || die "ZAPUPI_ZAP_KEY $SECRETS_FILE me missing hai"
setenv ZAPUPI_ZAP_KEY "$ZAPUPI_EFFECTIVE_KEY"

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
  # ORGANICSMM_FUNCTIONS_ENV
  functions:
    env_file:
      - ./functions.env
    environment:
      ZAPUPI_ZAP_KEY: \${ZAPUPI_ZAP_KEY:-}
YML

# Edge Runtime gets the same canonical key on first install and on rebuilds.
touch functions.env
sed -i '/^ZAPUPI_ZAP_KEY=/d' functions.env
printf 'ZAPUPI_ZAP_KEY=%s\n' "$ZAPUPI_EFFECTIVE_KEY" >> functions.env
chmod 600 functions.env

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
