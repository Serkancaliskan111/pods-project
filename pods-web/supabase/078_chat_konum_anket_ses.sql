-- Sohbet: konum, anket, sesli mesaj (mevcut text/image/video/file akışını bozmaz).
-- Yeni mesaj_tipi değerleri: location, poll, voice
-- chat_mesaj_gonder geriye uyumlu genişletildi; anket için ayrı RPC.

BEGIN;

-- ---------------------------------------------------------------------------
-- Ek kolonlar (NULL = eski satırlar etkilenmez)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sohbet_mesajlari
  ADD COLUMN IF NOT EXISTS konum_lat double precision NULL,
  ADD COLUMN IF NOT EXISTS konum_lng double precision NULL,
  ADD COLUMN IF NOT EXISTS konum_etiket text NULL,
  ADD COLUMN IF NOT EXISTS ses_suresi_sn integer NULL;

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_konum_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_konum_chk
  CHECK (
    konum_lat IS NULL
    OR (konum_lat >= -90 AND konum_lat <= 90)
  );

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_konum_lng_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_konum_lng_chk
  CHECK (
    konum_lng IS NULL
    OR (konum_lng >= -180 AND konum_lng <= 180)
  );

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_ses_suresi_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_ses_suresi_chk
  CHECK (
    ses_suresi_sn IS NULL
    OR (ses_suresi_sn >= 0 AND ses_suresi_sn <= 3600)
  );

