#!/usr/bin/env bash
# PHASE 3a — Cloud Supabase se poora dump (schema + data + auth). Idempotent.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
need pg_dump
[ -n "${CLOUD_DB_URL:-}" ] || die "CLOUD_DB_URL set karo $SECRETS_FILE me"

OUT="${OUT:-/opt/migration}"
mkdir -p "$OUT"; chmod 700 "$OUT"
PGD="pg_dump --no-owner --no-privileges --quote-all-identifiers"

log "1/6 roles + extensions"
psql "$CLOUD_DB_URL" -Atc "select 'CREATE EXTENSION IF NOT EXISTS \"'||extname||'\" WITH SCHEMA '||n.nspname||';' from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname not in ('plpgsql')" > "$OUT/01_extensions.sql"
ok "$(wc -l < "$OUT/01_extensions.sql") extensions"

log "2/6 public schema (structure only: types, tables, functions, triggers)"
$PGD "$CLOUD_DB_URL" --schema=public --schema-only > "$OUT/02_schema_public.sql"
ok "$(du -h "$OUT/02_schema_public.sql" | cut -f1)"

log "3/6 public data"
$PGD "$CLOUD_DB_URL" --schema=public --data-only --disable-triggers > "$OUT/03_data_public.sql"
ok "$(du -h "$OUT/03_data_public.sql" | cut -f1)"

log "4/6 grants + RLS policies (alag file, order ke liye)"
psql "$CLOUD_DB_URL" -Atc "
select string_agg(stmt, E'\n') from (
  select 'GRANT '||string_agg(distinct privilege_type, ', ')||' ON public.'||quote_ident(table_name)||' TO '||quote_ident(grantee)||';' as stmt
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated','service_role')
  group by table_name, grantee
) s;" > "$OUT/04_grants.sql"
psql "$CLOUD_DB_URL" -Atc "
select string_agg(
  'ALTER TABLE public.'||quote_ident(tablename)||' ENABLE ROW LEVEL SECURITY;'||E'\n'||
  'DROP POLICY IF EXISTS '||quote_ident(policyname)||' ON public.'||quote_ident(tablename)||';'||E'\n'||
  'CREATE POLICY '||quote_ident(policyname)||' ON public.'||quote_ident(tablename)||
  ' AS '||permissive||' FOR '||cmd||
  ' TO '||array_to_string(roles,', ')||
  coalesce(' USING ('||qual||')','')||
  coalesce(' WITH CHECK ('||with_check||')','')||';'
, E'\n') from pg_policies where schemaname='public';" > "$OUT/05_policies.sql"
ok "grants + policies exported"

log "5/6 auth users (UUID + bcrypt hash + metadata)"
psql "$CLOUD_DB_URL" -Atc "select coalesce(json_agg(row_to_json(u)),'[]') from (
  select id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         phone, phone_confirmed_at, confirmed_at, last_sign_in_at,
         raw_app_meta_data, raw_user_meta_data, is_super_admin,
         created_at, updated_at, banned_until, is_sso_user, deleted_at
  from auth.users where deleted_at is null) u;" > "$OUT/06_auth_users.json"
psql "$CLOUD_DB_URL" -Atc "select coalesce(json_agg(row_to_json(i)),'[]') from (
  select id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  from auth.identities) i;" > "$OUT/07_auth_identities.json"
ok "$(jq length "$OUT/06_auth_users.json") users, $(jq length "$OUT/07_auth_identities.json") identities"

log "6/6 cron jobs"
psql "$CLOUD_DB_URL" -Atc "select coalesce(string_agg(format('select cron.schedule(%L,%L,%L);', jobname, schedule, command), E'\n'),'') from cron.job;" > "$OUT/08_cron.sql" 2>/dev/null || echo "" > "$OUT/08_cron.sql"
ok "cron jobs exported"

chmod 600 "$OUT"/*
log "PHASE 3a complete -> $OUT"
ls -lh "$OUT"
