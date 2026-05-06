-- Mobil pickers: HEIC/HEIF ve bazı Android MIME’leri 042 listesinde yoktu; yükleme reddediliyordu.

BEGIN;

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
WHERE id = 'chat-ekleri';

COMMIT;
