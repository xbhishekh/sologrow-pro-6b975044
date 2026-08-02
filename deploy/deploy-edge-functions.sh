#!/usr/bin/env bash
# PHASE 5 — saari edge functions self-hosted Edge Runtime pe + secrets.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
FN_SRC="$APP_DIR/supabase/functions"
FN_DST="$SUPABASE_DIR/docker/volumes/functions"
[ -d "$FN_SRC" ] || die "$FN_SRC nahi mila"

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
OXAPAY_EFFECTIVE_KEY="${OXAPAY_MERCHANT_API_KEY:-}"
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
python3 - <<'PY'
import os, json
p = 'docker-compose.override.yml'
data = {}
if os.path.exists(p):
    try:
        import yaml
        data = yaml.safe_load(open(p).read()) or {}
    except Exception:
        data = {}
if not isinstance(data, dict):
    data = {}
svcs = data.get('services') or {}
fn = svcs.get('functions') or {}
envf = fn.get('env_file') or []
if isinstance(envf, str):
    envf = [envf]
if './functions.env' not in envf:
    envf.append('./functions.env')
fn['env_file'] = envf
# Keep an explicit mapping as well. Compose resolves it from docker/.env;
# this also overrides an empty value inherited from the base compose file.
env = fn.get('environment') or {}
if isinstance(env, list):
    env = dict(e.split('=', 1) for e in env if '=' in e)
env['ZAPUPI_ZAP_KEY'] = '${ZAPUPI_ZAP_KEY:-}'
env['OXAPAY_MERCHANT_API_KEY'] = '${OXAPAY_MERCHANT_API_KEY:-}'
fn['environment'] = env
svcs['functions'] = fn
data['services'] = svcs
# JSON is valid YAML — avoids needing PyYAML for writing.
open(p, 'w').write(json.dumps(data, indent=2) + "\n")
PY
COMPOSE=(docker compose -f "$BASE_COMPOSE" -f "$OVERRIDE_COMPOSE")
# Validate the exact same merged config used for recreation.
"${COMPOSE[@]}" config --services | grep -qx 'functions' \
  || die "merged compose config me functions service nahi mili"
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
ok "edge runtime restarted"

log "smoke test"
curl -s -o /dev/null -w "  /functions/v1/cron-status -> HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" "http://127.0.0.1:8000/functions/v1/cron-status" || true
log "PHASE 5 complete. Next: Caddy/domain (setup-caddy.sh)"
