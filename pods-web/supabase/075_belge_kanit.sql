-- 075: Belgeli görev kanıtı — belge_zorunlu, kanit_belgeler, storage MIME

BEGIN;

ALTER TABLE public.isler
  ADD COLUMN IF NOT EXISTS belge_zorunlu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_belge_sayisi integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kanit_belgeler jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.is_sablonlari
  ADD COLUMN IF NOT EXISTS belge_zorunlu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_belge_sayisi integer NOT NULL DEFAULT 0;

ALTER TABLE public.isler_zincir_gorev_adimlari
  ADD COLUMN IF NOT EXISTS kanit_belgeler jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.isler.belge_zorunlu IS 'Tamamlamada PDF/Office belge zorunlu';
COMMENT ON COLUMN public.isler.kanit_belgeler IS 'Belge kanıtları: [{"url","name","mime","size"}, ...]';

DO $$
BEGIN
  ALTER TABLE public.isler
    ADD CONSTRAINT chk_isler_min_belge_range
    CHECK (min_belge_sayisi >= 0 AND min_belge_sayisi <= 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- gorev_kanitlari bucket — belge MIME (varsa birleştir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gorev_kanitlari',
  'gorev_kanitlari',
  true,
  26214400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = GREATEST(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
  allowed_mime_types = (
    SELECT array_agg(DISTINCT m)
    FROM unnest(coalesce(storage.buckets.allowed_mime_types, '{}'::text[]) || EXCLUDED.allowed_mime_types) AS m
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
