#!/usr/bin/env bash
# Daily backup: DhanSMM (host postgres) + OrganicSMM (docker supabase-db) -> Google Drive
# Usage: bash /root/vps-gdrive-backup.sh
set -uo pipefail

STAMP="$(date +%F-%H%M)"
DIR="/root/backups/$STAMP"
REMOTE="gdrive:VPS-Backups"
RETENTION_DAYS=14
mkdir -p "$DIR"

log(){ echo "[$(date +%T)] $*"; }

# --- 1. DhanSMM (postgres on host, db name: dhansmm) ---
if command -v pg_dump >/dev/null 2>&1; then
  log "Dumping dhansmm..."
  sudo -u postgres pg_dump -Fc --no-owner --no-acl dhansmm -f "$DIR/dhansmm.dump" \
    && log "dhansmm OK" || log "dhansmm FAILED"
fi

# --- 2. OrganicSMM (docker container: supabase-db, db name: postgres) ---
if docker ps --format '{{.Names}}' | grep -qx supabase-db; then
  log "Dumping organicsmm (supabase-db)..."
  docker exec supabase-db pg_dumpall -U postgres > "$DIR/organicsmm-all.sql" \
    && gzip -f "$DIR/organicsmm-all.sql" && log "organicsmm OK" || log "organicsmm FAILED"
fi

# --- 3. Config / secrets / nginx (small, very useful on restore) ---
tar czf "$DIR/config.tar.gz" \
  /etc/nginx/sites-enabled \
  /var/www/dhansmm/backend/.env.production \
  /opt/smmpanel/.env /opt/smmpanel/docker-compose*.yml \
  /etc/smmpanel.secrets 2>/dev/null

ls -lh "$DIR"

# --- 4. Upload to Google Drive ---
log "Uploading to $REMOTE/$STAMP ..."
rclone copy "$DIR" "$REMOTE/$STAMP" --transfers 2 --retries 3 || { log "UPLOAD FAILED"; exit 1; }
log "Upload done."

# --- 5. Retention: keep 14 days locally + on Drive ---
find /root/backups -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null
rclone delete "$REMOTE" --min-age ${RETENTION_DAYS}d 2>/dev/null
rclone rmdirs "$REMOTE" --leave-root 2>/dev/null
log "Backup complete: $STAMP"
