-- Kişisel todo: madde tipi (metin/foto/video) + medya depolama

BEGIN;

ALTER TABLE public.kisisel_todo_sablon_maddeleri
  ADD COLUMN IF NOT EXISTS madde_tipi text NOT NULL DEFAULT 'metin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_kisisel_todo_sablon_madde_tipi'
  ) THEN
    ALTER TABLE public.kisisel_todo_sablon_maddeleri
      ADD CONSTRAINT chk_kisisel_todo_sablon_madde_tipi
      CHECK (madde_tipi IN ('metin', 'foto', 'video'));
  END IF;
END $$;

COMMENT ON COLUMN public.kisisel_todo_sablon_maddeleri.madde_tipi IS 'metin | foto | video — liste maddesine kopyalanır';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kisisel-todo-medya',
  'kisisel-todo-medya',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS kisisel_todo_medya_insert_own ON storage.objects;
CREATE POLICY kisisel_todo_medya_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kisisel-todo-medya'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS kisisel_todo_medya_select_authenticated ON storage.objects;
CREATE POLICY kisisel_todo_medya_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kisisel-todo-medya');

DROP POLICY IF EXISTS kisisel_todo_medya_update_own ON storage.objects;
CREATE POLICY kisisel_todo_medya_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'kisisel-todo-medya'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'kisisel-todo-medya'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS kisisel_todo_medya_delete_own ON storage.objects;
CREATE POLICY kisisel_todo_medya_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kisisel-todo-medya'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
