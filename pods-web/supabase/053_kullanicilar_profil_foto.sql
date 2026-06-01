-- 053: Kullanıcı profil fotoğrafı (Storage yolu + profil-fotolari bucket)
-- Yalnızca ekleme / yeni bucket; mevcut tabloları veya sütunları silmez/değiştirmez.

BEGIN;

ALTER TABLE IF EXISTS public.kullanicilar
  ADD COLUMN IF NOT EXISTS profil_foto_yol text;

COMMENT ON COLUMN public.kullanicilar.profil_foto_yol
  IS 'profil-fotolari bucket içindeki nesne yolu (örn. {kullanici_uuid}/avatar.jpg).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profil-fotolari',
  'profil-fotolari',
  false,
  3145728,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS profil_fotolari_insert_own ON storage.objects;
CREATE POLICY profil_fotolari_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profil-fotolari'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS profil_fotolari_select_authenticated ON storage.objects;
CREATE POLICY profil_fotolari_select_authenticated ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'profil-fotolari');

DROP POLICY IF EXISTS profil_fotolari_update_own ON storage.objects;
CREATE POLICY profil_fotolari_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profil-fotolari'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profil-fotolari'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS profil_fotolari_delete_own ON storage.objects;
CREATE POLICY profil_fotolari_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profil-fotolari'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
