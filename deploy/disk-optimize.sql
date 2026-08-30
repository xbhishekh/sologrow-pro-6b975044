-- Disk / memory reclaim for the self-hosted SMM panel.
-- Safe: sirf logs / old finished data hatata hai. Orders, users, wallet ko touch nahi karta.
\set ON_ERROR_STOP off

-- 1) Purani finished runs/orders ke logs trim karo (agar table exist kare)
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'edge_function_logs','function_logs','api_logs','request_logs',
    'provider_api_logs','provider_logs','webhook_logs','payment_logs',
    'admin_audit_log','audit_logs','notification_logs','sync_logs',
    'order_status_logs','run_logs','chat_typing','rate_limit_hits'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format(
        'DELETE FROM public.%I WHERE created_at < now() - interval ''14 days''', t);
      GET DIAGNOSTICS n = ROW_COUNT;
      RAISE NOTICE 'trimmed %: % rows', t, n;
      EXECUTE format('VACUUM (FULL, ANALYZE) public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 2) Rotation locks / ghost reservations jo 1 din se purane hain
DO $$
BEGIN
  IF to_regclass('public.rotation_locks') IS NOT NULL THEN
    DELETE FROM public.rotation_locks WHERE created_at < now() - interval '1 day';
  END IF;
END $$;

-- 3) Realtime + storage internal bloat
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DELETE FROM realtime.messages WHERE inserted_at < now() - interval '2 days';
  END IF;
END $$;

-- 4) Auth refresh tokens jo revoke/expire ho chuke hain (session bloat ka main source)
DELETE FROM auth.refresh_tokens
WHERE (revoked = true AND updated_at < now() - interval '7 days')
   OR updated_at < now() - interval '60 days';
DELETE FROM auth.sessions WHERE not_after IS NOT NULL AND not_after < now() - interval '7 days';
DELETE FROM auth.sessions s
WHERE NOT EXISTS (SELECT 1 FROM auth.refresh_tokens r WHERE r.session_id = s.id)
  AND s.updated_at < now() - interval '30 days';
VACUUM (FULL, ANALYZE) auth.refresh_tokens;
VACUUM (FULL, ANALYZE) auth.sessions;

-- 5) pg_stat_statements reset (memory + shared buffers)
SELECT pg_stat_statements_reset() WHERE to_regclass('public.pg_stat_statements') IS NOT NULL;

-- 6) Poore DB ka analyze + dead tuple reclaim (heavy tables ke liye)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, relname, n_dead_tup
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 10000
    ORDER BY n_dead_tup DESC
  LOOP
    RAISE NOTICE 'vacuum %.% (dead=%)', r.schemaname, r.relname, r.n_dead_tup;
    EXECUTE format('VACUUM (ANALYZE) %I.%I', r.schemaname, r.relname);
  END LOOP;
END $$;

-- 7) Top 15 sabse badi tables report
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 15;
