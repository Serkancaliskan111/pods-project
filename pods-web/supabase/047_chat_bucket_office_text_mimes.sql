-- Sohbet ekleri: TXT, Excel, PowerPoint, CSV, RTF, ODF, ZIP
-- Hata: "mime type text/plain is not supported" → bu migration Supabase'de çalıştırılmalı.

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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/rtf',
    'text/rtf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/zip',
    'application/x-zip-compressed'
  ]
WHERE id = 'chat-ekleri';

COMMIT;