-- ---------------------------------------------------------------------------
-- mesaj_tipi + içerik kuralları
-- ---------------------------------------------------------------------------

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_mesaj_tipi_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_mesaj_tipi_chk
  CHECK (mesaj_tipi IN ('text', 'image', 'video', 'file', 'location', 'poll', 'voice'));

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_icerik_veya_ek_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_icerik_veya_ek_chk
  CHECK (
    char_length(icerik) <= 8000
    AND (
      (
        mesaj_tipi = 'text'
        AND length(trim(icerik)) > 0
        AND ek_yol IS NULL
        AND ek_orijinal_ad IS NULL
        AND ek_mime IS NULL
        AND ek_boyut IS NULL
        AND konum_lat IS NULL
        AND konum_lng IS NULL
        AND konum_etiket IS NULL
        AND ses_suresi_sn IS NULL
      )
      OR (
        mesaj_tipi IN ('image', 'video', 'file', 'voice')
        AND ek_yol IS NOT NULL
        AND length(trim(ek_yol)) > 0
        AND strpos(ek_yol, E'\n') = 0
        AND strpos(ek_yol, E'\r') = 0
        AND konum_lat IS NULL
        AND konum_lng IS NULL
        AND konum_etiket IS NULL
      )
      OR (
        mesaj_tipi = 'location'
        AND konum_lat IS NOT NULL
        AND konum_lng IS NOT NULL
        AND ek_yol IS NULL
        AND ek_orijinal_ad IS NULL
        AND ek_mime IS NULL
        AND ek_boyut IS NULL
        AND ses_suresi_sn IS NULL
      )
      OR (
        mesaj_tipi = 'poll'
        AND length(trim(icerik)) > 0
        AND ek_yol IS NULL
        AND ek_orijinal_ad IS NULL
        AND ek_mime IS NULL
        AND ek_boyut IS NULL
        AND konum_lat IS NULL
        AND konum_lng IS NULL
        AND konum_etiket IS NULL
        AND ses_suresi_sn IS NULL
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Kanal özeti (trigger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sohbet_mesaj_sonrasi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ozet text;
  ad text := trim(coalesce(NEW.ek_orijinal_ad, ''));
  konum_lbl text := trim(coalesce(NEW.konum_etiket, ''));
BEGIN
  ozet := CASE NEW.mesaj_tipi
    WHEN 'image' THEN '📷 Fotoğraf'
    WHEN 'video' THEN '🎬 Video'
    WHEN 'file' THEN CASE WHEN length(ad) > 0 THEN '📎 ' || left(ad, 160) ELSE '📎 Dosya' END
    WHEN 'voice' THEN '🎤 Sesli mesaj'
    WHEN 'location' THEN CASE WHEN length(konum_lbl) > 0 THEN '📍 ' || left(konum_lbl, 160) ELSE '📍 Konum' END
    WHEN 'poll' THEN '📊 Anket: ' || left(trim(NEW.icerik), 140)
    ELSE left(trim(NEW.icerik), 180)
  END;

  UPDATE public.sohbet_kanallari
  SET
    son_mesaj_at = NEW.olusturulma_at,
    son_mesaj_ozet = ozet
  WHERE id = NEW.kanal_id;

  INSERT INTO public.sohbet_push_kuyrugu (mesaj_id, kanal_id, alici_kullanici_id)
  SELECT NEW.id, NEW.kanal_id, u.kullanici_id
  FROM public.sohbet_uyeleri u
  WHERE u.kanal_id = NEW.kanal_id
    AND u.kullanici_id <> NEW.gonderen_kullanici_id;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mesaj gönder (metin / ek / konum / ses)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.chat_mesaj_gonder(uuid, text, text, text, text, text, bigint);

CREATE OR REPLACE FUNCTION public.chat_mesaj_gonder(
  p_kanal_id uuid,
  p_icerik text,
  p_mesaj_tipi text DEFAULT 'text',
  p_ek_yol text DEFAULT NULL,
  p_ek_orijinal_ad text DEFAULT NULL,
  p_ek_mime text DEFAULT NULL,
  p_ek_boyut bigint DEFAULT NULL,
  p_konum_lat double precision DEFAULT NULL,
  p_konum_lng double precision DEFAULT NULL,
  p_konum_etiket text DEFAULT NULL,
  p_ses_suresi_sn integer DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_mid bigint;
  v_tip text := lower(trim(coalesce(p_mesaj_tipi, 'text')));
  v_text text := trim(coalesce(p_icerik, ''));
  v_yol text := trim(coalesce(p_ek_yol, ''));
  v_lbl text := nullif(trim(coalesce(p_konum_etiket, '')), '');
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF v_tip NOT IN ('text', 'image', 'video', 'file', 'location', 'poll', 'voice') THEN
    RAISE EXCEPTION 'Geçersiz mesaj tipi';
  END IF;

  IF v_tip = 'text' THEN
    IF length(v_text) = 0 THEN
      RAISE EXCEPTION 'Mesaj boş olamaz';
    END IF;
    IF length(v_text) > 8000 THEN
      RAISE EXCEPTION 'Mesaj çok uzun';
    END IF;
  ELSIF v_tip = 'location' THEN
    IF p_konum_lat IS NULL OR p_konum_lng IS NULL THEN
      RAISE EXCEPTION 'Konum koordinatları gerekli';
    END IF;
    IF p_konum_lat < -90 OR p_konum_lat > 90 OR p_konum_lng < -180 OR p_konum_lng > 180 THEN
      RAISE EXCEPTION 'Geçersiz koordinat';
    END IF;
    IF v_lbl IS NOT NULL AND length(v_lbl) > 500 THEN
      RAISE EXCEPTION 'Konum etiketi çok uzun';
    END IF;
  ELSIF v_tip = 'poll' THEN
    RAISE EXCEPTION 'Anket için chat_anket_gonder kullanın';
  ELSE
    IF length(v_yol) = 0 THEN
      RAISE EXCEPTION 'Ek dosya yolu gerekli';
    END IF;
    IF split_part(v_yol, '/', 1) <> p_kanal_id::text THEN
      RAISE EXCEPTION 'Geçersiz ek yolu';
    END IF;
    IF length(v_text) > 8000 THEN
      RAISE EXCEPTION 'Açıklama çok uzun';
    END IF;
    IF p_ek_boyut IS NOT NULL AND (p_ek_boyut < 0 OR p_ek_boyut > 52428800) THEN
      RAISE EXCEPTION 'Geçersiz dosya boyutu';
    END IF;
    IF v_tip = 'voice' AND p_ses_suresi_sn IS NOT NULL AND (p_ses_suresi_sn < 0 OR p_ses_suresi_sn > 3600) THEN
      RAISE EXCEPTION 'Geçersiz ses süresi';
    END IF;
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

  INSERT INTO public.sohbet_mesajlari (
    kanal_id,
    gonderen_kullanici_id,
    icerik,
    mesaj_tipi,
    ek_yol,
    ek_orijinal_ad,
    ek_mime,
    ek_boyut,
    konum_lat,
    konum_lng,
    konum_etiket,
    ses_suresi_sn
  )
  VALUES (
    p_kanal_id,
    v_me,
    v_text,
    v_tip,
    CASE WHEN v_tip IN ('image', 'video', 'file', 'voice') THEN v_yol ELSE NULL END,
    CASE WHEN v_tip IN ('image', 'video', 'file', 'voice') THEN nullif(trim(coalesce(p_ek_orijinal_ad, '')), '') ELSE NULL END,
    CASE WHEN v_tip IN ('image', 'video', 'file', 'voice') THEN nullif(trim(coalesce(p_ek_mime, '')), '') ELSE NULL END,
    CASE WHEN v_tip IN ('image', 'video', 'file', 'voice') THEN p_ek_boyut ELSE NULL END,
    CASE WHEN v_tip = 'location' THEN p_konum_lat ELSE NULL END,
    CASE WHEN v_tip = 'location' THEN p_konum_lng ELSE NULL END,
    CASE WHEN v_tip = 'location' THEN v_lbl ELSE NULL END,
    CASE WHEN v_tip = 'voice' THEN p_ses_suresi_sn ELSE NULL END
  )
  RETURNING id INTO v_mid;

  RETURN v_mid;
END;
$$;

ALTER FUNCTION public.chat_mesaj_gonder(
  uuid, text, text, text, text, text, bigint, double precision, double precision, text, integer
) RESET row_security;

GRANT EXECUTE ON FUNCTION public.chat_mesaj_gonder(
  uuid, text, text, text, text, text, bigint, double precision, double precision, text, integer
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Anket tabloları
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sohbet_anketleri (
  mesaj_id bigint PRIMARY KEY REFERENCES public.sohbet_mesajlari(id) ON DELETE CASCADE,
  soru text NOT NULL,
  coklu_secim boolean NOT NULL DEFAULT false,
  olusturuldu_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sohbet_anketleri_soru_chk CHECK (
    char_length(trim(soru)) > 0 AND char_length(soru) <= 500
  )
);

CREATE TABLE IF NOT EXISTS public.sohbet_anket_secenekleri (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mesaj_id bigint NOT NULL REFERENCES public.sohbet_anketleri(mesaj_id) ON DELETE CASCADE,
  sira smallint NOT NULL,
  metin text NOT NULL,
  CONSTRAINT sohbet_anket_secenek_sira_chk CHECK (sira >= 0 AND sira < 12),
  CONSTRAINT sohbet_anket_secenek_metin_chk CHECK (
    char_length(trim(metin)) > 0 AND char_length(metin) <= 200
  ),
  UNIQUE (mesaj_id, sira)
);

CREATE TABLE IF NOT EXISTS public.sohbet_anket_oylari (
  secenek_id bigint NOT NULL REFERENCES public.sohbet_anket_secenekleri(id) ON DELETE CASCADE,
  kullanici_id uuid NOT NULL REFERENCES public.kullanicilar(id),
  oylandi_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (secenek_id, kullanici_id)
);

CREATE INDEX IF NOT EXISTS sohbet_anket_secenekleri_mesaj_id_idx
  ON public.sohbet_anket_secenekleri (mesaj_id);

CREATE INDEX IF NOT EXISTS sohbet_anket_oylari_secenek_id_idx
  ON public.sohbet_anket_oylari (secenek_id);

-- ---------------------------------------------------------------------------
-- Anket RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.sohbet_anketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sohbet_anket_secenekleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sohbet_anket_oylari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sohbet_anketleri_select ON public.sohbet_anketleri;
CREATE POLICY sohbet_anketleri_select ON public.sohbet_anketleri
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.sohbet_uyeleri u ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      WHERE m.id = sohbet_anketleri.mesaj_id
    )
  );

DROP POLICY IF EXISTS sohbet_anket_secenekleri_select ON public.sohbet_anket_secenekleri;
CREATE POLICY sohbet_anket_secenekleri_select ON public.sohbet_anket_secenekleri
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.sohbet_uyeleri u ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      WHERE m.id = sohbet_anket_secenekleri.mesaj_id
    )
  );

DROP POLICY IF EXISTS sohbet_anket_oylari_select ON public.sohbet_anket_oylari;
CREATE POLICY sohbet_anket_oylari_select ON public.sohbet_anket_oylari
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sohbet_anket_secenekleri s
      JOIN public.sohbet_mesajlari m ON m.id = s.mesaj_id
      JOIN public.sohbet_uyeleri u ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      WHERE s.id = sohbet_anket_oylari.secenek_id
    )
  );

