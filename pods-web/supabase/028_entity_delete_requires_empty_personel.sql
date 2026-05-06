-- Birim / rol / şirket pasifleştirilmeden veya kalıcı silinmeden önce aktif personel kontrolü.
-- "İçinde aktif personel varken" silinememe ihtiyacını DB düzeyinde garanti eder.

-- Bazı veritabanlarında roller (veya diğerleri) henüz soft-delete kolonuna sahip değil;
-- tetikleyici `UPDATE OF silindi_at` kullandığı için kolonlar önce eklenir (mevcut yapıyı bozmaz).
ALTER TABLE IF EXISTS public.birimler
  ADD COLUMN IF NOT EXISTS silindi_at timestamptz NULL;

ALTER TABLE IF EXISTS public.roller
  ADD COLUMN IF NOT EXISTS silindi_at timestamptz NULL;

ALTER TABLE IF EXISTS public.ana_sirketler
  ADD COLUMN IF NOT EXISTS silindi_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.personeller_birim_agaci_icinde_sayisi(p_root uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE agac AS (
    SELECT id FROM public.birimler WHERE id = p_root
    UNION ALL
    SELECT b.id
    FROM public.birimler b
    INNER JOIN agac a ON b.ust_birim_id = a.id
  )
  SELECT count(*)::bigint
  FROM public.personeller p
  WHERE p.silindi_at IS NULL
    AND p.birim_id IS NOT NULL
    AND p.birim_id IN (SELECT id FROM agac)
$$;

CREATE OR REPLACE FUNCTION public.block_entity_soft_delete_if_active_personel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  IF TG_TABLE_NAME = 'birimler' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.silindi_at IS NULL AND NEW.silindi_at IS NOT NULL THEN
        n := public.personeller_birim_agaci_icinde_sayisi(OLD.id);
        IF n > 0 THEN
          RAISE EXCEPTION 'Bu birim veya alt birimlerinde % aktif personel varken birim pasifleştirilemez / silinemez. Önce personelleri başka birime taşıyın veya pasifleştirin.', n
            USING ERRCODE = '23503';
        END IF;
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      n := public.personeller_birim_agaci_icinde_sayisi(OLD.id);
      IF n > 0 THEN
        RAISE EXCEPTION 'Bu birim veya alt birimlerinde % aktif personel varken birim kalıcı olarak silinemez.', n
          USING ERRCODE = '23503';
      END IF;
      RETURN OLD;
    END IF;
  ELSIF TG_TABLE_NAME = 'roller' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.silindi_at IS NULL AND NEW.silindi_at IS NOT NULL THEN
        SELECT count(*) INTO n FROM public.personeller p
        WHERE p.silindi_at IS NULL AND p.rol_id = OLD.id;
        IF n > 0 THEN
          RAISE EXCEPTION 'Bu role bağlı % aktif personel varken rol pasifleştirilemez. Önce personellerin rolünü değiştirin.', n
            USING ERRCODE = '23503';
        END IF;
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      SELECT count(*) INTO n FROM public.personeller p
      WHERE p.silindi_at IS NULL AND p.rol_id = OLD.id;
      IF n > 0 THEN
        RAISE EXCEPTION 'Bu role bağlı % aktif personel varken rol kalıcı olarak silinemez.', n
          USING ERRCODE = '23503';
      END IF;
      RETURN OLD;
    END IF;
  ELSIF TG_TABLE_NAME = 'ana_sirketler' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.silindi_at IS NULL AND NEW.silindi_at IS NOT NULL THEN
        SELECT count(*) INTO n FROM public.personeller p
        WHERE p.silindi_at IS NULL AND p.ana_sirket_id = OLD.id;
        IF n > 0 THEN
          RAISE EXCEPTION 'Bu şirkette % aktif personel varken şirket pasifleştirilemez. Önce personelleri silin veya taşıyın.', n
            USING ERRCODE = '23503';
        END IF;
      END IF;
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      SELECT count(*) INTO n FROM public.personeller p
      WHERE p.silindi_at IS NULL AND p.ana_sirket_id = OLD.id;
      IF n > 0 THEN
        RAISE EXCEPTION 'Bu şirkette % aktif personel varken şirket kalıcı olarak silinemez.', n
          USING ERRCODE = '23503';
      END IF;
      RETURN OLD;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_birimler_guard_personel ON public.birimler;
CREATE TRIGGER tr_birimler_guard_personel
  BEFORE UPDATE OF silindi_at OR DELETE ON public.birimler
  FOR EACH ROW
  EXECUTE PROCEDURE public.block_entity_soft_delete_if_active_personel();

DROP TRIGGER IF EXISTS tr_roller_guard_personel ON public.roller;
CREATE TRIGGER tr_roller_guard_personel
  BEFORE UPDATE OF silindi_at OR DELETE ON public.roller
  FOR EACH ROW
  EXECUTE PROCEDURE public.block_entity_soft_delete_if_active_personel();

DROP TRIGGER IF EXISTS tr_ana_sirketler_guard_personel ON public.ana_sirketler;
CREATE TRIGGER tr_ana_sirketler_guard_personel
  BEFORE UPDATE OF silindi_at OR DELETE ON public.ana_sirketler
  FOR EACH ROW
  EXECUTE PROCEDURE public.block_entity_soft_delete_if_active_personel();

COMMENT ON FUNCTION public.personeller_birim_agaci_icinde_sayisi(uuid) IS
  'Verilen birim kökü ve tüm alt birimlerindeki aktif (silindi_at IS NULL) personel sayısı.';
