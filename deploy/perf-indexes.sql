-- OrganicSMM performance indexes (safe, idempotent). VPS par chalane ke liye:
--   sudo docker exec -i supabase-db psql -U postgres -d postgres < /opt/smmpanel/deploy/perf-indexes.sql

-- Admin deposit aggregates (transactions type+status scan)
CREATE INDEX IF NOT EXISTS idx_transactions_deposit_completed
  ON public.transactions (created_at DESC)
  WHERE type = 'deposit' AND status = 'completed';

-- Admin users list ordering
CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON public.profiles (created_at DESC);

-- Admin unread-message badge / mark-as-read updates
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON public.chat_messages (conversation_id)
  WHERE is_read = false;

-- Active subscription lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status, plan_type);

-- Engagement order detail page (runs by item, newest first)
CREATE INDEX IF NOT EXISTS idx_organic_runs_item_run
  ON public.organic_run_schedule (engagement_order_item_id, run_number);

ANALYZE public.transactions;
ANALYZE public.profiles;
ANALYZE public.organic_run_schedule;
