DROP POLICY IF EXISTS "Anyone can view bundle items" ON public.bundle_items;
CREATE POLICY "Anyone can view bundle items" ON public.bundle_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.engagement_bundles eb WHERE eb.id = bundle_items.bundle_id AND eb.is_active = true));
DROP POLICY IF EXISTS "tg_popup public read" ON public.telegram_popup_settings;
CREATE POLICY "tg_popup public read" ON public.telegram_popup_settings FOR SELECT USING (enabled = true);