-- Görev şablonu kapsamı (global / şirket / birim) + kişisel yapılacaklar (harici todo)

ALTER TABLE public.is_sablonlari
  ADD COLUMN IF NOT EXISTS kapsam text NOT NULL DEFAULT 'sirket';

ALTER TABLE public.is_sablonlari
  ADD COLUMN IF NOT EXISTS birim_id uuid REFERENCES public.birimler(id) ON DELETE SET NULL;

ALTER TABLE public.is_sablonlari
  ADD COLUMN IF NOT EXISTS olusturan_kullanici_id uuid REFERENCES public.kullanicilar(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_is_sablonlari_kapsam'
  ) THEN
    ALTER TABLE public.is_sablonlari
      ADD CONSTRAINT chk_is_sablonlari_kapsam
      CHECK (kapsam IN ('global', 'sirket', 'birim'));
  END IF;
END $$;

UPDATE public.is_sablonlari
SET kapsam = CASE
  WHEN ana_sirket_id IS NULL THEN 'global'
  ELSE 'sirket'
END
WHERE kapsam IS NULL OR kapsam = 'sirket';

COMMENT ON COLUMN public.is_sablonlari.kapsam IS 'global: tüm panel; sirket: ana_sirket_id; birim: birim_id + şirket';

-- Kişisel todo şablonları (yalnızca sahibi)
CREATE TABLE IF NOT EXISTS public.kisisel_todo_sablonlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES public.kullanicilar(id) ON DELETE CASCADE,
  baslik text NOT NULL,
  aciklama text,
  olusturulma_at timestamptz NOT NULL DEFAULT now(),
  guncelleme_at timestamptz NOT NULL DEFAULT now(),
  silindi_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.kisisel_todo_sablon_maddeleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sablon_id uuid NOT NULL REFERENCES public.kisisel_todo_sablonlari(id) ON DELETE CASCADE,
  metin text NOT NULL DEFAULT '',
  sira int NOT NULL DEFAULT 1
);

-- Kişisel todo kayıtları (takip listesi)
CREATE TABLE IF NOT EXISTS public.kisisel_todo_gorevleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid NOT NULL REFERENCES public.kullanicilar(id) ON DELETE CASCADE,
  sablon_id uuid REFERENCES public.kisisel_todo_sablonlari(id) ON DELETE SET NULL,
  baslik text NOT NULL,
  notlar text,
  durum text NOT NULL DEFAULT 'yapilacak'
    CHECK (durum IN ('yapilacak', 'yapildi', 'denetimde')),
  maddeler jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_id uuid REFERENCES public.isler(id) ON DELETE SET NULL,
  olusturulma_at timestamptz NOT NULL DEFAULT now(),
  guncelleme_at timestamptz NOT NULL DEFAULT now(),
  tamamlanma_at timestamptz,
  silindi_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kisisel_todo_gorev_kullanici
  ON public.kisisel_todo_gorevleri (kullanici_id)
  WHERE silindi_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_is_sablonlari_kapsam_birim
  ON public.is_sablonlari (kapsam, birim_id)
  WHERE silindi_at IS NULL;

ALTER TABLE public.kisisel_todo_sablonlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kisisel_todo_sablon_maddeleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kisisel_todo_gorevleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kisisel_todo_sablon_own ON public.kisisel_todo_sablonlari;
CREATE POLICY kisisel_todo_sablon_own ON public.kisisel_todo_sablonlari
  FOR ALL TO authenticated
  USING (kullanici_id = auth.uid())
  WITH CHECK (kullanici_id = auth.uid());

DROP POLICY IF EXISTS kisisel_todo_sablon_madde_own ON public.kisisel_todo_sablon_maddeleri;
CREATE POLICY kisisel_todo_sablon_madde_own ON public.kisisel_todo_sablon_maddeleri
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kisisel_todo_sablonlari s
      WHERE s.id = sablon_id AND s.kullanici_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kisisel_todo_sablonlari s
      WHERE s.id = sablon_id AND s.kullanici_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS kisisel_todo_gorev_own ON public.kisisel_todo_gorevleri;
CREATE POLICY kisisel_todo_gorev_own ON public.kisisel_todo_gorevleri
  FOR ALL TO authenticated
  USING (kullanici_id = auth.uid())
  WITH CHECK (kullanici_id = auth.uid());
