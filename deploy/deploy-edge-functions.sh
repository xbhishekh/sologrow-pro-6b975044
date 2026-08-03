#!/usr/bin/env bash
# PHASE 5 — saari edge functions self-hosted Edge Runtime pe + secrets.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
FN_SRC="$APP_DIR/supabase/functions"
FN_DST="$SUPABASE_DIR/docker/volumes/functions"
[ -d "$FN_SRC" ] || die "$FN_SRC nahi mila"

# Keep the DB-side rotation reservation in sync with the scheduler. Earlier
# deploys copied only edge-function code, so a VPS could run new scheduler code
# without the atomic unique lock and send duplicate orders to one provider.
ROTATION_LOCK_SQL="$APP_DIR/deploy/rotation-lock.sql"
[ -f "$ROTATION_LOCK_SQL" ] || die "$ROTATION_LOCK_SQL nahi mila"
log "same-link provider rotation lock -> database"
vpsql_file_soft "$ROTATION_LOCK_SQL"
ROTATION_LOCK_READY="$(vpsql -Atc "select case when to_regclass('public.uniq_active_rotation_lock') is not null and exists (select 1 from pg_trigger where tgname='trg_compute_rotation_lock_key' and tgrelid='public.organic_run_schedule'::regclass and not tgisinternal) then 'yes' else 'no' end;")"
[ "$ROTATION_LOCK_READY" = "yes" ] || die "provider rotation DB lock apply nahi hua"
ok "same link+type par same provider duplicate lock active"

