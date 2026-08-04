CREATE INDEX IF NOT EXISTS idx_transactions_deposit_completed ON public.transactions (created_at DESC) WHERE type = 'deposit' AND status = 'completed';
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON public.chat_messages (conversation_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status, plan_type);
CREATE INDEX IF NOT EXISTS idx_organic_runs_item_run ON public.organic_run_schedule (engagement_order_item_id, run_number);