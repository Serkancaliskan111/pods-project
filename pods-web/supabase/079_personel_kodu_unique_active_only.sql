-- 079: personel_kodu benzersizliği yalnızca aktif (silinmemiş) kayıtlar için.
-- Eski tablo kısıtı personeller_personel_kodu_key soft-delete sonrası aynı kodu
-- yeniden kullanmayı engelleyebilir; kısmi indeks ile değiştirilir.

BEGIN;

ALTER TABLE public.personeller
  DROP CONSTRAINT IF EXISTS personeller_personel_kodu_key;

DROP INDEX IF EXISTS public.idx_personel_kodu_active;

CREATE UNIQUE INDEX idx_personel_kodu_active
  ON public.personeller (personel_kodu)
  WHERE silindi_at IS NULL
    AND personel_kodu IS NOT NULL
    AND btrim(personel_kodu) <> '';

COMMIT;
