-- Görev referans medya desteği:
-- - isler tablosuna görev seviyesinde referans medya listesi
-- - task-reference-media storage bucket (foto/video referansları)

ALTER TABLE public.isler
  ADD COLUMN IF NOT EXISTS referans_medya jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-reference-media',
  'task-reference-media',
  false,
  104857600,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS task_reference_media_auth_insert ON storage.objects;
CREATE POLICY task_reference_media_auth_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-reference-media');

DROP POLICY IF EXISTS task_reference_media_auth_select ON storage.objects;
CREATE POLICY task_reference_media_auth_select
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'task-reference-media');
