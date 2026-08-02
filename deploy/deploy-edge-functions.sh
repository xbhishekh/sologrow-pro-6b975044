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
{
  echo "SUPABASE_URL=https://$APP_DOMAIN"
  echo "SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  echo "SUPABASE_DB_URL=postgresql://postgres:$POSTGRES_PASSWORD@db:5432/postgres"
  # app/provider secrets: sab non-Supabase keys /etc/smmpanel.secrets se
  grep -E '^[A-Z0-9_]+=' "$SECRETS_FILE" \
    | grep -vE '^(POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY|CLOUD_|GITHUB_TOKEN|REPO_|APP_DIR|SUPABASE_DIR|POSTGRES_PORT)' || true
} > "$ENVF"
chmod 600 "$ENVF"
ok "$(wc -l < "$ENVF") env vars"

log "compose override for functions env"
cd "$SUPABASE_DIR/docker"
python3 - <<'PY'
import io,os,re
p='docker-compose.override.yml'
s=open(p).read() if os.path.exists(p) else "services:\n"
if 'functions:' not in s:
    s += "  functions:\n    env_file:\n      - ./functions.env\n"
open(p,'w').write(s)
PY
docker compose up -d functions
sleep 5
ok "edge runtime restarted"

log "smoke test"
curl -s -o /dev/null -w "  /functions/v1/cron-status -> HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" "http://127.0.0.1:8000/functions/v1/cron-status" || true
log "PHASE 5 complete. Next: Caddy/domain (setup-caddy.sh)"
