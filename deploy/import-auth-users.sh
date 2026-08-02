#!/usr/bin/env bash
# PHASE 4a — auth.users + auth.identities import, SAME UUIDs + metadata.
# Password hash bhi yahin aata hai (encrypted_password), phir bhi verify ke liye
# import-auth-passwords.sh alag se chalao.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
OUT="${OUT:-/opt/migration}"
[ -f "$OUT/06_auth_users.json" ] || die "auth dump nahi mila — export-cloud-data.sh chalao"

log "users load ($(jq length "$OUT/06_auth_users.json"))"
vpsql -c "create table if not exists public._mig_users(j jsonb); truncate public._mig_users;"
jq -c '.[]' "$OUT/06_auth_users.json" | while IFS= read -r row; do
  printf '%s\n' "$row"
done | vpsql -c "copy public._mig_users(j) from stdin;" >/dev/null

log "auth.users upsert (same UUID, aud, role, instance_id, bcrypt hash)"
vpsql <<'SQL'
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  phone, phone_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  created_at, updated_at, banned_until, is_sso_user
)
select
  coalesce((j->>'instance_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
  (j->>'id')::uuid,
  coalesce(j->>'aud','authenticated'),
  coalesce(j->>'role','authenticated'),
  j->>'email',
  j->>'encrypted_password',
  coalesce((j->>'email_confirmed_at')::timestamptz, now()),
  j->>'phone',
  (j->>'phone_confirmed_at')::timestamptz,
  (j->>'last_sign_in_at')::timestamptz,
  coalesce(j->'raw_app_meta_data', '{"provider":"email","providers":["email"]}'::jsonb),
  coalesce(j->'raw_user_meta_data', '{}'::jsonb),
  coalesce((j->>'is_super_admin')::boolean, false),
  coalesce((j->>'created_at')::timestamptz, now()),
  coalesce((j->>'updated_at')::timestamptz, now()),
  (j->>'banned_until')::timestamptz,
  coalesce((j->>'is_sso_user')::boolean, false)
from public._mig_users
on conflict (id) do update set
  email              = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data  = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at         = now();
SQL
ok "auth.users done"

log "auth.identities (login ke liye MANDATORY)"
vpsql -c "create table if not exists public._mig_idents(j jsonb); truncate public._mig_idents;"
jq -c '.[]' "$OUT/07_auth_identities.json" | vpsql -c "copy public._mig_idents(j) from stdin;" >/dev/null
vpsql <<'SQL'
insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select coalesce((j->>'id')::uuid, gen_random_uuid()),
       (j->>'user_id')::uuid,
       j->'identity_data',
       j->>'provider',
       coalesce(j->>'provider_id', j->>'user_id'),
       (j->>'last_sign_in_at')::timestamptz,
       coalesce((j->>'created_at')::timestamptz, now()),
       coalesce((j->>'updated_at')::timestamptz, now())
from public._mig_idents
where (j->>'user_id')::uuid in (select id from auth.users)
on conflict (provider_id, provider) do update set
  identity_data = excluded.identity_data, updated_at = now();

-- fallback: jis user ki identity missing hai uske liye email identity bana do
insert into auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', u.id::text, now(), now()
from auth.users u
where not exists (select 1 from auth.identities i where i.user_id = u.id)
on conflict do nothing;
SQL
ok "auth.identities done"

vpsql -c "drop table if exists public._mig_users; drop table if exists public._mig_idents;"

log "VERIFY"
vpsql -Atc "select count(*)||' auth users' from auth.users;"
vpsql -Atc "select count(*)||' identities' from auth.identities;"
vpsql -Atc "select count(*)||' users WITHOUT password hash (login fail karenge)' from auth.users where encrypted_password is null or encrypted_password='';"
log "PHASE 4a complete. Next: bash deploy/import-auth-passwords.sh"
