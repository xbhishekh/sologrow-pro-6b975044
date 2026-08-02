#!/usr/bin/env bash
# Crypto (OxaPay) deposits jo PAID hain par wallet me credit nahi hue —
# unko OxaPay API se verify karke credit karta hai.
#
# Usage: bash deploy/repair-oxapay-credits.sh [days_back]   (default 14)
set -euo pipefail
cd "$(dirname "$0")/.."
. "$(dirname "$0")/_common.sh" 2>/dev/null || true
load_secrets 2>/dev/null || true

DAYS="${1:-14}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
KEY="${OXAPAY_MERCHANT_API_KEY:-${OXAPAY_API_KEY:-${OXAPAY_KEY:-}}}"
[ -n "$KEY" ] || { echo "OXAPAY_MERCHANT_API_KEY missing in /etc/smmpanel.secrets"; exit 1; }

q() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -tAq -c "$1"; }

rows="$(q "select order_id, coalesce(track_id,''), amount_usd, user_id, amount_inr
           from public.oxapay_deposits
           where credited = false
             and created_at > now() - interval '$DAYS days'
           order by created_at desc")"

[ -n "$rows" ] || { echo "koi uncredited deposit nahi mila (last $DAYS din)"; exit 0; }

echo "==> checking $(echo "$rows" | wc -l) uncredited deposits"
while IFS='|' read -r order track expected user_id amount_inr; do
  [ -n "$order" ] || continue
  if [ -z "$track" ]; then echo "  $order  -> track_id nahi hai, skip"; continue; fi
  resp="$(curl -s --max-time 25 -H "merchant_api_key: $KEY" "https://api.oxapay.com/v1/payment/$track" || true)"
  status="$(printf '%s' "$resp" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); i=d.get('data',d) or {}
    print(str(i.get('status','')).lower())
except Exception: print('')" 2>/dev/null)"
  paid_amt="$(printf '%s' "$resp" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); i=d.get('data',d) or {}
    a=i.get('amount') or i.get('paid_amount') or i.get('received_amount') or 0
    print(float(a))
except Exception: print(0)" 2>/dev/null)"

  case "$status" in
    paid|confirmed|completed|complete|success)
      ok="$(python3 -c "print(1 if float('$paid_amt') >= float('$expected')*0.98 else 0)")"
      if [ "$ok" != "1" ]; then
        echo "  $order  -> $status par amount kam ($paid_amt < $expected), manual check"
        continue
      fi
      q "update public.oxapay_deposits set status='$status', updated_at=now() where order_id='$order'" >/dev/null
      out="$(q "select public.credit_wallet_oxapay('$order')")"
      echo "  $order  -> CREDITED  $out"
      if printf '%s' "$out" | grep -q '"credited"[[:space:]]*:[[:space:]]*true'; then
        notify_payload="$(python3 -c 'import json,sys; print(json.dumps({"user_id":sys.argv[1],"order_id":sys.argv[2],"method":"OxaPay","status":"success","amount_inr":float(sys.argv[3]),"amount_usd":float(sys.argv[4])}))' "$user_id" "$order" "$amount_inr" "$expected")"
        notify_code="$(curl -sS --max-time 20 -o /tmp/oxapay-notify-response.json -w '%{http_code}' \
          "https://$APP_DOMAIN/functions/v1/notify-deposit-status" \
          -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
          -H 'Content-Type: application/json' \
          -d "$notify_payload" || true)"
        if [ "$notify_code" = "200" ]; then
          echo "  $order  -> Telegram notification sent"
        else
          echo "  $order  -> WARNING: Telegram notification failed (HTTP ${notify_code:-network_error})"
        fi
      fi
      ;;
    *)
      [ -n "$status" ] && q "update public.oxapay_deposits set status='$status', updated_at=now() where order_id='$order'" >/dev/null
      echo "  $order  -> $status (credit nahi)"
      ;;
  esac
done <<< "$rows"
echo "==> done"
