#!/usr/bin/env bash
# Shared helpers. source this from other scripts.
set -euo pipefail
SECRETS_FILE="${SECRETS_FILE:-/etc/smmpanel.secrets}"
log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[1;32m  OK\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

load_secrets() {
  [ -f "$SECRETS_FILE" ] || die "secrets file not found: $SECRETS_FILE (copy deploy/secrets.example)"
  set -a; . "$SECRETS_FILE"; set +a
  : "${APP_DIR:=/opt/smmpanel}"
  : "${SUPABASE_DIR:=/opt/supabase}"
  : "${POSTGRES_PORT:=5433}"
}

# psql against the self-hosted DB.
# NOTE: host port 5433 par Supavisor (pooler) bind hota hai -> "no tenant identifier" error.
# Isliye hamesha db container ke andar se psql chalate hain (100% reliable).
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
vpsql() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
      psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
  else
    PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$POSTGRES_PORT" -U postgres -d postgres "$@"
  fi
}
# same but never stops on error, reads a file from host
vpsql_file_soft() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$DB_CONTAINER"; then
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
      psql -v ON_ERROR_STOP=0 -U postgres -d postgres -f - < "$1"
  else
    PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=0 -h 127.0.0.1 -p "$POSTGRES_PORT" -U postgres -d postgres -f "$1"
  fi
}