DROP POLICY IF EXISTS sohbet_anket_oylari_insert ON public.sohbet_anket_oylari;
CREATE POLICY sohbet_anket_oylari_insert ON public.sohbet_anket_oylari
  FOR INSERT TO authenticated
  WITH CHECK (
    kullanici_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.sohbet_anket_secenekleri s
      JOIN public.sohbet_mesajlari m ON m.id = s.mesaj_id
      JOIN public.sohbet_uyeleri u ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      WHERE s.id = sohbet_anket_oylari.secenek_id
    )
  );

DROP POLICY IF EXISTS sohbet_anket_oylari_delete ON public.sohbet_anket_oylari;
CREATE POLICY sohbet_anket_oylari_delete ON public.sohbet_anket_oylari
  FOR DELETE TO authenticated
  USING (kullanici_id = auth.uid());

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

ALTER FUNCTION public.chat_anket_gonder(uuid, text, text[], boolean) RESET row_security;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.sohbet_uyeleri u
    WHERE u.kanal_id = v_kanal AND u.kullanici_id = v_me
  ) THEN
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

ALTER FUNCTION public.chat_anket_oyla(bigint, bigint) RESET row_security;
GRANT EXECUTE ON FUNCTION public.chat_anket_oyla(bigint, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- INSERT RLS: yeni mesaj tipleri
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS sohbet_mesajlari_insert ON public.sohbet_mesajlari;

CREATE POLICY sohbet_mesajlari_insert ON public.sohbet_mesajlari
  FOR INSERT TO authenticated
  WITH CHECK (
    gonderen_kullanici_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.sohbet_uyeleri u
      JOIN public.personeller p ON p.kullanici_id = auth.uid() AND p.silindi_at IS NULL
      JOIN public.sohbet_kanallari k ON k.id = sohbet_mesajlari.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
      WHERE u.kanal_id = sohbet_mesajlari.kanal_id
        AND u.kullanici_id = auth.uid()
    )
    AND (
      (
        mesaj_tipi = 'text'
        AND ek_yol IS NULL
        AND konum_lat IS NULL
        AND konum_lng IS NULL
      )
      OR (
        mesaj_tipi IN ('image', 'video', 'file', 'voice')
        AND ek_yol IS NOT NULL
        AND split_part(trim(ek_yol), '/', 1) = sohbet_mesajlari.kanal_id::text
        AND konum_lat IS NULL
        AND konum_lng IS NULL
      )
      OR (
        mesaj_tipi = 'location'
        AND konum_lat IS NOT NULL
        AND konum_lng IS NOT NULL
        AND ek_yol IS NULL
      )
      OR (
        mesaj_tipi = 'poll'
        AND ek_yol IS NULL
        AND konum_lat IS NULL
        AND konum_lng IS NULL
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: ses MIME türleri
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT x)
  FROM unnest(
    coalesce(allowed_mime_types, ARRAY[]::text[])
    || ARRAY[
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/webm',
      'audio/x-m4a',
      'audio/x-caf',
      'audio/wav'
    ]
  ) AS t(x)
)
WHERE id = 'chat-ekleri';

COMMIT;
