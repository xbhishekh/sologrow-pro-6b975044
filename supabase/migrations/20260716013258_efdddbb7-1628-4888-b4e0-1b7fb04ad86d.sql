-- 1) Items delivered >= quantity but not marked complete
UPDATE public.engagement_order_items
   SET status = 'completed',
       completion_locked_at = COALESCE(completion_locked_at, now()),
       updated_at = now()
 WHERE quantity > 0
   AND delivered_count >= quantity
   AND status NOT IN ('completed','cancelled');

-- 2) Items processing/pending with no active runs left → partial (if some delivered) else leave for retry
UPDATE public.engagement_order_items eoi
   SET status = 'partial',
       updated_at = now()
 WHERE eoi.status IN ('pending','processing')
   AND eoi.delivered_count > 0
   AND eoi.delivered_count < eoi.quantity
   AND NOT EXISTS (
     SELECT 1 FROM public.organic_run_schedule r
      WHERE r.engagement_order_item_id = eoi.id
        AND r.status IN ('pending','started')
   );

-- 3) Parent engagement_orders where every item is in a terminal state → completed
UPDATE public.engagement_orders eo
   SET status = 'completed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE eo.status NOT IN ('completed','cancelled')
   AND NOT EXISTS (
     SELECT 1 FROM public.engagement_order_items i
      WHERE i.engagement_order_id = eo.id
        AND i.status NOT IN ('completed','cancelled','partial','failed')
   )
   AND EXISTS (
     SELECT 1 FROM public.engagement_order_items i
      WHERE i.engagement_order_id = eo.id
   );