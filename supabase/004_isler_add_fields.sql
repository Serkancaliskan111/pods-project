-- Add fields to isler to support single/ad-hoc tasks and evidence rules
ALTER TABLE IF EXISTS isler
ADD COLUMN IF NOT EXISTS is_sablon_id UUID,
ADD COLUMN IF NOT EXISTS foto_zorunlu BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS min_foto_sayisi INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS son_tarih TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS aciklama_zorunlu BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aciklama TEXT;

-- Optional: ensure indexes for common queries (e.g., by birim_id, sorumlu_personel_id)
CREATE INDEX IF NOT EXISTS idx_isler_birim_id ON isler (birim_id);
CREATE INDEX IF NOT EXISTS idx_isler_sorumlu_personel_id ON isler (sorumlu_personel_id);

