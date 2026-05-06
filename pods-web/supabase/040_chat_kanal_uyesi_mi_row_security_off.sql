-- 039 sonrası hâlâ "infinite recursion ... sohbet_uyeleri" görülüyorsa:
-- FORCE ROW LEVEL SECURITY nedeniyle DEFINER gövdesindeki SELECT de RLS'e giriyordu.
-- Bu migration yalnızca üyelik fonksiyonunda RLS'i kapatır (yalnızca EXISTS + auth.uid()).

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_kanal_uyesi_mi(p_kanal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sohbet_uyeleri u
    WHERE u.kanal_id = p_kanal_id
      AND u.kullanici_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.chat_kanal_uyesi_mi(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_kanal_uyesi_mi(uuid) TO authenticated;

COMMIT;
