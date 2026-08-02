CREATE TABLE IF NOT EXISTS public.telegram_popup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  telegram_url text NOT NULL DEFAULT 'https://telegram.me/organicsmmofficial',
  title text NOT NULL DEFAULT 'Join Our Official Telegram Channel',
  description text NOT NULL DEFAULT 'Our users have been earning really well with OrganicSMM, and because of that a few competitors have been trying to attack the site. Nothing to worry about — everything is running safe and smooth.',
  note text NOT NULL DEFAULT '📢 Just as a precaution, please join our official Telegram channel so you never miss any updates, offers, or important announcements.',
  button_text text NOT NULL DEFAULT 'Join Telegram Channel',
  repeat_minutes integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.telegram_popup_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.telegram_popup_settings TO authenticated;
GRANT ALL ON public.telegram_popup_settings TO service_role;

ALTER TABLE public.telegram_popup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tg_popup public read" ON public.telegram_popup_settings;
CREATE POLICY "tg_popup public read" ON public.telegram_popup_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "tg_popup admin insert" ON public.telegram_popup_settings;
CREATE POLICY "tg_popup admin insert" ON public.telegram_popup_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tg_popup admin update" ON public.telegram_popup_settings;
CREATE POLICY "tg_popup admin update" ON public.telegram_popup_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "tg_popup admin delete" ON public.telegram_popup_settings;
CREATE POLICY "tg_popup admin delete" ON public.telegram_popup_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS telegram_popup_settings_updated_at ON public.telegram_popup_settings;
CREATE TRIGGER telegram_popup_settings_updated_at BEFORE UPDATE ON public.telegram_popup_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.telegram_popup_settings (enabled)
SELECT false WHERE NOT EXISTS (SELECT 1 FROM public.telegram_popup_settings);