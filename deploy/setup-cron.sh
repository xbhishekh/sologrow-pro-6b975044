#!/usr/bin/env bash
# PHASE 8 - scheduler. pg_cron ke bina: systemd timers se edge functions trigger.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

log "runner script likh raha hoon"
tee /usr/local/bin/smm-cron.sh > /dev/null <<'RUNNER'
#!/usr/bin/env bash
set -uo pipefail
set -a; . /etc/smmpanel.secrets; set +a
KONG="http://127.0.0.1:8000"
fn(){
  code=$(curl -s -o /tmp/smm-cron-last.json -w '%{http_code}' -m 300 -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    "$KONG/functions/v1/$1" -d '{}')
  echo "$(date -Is) $1 -> HTTP $code"
}
case "${1:-}" in
  runs)    fn execute-all-runs ;;
  status)  fn check-order-status ;;
  prices)  fn sync-service-prices ;;
  cleanup)
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" supabase-db \
      psql -U postgres -d postgres -Atc "select public.cleanup_old_completed_engagement_orders();"
    ;;
  *) echo "usage: smm-cron.sh runs|status|prices|cleanup"; exit 1 ;;
esac
RUNNER
chmod +x /usr/local/bin/smm-cron.sh
ok "runner ready"

mk_unit() { # name arg oncalendar
  tee "/etc/systemd/system/smm-$1.service" > /dev/null <<UNIT
[Unit]
Description=SMM cron: $1
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/smm-cron.sh $2
UNIT
  tee "/etc/systemd/system/smm-$1.timer" > /dev/null <<UNIT
[Unit]
Description=SMM cron timer: $1

[Timer]
OnBootSec=60
OnCalendar=$3
AccuracySec=5s
Persistent=false

[Install]
WantedBy=timers.target
UNIT
}

log "timers: runs(1m) status(2m) prices(12h) cleanup(1h)"
mk_unit runs    runs    '*:0/1'
mk_unit status  status  '*:0/2'
mk_unit prices  prices  '00,12:00'
mk_unit cleanup cleanup 'hourly'

systemctl daemon-reload
for t in runs status prices cleanup; do
  systemctl enable --now "smm-$t.timer" >/dev/null 2>&1
done
ok "timers enabled"

log "smoke test (execute-all-runs abhi chalao)"
/usr/local/bin/smm-cron.sh runs || true

log "VERIFY"
systemctl list-timers 'smm-*' --no-pager || true
log "PHASE 8 complete. Logs: journalctl -u smm-runs.service -f"