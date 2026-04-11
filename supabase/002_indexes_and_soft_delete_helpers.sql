-- 1. PARTIAL UNIQUE INDEXES (Soft-delete dostu benzersizlik)
-- Aynı personel kodu sadece aktif (silinmemiş) kayıtlar arasında benzersiz olmalı.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personel_kodu_active ON personeller (personel_kodu) 
WHERE silindi_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ana_sirket_vergi_no_active ON ana_sirketler (vergi_no) 
WHERE silindi_at IS NULL;

-- 2. PERFORMANCE INDEXES (Sık sorgulanan ve join yapılan alanlar)
CREATE INDEX IF NOT EXISTS idx_birimler_ust_id ON birimler (ust_birim_id);
CREATE INDEX IF NOT EXISTS idx_birimler_ana_sirket ON birimler (ana_sirket_id);
CREATE INDEX IF NOT EXISTS idx_personeller_kullanici_id ON personeller (kullanici_id);
CREATE INDEX IF NOT EXISTS idx_personeller_birim_id ON personeller (birim_id);
CREATE INDEX IF NOT EXISTS idx_isler_sorumlu_personel ON isler (sorumlu_personel_id);
CREATE INDEX IF NOT EXISTS idx_isler_durum ON isler (durum);
CREATE INDEX IF NOT EXISTS idx_is_cevaplari_is_id ON is_cevaplari (is_id);
CREATE INDEX IF NOT EXISTS idx_puan_hareketleri_personel_tarih ON puan_hareketleri (personel_id, tarih DESC);

-- 3. ON DELETE DAVRANIŞLARI (Veri güvenliği ve temizlik)
-- Birim silindiğinde (soft-delete olsa bile foreign key ilişkisi korunur), 
-- ancak fiziksel bir silme durumunda yetim kayıt (orphan) kalmaması için:
ALTER TABLE IF EXISTS personeller 
  DROP CONSTRAINT IF EXISTS personeller_rol_id_fkey,
  ADD CONSTRAINT personeller_rol_id_fkey 
  FOREIGN KEY (rol_id) REFERENCES roller(id) ON DELETE SET NULL;

-- 4. SOFT-DELETE FILTERING HELPER (Opsiyonel ama önerilen)
-- Sorguları hızlandırmak için silinmemiş kayıtları hedefleyen bir VIEW örneği
CREATE OR REPLACE VIEW aktif_personeller AS
SELECT * FROM personeller WHERE silindi_at IS NULL;

