-- 064: Proje yönetimi — projeler, hiyerarşik proje görevleri (alt görev), Gantt için tarih alanları

BEGIN;

CREATE TABLE IF NOT EXISTS public.projeler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ana_sirket_id uuid NOT NULL REFERENCES public.ana_sirketler(id) ON DELETE CASCADE,
  birim_id uuid REFERENCES public.birimler(id) ON DELETE SET NULL,
  baslik text NOT NULL,
  aciklama text,
  kod text,
  durum text NOT NULL DEFAULT 'planlama'
    CHECK (durum IN ('planlama', 'devam', 'tamamlandi', 'beklemede', 'iptal')),
  oncelik text NOT NULL DEFAULT 'normal'
    CHECK (oncelik IN ('dusuk', 'normal', 'yuksek', 'kritik')),
  baslangic_tarihi date,
  bitis_tarihi date,
  renk text NOT NULL DEFAULT '#2563EB',
  sorumlu_personel_id uuid REFERENCES public.personeller(id) ON DELETE SET NULL,
  olusturan_kullanici_id uuid REFERENCES public.kullanicilar(id) ON DELETE SET NULL,
  olusturulma_at timestamptz NOT NULL DEFAULT now(),
  guncelleme_at timestamptz NOT NULL DEFAULT now(),
  silindi_at timestamptz,
  CONSTRAINT projeler_tarih_chk CHECK (
    baslangic_tarihi IS NULL
    OR bitis_tarihi IS NULL
    OR bitis_tarihi >= baslangic_tarihi
  )
);

CREATE INDEX IF NOT EXISTS idx_projeler_sirket_aktif
  ON public.projeler (ana_sirket_id, durum)
  WHERE silindi_at IS NULL;

CREATE TABLE IF NOT EXISTS public.proje_gorevleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proje_id uuid NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.proje_gorevleri(id) ON DELETE CASCADE,
  baslik text NOT NULL,
  aciklama text,
  baslangic_tarihi date NOT NULL,
  bitis_tarihi date NOT NULL,
  durum text NOT NULL DEFAULT 'yapilacak'
    CHECK (durum IN ('yapilacak', 'devam', 'tamamlandi', 'bloke')),
  ilerleme smallint NOT NULL DEFAULT 0
    CHECK (ilerleme >= 0 AND ilerleme <= 100),
  sira integer NOT NULL DEFAULT 0,
  sorumlu_personel_id uuid REFERENCES public.personeller(id) ON DELETE SET NULL,
  bagli_is_id uuid REFERENCES public.isler(id) ON DELETE SET NULL,
  olusturulma_at timestamptz NOT NULL DEFAULT now(),
  guncelleme_at timestamptz NOT NULL DEFAULT now(),
  silindi_at timestamptz,
  CONSTRAINT proje_gorev_tarih_chk CHECK (bitis_tarihi >= baslangic_tarihi)
);

CREATE INDEX IF NOT EXISTS idx_proje_gorev_proje_aktif
  ON public.proje_gorevleri (proje_id, sira)
  WHERE silindi_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proje_gorev_parent
  ON public.proje_gorevleri (parent_id)
  WHERE silindi_at IS NULL AND parent_id IS NOT NULL;

COMMENT ON TABLE public.projeler IS 'Planlama projeleri — operasyonel isler tablosundan bagimsiz; istege bagli bagli_is_id ile eslenebilir.';
COMMENT ON TABLE public.proje_gorevleri IS 'Proje gorevleri; parent_id ile alt gorev hiyerarsisi.';

CREATE OR REPLACE FUNCTION public.projeler_kapsaminda_mi(p_ana_sirket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kullanicilar k
    WHERE k.id = auth.uid()
      AND coalesce(k.is_system_admin, false) = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.personeller p
    WHERE p.kullanici_id = auth.uid()
      AND p.silindi_at IS NULL
      AND p.ana_sirket_id = p_ana_sirket_id
  );
$$;

REVOKE ALL ON FUNCTION public.projeler_kapsaminda_mi(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.projeler_kapsaminda_mi(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_projeler_guncelleme_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.guncelleme_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projeler_guncelleme_at ON public.projeler;
CREATE TRIGGER trg_projeler_guncelleme_at
  BEFORE UPDATE ON public.projeler
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_projeler_guncelleme_at();

DROP TRIGGER IF EXISTS trg_proje_gorevleri_guncelleme_at ON public.proje_gorevleri;
CREATE TRIGGER trg_proje_gorevleri_guncelleme_at
  BEFORE UPDATE ON public.proje_gorevleri
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_projeler_guncelleme_at();

ALTER TABLE public.projeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proje_gorevleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projeler_select_scope ON public.projeler;
CREATE POLICY projeler_select_scope ON public.projeler
  FOR SELECT TO authenticated
  USING (
    silindi_at IS NULL
    AND public.projeler_kapsaminda_mi(ana_sirket_id)
  );

DROP POLICY IF EXISTS projeler_insert_scope ON public.projeler;
CREATE POLICY projeler_insert_scope ON public.projeler
  FOR INSERT TO authenticated
  WITH CHECK (public.projeler_kapsaminda_mi(ana_sirket_id));

DROP POLICY IF EXISTS projeler_update_scope ON public.projeler;
CREATE POLICY projeler_update_scope ON public.projeler
  FOR UPDATE TO authenticated
  USING (public.projeler_kapsaminda_mi(ana_sirket_id))
  WITH CHECK (public.projeler_kapsaminda_mi(ana_sirket_id));

DROP POLICY IF EXISTS projeler_delete_scope ON public.projeler;
CREATE POLICY projeler_delete_scope ON public.projeler
  FOR DELETE TO authenticated
  USING (public.projeler_kapsaminda_mi(ana_sirket_id));

DROP POLICY IF EXISTS proje_gorevleri_select_scope ON public.proje_gorevleri;
CREATE POLICY proje_gorevleri_select_scope ON public.proje_gorevleri
  FOR SELECT TO authenticated
  USING (
    silindi_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND pr.silindi_at IS NULL
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

DROP POLICY IF EXISTS proje_gorevleri_insert_scope ON public.proje_gorevleri;
CREATE POLICY proje_gorevleri_insert_scope ON public.proje_gorevleri
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND pr.silindi_at IS NULL
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

DROP POLICY IF EXISTS proje_gorevleri_update_scope ON public.proje_gorevleri;
CREATE POLICY proje_gorevleri_update_scope ON public.proje_gorevleri
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

DROP POLICY IF EXISTS proje_gorevleri_delete_scope ON public.proje_gorevleri;
CREATE POLICY proje_gorevleri_delete_scope ON public.proje_gorevleri
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projeler pr
      WHERE pr.id = proje_id
        AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
    )
  );

COMMIT;
