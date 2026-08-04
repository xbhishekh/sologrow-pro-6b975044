#!/usr/bin/env bash
# ZapUPI key ko self-hosted Edge Runtime me permanently available rakhe.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

EXPECTED_KEY="${ZAPUPI_ZAP_KEY:-${ZAPUPI_TOKEN:-${ZAPUPI_API_KEY:-${ZAPUPI_KEY:-${ZAPUPI_SECRET:-}}}}}"
[ -n "$EXPECTED_KEY" ] || die "ZapUPI API key $SECRETS_FILE me missing hai (ZAPUPI_ZAP_KEY=...)"

find_functions_container() {
  docker ps --format '{{.ID}} {{.Image}} {{.Names}}' \
    | awk 'tolower($0) ~ /edge-runtime|functions/ { print $1; exit }'
}

CONTAINER_ID="$(find_functions_container)"
[ -n "$CONTAINER_ID" ] || exit 1
RUNNING_KEY="$(docker exec "$CONTAINER_ID" printenv ZAPUPI_ZAP_KEY 2>/dev/null || true)"

# Value kabhi print nahi karni. Exact match se stale/old key bhi detect hogi.
if [ -n "$RUNNING_KEY" ] && [ "$RUNNING_KEY" = "$EXPECTED_KEY" ]; then
  exit 0
fi

if [ "${1:-}" = "--check" ]; then
  exit 1
fi

log "ZapUPI key Edge Runtime se missing/stale hai; auto-repair running"
bash "$APP_DIR/deploy/deploy-edge-functions.sh"

CONTAINER_ID="$(find_functions_container)"
[ -n "$CONTAINER_ID" ] || die "functions container auto-repair ke baad nahi mila"
RUNNING_KEY="$(docker exec "$CONTAINER_ID" printenv ZAPUPI_ZAP_KEY 2>/dev/null || true)"
[ "$RUNNING_KEY" = "$EXPECTED_KEY" ] || die "ZapUPI key auto-repair ke baad bhi load nahi hui"
ok "ZapUPI payment gateway key restored"