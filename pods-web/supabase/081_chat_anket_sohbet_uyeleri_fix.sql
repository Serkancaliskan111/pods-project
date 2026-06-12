-- Anket RPC: doğrudan sohbet_uyeleri okuması FORCE RLS ile 42501 veriyor
-- ("query would be affected by row-level security policy for table sohbet_uyeleri").
-- Üyelik: chat_kanal_uyesi_mi (039/040, SECURITY DEFINER + row_security off).

BEGIN;

-- ---------------------------------------------------------------------------
-- INSERT RLS (080 ile aynı; sohbet_uyeleri JOIN yerine chat_kanal_uyesi_mi)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS sohbet_anketleri_insert ON public.sohbet_anketleri;
CREATE POLICY sohbet_anketleri_insert ON public.sohbet_anketleri
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.personeller p
        ON p.kullanici_id = auth.uid() AND p.silindi_at IS NULL
      JOIN public.sohbet_kanallari k
        ON k.id = m.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
      WHERE m.id = sohbet_anketleri.mesaj_id
        AND m.gonderen_kullanici_id = auth.uid()
        AND m.mesaj_tipi = 'poll'
        AND public.chat_kanal_uyesi_mi(m.kanal_id)
    )
  );

DROP POLICY IF EXISTS sohbet_anket_secenekleri_insert ON public.sohbet_anket_secenekleri;
CREATE POLICY sohbet_anket_secenekleri_insert ON public.sohbet_anket_secenekleri
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.personeller p
        ON p.kullanici_id = auth.uid() AND p.silindi_at IS NULL
      JOIN public.sohbet_kanallari k
        ON k.id = m.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
      WHERE m.id = sohbet_anket_secenekleri.mesaj_id
        AND m.gonderen_kullanici_id = auth.uid()
        AND m.mesaj_tipi = 'poll'
        AND public.chat_kanal_uyesi_mi(m.kanal_id)
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: anket oluştur
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_anket_gonder(
  p_kanal_id uuid,
  p_soru text,
  p_secenekler text[],
  p_coklu_secim boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_mid bigint;
  v_soru text := trim(coalesce(p_soru, ''));
  v_opt text;
  v_i int := 0;
  v_cnt int := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF length(v_soru) = 0 OR length(v_soru) > 500 THEN
    RAISE EXCEPTION 'Anket sorusu geçersiz';
  END IF;

  IF p_secenekler IS NULL OR array_length(p_secenekler, 1) IS NULL THEN
    RAISE EXCEPTION 'En az 2 seçenek gerekli';
  END IF;

  IF array_length(p_secenekler, 1) < 2 OR array_length(p_secenekler, 1) > 10 THEN
    RAISE EXCEPTION 'Seçenek sayısı 2–10 arasında olmalı';
  END IF;

  IF NOT public.chat_kanal_uyesi_mi(p_kanal_id) THEN
    RAISE EXCEPTION 'Bu kanala yazma yetkiniz yok';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sohbet_kanallari k
    JOIN public.personeller p
      ON p.kullanici_id = v_me
     AND p.silindi_at IS NULL
     AND k.ana_sirket_id = p.ana_sirket_id
    WHERE k.id = p_kanal_id
  ) THEN
    RAISE EXCEPTION 'Bu kanala yazma yetkiniz yok';
  END IF;

  INSERT INTO public.sohbet_mesajlari (
    kanal_id,
    gonderen_kullanici_id,
    icerik,
    mesaj_tipi
  )
  VALUES (p_kanal_id, v_me, v_soru, 'poll')
  RETURNING id INTO v_mid;

  INSERT INTO public.sohbet_anketleri (mesaj_id, soru, coklu_secim)
  VALUES (v_mid, v_soru, coalesce(p_coklu_secim, false));

  FOREACH v_opt IN ARRAY p_secenekler LOOP
    v_opt := trim(coalesce(v_opt, ''));
    IF length(v_opt) = 0 OR length(v_opt) > 200 THEN
      RAISE EXCEPTION 'Geçersiz seçenek metni';
    END IF;
    INSERT INTO public.sohbet_anket_secenekleri (mesaj_id, sira, metin)
    VALUES (v_mid, v_i, v_opt);
    v_i := v_i + 1;
    v_cnt := v_cnt + 1;
  END LOOP;

  IF v_cnt < 2 THEN
    RAISE EXCEPTION 'En az 2 geçerli seçenek gerekli';
  END IF;

  RETURN v_mid;
END;
$$;

ALTER FUNCTION public.chat_anket_gonder(uuid, text, text[], boolean) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.chat_anket_gonder(uuid, text, text[], boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: ankete oy ver
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.chat_anket_oyla(
  p_mesaj_id bigint,
  p_secenek_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_coklu boolean;
  v_kanal uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  SELECT a.coklu_secim, m.kanal_id
  INTO v_coklu, v_kanal
  FROM public.sohbet_anketleri a
  JOIN public.sohbet_mesajlari m ON m.id = a.mesaj_id
  WHERE a.mesaj_id = p_mesaj_id
    AND EXISTS (
      SELECT 1 FROM public.sohbet_anket_secenekleri s
      WHERE s.id = p_secenek_id AND s.mesaj_id = p_mesaj_id
    );

  IF v_kanal IS NULL THEN
    RAISE EXCEPTION 'Anket bulunamadı';
  END IF;

  IF NOT public.chat_kanal_uyesi_mi(v_kanal) THEN
    RAISE EXCEPTION 'Bu ankete oy veremezsiniz';
  END IF;

  IF NOT coalesce(v_coklu, false) THEN
    DELETE FROM public.sohbet_anket_oylari o
    USING public.sohbet_anket_secenekleri s
    WHERE s.id = o.secenek_id
      AND s.mesaj_id = p_mesaj_id
      AND o.kullanici_id = v_me;
  END IF;

  INSERT INTO public.sohbet_anket_oylari (secenek_id, kullanici_id)
  VALUES (p_secenek_id, v_me)
  ON CONFLICT (secenek_id, kullanici_id) DO NOTHING;
END;
$$;

ALTER FUNCTION public.chat_anket_oyla(bigint, bigint) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.chat_anket_oyla(bigint, bigint) TO authenticated;

COMMIT;
