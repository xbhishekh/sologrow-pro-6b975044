#!/usr/bin/env bash
# PHASE 3 — schema (repo migrations) + data (edge-function export) + auth users/passwords import.
# Requires: /opt/migration/cloud-data.sql  aur  /opt/migration/auth-users.sql
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
OUT="${OUT:-/opt/migration}"
APP_DIR="${APP_DIR:-/opt/smmpanel}"
MIG="$APP_DIR/supabase/migrations"

[ -s "$OUT/cloud-data.sql" ]  || die "$OUT/cloud-data.sql nahi mila"
[ -s "$OUT/auth-users.sql" ]  || die "$OUT/auth-users.sql nahi mila"
[ -d "$MIG" ]                 || die "migrations folder nahi mila: $MIG"

log "0/6 extensions + roles"
for e in pgcrypto "uuid-ossp" pg_net pg_cron; do
  vpsql -c "create extension if not exists \"$e\";" >/dev/null 2>&1 || log "  skip extension $e"
done
vpsql -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
end \$\$;" >/dev/null
vpsql -c "grant usage on schema public to anon, authenticated, service_role;" >/dev/null
ok "roles/extensions ready"

log "1/6 auth users + bcrypt passwords (schema data pehle, FK ke liye)"
# safety: purane export me confirmed_at aata tha jo self-host me GENERATED column hai -> strip
sed -i '/^  confirmed_at, last_sign_in_at, is_sso_user, is_anonymous$/s//  last_sign_in_at, is_sso_user, is_anonymous/' "$OUT/auth-users.sql"
vpsql_file_soft "$OUT/auth-users.sql" > /tmp/import_auth.log 2>&1 || true
echo "  auth errors: $(grep -c '^ERROR' /tmp/import_auth.log || true) (/tmp/import_auth.log)"
vpsql -Atc "select count(*)||' auth.users' from auth.users;"

log "2/6 schema — ${MIG} se saari migrations apply"
: > /tmp/import_schema.log
for f in $(ls "$MIG"/*.sql | sort); do
  echo "---- $f" >> /tmp/import_schema.log
  vpsql_file_soft "$f" >> /tmp/import_schema.log 2>&1 || true
done
echo "  schema errors: $(grep -c '^ERROR' /tmp/import_schema.log || true) (already-exists normal, /tmp/import_schema.log)"
ok "schema applied"

log "3/6 data import (triggers OFF) + missing-column auto-heal"
{ echo "set session_replication_role='replica';"; cat "$OUT/cloud-data.sql"; } > /tmp/_data_load.sql
for pass in 1 2 3; do
  vpsql_file_soft /tmp/_data_load.sql > /tmp/import_data.log 2>&1 || true
  errs=$(grep -c '^ERROR' /tmp/import_data.log || true)
  echo "  pass $pass -> data errors: $errs"
  [ "$errs" = "0" ] && break
  # cloud schema me naye columns ho sakte hain jo repo migrations me nahi -> add karo
  : > /tmp/_addcols.sql
  grep -oE 'column "[^"]+" of relation "[^"]+" does not exist' /tmp/import_data.log \
    | sed -E 's/column "([^"]+)" of relation "([^"]+)".*/\2 \1/' | sort -u | while read -r tbl col; do
      case "$col" in
        *_at)                    typ="timestamptz" ;;
        is_*|has_*|*_enabled)    typ="boolean" ;;
        *_count|*_percent|*_amount|*_price|*quantity*) typ="numeric" ;;
        *_data|*_json|*_meta|*_response) typ="jsonb" ;;
        *)                       typ="text" ;;
      esac
      echo "ALTER TABLE public.\"$tbl\" ADD COLUMN IF NOT EXISTS \"$col\" $typ;" >> /tmp/_addcols.sql
    done
  if [ -s /tmp/_addcols.sql ]; then
    echo "  adding missing columns: $(wc -l < /tmp/_addcols.sql)"
    vpsql_file_soft /tmp/_addcols.sql >/dev/null 2>&1 || true
  else
    break
  fi
done
rm -f /tmp/_data_load.sql
ok "data imported"

log "4/6 sequences resync"
vpsql -Atc "
select coalesce(string_agg(format('select setval(%L, coalesce((select max(%I) from %I.%I),1), true);',
  quote_ident(seq_ns)||'.'||quote_ident(seq_name), col, tab_ns, tab), E'\n'),'')
from (
  select s.relname seq_name, sn.nspname seq_ns, t.relname tab, tn.nspname tab_ns, a.attname col
  from pg_class s
  join pg_depend d on d.objid=s.oid and d.classid='pg_class'::regclass
  join pg_class t on t.oid=d.refobjid
  join pg_namespace sn on sn.oid=s.relnamespace
  join pg_namespace tn on tn.oid=t.relnamespace
  join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
  where s.relkind='S' and tn.nspname='public'
) x;" > /tmp/_seq.sql 2>/dev/null || true
[ -s /tmp/_seq.sql ] && vpsql_file_soft /tmp/_seq.sql >/dev/null 2>&1 || true
ok "sequences resynced"

log "5/6 grants (PostgREST ke liye har table pe zaroori)"
vpsql -Atc "select coalesce(string_agg(format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated; GRANT ALL ON public.%I TO service_role;', tablename, tablename), E'\n'),'') from pg_tables where schemaname='public';" > /tmp/_grants.sql
vpsql_file_soft /tmp/_grants.sql >/dev/null 2>&1 || true
vpsql -c "grant usage, select on all sequences in schema public to anon, authenticated, service_role;" >/dev/null
vpsql -c "grant execute on all functions in schema public to anon, authenticated, service_role;" >/dev/null
ok "grants applied"

log "6/6 VERIFY"
vpsql -Atc "select count(*)||' tables'    from pg_tables   where schemaname='public';"
vpsql -Atc "select count(*)||' policies'  from pg_policies where schemaname='public';"
vpsql -Atc "select count(*)||' functions' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
vpsql -Atc "select count(*)||' auth users' from auth.users;"
vpsql -Atc "select 'profiles='||(select count(*) from public.profiles)||', orders='||(select count(*) from public.orders)||', engagement_orders='||(select count(*) from public.engagement_orders)||', transactions='||(select count(*) from public.transactions)||', wallets='||(select count(*) from public.wallets);" 2>/dev/null || true
log "PHASE 3 complete. Next: bash deploy/deploy-edge-functions.sh && bash deploy/setup-caddy.sh"