# Self-host deployment (Hostinger VPS + self-hosted Supabase)

Run in this order. Every script is idempotent and re-runnable.

| # | Script | Kya karta hai |
|---|--------|----------------|
| 1 | `hostinger-setup.sh` | VPS bootstrap: docker, node, pnpm, caddy, ufw, repo clone, build, systemd |
| 2 | `supabase-selfhost.sh` | Self-hosted Supabase stack (Postgres 5433, Kong 8000, Auth, Realtime, Storage, PostgREST, Edge Runtime) |
| 3 | `export-cloud-data.sh` | Cloud Supabase se schema + data + auth dump |
| 4 | `import-data.sh` | VPS Postgres me 1:1 import (correct order) |
| 5 | `import-auth-users.sh` | auth.users + auth.identities same UUID ke saath |
| 6 | `import-auth-passwords.sh` | bcrypt password hashes import |
| 7 | `deploy-edge-functions.sh` | Saari edge functions + secrets |
| 8 | `update.sh` | Atomic rebuild (dist-new -> dist swap) + restart |

Secrets: `/etc/smmpanel.secrets` (chmod 600). Repo me kabhi commit mat karo.
