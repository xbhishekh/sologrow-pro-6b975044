#!/usr/bin/env bash
# OrganicSMM auth-key consistency guard. Safe to run repeatedly from systemd.
# It never prints keys and only invokes the full repair when a mismatch exists.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

LOCK_FILE=/run/lock/organicsmm-auth-key-guard.lock
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

STACK_ENV="$SUPABASE_DIR/docker/.env"
[ -f "$STACK_ENV" ] || die "stack env missing: $STACK_ENV"

STACK_JWT_SECRET=$(sed -n 's/^JWT_SECRET=//p' "$STACK_ENV" | tail -n 1)
STACK_ANON_KEY=$(sed -n 's/^ANON_KEY=//p' "$STACK_ENV" | tail -n 1)
STACK_SERVICE_KEY=$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$STACK_ENV" | tail -n 1)
FILE_ANON_KEY="${ANON_KEY:-}"
FILE_SERVICE_KEY="${SERVICE_ROLE_KEY:-}"

valid_jwt() {
  JWT_SECRET_TO_CHECK="$STACK_JWT_SECRET" JWT_TO_CHECK="$1" EXPECTED_ROLE="$2" node -e '
    const crypto = require("crypto");
    const token = process.env.JWT_TO_CHECK || "";
    const parts = token.split(".");
    if (parts.length !== 3) process.exit(1);
    const expected = crypto.createHmac("sha256", process.env.JWT_SECRET_TO_CHECK || "")
      .update(parts[0] + "." + parts[1]).digest("base64url");
    const a = Buffer.from(expected), b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) process.exit(1);
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.role !== process.env.EXPECTED_ROLE) process.exit(1);
  ' >/dev/null 2>&1
}

REASON=""
[ -n "$STACK_JWT_SECRET" ] || REASON="stack JWT secret missing"
if [ -z "$REASON" ] && ! valid_jwt "$STACK_ANON_KEY" anon; then REASON="stack anon key invalid"; fi
if [ -z "$REASON" ] && ! valid_jwt "$STACK_SERVICE_KEY" service_role; then REASON="stack service key invalid"; fi
if [ -z "$REASON" ] && { [ "$STACK_ANON_KEY" != "$FILE_ANON_KEY" ] || [ "$STACK_SERVICE_KEY" != "$FILE_SERVICE_KEY" ]; }; then
  REASON="stack and OrganicSMM secrets differ"
fi

if [ -z "$REASON" ]; then
  HEALTH_CODE=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' \
    -H "apikey: $STACK_ANON_KEY" "http://127.0.0.1:8000/auth/v1/health" || true)
  [ "$HEALTH_CODE" = "200" ] || REASON="local auth rejected configured key (HTTP $HEALTH_CODE)"
fi

if [ -z "$REASON" ] && [ -d "$APP_DIR/dist/assets" ]; then
  grep -FRlq -- "$STACK_ANON_KEY" "$APP_DIR/dist/assets" \
    || REASON="frontend bundle contains a different key"
fi

if [ -z "$REASON" ]; then
  ok "OrganicSMM auth keys consistent"
  exit 0
fi

log "auth-key mismatch detected: $REASON"
if [ "${1:-}" = "--check" ]; then
  exit 1
fi

REPAIR_SCRIPT="$APP_DIR/deploy/repair-login-key.sh"
[ -f "$REPAIR_SCRIPT" ] || die "repair script missing: $REPAIR_SCRIPT"
AUTH_GUARD_INSTALL=0 bash "$REPAIR_SCRIPT"
ok "OrganicSMM auth-key mismatch automatically repaired"