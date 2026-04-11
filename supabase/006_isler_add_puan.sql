-- Add puan column to isler for task scoring
ALTER TABLE IF EXISTS isler
ADD COLUMN IF NOT EXISTS puan INTEGER DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_isler_puan ON isler (puan);

