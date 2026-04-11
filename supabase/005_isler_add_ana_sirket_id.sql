-- Add ana_sirket_id to isler so frontend inserts work
ALTER TABLE IF EXISTS isler
ADD COLUMN IF NOT EXISTS ana_sirket_id UUID;

-- Optional: add foreign key to ana_sirketler if that table/column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ana_sirketler'
  ) THEN
    BEGIN
      -- try to add foreign key, ignore if it already exists
      ALTER TABLE IF EXISTS isler
      ADD CONSTRAINT IF NOT EXISTS fk_isler_ana_sirket
        FOREIGN KEY (ana_sirket_id) REFERENCES ana_sirketler(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists; do nothing
      NULL;
    END;
  END IF;
END
$$;

-- index for faster queries
CREATE INDEX IF NOT EXISTS idx_isler_ana_sirket_id ON isler (ana_sirket_id);

