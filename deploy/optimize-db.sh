#!/usr/bin/env bash
# Apply performance indexes to the self-hosted Postgres.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="${DB_CONTAINER:-supabase-db}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: database container '${CONTAINER}' is not running" >&2
  exit 1
fi

echo "Applying performance indexes (this may take a minute)..."
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$DIR/optimize-db.sql"
echo "✅ Indexes applied and statistics refreshed."
