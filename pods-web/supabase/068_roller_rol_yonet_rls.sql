-- 068: roller — rol.yonet yetkisi olanların şirket rollerini okuması/güncellemesi
-- role_perm_truthy: iç içe kategori JSON (OPERASYON, SISTEM, …) + legacy anahtarlar

BEGIN;

-- ---------------------------------------------------------------------------
-- Tek leaf değer truthy mi?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._role_perm_leaf_truthy(p_obj jsonb, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (
      lower(trim(coalesce(p_obj->>p_key, ''))) IN ('true', 't', '1', 'yes')
      OR (
        jsonb_typeof(p_obj->p_key) = 'boolean'
        AND (p_obj->p_key)::text = 'true'
      )
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- role_perm_truthy — düz + legacy takma + kategori altı
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.role_perm_truthy(p_yetkiler jsonb, p_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cat text;
  cats text[] := ARRAY[
    'OPERASYON', 'DENETIM', 'YONETIM', 'GUVENLIK', 'SISTEM',
    'Operasyon', 'Denetim', 'Yönetim', 'Güvenlik', 'Sistem',
    'operasyon', 'denetim', 'yonetim', 'guvenlik', 'sistem'
  ];
BEGIN
  IF p_yetkiler IS NULL OR p_yetkiler = 'null'::jsonb THEN
    RETURN false;
  END IF;

  IF public._role_perm_leaf_truthy(p_yetkiler, p_key) THEN
    RETURN true;
  END IF;

  IF p_key = 'rol.yonet' THEN
    IF public._role_perm_leaf_truthy(p_yetkiler, 'rol_yonet') THEN RETURN true; END IF;
    IF public._role_perm_leaf_truthy(p_yetkiler, 'roller_yonet') THEN RETURN true; END IF;
    IF public._role_perm_leaf_truthy(p_yetkiler, 'rol_yonet') THEN RETURN true; END IF;
  ELSIF p_key = 'personel.yonet' THEN
    IF public._role_perm_leaf_truthy(p_yetkiler, 'personel_yonet') THEN RETURN true; END IF;
  ELSIF p_key = 'proje.yonet' THEN
    IF public._role_perm_leaf_truthy(p_yetkiler, 'proje_yonet') THEN RETURN true; END IF;
  END IF;

  FOREACH cat IN ARRAY cats LOOP
    IF (p_yetkiler ? cat) AND jsonb_typeof(p_yetkiler->cat) = 'object' THEN
      IF public._role_perm_leaf_truthy(p_yetkiler->cat, p_key) THEN
        RETURN true;
      END IF;
      IF p_key = 'rol.yonet' THEN
        IF public._role_perm_leaf_truthy(p_yetkiler->cat, 'rol_yonet') THEN RETURN true; END IF;
        IF public._role_perm_leaf_truthy(p_yetkiler->cat, 'roller_yonet') THEN RETURN true; END IF;
      ELSIF p_key = 'personel.yonet' THEN
        IF public._role_perm_leaf_truthy(p_yetkiler->cat, 'personel_yonet') THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Oturum: sistem yöneticisi veya rol.yonet
-- ---------------------------------------------------------------------------
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
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_actor_can_manage_roles() FROM public;
GRANT EXECUTE ON FUNCTION public.current_actor_can_manage_roles() TO authenticated;

-- Kendi rol satırı (giriş / yetki okuma)
CREATE OR REPLACE FUNCTION public.current_actor_role_row_visible(p_rol_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.personeller p
    WHERE p.kullanici_id = auth.uid()
      AND p.silindi_at IS NULL
      AND p.rol_id = p_rol_id
  );
$$;

REVOKE ALL ON FUNCTION public.current_actor_role_row_visible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.current_actor_role_row_visible(uuid) TO authenticated;

-- Şirket kapsamındaki rol satırı
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
  )
  OR p_ana_sirket_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.role_row_in_actor_company(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.role_row_in_actor_company(uuid) TO authenticated;

ALTER TABLE public.roller ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roller_select_scope ON public.roller;
CREATE POLICY roller_select_scope ON public.roller
  FOR SELECT TO authenticated
  USING (
    (silindi_at IS NULL)
    AND (
      public.current_actor_can_manage_roles()
      AND public.role_row_in_actor_company(ana_sirket_id)
    )
    OR public.current_actor_role_row_visible(id)
  );

DROP POLICY IF EXISTS roller_insert_scope ON public.roller;
CREATE POLICY roller_insert_scope ON public.roller
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_actor_can_manage_roles()
    AND public.role_row_in_actor_company(ana_sirket_id)
    AND silindi_at IS NULL
  );

DROP POLICY IF EXISTS roller_update_scope ON public.roller;
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

-- Kayıt RPC (069 ile güncellenir; yalnız 068 çalıştırıldıysa da oluşur)
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
