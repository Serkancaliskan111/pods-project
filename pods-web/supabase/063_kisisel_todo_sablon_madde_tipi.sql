-- Şablon maddesi tipi (metin / foto / video)
-- 062 uygulanmadıysa veya sadece bu kolon eksikse çalıştırın.

BEGIN;

ALTER TABLE public.kisisel_todo_sablon_maddeleri
  ADD COLUMN IF NOT EXISTS madde_tipi text NOT NULL DEFAULT 'metin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_kisisel_todo_sablon_madde_tipi'
  ) THEN
    ALTER TABLE public.kisisel_todo_sablon_maddeleri
      ADD CONSTRAINT chk_kisisel_todo_sablon_madde_tipi
      CHECK (madde_tipi IN ('metin', 'foto', 'video'));
  END IF;
END $$;

COMMENT ON COLUMN public.kisisel_todo_sablon_maddeleri.madde_tipi IS
  'metin | foto | video — yeni listeye kopyalanır';

NOTIFY pgrst, 'reload schema';

COMMIT;
