-- Tek cihazdan aktif oturum zorunluluğu için personeller tablosuna session kolonları
BEGIN;

ALTER TABLE IF EXISTS personeller
  ADD COLUMN IF NOT EXISTS active_session_id text NULL,
  ADD COLUMN IF NOT EXISTS active_device_id text NULL,
  ADD COLUMN IF NOT EXISTS active_session_updated_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_personeller_active_session_id
  ON personeller (active_session_id);

COMMIT;

