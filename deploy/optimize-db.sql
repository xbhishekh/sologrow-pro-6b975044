-- Performance indexes for high traffic / high order volume.
-- Safe to run repeatedly (IF NOT EXISTS everywhere).

-- Order history pages (user_id + newest first)
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_orders_user_created ON public.engagement_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_orders_created ON public.engagement_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eng_orders_order_number ON public.engagement_orders(order_number);

-- Order detail page (nested items + runs)
CREATE INDEX IF NOT EXISTS idx_eng_items_order_status ON public.engagement_order_items(engagement_order_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_item_scheduled ON public.organic_run_schedule(engagement_order_item_id, scheduled_at);

-- Scheduler hot path: pick next due runs
CREATE INDEX IF NOT EXISTS idx_runs_pending_due ON public.organic_run_schedule(scheduled_at)
  WHERE status IN ('pending','queued');
CREATE INDEX IF NOT EXISTS idx_runs_active ON public.organic_run_schedule(status, scheduled_at)
  WHERE status IN ('pending','queued','processing','started');

-- Loss guard / duplicate detection by link
CREATE INDEX IF NOT EXISTS idx_orders_link ON public.orders(link);
CREATE INDEX IF NOT EXISTS idx_eng_orders_link ON public.engagement_orders(link);

-- Wallet / deposits history
CREATE INDEX IF NOT EXISTS idx_deposits_user_created ON public.deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status_created ON public.deposits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions(created_at DESC);

-- Admin chat
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg ON public.chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msgs_unread ON public.chat_messages(conversation_id)
  WHERE is_read = false;

-- Provider rotation
CREATE INDEX IF NOT EXISTS idx_spm_service_priority ON public.service_provider_mapping(service_id, admin_priority)
  WHERE is_active = true;

ANALYZE;
