#!/usr/bin/env bash
# PHASE 4b — bcrypt password hashes ko re-apply + verify (users purane password se login karenge).
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
OUT="${OUT:-/opt/migration}"
[ -f "$OUT/06_auth_users.json" ] || die "auth dump nahi mila"

log "hashes apply"
vpsql -c "create table if not exists public._mig_pw(j jsonb); truncate public._mig_pw;"
jq -c '.[] | {id, email, encrypted_password}' "$OUT/06_auth_users.json" | vpsql -c "copy public._mig_pw(j) from stdin;" >/dev/null
vpsql <<'SQL'
update auth.users u
   set encrypted_password = p.j->>'encrypted_password',
       email_confirmed_at = coalesce(u.email_confirmed_at, now()),
       updated_at = now()
  from public._mig_pw p
 where u.id = (p.j->>'id')::uuid
   and coalesce(p.j->>'encrypted_password','') <> ''
   and u.encrypted_password is distinct from (p.j->>'encrypted_password');
SQL
ok "hashes applied"

log "hash format sanity ($2a/$2b bcrypt hona chahiye)"
vpsql -Atc "select substring(encrypted_password from 1 for 4)||' -> '||count(*) from auth.users where encrypted_password is not null group by 1;"
vpsql -Atc "select count(*)||' users with NO password' from auth.users where coalesce(encrypted_password,'')='';"
vpsql -c "drop table if exists public._mig_pw;"

log "OPTIONAL live check: apna email + purana password daal ke test karo"
cat <<'HINT'
  curl -s -X POST "https://$APP_DOMAIN/auth/v1/token?grant_type=password" \
    -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
    -d '{"email":"you@example.com","password":"yourOldPassword"}' | jq '{ok: (.access_token!=null), error: .error_description}'
HINT
log "PHASE 4b complete. Next: bash deploy/deploy-edge-functions.sh"
