-- Zincir görev (sıralı yürütme) ve zincir onay (sıralı onay) desteği
-- Uygulama: pods-web / pods-mobile

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS isler
  ADD COLUMN IF NOT EXISTS gorev_turu text NOT NULL DEFAULT 'normal';

ALTER TABLE IF EXISTS isler
  ADD COLUMN IF NOT EXISTS zincir_aktif_adim integer NOT NULL DEFAULT 1;

ALTER TABLE IF EXISTS isler
  ADD COLUMN IF NOT EXISTS zincir_onay_aktif_adim integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN isler.gorev_turu IS 'normal | zincir_gorev | zincir_onay | zincir_gorev_ve_onay';
COMMENT ON COLUMN isler.zincir_aktif_adim IS 'Zincir görevde aktif halka sırası (1 tabanlı).';
COMMENT ON COLUMN isler.zincir_onay_aktif_adim IS '0: onay zinciri başlamadı; 1..N: sıradaki onaylayıcı adımı.';

CREATE TABLE IF NOT EXISTS isler_zincir_gorev_adimlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_id uuid NOT NULL REFERENCES isler(id) ON DELETE CASCADE,
  adim_no integer NOT NULL,
  personel_id uuid NOT NULL REFERENCES personeller(id) ON DELETE CASCADE,
  durum text NOT NULL DEFAULT 'sira_bekliyor',
  kanit_resim_ler jsonb NOT NULL DEFAULT '[]'::jsonb,
  kanit_foto_durumlari jsonb NOT NULL DEFAULT '{}'::jsonb,
  aciklama text,
  tamamlandi_at timestamptz,
  olusturuldu_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_zincir_gorev_adim UNIQUE (is_id, adim_no)
);

CREATE INDEX IF NOT EXISTS idx_zincir_gorev_is_id ON isler_zincir_gorev_adimlari (is_id);

CREATE TABLE IF NOT EXISTS isler_zincir_onay_adimlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_id uuid NOT NULL REFERENCES isler(id) ON DELETE CASCADE,
  adim_no integer NOT NULL,
  onaylayici_personel_id uuid NOT NULL REFERENCES personeller(id) ON DELETE CASCADE,
  durum text NOT NULL DEFAULT 'bekliyor',
  yorum text,
  onaylandi_at timestamptz,
  olusturuldu_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_zincir_onay_adim UNIQUE (is_id, adim_no)
);

CREATE INDEX IF NOT EXISTS idx_zincir_onay_is_id ON isler_zincir_onay_adimlari (is_id);

COMMIT;
