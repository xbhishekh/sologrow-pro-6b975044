#!/usr/bin/env bash
# Repair password-login records after importing users into the self-hosted auth database.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

OUT="${OUT:-/opt/migration}"
AUTH_DUMP="$OUT/06_auth_users.json"

[ -s "$AUTH_DUMP" ] || die "$AUTH_DUMP missing; old password hashes cannot be restored safely"
jq -e 'type == "array" and length > 0' "$AUTH_DUMP" >/dev/null \
  || die "$AUTH_DUMP is not a valid non-empty user export"

log "Loading original password hashes"
vpsql -c "drop table if exists public._login_repair; create unlogged table public._login_repair(j jsonb); revoke all on public._login_repair from public, anon, authenticated;" >/dev/null
jq -c '.[]' "$AUTH_DUMP" | vpsql -c "copy public._login_repair(j) from stdin;" >/dev/null

log "Repairing users and email identities"
vpsql <<'SQL'
begin;

update auth.users u
set email = lower(btrim(coalesce(nullif(r.j->>'email', ''), u.email))),
    encrypted_password = case
      when coalesce(r.j->>'encrypted_password', '') ~ '^\$2[aby]\$'
        then r.j->>'encrypted_password'
      else u.encrypted_password
    end,
    instance_id = coalesce(u.instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    aud = 'authenticated',
    role = 'authenticated',
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
      || '{"provider":"email","providers":["email"]}'::jsonb,
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb),
    is_sso_user = false,
    updated_at = now()
from public._login_repair r
where u.id = (r.j->>'id')::uuid;

-- Keep the email identity in sync; password login depends on this relation.
update auth.identities i
set identity_data = coalesce(i.identity_data, '{}'::jsonb)
      || jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
    updated_at = now()
from auth.users u
where i.user_id = u.id and i.provider = 'email';

insert into auth.identities
  (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
select gen_random_uuid(), u.id,
       jsonb_build_object(
         'sub', u.id::text,
         'email', u.email,
         'email_verified', true,
         'phone_verified', false
       ),
       'email', u.id::text, now(), now()
from auth.users u
where not exists (
  select 1 from auth.identities i
  where i.user_id = u.id and i.provider = 'email'
)
on conflict (provider_id, provider) do nothing;

commit;
SQL

vpsql -c "drop table public._login_repair;" >/dev/null

log "Login repair verification"
vpsql -Atc "select count(*)||' total users' from auth.users;"
vpsql -Atc "select count(*)||' users with valid bcrypt hash' from auth.users where encrypted_password ~ '^\\$2[aby]\\$';"
vpsql -Atc "select count(*)||' users missing/invalid password hash' from auth.users where coalesce(encrypted_password,'') !~ '^\\$2[aby]\\$';"
vpsql -Atc "select count(*)||' users missing email identity' from auth.users u where not exists (select 1 from auth.identities i where i.user_id=u.id and i.provider='email');"

if docker ps --format '{{.Names}}' | grep -qx supabase-auth; then
  docker restart supabase-auth >/dev/null
  ok "auth service restarted"
else
  log "supabase-auth container not found; restart the auth service manually"
fi

ok "Old-user login records repaired. Test through https://$APP_DOMAIN"