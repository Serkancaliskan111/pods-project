-- 059: Kullanıcı panel görünüm tercihleri (sidebar rengi vb.) — mevcut kolonlara dokunmaz

BEGIN;

ALTER TABLE IF EXISTS public.kullanicilar
  ADD COLUMN IF NOT EXISTS arayuz_tercihleri jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.kullanicilar.arayuz_tercihleri IS
  'Panel UI tercihleri (JSON): sidebarBg, accentColor, pageBg, density, fontScale, cornerStyle. Kullanıcı başına.';

COMMIT;
