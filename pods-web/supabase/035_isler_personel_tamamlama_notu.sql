-- Görev atanırken yazılan metin (public.isler.aciklama) ile personelin tamamlarken girdiği notu ayırır.
-- Tamamlama akışı artık personel notunu personel_tamamlama_notu kolonuna yazar; aciklama atanmış görev açıklaması olarak kalır.

ALTER TABLE public.isler
  ADD COLUMN IF NOT EXISTS personel_tamamlama_notu text;

COMMENT ON COLUMN public.isler.personel_tamamlama_notu IS
  'Personeilin görevi tamamlarken veya onaya gönderirken yazdığı not. Atama/görev açıklaması aciklama alanında kalır.';
