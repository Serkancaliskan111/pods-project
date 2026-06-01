-- Kişisel yapılacaklar: planlama tarihi/saati

ALTER TABLE public.kisisel_todo_gorevleri
  ADD COLUMN IF NOT EXISTS planlanan_tarih date;

ALTER TABLE public.kisisel_todo_gorevleri
  ADD COLUMN IF NOT EXISTS planlanan_saat time;

COMMENT ON COLUMN public.kisisel_todo_gorevleri.planlanan_tarih IS 'Liste için hedef gün (planlama)';
COMMENT ON COLUMN public.kisisel_todo_gorevleri.planlanan_saat IS 'İsteğe bağlı hedef saat';

CREATE INDEX IF NOT EXISTS idx_kisisel_todo_gorev_plan
  ON public.kisisel_todo_gorevleri (kullanici_id, planlanan_tarih)
  WHERE silindi_at IS NULL;
