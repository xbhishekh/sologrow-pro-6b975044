#!/usr/bin/env bash
# PHASE 9 — final verification checklist.
set -uo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
P(){ printf '%-52s %s\n' "$1" "$2"; }
c(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "=== SERVICES ==="
P "smmpanel (frontend :3000)" "$(systemctl is-active smmpanel)"
P "caddy"                     "$(systemctl is-active caddy)"
P "docker containers up"      "$(docker ps --format '{{.Names}}' | wc -l)"

echo "=== HTTP ==="
P "https://$APP_DOMAIN"               "$(c https://$APP_DOMAIN)"
P "/rest/v1/ (PostgREST)"             "$(c -H "apikey: $ANON_KEY" https://$APP_DOMAIN/rest/v1/)"
P "/auth/v1/health (GoTrue)"          "$(c -H "apikey: $ANON_KEY" https://$APP_DOMAIN/auth/v1/health)"
P "/storage/v1/version"               "$(c -H "apikey: $ANON_KEY" https://$APP_DOMAIN/storage/v1/version)"
P "/functions/v1/cron-status"         "$(c -H "Authorization: Bearer $SERVICE_ROLE_KEY" https://$APP_DOMAIN/functions/v1/cron-status)"
P "/functions/v1/zapupi-webhook"      "$(c -X POST https://$APP_DOMAIN/functions/v1/zapupi-webhook)"

echo "=== DB ==="
vpsql -Atc "select 'tables: '||count(*) from pg_tables where schemaname='public';"
vpsql -Atc "select 'policies: '||count(*) from pg_policies where schemaname='public';"
vpsql -Atc "select 'functions: '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
vpsql -Atc "select 'auth users: '||count(*) from auth.users;"
vpsql -Atc "select 'users w/o password: '||count(*) from auth.users where coalesce(encrypted_password,'')='';"
vpsql -Atc "select 'tables missing grants: '||count(*) from pg_tables t where schemaname='public' and not exists (select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=t.tablename and g.grantee='authenticated');"

echo "=== BUILD ==="
P "dist/index.html"  "$([ -f "$APP_DIR/dist/index.html" ] && echo present || echo MISSING)"
P "manualChunks in vite config" "$(grep -q manualChunks "$APP_DIR/vite.config.ts" && echo 'FOUND (hatao! black screen risk)' || echo 'absent (good)')"
P "VITE_SUPABASE_URL" "$(grep VITE_SUPABASE_URL "$APP_DIR/.env" | cut -d= -f2)"

echo
echo "MANUAL TEST: login (purana password), wallet balance, order place, admin funds add."
