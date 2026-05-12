-- Müşteri QR değerlendirme — opsiyonel yorum (açıklama) desteği
-- - customer_unit_ratings.yorum kolonu (text, NULL'a izin verir; 1000 char limit)
-- - rpc_submit_customer_rating: p_yorum text DEFAULT NULL parametresi
-- - Idempotent: ADD COLUMN IF NOT EXISTS, constraint DO-block guard, OR REPLACE
-- - Mevcut sistemde puan-only akışı korunur (p_yorum verilmediğinde NULL kaydedilir).

BEGIN;

-- 1) Tabloya yorum kolonu (idempotent)
ALTER TABLE public.customer_unit_ratings
  ADD COLUMN IF NOT EXISTS yorum text NULL;

COMMENT ON COLUMN public.customer_unit_ratings.yorum IS
  'Müşterinin opsiyonel serbest metin geri bildirimi. 1000 karakterle sınırlandırılır.';

-- 2) Uzunluk kısıtlaması (idempotent guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_unit_ratings_yorum_uzunluk'
      AND conrelid = 'public.customer_unit_ratings'::regclass
  ) THEN
    ALTER TABLE public.customer_unit_ratings
      ADD CONSTRAINT customer_unit_ratings_yorum_uzunluk
      CHECK (yorum IS NULL OR char_length(yorum) <= 1000);
  END IF;
END $$;

-- 3) RPC: yorum kabul eden yeni imzaya çek
--    Eski imza (text, integer) ile yeni (text, integer, text) çakışmasın diye
--    her iki olası imzayı önce DROP edip yeni imzayla CREATE OR REPLACE ediyoruz.
DROP FUNCTION IF EXISTS public.rpc_submit_customer_rating(text, integer);
DROP FUNCTION IF EXISTS public.rpc_submit_customer_rating(text, integer, text);

CREATE OR REPLACE FUNCTION public.rpc_submit_customer_rating(
  p_code text,
  p_rating integer,
  p_yorum text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr     public.customer_unit_qr_links%ROWTYPE;
  v_yorum  text;
BEGIN
  -- Puan doğrulaması
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Geçersiz puan';
  END IF;

  -- QR koduna karşılık aktif kayıt ara
  SELECT *
  INTO v_qr
  FROM public.customer_unit_qr_links q
  WHERE q.code = p_code
    AND q.aktif = true
  LIMIT 1;

  IF v_qr.id IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya pasif QR';
  END IF;

  -- Yorum normalizasyonu: trim + boş string -> NULL, üst sınır 1000.
  v_yorum := NULLIF(btrim(COALESCE(p_yorum, '')), '');
  IF v_yorum IS NOT NULL AND char_length(v_yorum) > 1000 THEN
    v_yorum := substr(v_yorum, 1, 1000);
  END IF;

  INSERT INTO public.customer_unit_ratings
    (qr_id, ana_sirket_id, birim_id, rating, yorum)
  VALUES
    (v_qr.id, v_qr.ana_sirket_id, v_qr.birim_id, p_rating, v_yorum);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_submit_customer_rating(text, integer, text)
  TO anon, authenticated;

COMMIT;
