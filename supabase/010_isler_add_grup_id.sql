BEGIN;

ALTER TABLE IF EXISTS isler
  ADD COLUMN IF NOT EXISTS grup_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_isler_grup_id ON isler (grup_id);

COMMIT;

