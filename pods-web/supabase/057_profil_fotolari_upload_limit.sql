-- 057: Profil fotoğrafı bucket — istemci sıkıştırır; ham yükleme üst sınırı 30 MB

BEGIN;

UPDATE storage.buckets
SET
  file_size_limit = 31457280,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
WHERE id = 'profil-fotolari';

COMMIT;