log "functions copy: $FN_SRC -> $FN_DST"
mkdir -p "$FN_DST"
rsync -a --delete --exclude '*_test.ts' "$FN_SRC"/ "$FN_DST"/
# main router (edge-runtime ko chahiye)
if [ ! -f "$FN_DST/main/index.ts" ]; then
  mkdir -p "$FN_DST/main"
  cat > "$FN_DST/main/index.ts" <<'TS'
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
serve(async (req: Request) => {
  const url = new URL(req.url);
  const name = url.pathname.replace(/^\/+/, "").split("/")[0];
  if (!name) return new Response("ok", { status: 200 });
  try {
    const mod = `./../${name}/index.ts`;
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 256,
      workerTimeoutMs: 400_000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(req);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
TS
fi
ok "$(ls -1 "$FN_DST" | wc -l) functions staged"

log "secrets -> edge runtime env file"
ENVF="$SUPABASE_DIR/docker/functions.env"
# ZapUPI issues only one API key, but older VPS installs saved it under
# different names. Normalize it to the canonical name consumed by functions.
ZAPUPI_EFFECTIVE_KEY="${ZAPUPI_ZAP_KEY:-${ZAPUPI_TOKEN:-${ZAPUPI_API_KEY:-${ZAPUPI_KEY:-${ZAPUPI_SECRET:-}}}}}"
OXAPAY_EFFECTIVE_KEY="${OXAPAY_MERCHANT_API_KEY:-${OXAPAY_API_KEY:-${OXAPAY_KEY:-${OXAPAY_MERCHANT_KEY:-${OXAPAY_SECRET:-}}}}}"
{
  echo "SUPABASE_URL=https://$APP_DOMAIN"
  echo "SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "SUPABASE_DB_URL=postgresql://postgres:$POSTGRES_PASSWORD@db:5432/postgres"
  # app/provider secrets: sab non-Supabase keys /etc/smmpanel.secrets se
  grep -E '^[A-Z0-9_]+=' "$SECRETS_FILE" \
    | grep -vE '^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|CLOUD_|GITHUB_TOKEN|REPO_|APP_DIR|SUPABASE_DIR|POSTGRES_PORT)' || true
  if [ -n "$ZAPUPI_EFFECTIVE_KEY" ]; then
    printf 'ZAPUPI_ZAP_KEY=%s\n' "$ZAPUPI_EFFECTIVE_KEY"
  fi
  if [ -n "$OXAPAY_EFFECTIVE_KEY" ]; then
    printf 'OXAPAY_MERCHANT_API_KEY=%s\n' "$OXAPAY_EFFECTIVE_KEY"
  fi
} > "$ENVF"
chmod 600 "$ENVF"
ok "$(wc -l < "$ENVF") env vars"
if [ -n "$ZAPUPI_EFFECTIVE_KEY" ]; then
  ok "ZapUPI API key configured"
else
  log "WARNING: ZapUPI API key is missing in $SECRETS_FILE"
fi
if [ -n "$OXAPAY_EFFECTIVE_KEY" ]; then
  ok "OxaPay merchant API key configured"
else
  log "WARNING: OxaPay merchant API key is missing in $SECRETS_FILE"
fi
if grep -q '^TELEGRAM_BOT_TOKEN=.' "$ENVF" && grep -q '^TELEGRAM_CHAT_ID=.' "$ENVF"; then
  ok "Telegram bot token aur admin chat ID configured"
else
  log "WARNING: TELEGRAM_BOT_TOKEN ya TELEGRAM_CHAT_ID missing hai; payment alerts nahi aayenge"
fi

log "compose override for functions env"
cd "$SUPABASE_DIR/docker"
# Always pass the override explicitly. Some self-hosted installations set
# COMPOSE_FILE, in which case Docker does not auto-load docker-compose.override.yml.
BASE_COMPOSE="docker-compose.yml"
OVERRIDE_COMPOSE="docker-compose.override.yml"
[ -f "$BASE_COMPOSE" ] || die "$SUPABASE_DIR/docker/$BASE_COMPOSE nahi mila"
if [ -n "$ZAPUPI_EFFECTIVE_KEY" ]; then
  touch .env
  sed -i '/^ZAPUPI_ZAP_KEY=/d' .env
  printf 'ZAPUPI_ZAP_KEY=%s\n' "$ZAPUPI_EFFECTIVE_KEY" >> .env
fi
if [ -n "$OXAPAY_EFFECTIVE_KEY" ]; then
  touch .env
  sed -i '/^OXAPAY_MERCHANT_API_KEY=/d' .env
  printf 'OXAPAY_MERCHANT_API_KEY=%s\n' "$OXAPAY_EFFECTIVE_KEY" >> .env
fi
# Never rewrite the installation's own override file — a partial rewrite can
# drop other services and break the merged config. Instead write a small,
# self-contained overlay that only patches the `functions` service.
SMM_COMPOSE="docker-compose.smm-functions.yml"
cat > "$SMM_COMPOSE" <<'YML'
services:
  functions:
    env_file:
      - ./functions.env
    environment:
      ZAPUPI_ZAP_KEY: ${ZAPUPI_ZAP_KEY:-}
      OXAPAY_MERCHANT_API_KEY: ${OXAPAY_MERCHANT_API_KEY:-}
YML
# Some installations export COMPOSE_FILE / COMPOSE_PROFILES which silently
# changes which files docker compose reads. Neutralise that here.
unset COMPOSE_FILE COMPOSE_PATH_SEPARATOR

# Try candidate file combinations and use the first one that actually exposes
# a `functions` service. This survives installs where `functions` is defined
# only in the override file, or where the override does not merge cleanly.
pick_compose() {
  local -a candidates=()
  if [ -f "$OVERRIDE_COMPOSE" ]; then
    candidates+=("-f|$BASE_COMPOSE|-f|$OVERRIDE_COMPOSE|-f|$SMM_COMPOSE")
    candidates+=("-f|$OVERRIDE_COMPOSE|-f|$SMM_COMPOSE")
  fi
  candidates+=("-f|$BASE_COMPOSE|-f|$SMM_COMPOSE")
  candidates+=("-f|$BASE_COMPOSE")
  local c
  for c in "${candidates[@]}"; do
    local -a args=()
    IFS='|' read -r -a args <<< "$c"
    if docker compose "${args[@]}" config --services 2>/tmp/smm-compose-config.err \
         | grep -qx 'functions'; then
      COMPOSE=(docker compose "${args[@]}")
      return 0
    fi
  done
  return 1
}
if ! pick_compose; then
  log "compose files present:"; ls -1 *.yml *.yaml 2>/dev/null >&2 || true
  log "services seen in base compose:"
  docker compose -f "$BASE_COMPOSE" config --services >&2 2>/dev/null || true
  sed -n '1,40p' /tmp/smm-compose-config.err >&2 || true
  die "merged compose config me functions service nahi mili"
fi
# `docker compose up` does not recreate an existing container when only the
# env_file contents change. Force recreation so rotated/added keys are loaded.
"${COMPOSE[@]}" up -d --force-recreate --no-deps functions
sleep 5
FUNCTIONS_CONTAINER_ID="$("${COMPOSE[@]}" ps -q functions)"
[ -n "$FUNCTIONS_CONTAINER_ID" ] || die "functions container nahi mila"
key_in_container() {
  docker exec "$FUNCTIONS_CONTAINER_ID" printenv ZAPUPI_ZAP_KEY 2>/dev/null | grep -q '.' \
    || docker inspect "$FUNCTIONS_CONTAINER_ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
         2>/dev/null | grep -q '^ZAPUPI_ZAP_KEY=.'
}
if [ -n "$ZAPUPI_EFFECTIVE_KEY" ]; then
  if key_in_container; then
    ok "ZapUPI API key edge runtime me loaded"
  else
    die "ZapUPI key functions container me load nahi hui; merged compose config check karo"
  fi
fi
if [ -n "$OXAPAY_EFFECTIVE_KEY" ]; then
  if docker exec "$FUNCTIONS_CONTAINER_ID" printenv OXAPAY_MERCHANT_API_KEY 2>/dev/null | grep -q '.'; then
    ok "OxaPay merchant API key edge runtime me loaded"
  else
    die "OxaPay key functions container me load nahi hui; merged compose config check karo"
  fi
fi
if docker exec "$FUNCTIONS_CONTAINER_ID" printenv TELEGRAM_BOT_TOKEN 2>/dev/null | grep -q '.' \
  && docker exec "$FUNCTIONS_CONTAINER_ID" printenv TELEGRAM_CHAT_ID 2>/dev/null | grep -q '.'; then
  ok "Telegram settings edge runtime me loaded"
else
  die "Telegram bot token/chat ID functions container me load nahi hua"
fi

log "Telegram payment-alert smoke test"
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-${TELEGRAM_TOKEN:-}}"
TG_CHAT="${TELEGRAM_CHAT_ID:-}"
[ -n "$TG_TOKEN" ] || die "TELEGRAM_BOT_TOKEN missing hai"
[ -n "$TG_CHAT" ] || die "TELEGRAM_CHAT_ID missing hai"
TG_TEST_RESPONSE="$(curl -sS --max-time 20 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"chat_id":sys.argv[1],"text":"✅ OrganicSMM payment alerts are working."}))' "$TG_CHAT")" || true)"
if printf '%s' "$TG_TEST_RESPONSE" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
  ok "Telegram test message admin chat me bhej diya"
else
  TG_ERROR="$(printf '%s' "$TG_TEST_RESPONSE" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("description","unknown Telegram error"))' 2>/dev/null || echo 'Telegram API unreachable')"
  die "Telegram test failed: $TG_ERROR"
fi
ok "edge runtime restarted"

log "smoke test"
curl -s -o /dev/null -w "  /functions/v1/cron-status -> HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" "http://127.0.0.1:8000/functions/v1/cron-status" || true
log "PHASE 5 complete. Next: Caddy/domain (setup-caddy.sh)"
