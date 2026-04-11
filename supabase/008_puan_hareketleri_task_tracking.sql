-- Puan hareketlerinde görev kaynağını %100 izlenebilir hale getirir.
-- Güvenli/tekrarlanabilir migration: mevcut ortamlarda IF NOT EXISTS kullanır.

BEGIN;

ALTER TABLE IF EXISTS puan_hareketleri
  ADD COLUMN IF NOT EXISTS gorev_id uuid NULL,
  ADD COLUMN IF NOT EXISTS gorev_baslik text NULL,
  ADD COLUMN IF NOT EXISTS islem_tipi text NULL,
  ADD COLUMN IF NOT EXISTS aciklama text NULL;

-- Performans indexleri
CREATE INDEX IF NOT EXISTS idx_puan_hareketleri_gorev_id ON puan_hareketleri (gorev_id);
CREATE INDEX IF NOT EXISTS idx_puan_hareketleri_islem_tipi_tarih ON puan_hareketleri (islem_tipi, tarih DESC);

-- Görev bağlantısı (isler tablosu silinirse kayıt düşmesin, referans null olsun)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'puan_hareketleri_gorev_id_fkey'
  ) THEN
    ALTER TABLE puan_hareketleri
      ADD CONSTRAINT puan_hareketleri_gorev_id_fkey
      FOREIGN KEY (gorev_id) REFERENCES isler(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Veri kalitesi için opsiyonel işlem tipi kontrolü (bozmayacak şekilde eklenir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'puan_hareketleri_islem_tipi_check'
  ) THEN
    ALTER TABLE puan_hareketleri
      ADD CONSTRAINT puan_hareketleri_islem_tipi_check
      CHECK (
        islem_tipi IS NULL OR
        islem_tipi IN (
          'TASK_APPROVED',
          'TASK_DELAY_PENALTY',
          'TASK_TIMEOUT_PENALTY',
          'MANUAL_ADD',
          'MANUAL_DEDUCT'
        )
      );
  END IF;
END
$$;

COMMIT;

