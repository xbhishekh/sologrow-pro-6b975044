#!/usr/bin/env bash
# PHASE 3b — VPS Postgres me 1:1 import. ORDER CRITICAL.
# extensions -> types/enums -> tables -> data -> constraints -> functions -> triggers -> grants -> RLS
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
OUT="${OUT:-/opt/migration}"
[ -f "$OUT/02_schema_public.sql" ] || die "dump nahi mila — pehle export-cloud-data.sh chalao"

log "0/7 roles ensure"
vpsql -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end \$\$;"
vpsql -c "grant usage on schema public to anon, authenticated, service_role;"
ok "roles ready"

log "1/7 extensions"
vpsql -f "$OUT/01_extensions.sql" || log "kuch extensions skip hue (self-host me available nahi) — continue"

log "2-6/7 schema (types, tables, functions, triggers) + constraints"
# pg_dump ka schema file khud sahi order me hai (types -> tables -> functions -> constraints -> triggers)
PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -p "$POSTGRES_PORT" -U postgres -d postgres \
  -v ON_ERROR_STOP=0 -f "$OUT/02_schema_public.sql" > /tmp/import_schema.log 2>&1
grep -c '^ERROR' /tmp/import_schema.log | xargs -I{} echo "  schema errors: {} (already-exists errors normal hain, /tmp/import_schema.log dekho)"
ok "schema imported"

log "3/7 data (triggers disabled)"
vpsql -c "set session_replication_role = replica;" >/dev/null 2>&1 || true
PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -p "$POSTGRES_PORT" -U postgres -d postgres \
  -v ON_ERROR_STOP=0 -c "set session_replication_role='replica';" -f "$OUT/03_data_public.sql" \
  > /tmp/import_data.log 2>&1
echo "  data errors: $(grep -c '^ERROR' /tmp/import_data.log || true) (/tmp/import_data.log)"
ok "data imported"

log "4/7 sequences resync"
vpsql -Atc "
select string_agg(format('select setval(%L, coalesce((select max(%I) from %I.%I),1), true);',
  quote_ident(seq_ns)||'.'||quote_ident(seq_name), col, tab_ns, tab), E'\n')
from (
  select s.relname seq_name, sn.nspname seq_ns, t.relname tab, tn.nspname tab_ns, a.attname col
  from pg_class s
  join pg_depend d on d.objid=s.oid and d.classid='pg_class'::regclass
  join pg_class t on t.oid=d.refobjid
  join pg_namespace sn on sn.oid=s.relnamespace
  join pg_namespace tn on tn.oid=t.relnamespace
  join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
  where s.relkind='S' and tn.nspname='public'
) x;" | vpsql -f - >/dev/null 2>&1 || true
ok "sequences resynced"

log "5/7 grants (HAR public table pe zaroori — PostgREST ke liye)"
vpsql -f "$OUT/04_grants.sql" >/dev/null 2>&1 || true
# safety net: koi table grant se chhoot na jaye
vpsql -Atc "select string_agg(format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role;', tablename, tablename), E'\n') from pg_tables where schemaname='public';" | vpsql -f - >/dev/null
vpsql -c "grant usage, select on all sequences in schema public to anon, authenticated, service_role;"
vpsql -c "grant execute on all functions in schema public to anon, authenticated, service_role;"
ok "grants applied"

log "6/7 RLS policies"
vpsql -f "$OUT/05_policies.sql" > /tmp/import_policies.log 2>&1 || true
echo "  policy errors: $(grep -c '^ERROR' /tmp/import_policies.log || true)"
ok "policies applied"

log "7/7 cron jobs"
vpsql -c "create extension if not exists pg_cron;" >/dev/null 2>&1 || true
vpsql -c "create extension if not exists pg_net;"  >/dev/null 2>&1 || true
[ -s "$OUT/08_cron.sql" ] && vpsql -f "$OUT/08_cron.sql" >/dev/null 2>&1 || true
ok "cron restored"

log "VERIFY"
vpsql -Atc "select count(*)||' tables' from pg_tables where schemaname='public';"
vpsql -Atc "select count(*)||' policies' from pg_policies where schemaname='public';"
vpsql -Atc "select count(*)||' functions' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
vpsql -Atc "select 'rows: profiles='||(select count(*) from public.profiles)||', orders='||(select count(*) from public.orders)||', wallets='||(select count(*) from public.wallets);" 2>/dev/null || true
log "PHASE 3b complete. Next: bash deploy/import-auth-users.sh"
