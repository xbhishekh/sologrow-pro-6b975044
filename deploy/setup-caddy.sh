#!/usr/bin/env bash
# PHASE 7 — Caddy reverse proxy + free HTTPS. Path-based (subdomain DNS ki zaroorat nahi).
set -euo pipefail
. "$(dirname "$0")/_common.sh"
load_secrets
[ -n "${APP_DOMAIN:-}" ] || die "APP_DOMAIN set karo"

log "Caddyfile likh raha hoon (tee heredoc — hidden chars se bachne ke liye)"
tee /etc/caddy/Caddyfile > /dev/null <<CADDY
${APP_DOMAIN} {
	encode zstd gzip

	# --- Supabase API paths -> Kong (8000). /auth/* broad NAHI, sirf /auth/v1/*
	@supabase path /rest/v1/* /auth/v1/* /functions/v1/* /storage/v1/* /realtime/v1/* /graphql/v1/*
	handle @supabase {
		reverse_proxy 127.0.0.1:8000
	}

	# --- Frontend SPA
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
CADDY

caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile || die "Caddyfile invalid"
systemctl reload caddy || systemctl restart caddy
sleep 3
systemctl is-active --quiet caddy && ok "caddy running" || die "caddy start fail: journalctl -u caddy -n 50"

log "VERIFY"
curl -s -o /dev/null -w "  https://$APP_DOMAIN            -> %{http_code}\n" "https://$APP_DOMAIN" || true
curl -s -o /dev/null -w "  https://$APP_DOMAIN/rest/v1/    -> %{http_code}\n" -H "apikey: $ANON_KEY" "https://$APP_DOMAIN/rest/v1/" || true
curl -s -o /dev/null -w "  https://$APP_DOMAIN/auth/v1/health -> %{http_code}\n" -H "apikey: $ANON_KEY" "https://$APP_DOMAIN/auth/v1/health" || true
log "PHASE 7 complete."
