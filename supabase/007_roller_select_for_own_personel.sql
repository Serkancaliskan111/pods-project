-- Girişte AuthContext, personelin rol_id'si ile roller.yetkiler okur.
-- RLS tüm SELECT'leri kesiyorsa kullanıcı rolü göremez ve panel reddedilir.
-- Bu politikayı SQL Editor'de çalıştırmadan önce mevcut roller politikalarını kontrol edin.

-- ALTER TABLE roller ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS "roller_select_own_via_personel" ON roller;

-- CREATE POLICY "roller_select_own_via_personel"
-- ON roller
-- FOR SELECT
-- TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1
--     FROM personeller p
--     WHERE p.kullanici_id = auth.uid()
--       AND p.rol_id = roller.id
--       AND p.silindi_at IS NULL
--   )
-- );

-- personeller.silindi_at yoksa AND satırını kaldırın.
-- Yöneticiler tüm rolleri görsün diye ayrıca service_role veya is_system_admin koşulu eklenebilir.
