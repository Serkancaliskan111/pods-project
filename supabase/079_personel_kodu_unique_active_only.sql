-- 079: personel_kodu benzersizliği yalnızca aktif (silinmemiş) kayıtlar için.
-- pods-web/supabase/079_personel_kodu_unique_active_only.sql ile aynı.

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
