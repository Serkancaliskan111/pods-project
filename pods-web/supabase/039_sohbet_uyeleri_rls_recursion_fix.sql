-- sohbet_uyeleri_select içinde tekrar sohbet_uyeleri okumak RLS'i yeniden tetikler;
-- sohbet_kanallari_select ↔ sohbet_uyeleri_select karşılıklı tablo okuması da döngüdür.
-- "infinite recursion detected in relation sohbet_uyeleri".
-- Üyelik: chat_kanal_uyesi_mi (SECURITY DEFINER + row_security off).
--
-- Supabase/FORCE ROW LEVEL SECURITY ile tablo sahibi bile RLS'e takılırsa,
-- bu fonksiyondaki SELECT yine sohbet_uyeleri politikasını çalıştırır → döngü.
-- row_security = off: yalnızca EXISTS + auth.uid() filtresi; başka satır sızmaz.

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

DROP POLICY IF EXISTS sohbet_uyeleri_select ON public.sohbet_uyeleri;

CREATE POLICY sohbet_uyeleri_select ON public.sohbet_uyeleri
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.personeller p
      JOIN public.sohbet_kanallari k
        ON k.id = sohbet_uyeleri.kanal_id
       AND k.ana_sirket_id = p.ana_sirket_id
      WHERE p.kullanici_id = auth.uid()
        AND p.silindi_at IS NULL
    )
    AND public.chat_kanal_uyesi_mi(sohbet_uyeleri.kanal_id)
  );

DROP POLICY IF EXISTS sohbet_kanallari_select ON public.sohbet_kanallari;

CREATE POLICY sohbet_kanallari_select ON public.sohbet_kanallari
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.personeller p
      WHERE p.kullanici_id = auth.uid()
        AND p.silindi_at IS NULL
        AND sohbet_kanallari.ana_sirket_id = p.ana_sirket_id
    )
    AND public.chat_kanal_uyesi_mi(sohbet_kanallari.id)
  );

COMMIT;
