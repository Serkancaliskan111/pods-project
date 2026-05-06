-- Mesaj INSERT’ı oturum sahibi (authenticated) olarak çalışsın; böylece RLS ile SELECT/liste aynı kuralları kullanır.
-- SECURITY DEFINER ile yazılıp istemcinin SELECT politikasından “görünmez” kalan satırlar: yenileyince sohbet boş kalırdı.
--
-- 037’deki ALTER FUNCTION ... SET row_security = off kalıntısını kaldırır (CREATE OR REPLACE ayarı koruyabilir).

BEGIN;

CREATE OR REPLACE FUNCTION public.chat_mesaj_gonder(p_kanal_id uuid, p_icerik text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_mid bigint;
  v_text text := trim(p_icerik);
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;
  IF v_text IS NULL OR length(v_text) = 0 THEN
    RAISE EXCEPTION 'Mesaj boş olamaz';
  END IF;
  IF length(v_text) > 8000 THEN
    RAISE EXCEPTION 'Mesaj çok uzun';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sohbet_uyeleri u
    JOIN public.personeller p ON p.kullanici_id = v_me AND p.silindi_at IS NULL
    JOIN public.sohbet_kanallari k ON k.id = u.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
    WHERE u.kanal_id = p_kanal_id
      AND u.kullanici_id = v_me
  ) THEN
    RAISE EXCEPTION 'Bu kanala yazma yetkiniz yok';
  END IF;

  INSERT INTO public.sohbet_mesajlari (kanal_id, gonderen_kullanici_id, icerik)
  VALUES (p_kanal_id, v_me, v_text)
  RETURNING id INTO v_mid;

  RETURN v_mid;
END;
$$;

ALTER FUNCTION public.chat_mesaj_gonder(uuid, text) RESET row_security;

GRANT EXECUTE ON FUNCTION public.chat_mesaj_gonder(uuid, text) TO authenticated;

COMMIT;
