#!/usr/bin/env bash
# =============================================================
#  DISK + MEMORY OPTIMIZER  (one-shot + auto daily timer)
#  Usage:
#     bash deploy/disk-optimize.sh          # clean now
#     bash deploy/disk-optimize.sh --install # clean now + daily 4AM auto-clean
# =============================================================
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[1;32m  OK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ..\033[0m %s\n' "$*"; }

BEFORE=$(df -B1 --output=used / | tail -1)

log "1/8  Docker: dangling images, stopped containers, unused volumes/cache"
docker container prune -f            >/dev/null 2>&1 && ok "stopped containers removed"
docker image prune -af --filter "until=48h" >/dev/null 2>&1 && ok "unused images removed"
docker builder prune -af             >/dev/null 2>&1 && ok "build cache cleared"
docker network prune -f              >/dev/null 2>&1 && ok "unused networks removed"
# volumes: sirf anonymous/unused (named DB volume safe hai kyunki attached hai)
docker volume prune -f               >/dev/null 2>&1 && ok "orphan volumes removed"

log "2/8  Container logs truncate (json-file logs biggest disk eater)"
TOTAL=0
for f in $(docker inspect --format='{{.LogPath}}' $(docker ps -aq) 2>/dev/null); do
  [ -f "$f" ] || continue
  SZ=$(stat -c%s "$f" 2>/dev/null || echo 0)
  TOTAL=$((TOTAL+SZ))
  : > "$f"
done
ok "$(numfmt --to=iec ${TOTAL:-0}) freed from container logs"

log "3/8  Docker daemon me permanent log-rotation cap (10MB x 3 files)"
mkdir -p /etc/docker
if ! grep -q '"max-size"' /etc/docker/daemon.json 2>/dev/null; then
  python3 - <<'PY'
import json,os
p="/etc/docker/daemon.json"
d={}
if os.path.exists(p):
    try: d=json.load(open(p))
    except Exception: d={}
d["log-driver"]="json-file"
d["log-opts"]={"max-size":"10m","max-file":"3"}
json.dump(d,open(p,"w"),indent=2)
PY
  systemctl reload docker 2>/dev/null || systemctl restart docker
  ok "daemon.json updated (ab logs kabhi 30MB se upar nahi jayenge)"
else
  ok "log rotation already configured"
fi

log "4/8  systemd journal cap (500MB) + old logs vacuum"
journalctl --vacuum-size=200M >/dev/null 2>&1
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/99-size.conf <<'EOF'
[Journal]
SystemMaxUse=200M
SystemMaxFileSize=50M
MaxRetentionSec=7day
EOF
systemctl restart systemd-journald 2>/dev/null
ok "journal capped at 200MB"

log "5/8  APT / tmp / old kernels cleanup"
apt-get clean -y >/dev/null 2>&1
apt-get autoremove --purge -y >/dev/null 2>&1
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* 2>/dev/null
find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete 2>/dev/null
find /var/log -type f -name "*.log" -size +50M -exec truncate -s 0 {} \; 2>/dev/null
rm -rf /root/.npm/_cacache /root/.cache/* 2>/dev/null
ok "system caches cleared"

log "6/8  Old app builds / node_modules cache"
for APP in /opt/smmpanel /opt/*/app; do
  [ -d "$APP" ] || continue
  rm -rf "$APP/node_modules/.vite" "$APP/node_modules/.cache" "$APP/.vite" 2>/dev/null
done
ok "frontend build caches cleared"

log "7/8  Database: logs trim + VACUUM + dead tuple reclaim"
if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$DIR/disk-optimize.sql" 2>&1 \
    | grep -Ei 'NOTICE|table_name|MB|GB|rows' | head -40
  # WAL shrink
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -Atc "CHECKPOINT; SELECT pg_switch_wal();" >/dev/null 2>&1
  ok "DB vacuumed + WAL checkpointed"
else
  warn "DB container '${DB_CONTAINER}' not running - skipped"
fi

log "8/8  Memory: page cache drop + swap re-cycle"
sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null && ok "page cache dropped"
if [ "$(swapon --show --noheadings | wc -l)" -gt 0 ]; then
  FREE_RAM=$(free -m | awk '/Mem:/{print $7}')
  USED_SWAP=$(free -m | awk '/Swap:/{print $3}')
  if [ "$USED_SWAP" -gt 0 ] && [ "$FREE_RAM" -gt "$((USED_SWAP + 500))" ]; then
    swapoff -a && swapon -a && ok "swap recycled (${USED_SWAP}MB back to RAM)"
  fi
fi
sysctl -qw vm.swappiness=10 2>/dev/null
grep -q 'vm.swappiness' /etc/sysctl.conf 2>/dev/null || echo 'vm.swappiness=10' >> /etc/sysctl.conf

AFTER=$(df -B1 --output=used / | tail -1)
FREED=$((BEFORE-AFTER))
echo
printf '\033[1;32m═══════════════════════════════════════\033[0m\n'
printf '  Freed : \033[1;32m%s\033[0m\n' "$(numfmt --to=iec ${FREED#-} 2>/dev/null || echo 0)"
df -h / | tail -1 | awk '{printf "  Disk  : %s used / %s total (%s)\n", $3,$2,$5}'
free -h | awk '/Mem:/{printf "  RAM   : %s used / %s total\n", $3,$2}'
printf '\033[1;32m═══════════════════════════════════════\033[0m\n'

# ---------- optional: daily auto-clean ----------
if [ "${1:-}" = "--install" ]; then
  log "Installing daily auto-clean timer (4:00 AM)"
  cat > /etc/systemd/system/smm-diskclean.service <<UNIT
[Unit]
Description=SMM panel disk & memory optimizer
[Service]
Type=oneshot
ExecStart=/usr/bin/env bash ${DIR}/disk-optimize.sh
UNIT
  cat > /etc/systemd/system/smm-diskclean.timer <<'UNIT'
[Unit]
Description=Daily SMM disk cleanup
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now smm-diskclean.timer
  ok "auto-clean enabled -> systemctl list-timers | grep diskclean"
fi
