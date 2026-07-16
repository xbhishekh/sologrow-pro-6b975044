
-- 1. Deactivate mappings that consistently return "Service inactive" from provider
UPDATE service_provider_mapping SET is_active = false
WHERE (service_id='2644987f-bbe9-4646-8727-da1e15c95b3f' AND provider_account_id IN ('051784a5-a866-41b6-9859-ef1215e0bfb7','13831e62-2ddb-48da-bce6-9dd9b8e236e0'))
   OR (service_id='6d24ce9f-81aa-475f-9443-490d3395213f' AND provider_account_id IN ('226af5dc-1a87-4cdb-bf52-a33c4d1de8e7','13831e62-2ddb-48da-bce6-9dd9b8e236e0'));

-- 2. Reset stale started runs (>2h no completion) back to pending
UPDATE organic_run_schedule
SET status='pending', started_at=NULL, provider_account_id=NULL, provider_account_name=NULL,
    provider_order_id=NULL, provider_response=NULL, provider_status=NULL,
    error_message='Auto-reset: stale started run',
    scheduled_at = now() - interval '10 second'
WHERE status='started' AND started_at < now() - interval '2 hour'
  AND (provider_order_id IS NULL OR provider_status IS NULL);

-- 3. Unblock all pending runs stuck on "Service is inactive" or "Postponed" or "busy"
UPDATE organic_run_schedule
SET scheduled_at = now() - interval '5 second',
    error_message = NULL,
    provider_response = NULL
WHERE status='pending'
  AND (
    error_message ILIKE '%Service is inactive%'
    OR error_message ILIKE '%Postponed%'
    OR error_message ILIKE '%accounts busy%'
    OR error_message ILIKE '%all providers busy%'
  );
