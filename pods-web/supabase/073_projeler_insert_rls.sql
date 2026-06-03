-- 073: Proje oluşturma RLS — proje.yonet + oluşturanın INSERT RETURNING sonrası görebilmesi
-- 071 sonrası insert().select() SELECT politikası (proje_gorunur_mu) yüzünden başarısız olabiliyordu.

BEGIN;

-- ---------------------------------------------------------------------------
-- Oturum: sistem yöneticisi veya şirkette proje.yonet yetkisi
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_actor_can_manage_projects(p_ana_sirket_id uuid)
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
    JOIN public.roller r ON r.id = p.rol_id
    WHERE p.kullanici_id = auth.uid()
      AND p.silindi_at IS NULL
      AND (r.silindi_at IS NULL)
      AND p.ana_sirket_id = p_ana_sirket_id
      AND public.role_perm_truthy(r.yetkiler, 'proje.yonet')
  );
$$;

REVOKE ALL ON FUNCTION public.current_actor_can_manage_projects(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_actor_can_manage_projects(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Görünürlük: oluşturan (şirket kapsamında) her zaman kendi projesini görür
-- ---------------------------------------------------------------------------
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
    WHERE pr.id = p_proje_id
      AND pr.silindi_at IS NULL
      AND pr.olusturan_kullanici_id = auth.uid()
      AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
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
        EXISTS (
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

-- ---------------------------------------------------------------------------
-- projeler: oluşturma yalnızca proje.yonet; güncelleme/silme şirket kapsamı + görünürlük
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS projeler_insert_scope ON public.projeler;
CREATE POLICY projeler_insert_scope ON public.projeler
  FOR INSERT TO authenticated
  WITH CHECK (public.current_actor_can_manage_projects(ana_sirket_id));

DROP POLICY IF EXISTS projeler_update_scope ON public.projeler;
CREATE POLICY projeler_update_scope ON public.projeler
  FOR UPDATE TO authenticated
  USING (
    public.proje_gorunur_mu(id)
    AND public.projeler_kapsaminda_mi(ana_sirket_id)
  )
  WITH CHECK (
    public.proje_gorunur_mu(id)
    AND public.projeler_kapsaminda_mi(ana_sirket_id)
  );

DROP POLICY IF EXISTS projeler_delete_scope ON public.projeler;
CREATE POLICY projeler_delete_scope ON public.projeler
  FOR DELETE TO authenticated
  USING (
    public.proje_gorunur_mu(id)
    AND public.current_actor_can_manage_projects(ana_sirket_id)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
