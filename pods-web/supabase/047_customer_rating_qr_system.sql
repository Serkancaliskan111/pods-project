-- Müşteri QR değerlendirme sistemi
-- - Birim bazlı QR link üretimi
-- - Müşteri (anon) yıldız puan gönderimi
-- - Yönetim paneli için raporlama verisi

CREATE TABLE IF NOT EXISTS public.customer_unit_qr_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ana_sirket_id uuid NOT NULL REFERENCES public.ana_sirketler(id) ON DELETE CASCADE,
  birim_id uuid NOT NULL REFERENCES public.birimler(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  aktif boolean NOT NULL DEFAULT true,
  olusturan_personel_id uuid NULL REFERENCES public.personeller(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_unit_ratings (
  id bigserial PRIMARY KEY,
  qr_id uuid NOT NULL REFERENCES public.customer_unit_qr_links(id) ON DELETE CASCADE,
  ana_sirket_id uuid NOT NULL REFERENCES public.ana_sirketler(id) ON DELETE CASCADE,
  birim_id uuid NOT NULL REFERENCES public.birimler(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_qr_links_company_unit
  ON public.customer_unit_qr_links (ana_sirket_id, birim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_ratings_qr_time
  ON public.customer_unit_ratings (qr_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_ratings_company_time
  ON public.customer_unit_ratings (ana_sirket_id, birim_id, created_at DESC);

ALTER TABLE public.customer_unit_qr_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_unit_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_qr_links_auth_select ON public.customer_unit_qr_links;
CREATE POLICY customer_qr_links_auth_select
ON public.customer_unit_qr_links
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS customer_qr_links_auth_insert ON public.customer_unit_qr_links;
CREATE POLICY customer_qr_links_auth_insert
ON public.customer_unit_qr_links
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS customer_ratings_auth_select ON public.customer_unit_ratings;
CREATE POLICY customer_ratings_auth_select
ON public.customer_unit_ratings
FOR SELECT
TO authenticated
USING (true);

DROP FUNCTION IF EXISTS public.rpc_get_customer_rating_form(text);
CREATE OR REPLACE FUNCTION public.rpc_get_customer_rating_form(p_code text)
RETURNS TABLE (
  qr_id uuid,
  ana_sirket_id uuid,
  birim_id uuid,
  ana_sirket_adi text,
  birim_adi text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id AS qr_id,
    q.ana_sirket_id,
    q.birim_id,
    a.ana_sirket_adi,
    b.birim_adi
  FROM public.customer_unit_qr_links q
  JOIN public.ana_sirketler a ON a.id = q.ana_sirket_id
  JOIN public.birimler b ON b.id = q.birim_id
  WHERE q.code = p_code
    AND q.aktif = true
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.rpc_submit_customer_rating(text, integer);
CREATE OR REPLACE FUNCTION public.rpc_submit_customer_rating(
  p_code text,
  p_rating integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr public.customer_unit_qr_links%ROWTYPE;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN
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

  INSERT INTO public.customer_unit_ratings (qr_id, ana_sirket_id, birim_id, rating)
  VALUES (v_qr.id, v_qr.ana_sirket_id, v_qr.birim_id, p_rating);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_customer_rating_form(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_customer_rating(text, integer) TO anon, authenticated;
