-- 074: Proje RLS düzeltmesi — proje.yonet algılama + proje_sorumlulari alt sorgu tuzağı
-- 073 sonrası yetkisi olan kullanıcıda insert/ekip ekleme hâlâ başarısız olabiliyordu:
-- 1) roller.silindi_at / yetkiler okuma
-- 2) proje_sorumlulari INSERT içinde projeler SELECT (RLS) — yeni proje görünmez

BEGIN;

-- ---------------------------------------------------------------------------
-- Şirkette proje.yonet (frontend isPermTruthy ile uyumlu)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._actor_has_proje_yonet_for_company(p_ana_sirket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.personeller p
    LEFT JOIN public.roller r ON r.id = p.rol_id
    WHERE p.kullanici_id = auth.uid()
      AND p.silindi_at IS NULL
      AND p.ana_sirket_id = p_ana_sirket_id
      AND (
        public.role_perm_truthy(coalesce(r.yetkiler, '{}'::jsonb), 'proje.yonet')
        OR public._role_perm_leaf_truthy(coalesce(r.yetkiler, '{}'::jsonb), 'proje_yonet')
      )
  );
$$;

REVOKE ALL ON FUNCTION public._actor_has_proje_yonet_for_company(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._actor_has_proje_yonet_for_company(uuid) TO authenticated;

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
  OR (
    public.projeler_kapsaminda_mi(p_ana_sirket_id)
    AND public._actor_has_proje_yonet_for_company(p_ana_sirket_id)
  );
$$;

REVOKE ALL ON FUNCTION public.current_actor_can_manage_projects(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_actor_can_manage_projects(uuid) TO authenticated;

-- Proje satırı şirket kapsamında mı (RLS bypass — alt politika alt sorguları için)
CREATE OR REPLACE FUNCTION public.proje_sirket_kapsaminda_mi(p_proje_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projeler pr
    WHERE pr.id = p_proje_id
      AND pr.silindi_at IS NULL
      AND public.projeler_kapsaminda_mi(pr.ana_sirket_id)
  );
$$;

REVOKE ALL ON FUNCTION public.proje_sirket_kapsaminda_mi(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.proje_sirket_kapsaminda_mi(uuid) TO authenticated;

-- Proje ana_sirket_id (RLS bypass)
CREATE OR REPLACE FUNCTION public.proje_ana_sirket_id(p_proje_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.ana_sirket_id
  FROM public.projeler pr
  WHERE pr.id = p_proje_id
    AND pr.silindi_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.proje_ana_sirket_id(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.proje_ana_sirket_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- proje_sorumlulari — projeler alt sorgusunda RLS tuzağını kaldır
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS proje_sorumlulari_select ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_select ON public.proje_sorumlulari
  FOR SELECT TO authenticated
  USING (public.proje_gorunur_mu(proje_id));

DROP POLICY IF EXISTS proje_sorumlulari_insert ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_insert ON public.proje_sorumlulari
  FOR INSERT TO authenticated
  WITH CHECK (
    public.proje_sirket_kapsaminda_mi(proje_id)
    AND EXISTS (
      SELECT 1
      FROM public.personeller pe
      WHERE pe.id = personel_id
        AND pe.silindi_at IS NULL
        AND pe.ana_sirket_id = public.proje_ana_sirket_id(proje_id)
    )
    AND (
      public.proje_gorunur_mu(proje_id)
      OR public.current_actor_can_manage_projects(public.proje_ana_sirket_id(proje_id))
    )
  );

DROP POLICY IF EXISTS proje_sorumlulari_delete ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_delete ON public.proje_sorumlulari
  FOR DELETE TO authenticated
  USING (
    public.proje_sirket_kapsaminda_mi(proje_id)
    AND (
      public.proje_gorunur_mu(proje_id)
      OR public.current_actor_can_manage_projects(public.proje_ana_sirket_id(proje_id))
    )
  );

DROP POLICY IF EXISTS proje_sorumlulari_update ON public.proje_sorumlulari;
CREATE POLICY proje_sorumlulari_update ON public.proje_sorumlulari
  FOR UPDATE TO authenticated
  USING (
    public.proje_sirket_kapsaminda_mi(proje_id)
    AND public.proje_gorunur_mu(proje_id)
  )
  WITH CHECK (
    public.proje_sirket_kapsaminda_mi(proje_id)
    AND public.proje_gorunur_mu(proje_id)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
