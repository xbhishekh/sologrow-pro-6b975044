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
  IF NEW.status = 'started'
     AND NEW.provider_account_id IS NOT NULL
     AND NEW.engagement_order_item_id IS NOT NULL THEN
    SELECT lower(btrim(eo.link)), lower(btrim(eoi.engagement_type))
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