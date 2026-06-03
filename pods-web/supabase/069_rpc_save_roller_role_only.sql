-- Yalnızca rpc_save_roller_role (068 çalıştı, 069 henüz değilse)
-- Supabase SQL Editor → Run

BEGIN;

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
