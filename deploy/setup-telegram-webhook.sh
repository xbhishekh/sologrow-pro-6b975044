#!/usr/bin/env bash
# Registers the Telegram bot webhook against the self-hosted edge function.
# Usage: bash deploy/setup-telegram-webhook.sh
set -euo pipefail
SECRETS_FILE="${SECRETS_FILE:-/etc/smmpanel.secrets}"
[ -f "$SECRETS_FILE" ] && . "$SECRETS_FILE"
APP_DOMAIN="${APP_DOMAIN:-organicsmm.online}"
TOKEN="${TELEGRAM_BOT_TOKEN:-${TELEGRAM_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "[FAIL] TELEGRAM_BOT_TOKEN $SECRETS_FILE me nahi mila. BotFather se token le kar add karo:"
  echo "       echo 'TELEGRAM_BOT_TOKEN=123456:AA...' >> $SECRETS_FILE"
  exit 1
fi
SECRET="$(printf 'telegram-webhook:%s' "$TOKEN" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
URL="https://$APP_DOMAIN/functions/v1/telegram-webhook"
echo "[*] setWebhook -> $URL"
curl -sS "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"$URL\",\"secret_token\":\"$SECRET\",\"allowed_updates\":[\"message\",\"edited_message\"]}"
echo
echo "[*] getWebhookInfo:"
curl -sS "https://api.telegram.org/bot$TOKEN/getWebhookInfo"; echo
