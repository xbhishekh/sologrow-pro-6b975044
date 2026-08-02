#!/usr/bin/env bash
# Paid OxaPay invoices ko webhook/return-page failure ke bawajood auto-credit kare.
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets

cat > /etc/systemd/system/smm-oxapay-reconcile.service <<UNIT
[Unit]
Description=SMM OxaPay paid deposit reconciliation
After=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/bash $APP_DIR/deploy/repair-oxapay-credits.sh 30
UNIT

cat > /etc/systemd/system/smm-oxapay-reconcile.timer <<'UNIT'
[Unit]
Description=Check uncredited OxaPay payments every two minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
AccuracySec=15s
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now smm-oxapay-reconcile.timer
if ! systemctl start smm-oxapay-reconcile.service; then
  echo "Initial OxaPay reconcile run fail hua; exact log:"
  journalctl -u smm-oxapay-reconcile.service -n 40 --no-pager || true
  exit 1
fi
ok "OxaPay auto-credit reconciliation enabled (every 2 minutes)"
systemctl status smm-oxapay-reconcile.service --no-pager || true