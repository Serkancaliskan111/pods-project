-- Müşteri değerlendirme — opsiyonel fotoğraf / video (mevcut puan+yorum akışına ek)
-- Idempotent: yeni kolonlar NULL; eski RPC imzaları korunur, yeni fonksiyonlar eklenir.

BEGIN;

ALTER TABLE public.customer_unit_ratings
  ADD COLUMN IF NOT EXISTS foto_path text NULL,
  ADD COLUMN IF NOT EXISTS video_path text NULL;

COMMENT ON COLUMN public.customer_unit_ratings.foto_path IS
  'storage.objects.name — bucket musteri-degerlendirme';
COMMENT ON COLUMN public.customer_unit_ratings.video_path IS
  'storage.objects.name — bucket musteri-degerlendirme';

-- Depolama (sıkıştırılmış istemci yüklemesi; üst sınır sunucu tarafı)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'musteri-degerlendirme',
  'musteri-degerlendirme',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Gönderim: rating id döner (mevcut istemciler dönüşü yok sayabilir)
DROP FUNCTION IF EXISTS public.rpc_submit_customer_rating(text, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_submit_customer_rating(
  p_code text,
  p_rating integer,
  p_yorum text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr     public.customer_unit_qr_links%ROWTYPE;
  v_yorum  text;
  v_id     bigint;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Geçersiz puan';
  END IF;

  SELECT *
  INTO v_qr
  FROM public.customer_unit_qr_links q
  WHERE q.code = p_code
    AND q.aktif = true
  LIMIT 1;

  IF v_qr.id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya pasif QR';
  END IF;

  v_yorum := NULLIF(btrim(COALESCE(p_yorum, '')), '');
  IF v_yorum IS NOT NULL AND char_length(v_yorum) > 1000 THEN
    v_yorum := substr(v_yorum, 1, 1000);
  END IF;

  INSERT INTO public.customer_unit_ratings
    (qr_id, ana_sirket_id, birim_id, rating, yorum)
  VALUES
    (v_qr.id, v_qr.ana_sirket_id, v_qr.birim_id, p_rating, v_yorum)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_submit_customer_rating(text, integer, text)
  TO anon, authenticated;

-- Yükleme sonrası yolları bağla (yalnızca yeni kayıt + kod eşleşmesi)
DROP FUNCTION IF EXISTS public.rpc_attach_customer_rating_media(text, bigint, text, text);

CREATE OR REPLACE FUNCTION public.rpc_attach_customer_rating_media(
  p_code text,
  p_rating_id bigint,
  p_foto_path text DEFAULT NULL,
  p_video_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.customer_unit_qr_links%ROWTYPE;
  v_row public.customer_unit_ratings%ROWTYPE;
  v_foto text;
  v_video text;
  v_prefix text;
BEGIN
  IF p_rating_id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz değerlendirme';
  END IF;

  SELECT *
  INTO v_qr
  FROM public.customer_unit_qr_links q
  WHERE q.code = p_code
    AND q.aktif = true
  LIMIT 1;

  IF v_qr.id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya pasif QR';
  END IF;

  SELECT *
  INTO v_row
  FROM public.customer_unit_ratings r
  WHERE r.id = p_rating_id
    AND r.qr_id = v_qr.id
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Değerlendirme bulunamadı';
  END IF;

  IF v_row.created_at < (now() - interval '30 minutes') THEN
    RAISE EXCEPTION 'Medya ekleme süresi doldu';
  END IF;

  v_prefix := p_rating_id::text || '/';
  v_foto := NULLIF(btrim(COALESCE(p_foto_path, '')), '');
  v_video := NULLIF(btrim(COALESCE(p_video_path, '')), '');

  IF v_foto IS NOT NULL AND v_foto <> v_prefix || 'foto.jpg' THEN
    RAISE EXCEPTION 'Geçersiz fotoğraf yolu';
  END IF;

  IF v_video IS NOT NULL AND v_video NOT LIKE v_prefix || 'video.%' THEN
    RAISE EXCEPTION 'Geçersiz video yolu';
  END IF;

  IF v_foto IS NULL AND v_video IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.customer_unit_ratings
  SET
    foto_path = COALESCE(v_foto, foto_path),
    video_path = COALESCE(v_video, video_path)
  WHERE id = p_rating_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_attach_customer_rating_media(text, bigint, text, text)
  TO anon, authenticated;

-- Storage RLS
DROP POLICY IF EXISTS musteri_degerlendirme_anon_insert ON storage.objects;
CREATE POLICY musteri_degerlendirme_anon_insert
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'musteri-degerlendirme'
  AND (storage.foldername(name))[1] ~ '^[0-9]+$'
  AND EXISTS (
    SELECT 1
    FROM public.customer_unit_ratings r
    WHERE r.id::text = (storage.foldername(name))[1]
      AND r.created_at > (now() - interval '30 minutes')
  )
);

DROP POLICY IF EXISTS musteri_degerlendirme_auth_select ON storage.objects;
CREATE POLICY musteri_degerlendirme_auth_select
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'musteri-degerlendirme');

COMMIT;
