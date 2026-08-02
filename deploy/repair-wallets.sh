#!/usr/bin/env bash
# Restore wallet balances + transaction history that were lost during the
# Lovable Cloud -> VPS migration.
#
# Safe rules:
#  - A wallet is only restored when the VPS row is clearly EMPTY
#    (total_deposited = 0 AND balance = 0 AND total_spent = 0)
#    while the Cloud snapshot has real values. Newer VPS activity is never
#    overwritten.
#  - Transactions are inserted by primary key, existing ids are skipped.
#
# Usage:  bash deploy/repair-wallets.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
PSQL="docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1"

echo "==> Loading Cloud snapshot into staging tables"
$PSQL <<'SQL'
DROP TABLE IF EXISTS _cloud_wallets;
CREATE TABLE _cloud_wallets(user_id uuid, balance numeric, total_deposited numeric, total_spent numeric);
DROP TABLE IF EXISTS _cloud_tx;
CREATE TABLE _cloud_tx(id uuid, user_id uuid, type text, amount numeric, balance_after numeric,
  description text, payment_method text, payment_reference text, status text, created_at timestamptz);
SQL

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c \
  "COPY _cloud_wallets FROM STDIN WITH CSV HEADER" < deploy/data/wallets-cloud.csv
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c \
  "COPY _cloud_tx FROM STDIN WITH CSV HEADER" < deploy/data/transactions-cloud.csv

echo "==> Restoring wallets"
$PSQL <<'SQL'
ALTER TABLE public.wallets DISABLE TRIGGER USER;
ALTER TABLE public.transactions DISABLE TRIGGER USER;

-- create missing wallet rows for migrated users
INSERT INTO public.wallets (user_id, balance, total_deposited, total_spent)
SELECT c.user_id, c.balance, c.total_deposited, c.total_spent
FROM _cloud_wallets c
JOIN auth.users u ON u.id = c.user_id
LEFT JOIN public.wallets w ON w.user_id = c.user_id
WHERE w.id IS NULL AND (c.balance > 0 OR c.total_deposited > 0 OR c.total_spent > 0);

-- restore wallets that are completely empty on the VPS
WITH fixed AS (
  UPDATE public.wallets w
  SET balance = c.balance,
      total_deposited = c.total_deposited,
      total_spent = c.total_spent,
      updated_at = now()
  FROM _cloud_wallets c
  WHERE c.user_id = w.user_id
    AND COALESCE(w.balance,0) = 0
    AND COALESCE(w.total_deposited,0) = 0
    AND COALESCE(w.total_spent,0) = 0
    AND (c.balance > 0 OR c.total_deposited > 0 OR c.total_spent > 0)
  RETURNING 1
)
SELECT count(*) AS wallets_restored FROM fixed;

-- restore missing transaction history
WITH ins AS (
  INSERT INTO public.transactions
    (id, user_id, type, amount, balance_after, description, payment_method, payment_reference, status, created_at)
  SELECT t.id, t.user_id, t.type, t.amount, t.balance_after,
         NULLIF(t.description,''), NULLIF(t.payment_method,''), NULLIF(t.payment_reference,''),
         COALESCE(NULLIF(t.status,''),'completed'), t.created_at
  FROM _cloud_tx t
  JOIN auth.users u ON u.id = t.user_id
  ON CONFLICT (id) DO NOTHING
  RETURNING 1
)
SELECT count(*) AS transactions_restored FROM ins;

ALTER TABLE public.wallets ENABLE TRIGGER USER;
ALTER TABLE public.transactions ENABLE TRIGGER USER;

DROP TABLE _cloud_wallets;
DROP TABLE _cloud_tx;
SQL

echo "==> Done. Verify a user:"
echo "   docker exec -i ${DB_CONTAINER} psql -U postgres -d postgres -c \"select p.email,w.balance,w.total_deposited,w.total_spent from profiles p join wallets w on w.user_id=p.user_id where p.email='baddie628tw@gmail.com';\""
