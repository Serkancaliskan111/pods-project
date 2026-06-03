-- 065: Proje sorumluları (ekip) — görev atamalarında yalnızca bu liste kullanılır

BEGIN;

CREATE TABLE IF NOT EXISTS public.proje_sorumlulari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id uuid NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  personel_id uuid NOT NULL REFERENCES public.personeller(id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'uye'
    CHECK (rol IN ('lider', 'uye')),
  sira integer NOT NULL DEFAULT 0,
  eklendi_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_proje_sorumlu_personel UNIQUE (proje_id, personel_id)
);

CREATE INDEX IF NOT EXISTS idx_proje_sorumlulari_proje
  ON public.proje_sorumlulari (proje_id, sira);

COMMENT ON TABLE public.proje_sorumlulari IS 'Projeye dahil ekip; görev/alt görev sorumlusu yalnızca bu listeden seçilir.';

-- Mevcut tek sorumluyu ekibe taşı
INSERT INTO public.proje_sorumlulari (proje_id, personel_id, rol, sira)
SELECT p.id, p.sorumlu_personel_id, 'lider', 0
FROM public.projeler p
WHERE p.sorumlu_personel_id IS NOT NULL
  AND p.silindi_at IS NULL
ON CONFLICT (proje_id, personel_id) DO NOTHING;

ALTER TABLE public.proje_sorumlulari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proje_sorumlulari_select ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_select ON public.proje_sorumlulari
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND pr.silindi_at IS NULL
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

DROP POLICY IF EXISTS proje_sorumlulari_insert ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_insert ON public.proje_sorumlulari
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND pr.silindi_at IS NULL
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.personeller pe
      WHERE pe.id = personel_id
        AND pe.silindi_at IS NULL
        AND pe.ana_sirket_id = (
          SELECT pr.ana_sirket_id FROM public.projeler pr WHERE pr.id = proje_id
        )
    )
  );

DROP POLICY IF EXISTS proje_sorumlulari_delete ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_delete ON public.proje_sorumlulari
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

DROP POLICY IF EXISTS proje_sorumlulari_update ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_update ON public.proje_sorumlulari
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

COMMIT;
