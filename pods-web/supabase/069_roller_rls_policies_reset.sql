-- 069: Eski/bilinmeyen roller RLS politikalarını temizle + kapsam düzeltmesi
-- 068 sonrası hâlâ düzenlenemiyorsa bu dosyayı da çalıştırın.

BEGIN;

-- Tüm mevcut roller politikalarını kaldır (isim çakışması / eski deny kuralları)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'roller'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.roller', pol.policyname);
  END LOOP;
END $$;

-- Şirket kapsamı: global roller yalnızca sistem yöneticisi (önceki sürümde NULL herkese açıktı)
CREATE OR REPLACE FUNCTION public.role_row_in_actor_company(p_ana_sirket_id uuid)
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
    p_ana_sirket_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.personeller p
      WHERE p.kullanici_id = auth.uid()
        AND p.silindi_at IS NULL
        AND p.ana_sirket_id = p_ana_sirket_id
    )
  );
$$;

-- Rol yöneticisi: rol.yonet + legacy + is_admin / is_manager
CREATE OR REPLACE FUNCTION public.current_actor_can_manage_roles()
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
      AND (
        public.role_perm_truthy(r.yetkiler, 'rol.yonet')
        OR public.role_perm_truthy(r.yetkiler, 'rol_yonet')
        OR public.role_perm_truthy(r.yetkiler, 'roller_yonet')
        OR public.role_perm_truthy(r.yetkiler, 'is_admin')
        OR public.role_perm_truthy(r.yetkiler, 'is_manager')
      )
  );
$$;

ALTER TABLE public.roller ENABLE ROW LEVEL SECURITY;

CREATE POLICY roller_select_scope ON public.roller
  FOR SELECT TO authenticated
  USING (
    (silindi_at IS NULL)
    AND (
      (
        public.current_actor_can_manage_roles()
        AND public.role_row_in_actor_company(ana_sirket_id)
      )
      OR public.current_actor_role_row_visible(id)
    )
  );

CREATE POLICY roller_insert_scope ON public.roller
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_actor_can_manage_roles()
    AND public.role_row_in_actor_company(ana_sirket_id)
    AND silindi_at IS NULL
  );

CREATE POLICY roller_update_scope ON public.roller
  FOR UPDATE TO authenticated
  USING (
    public.current_actor_can_manage_roles()
    AND public.role_row_in_actor_company(ana_sirket_id)
  )
  WITH CHECK (
    public.current_actor_can_manage_roles()
    AND public.role_row_in_actor_company(ana_sirket_id)
  );

-- Güvenli kayıt: RLS yine de engellerse açık hata
CREATE OR REPLACE FUNCTION public.rpc_save_roller_role(
  p_rol_id uuid,
  p_rol_adi text,
  p_ana_sirket_id uuid,
  p_yetkiler jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.roller%ROWTYPE;
  v_name text;
BEGIN
  IF NOT public.current_actor_can_manage_roles() THEN
    RAISE EXCEPTION 'Rol kaydetme yetkiniz yok (rol.yonet gerekli).'
      USING ERRCODE = '42501';
  END IF;

  v_name := trim(coalesce(p_rol_adi, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Rol adı zorunludur.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.role_row_in_actor_company(p_ana_sirket_id) THEN
    RAISE EXCEPTION 'Bu şirket kapsamında rol kaydedemezsiniz.'
      USING ERRCODE = '42501';
  END IF;

  IF p_rol_id IS NULL THEN
    INSERT INTO public.roller (rol_adi, ana_sirket_id, yetkiler, silindi_at)
    VALUES (v_name, p_ana_sirket_id, coalesce(p_yetkiler, '{}'::jsonb), NULL)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.roller
    SET
      rol_adi = v_name,
      ana_sirket_id = p_ana_sirket_id,
      yetkiler = coalesce(p_yetkiler, '{}'::jsonb)
    WHERE id = p_rol_id
      AND silindi_at IS NULL
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rol bulunamadı veya güncelleme kapsam dışı.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_roller_role(uuid, text, uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_save_roller_role(uuid, text, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
