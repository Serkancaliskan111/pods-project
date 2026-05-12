-- Gecikme/Zaman aşımı cezalarının tek seferlik uygulanmasını DB seviyesinde garanti et.
-- Mevcut sorunlar:
--   - Mobil tarafta Home/Tasks ekranları açılışında gecikmiş görevler için ceza
--     yazılıyor; idempotency kontrolü yoktu, her açılışta tekrar yazılıyordu.
-- Çözüm:
--   1) Geriye dönük olarak (personel_id, gorev_id, islem_tipi) bazında biriken
--      duplicate ceza kayıtlarından en eski olanı tutup diğerlerini sil.
--   2) Aynı kombinasyonda yeniden ekleme yapılmasını engelleyen partial unique
--      index ekle (sadece TASK_DELAY_PENALTY ve TASK_TIMEOUT_PENALTY için).
-- Idempotent: birden fazla çalıştırılabilir (cleanup zaten boşalmışsa no-op,
-- index `IF NOT EXISTS` ile korumalı).

BEGIN;

-- 1) Geriye dönük temizlik: en eski (en küçük id) kaydı tut, diğer
--    duplicate'leri sil. row_number() ile partition başına bir kayıt korunur.
WITH dup AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY personel_id, gorev_id, islem_tipi
           ORDER BY id ASC
         ) AS rn
  FROM public.puan_hareketleri
  WHERE islem_tipi IN ('TASK_DELAY_PENALTY', 'TASK_TIMEOUT_PENALTY')
    AND gorev_id IS NOT NULL
    AND personel_id IS NOT NULL
)
DELETE FROM public.puan_hareketleri ph
USING dup
WHERE ph.id = dup.id
  AND dup.rn > 1;

-- 2) Bundan sonra aynı kombinasyonun yazılmasını engelleyen partial unique index.
--    Index `IF NOT EXISTS` ile sarılı; ayrıca DO bloğunda guard'la çift güvenlik.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'puan_hareketleri'
      AND indexname = 'puan_hareketleri_task_penalty_unique'
  ) THEN
    CREATE UNIQUE INDEX puan_hareketleri_task_penalty_unique
      ON public.puan_hareketleri (personel_id, gorev_id, islem_tipi)
      WHERE islem_tipi IN ('TASK_DELAY_PENALTY', 'TASK_TIMEOUT_PENALTY')
        AND gorev_id IS NOT NULL
        AND personel_id IS NOT NULL;
  END IF;
END $$;

COMMENT ON INDEX public.puan_hareketleri_task_penalty_unique IS
  'Aynı personel/görev için TASK_DELAY_PENALTY veya TASK_TIMEOUT_PENALTY kaydının yalnızca bir kez yazılmasını sağlar.';

COMMIT;
