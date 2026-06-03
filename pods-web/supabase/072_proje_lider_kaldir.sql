-- 072: Proje lider rolünü kaldır — mevcut liderler yetkili olur

BEGIN;

UPDATE public.proje_sorumlulari
SET rol = 'yetkili'
WHERE rol = 'lider';

ALTER TABLE public.proje_sorumlulari
  DROP CONSTRAINT IF EXISTS proje_sorumlulari_rol_check;

ALTER TABLE public.proje_sorumlulari
  ADD CONSTRAINT proje_sorumlulari_rol_check
  CHECK (rol IN ('uye', 'yetkili'));

COMMENT ON COLUMN public.proje_sorumlulari.rol IS 'uye=proje ekibi (görev ataması); yetkili=proje.yonet yöneticisi.';

COMMIT;
