-- Atomic loss guard for provider rotation.
-- A provider account may hold only one active run for the same link + engagement type.
ALTER TABLE public.organic_run_schedule
  ADD COLUMN IF NOT EXISTS rotation_lock_key text;

CREATE OR REPLACE FUNCTION public.compute_rotation_lock_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text;
  v_type text;
BEGIN
  IF lower(btrim(COALESCE(NEW.status, ''))) = 'started'
     AND NEW.provider_account_id IS NOT NULL
     AND NEW.engagement_order_item_id IS NOT NULL THEN
    SELECT lower(regexp_replace(btrim(eo.link), '/$', '')),
           lower(btrim(eoi.engagement_type))
      INTO v_link, v_type
    FROM public.engagement_order_items eoi
    JOIN public.engagement_orders eo ON eo.id = eoi.engagement_order_id
    WHERE eoi.id = NEW.engagement_order_item_id;

    IF COALESCE(v_link, '') <> '' AND COALESCE(v_type, '') <> '' THEN
      NEW.rotation_lock_key := v_link || '||' || v_type || '||' || NEW.provider_account_id::text;
    ELSE
      NEW.rotation_lock_key := NULL;
    END IF;
  ELSE
    NEW.rotation_lock_key := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_rotation_lock_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_rotation_lock_key() TO service_role;

DROP TRIGGER IF EXISTS trg_compute_rotation_lock_key ON public.organic_run_schedule;
CREATE TRIGGER trg_compute_rotation_lock_key
BEFORE INSERT OR UPDATE OF status, provider_order_id, provider_account_id, engagement_order_item_id
ON public.organic_run_schedule
FOR EACH ROW EXECUTE FUNCTION public.compute_rotation_lock_key();

UPDATE public.organic_run_schedule
SET rotation_lock_key = NULL
WHERE rotation_lock_key IS NOT NULL;

-- Keep one lock holder if historical duplicates already exist. The later rows
-- represent provider orders that were already paid for, so do not cancel or
-- resend them; they simply finish normally while the earliest active row holds
-- the lock against any new duplicate dispatch.
WITH ranked_active AS (
  SELECT
    rs.id,
    lower(regexp_replace(btrim(eo.link), '/$', ''))
      || '||' || lower(btrim(eoi.engagement_type))
      || '||' || rs.provider_account_id::text AS lock_key,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(btrim(eo.link), '/$', '')),
                   lower(btrim(eoi.engagement_type)),
                   rs.provider_account_id
      ORDER BY rs.started_at NULLS LAST, rs.id
    ) AS lock_rank
  FROM public.organic_run_schedule rs
  JOIN public.engagement_order_items eoi ON eoi.id = rs.engagement_order_item_id
  JOIN public.engagement_orders eo ON eo.id = eoi.engagement_order_id
  WHERE lower(btrim(COALESCE(rs.status, ''))) = 'started'
    AND rs.provider_account_id IS NOT NULL
)
UPDATE public.organic_run_schedule rs
SET rotation_lock_key = CASE WHEN ranked_active.lock_rank = 1 THEN ranked_active.lock_key ELSE NULL END
FROM ranked_active
WHERE rs.id = ranked_active.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_rotation_lock
  ON public.organic_run_schedule (rotation_lock_key)
  WHERE rotation_lock_key IS NOT NULL;