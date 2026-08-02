#!/usr/bin/env bash
# Shared helpers. source this from other scripts.
set -euo pipefail
SECRETS_FILE="${SECRETS_FILE:-/etc/smmpanel.secrets}"
log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[1;32m  OK\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

load_secrets() {
  [ -f "$SECRETS_FILE" ] || die "secrets file not found: $SECRETS_FILE (copy deploy/secrets.example)"
  set -a; . "$SECRETS_FILE"; set +a
  : "${APP_DIR:=/opt/smmpanel}"
  : "${SUPABASE_DIR:=/opt/supabase}"
  : "${POSTGRES_PORT:=5433}"
}

# psql against the self-hosted DB
vpsql() { PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$POSTGRES_PORT" -U postgres -d postgres "$@"; }
