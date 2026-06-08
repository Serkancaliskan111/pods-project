-- 077: Operasyonel görevlerde proje bağlantısı (isler.proje_id)
-- Sadece genişletici: mevcut satırlar NULL kalır; bagli_is_id köprüsü korunur.

BEGIN;

ALTER TABLE public.isler
  ADD COLUMN IF NOT EXISTS proje_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'isler_proje_id_fkey'
      AND conrelid = 'public.isler'::regclass
  ) THEN
    ALTER TABLE public.isler
      ADD CONSTRAINT isler_proje_id_fkey
      FOREIGN KEY (proje_id) REFERENCES public.projeler(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_isler_proje_id_aktif
  ON public.isler (proje_id, updated_at DESC)
  WHERE proje_id IS NOT NULL;

COMMENT ON COLUMN public.isler.proje_id IS
  'Proje kapsamındaki operasyonel görev. NULL = şirket geneli normal görev. Planlama satırı proje_gorevleri.bagli_is_id ile eşleşebilir.';

-- Mevcut planlama↔operasyonel bağlantılarından geriye dönük doldurma (idempotent).
UPDATE public.isler i
SET proje_id = pg.proje_id
FROM public.proje_gorevleri pg
WHERE pg.bagli_is_id = i.id
  AND i.proje_id IS NULL
  AND pg.silindi_at IS NULL;

COMMIT;
