-- 071: Proje yetkilileri (rol=yetkili) + görünürlük yalnızca ekip / yetkili / görev sorumlusu / oluşturan

BEGIN;

ALTER TABLE public.proje_sorumlulari
  DROP CONSTRAINT IF EXISTS proje_sorumlulari_rol_check;

ALTER TABLE public.proje_sorumlulari
  ADD CONSTRAINT proje_sorumlulari_rol_check
  CHECK (rol IN ('uye', 'yetkili'));

COMMENT ON COLUMN public.proje_sorumlulari.rol IS 'uye=proje ekibi (görev ataması); yetkili=proje.yonet yöneticisi (göreve atanmaz).';

CREATE OR REPLACE FUNCTION public.proje_gorunur_mu(p_proje_id uuid)
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
    FROM public.projeler pr
    JOIN public.personeller p
      ON p.kullanici_id = auth.uid()
      AND p.silindi_at IS NULL
      AND p.ana_sirket_id = pr.ana_sirket_id
    WHERE pr.id = p_proje_id
      AND pr.silindi_at IS NULL
      AND (
        pr.olusturan_kullanici_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.proje_sorumlulari ps
          WHERE ps.proje_id = pr.id
            AND ps.personel_id = p.id
        )
        OR EXISTS (
          SELECT 1
          FROM public.proje_gorevleri pg
          WHERE pg.proje_id = pr.id
            AND pg.sorumlu_personel_id = p.id
            AND pg.silindi_at IS NULL
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.proje_gorunur_mu(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.proje_gorunur_mu(uuid) TO authenticated;

DROP POLICY IF EXISTS projeler_select_scope ON public.projeler;
CREATE POLICY projeler_select_scope ON public.projeler
  FOR SELECT TO authenticated
  USING (
    silindi_at IS NULL
    AND public.proje_gorunur_mu(id)
  );

DROP POLICY IF EXISTS proje_gorevleri_select_scope ON public.proje_gorevleri;
CREATE POLICY proje_gorevleri_select_scope ON public.proje_gorevleri
  FOR SELECT TO authenticated
  USING (
    silindi_at IS NULL
    AND public.proje_gorunur_mu(proje_id)
  );

DROP POLICY IF EXISTS proje_sorumlulari_select ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_select ON public.proje_sorumlulari
  FOR SELECT TO authenticated
  USING (public.proje_gorunur_mu(proje_id));

NOTIFY pgrst, 'reload schema';

COMMIT;
