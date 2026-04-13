BEGIN;

ALTER TABLE IF EXISTS public.personeller
  ADD COLUMN IF NOT EXISTS mobil_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobil_online_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS mobil_last_seen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS mobil_last_offline_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_personeller_mobil_online
  ON public.personeller (mobil_online);

CREATE INDEX IF NOT EXISTS idx_personeller_mobil_last_seen_at
  ON public.personeller (mobil_last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.personel_online_kayitlari (
  id bigserial PRIMARY KEY,
  personel_id uuid NOT NULL REFERENCES public.personeller(id) ON DELETE CASCADE,
  durum text NOT NULL CHECK (durum IN ('online', 'offline')),
  aciklama text NULL,
  kaydedildi_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personel_online_kayitlari_personel_id
  ON public.personel_online_kayitlari (personel_id, kaydedildi_at DESC);

COMMIT;

