-- 066: Proje planlama görevlerine operasyonel görev tipi (6 mod)

BEGIN;

ALTER TABLE public.proje_gorevleri
  ADD COLUMN IF NOT EXISTS gorev_tipi text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS plan_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proje_gorevleri_gorev_tipi_chk'
  ) THEN
    ALTER TABLE public.proje_gorevleri
      ADD CONSTRAINT proje_gorevleri_gorev_tipi_chk
      CHECK (
        gorev_tipi IN (
          'normal',
          'sablon_gorev',
          'zincir_gorev',
          'zincir_onay',
          'zincir_gorev_ve_onay',
          'sirali_gorev'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.proje_gorevleri.gorev_tipi IS 'Operasyonel görev modu ile aynı 6 tip; planlama ve Gantt için.';
COMMENT ON COLUMN public.proje_gorevleri.plan_meta IS 'Tip özel atama verisi: zincir sıraları, şablon id, sıralı adımlar vb.';

COMMIT;
