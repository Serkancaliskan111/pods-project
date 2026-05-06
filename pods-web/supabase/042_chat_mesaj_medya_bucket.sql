-- Sohbet: fotoğraf / video / belge eki, storage bucket + RLS.
-- Mesaj özeti tetikleyicisi ek türüne göre özet üretir.
-- chat_mesaj_gonder isteğe bağlı ek parametreleri alır (PostgREST: varsayılanlar).

BEGIN;

-- ---------------------------------------------------------------------------
-- Mesaj satırı: ek metadata (yol = storage.objects.name, ilk klasör = kanal_id)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_icerik_check;

ALTER TABLE public.sohbet_mesajlari
  ADD COLUMN IF NOT EXISTS mesaj_tipi text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS ek_yol text NULL,
  ADD COLUMN IF NOT EXISTS ek_orijinal_ad text NULL,
  ADD COLUMN IF NOT EXISTS ek_mime text NULL,
  ADD COLUMN IF NOT EXISTS ek_boyut bigint NULL;

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_mesaj_tipi_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_mesaj_tipi_chk
  CHECK (mesaj_tipi IN ('text', 'image', 'video', 'file'));

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
      )
      OR (
        mesaj_tipi IN ('image', 'video', 'file')
        AND ek_yol IS NOT NULL
        AND length(trim(ek_yol)) > 0
        AND strpos(ek_yol, E'\n') = 0
        AND strpos(ek_yol, E'\r') = 0
      )
    )
  );

ALTER TABLE public.sohbet_mesajlari
  DROP CONSTRAINT IF EXISTS sohbet_mesajlari_ek_boyut_chk;

ALTER TABLE public.sohbet_mesajlari
  ADD CONSTRAINT sohbet_mesajlari_ek_boyut_chk
  CHECK (ek_boyut IS NULL OR (ek_boyut >= 0 AND ek_boyut <= 52428800));

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
BEGIN
  ozet := CASE NEW.mesaj_tipi
    WHEN 'image' THEN '📷 Fotoğraf'
    WHEN 'video' THEN '🎬 Video'
    WHEN 'file' THEN CASE WHEN length(ad) > 0 THEN '📎 ' || left(ad, 160) ELSE '📎 Dosya' END
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
-- RPC: mesaj gönder (metin veya ek)
-- ---------------------------------------------------------------------------
-- Eski iki parametreli imza kaldırılır; tek gövde + varsayılanlar (PostgREST uyumu).

DROP FUNCTION IF EXISTS public.chat_mesaj_gonder(uuid, text);

CREATE OR REPLACE FUNCTION public.chat_mesaj_gonder(
  p_kanal_id uuid,
  p_icerik text,
  p_mesaj_tipi text DEFAULT 'text',
  p_ek_yol text DEFAULT NULL,
  p_ek_orijinal_ad text DEFAULT NULL,
  p_ek_mime text DEFAULT NULL,
  p_ek_boyut bigint DEFAULT NULL
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
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF v_tip NOT IN ('text', 'image', 'video', 'file') THEN
    RAISE EXCEPTION 'Geçersiz mesaj tipi';
  END IF;

  IF v_tip = 'text' THEN
    IF length(v_text) = 0 THEN
      RAISE EXCEPTION 'Mesaj boş olamaz';
    END IF;
    IF length(v_text) > 8000 THEN
      RAISE EXCEPTION 'Mesaj çok uzun';
    END IF;
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
    ek_boyut
  )
  VALUES (
    p_kanal_id,
    v_me,
    v_text,
    v_tip,
    CASE WHEN v_tip = 'text' THEN NULL ELSE v_yol END,
    CASE WHEN v_tip = 'text' THEN NULL ELSE nullif(trim(coalesce(p_ek_orijinal_ad, '')), '') END,
    CASE WHEN v_tip = 'text' THEN NULL ELSE nullif(trim(coalesce(p_ek_mime, '')), '') END,
    CASE WHEN v_tip = 'text' THEN NULL ELSE p_ek_boyut END
  )
  RETURNING id INTO v_mid;

  RETURN v_mid;
END;
$$;

ALTER FUNCTION public.chat_mesaj_gonder(uuid, text, text, text, text, text, bigint) RESET row_security;

GRANT EXECUTE ON FUNCTION public.chat_mesaj_gonder(uuid, text, text, text, text, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- INSERT RLS: ek alanları
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
        AND ek_orijinal_ad IS NULL
        AND ek_mime IS NULL
        AND ek_boyut IS NULL
      )
      OR (
        mesaj_tipi IN ('image', 'video', 'file')
        AND ek_yol IS NOT NULL
        AND split_part(trim(ek_yol), '/', 1) = sohbet_mesajlari.kanal_id::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket + politikalar (ilk klasör = kanal UUID)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-ekleri',
  'chat-ekleri',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS chat_ekleri_insert_member ON storage.objects;
CREATE POLICY chat_ekleri_insert_member ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-ekleri'
    AND EXISTS (
      SELECT 1
      FROM public.sohbet_uyeleri u
      WHERE u.kullanici_id = auth.uid()
        AND u.kanal_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS chat_ekleri_select_member ON storage.objects;
CREATE POLICY chat_ekleri_select_member ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-ekleri'
    AND EXISTS (
      SELECT 1
      FROM public.sohbet_uyeleri u
      WHERE u.kullanici_id = auth.uid()
        AND u.kanal_id::text = (storage.foldername(name))[1]
    )
  );

COMMIT;
