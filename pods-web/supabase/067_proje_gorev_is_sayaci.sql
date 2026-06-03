-- 067: Planlama görevlerinde yapılan / toplam iş sayacı (ilerleme otomatik)

BEGIN;

ALTER TABLE public.proje_gorevleri
  ADD COLUMN IF NOT EXISTS yapilan_is integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS toplam_is integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proje_gorevleri_is_sayaci_chk'
  ) THEN
    ALTER TABLE public.proje_gorevleri
      ADD CONSTRAINT proje_gorevleri_is_sayaci_chk
      CHECK (yapilan_is >= 0 AND toplam_is >= 1 AND yapilan_is <= toplam_is);
  END IF;
END $$;

COMMENT ON COLUMN public.proje_gorevleri.yapilan_is IS 'Tamamlanan iş birimi sayısı; ilerleme bundan hesaplanır.';
COMMENT ON COLUMN public.proje_gorevleri.toplam_is IS 'Toplam planlanan iş birimi; en az 1.';

COMMIT;
