-- 033: Video üst süre tavanı 60 sn (032 daha önce 120 ile uygulanmış ortamlar için veri + CHECK + RPC).
BEGIN;

UPDATE public.isler SET max_video_suresi_sn = 60 WHERE max_video_suresi_sn > 60;
UPDATE public.is_sablonlari SET max_video_suresi_sn = 60 WHERE max_video_suresi_sn > 60;
UPDATE public.is_sablon_sorulari SET max_video_suresi_sn = 60 WHERE max_video_suresi_sn > 60;

ALTER TABLE public.isler DROP CONSTRAINT IF EXISTS chk_isler_max_video_suresi_sn;
ALTER TABLE public.is_sablonlari DROP CONSTRAINT IF EXISTS chk_sablon_max_video_suresi_sn;
ALTER TABLE public.is_sablon_sorulari DROP CONSTRAINT IF EXISTS chk_sablon_soru_max_video_sn;

DO $$
BEGIN
  ALTER TABLE public.isler
    ADD CONSTRAINT chk_isler_max_video_suresi_sn CHECK (max_video_suresi_sn >= 5 AND max_video_suresi_sn <= 60);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.is_sablonlari
    ADD CONSTRAINT chk_sablon_max_video_suresi_sn CHECK (max_video_suresi_sn >= 5 AND max_video_suresi_sn <= 60);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.is_sablon_sorulari
    ADD CONSTRAINT chk_sablon_soru_max_video_sn CHECK (max_video_suresi_sn >= 5 AND max_video_suresi_sn <= 60);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- rpc_is_operasyonel_guncelle — video alanları (026 üzerine)
CREATE OR REPLACE FUNCTION public.rpc_is_operasyonel_guncelle(
  p_is_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patch jsonb := coalesce(nullif(p_patch, 'null'::jsonb), '{}'::jsonb);
  v_pid uuid;
  v_sys_admin boolean := false;
  v_company uuid;
  v_yetkiler jsonb;
  v_can boolean;
  r public.isler%rowtype;
  v_patch_nkeys int := 0;
  v_patch_keys text[] := array[]::text[];
  v_key text;

  v_baslik text;
  v_aciklama text;
  v_sorumlu uuid;
  v_birim uuid;
  v_baslama timestamptz;
  v_son timestamptz;
  v_puan numeric;
  v_foto_zorunlu boolean;
  v_min_foto int;
  v_video_zorunlu boolean;
  v_min_video int;
  v_max_video_sn int;
  v_aciklama_zorunlu boolean;
  v_ozel boolean;

  v_gorev_turu text;
  v_step_id uuid;
  v_step_durum text;
  v_adim int;
BEGIN
  IF p_is_id IS NULL THEN
    RAISE EXCEPTION 'is_id gerekli';
  END IF;

  SELECT count(*)::int INTO v_patch_nkeys FROM jsonb_object_keys(v_patch);
  IF coalesce(v_patch_nkeys, 0) = 0 THEN
    RAISE EXCEPTION 'Güncellenecek alan yok';
  END IF;

  SELECT coalesce(array_agg(s.k ORDER BY s.k), array[]::text[])
    INTO v_patch_keys
  FROM (SELECT jsonb_object_keys AS k FROM jsonb_object_keys(v_patch)) s;

  FOREACH v_key IN ARRAY v_patch_keys
  LOOP
    IF v_key NOT IN (
      'baslik',
      'aciklama',
      'sorumlu_personel_id',
      'birim_id',
      'baslama_tarihi',
      'son_tarih',
      'puan',
      'foto_zorunlu',
      'min_foto_sayisi',
      'video_zorunlu',
      'min_video_sayisi',
      'max_video_suresi_sn',
      'aciklama_zorunlu',
      'ozel_gorev'
    ) THEN
      RAISE EXCEPTION 'Geçersiz güncelleme alanı: %', v_key;
    END IF;
  END LOOP;

  SELECT coalesce(k.is_system_admin, false)
    INTO v_sys_admin
  FROM public.kullanicilar k
  WHERE k.id = auth.uid()
    AND k.silindi_at IS NULL
  LIMIT 1;

  v_pid := public.current_personel_id();

  IF NOT v_sys_admin THEN
    IF v_pid IS NULL THEN
      RAISE EXCEPTION 'Oturum veya personel kaydı bulunamadı';
    END IF;

    SELECT p.ana_sirket_id, rol.yetkiler
      INTO v_company, v_yetkiler
    FROM public.personeller p
    LEFT JOIN public.roller rol ON rol.id = p.rol_id
    WHERE p.id = v_pid
      AND p.silindi_at IS NULL
    LIMIT 1;

    IF v_company IS NULL THEN
      RAISE EXCEPTION 'Şirket bilgisi bulunamadı';
    END IF;

    v_can := public.role_perm_truthy(v_yetkiler, 'is.duzenle');
    IF NOT v_can THEN
      RAISE EXCEPTION 'İş operasyonel düzenleme yetkisi yok (is.duzenle)';
    END IF;
  END IF;

  SELECT * INTO r FROM public.isler WHERE id = p_is_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı';
  END IF;

  IF NOT public.isler_operasyon_duzenlenebilir_mi(
    r.durum::text,
    coalesce(r.tekrar_gonderim_sayisi, 0)::integer
  ) THEN
    RAISE EXCEPTION 'Bu görev durumunda düzenleme yapılamaz (onaylı, reddedilmiş veya tekrar sürecinde)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.isler_silme_talepleri t
    WHERE t.is_id = p_is_id AND t.durum = 'bekliyor'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Silme talebi bekleyen görev düzenlenemez';
  END IF;

  IF NOT v_sys_admin THEN
    IF r.ana_sirket_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'Bu görev için düzenleme yapamazsınız';
    END IF;
  END IF;

  v_gorev_turu := nullif(trim(coalesce(r.gorev_turu, '')), '');
  IF v_gorev_turu IS NULL THEN
    v_gorev_turu := 'normal';
  END IF;

  IF v_patch ? 'ozel_gorev' THEN
    IF v_gorev_turu <> 'normal' AND coalesce((v_patch->>'ozel_gorev')::boolean, false) THEN
      RAISE EXCEPTION 'Özel görev yalnızca normal görev tipinde açılabilir';
    END IF;
  END IF;

  IF v_gorev_turu IN ('zincir_gorev', 'zincir_gorev_ve_onay') AND v_patch ? 'birim_id' THEN
    RAISE EXCEPTION 'Zincir görevde birim bu yolla değiştirilemez';
  END IF;

  v_baslik := r.baslik;
  v_aciklama := r.aciklama;
  v_sorumlu := r.sorumlu_personel_id;
  v_birim := r.birim_id;
  v_baslama := r.baslama_tarihi;
  v_son := r.son_tarih;
  v_puan := r.puan;
  v_foto_zorunlu := coalesce(r.foto_zorunlu, false);
  v_min_foto := coalesce(r.min_foto_sayisi, 0)::int;
  v_video_zorunlu := coalesce(r.video_zorunlu, false);
  v_min_video := coalesce(r.min_video_sayisi, 0)::int;
  v_max_video_sn := coalesce(r.max_video_suresi_sn, 60)::int;
  v_aciklama_zorunlu := coalesce(r.aciklama_zorunlu, false);
  v_ozel := coalesce(r.ozel_gorev, false);

  IF v_patch ? 'baslik' THEN
    v_baslik := nullif(trim(v_patch->>'baslik'), '');
    IF v_baslik IS NULL THEN
      RAISE EXCEPTION 'Başlık boş olamaz';
    END IF;
  END IF;

  IF v_patch ? 'aciklama' THEN
    IF jsonb_typeof(v_patch->'aciklama') = 'null' THEN
      v_aciklama := null;
    ELSE
      v_aciklama := nullif(trim(v_patch->>'aciklama'), '');
    END IF;
  END IF;

  IF v_patch ? 'sorumlu_personel_id' THEN
    IF jsonb_typeof(v_patch->'sorumlu_personel_id') = 'null' THEN
      RAISE EXCEPTION 'Sorumlu personel boş olamaz';
    END IF;
    v_sorumlu := (v_patch->>'sorumlu_personel_id')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.personeller p
      WHERE p.id = v_sorumlu
        AND p.ana_sirket_id = r.ana_sirket_id
        AND p.silindi_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Geçersiz sorumlu personel';
    END IF;

    IF v_gorev_turu IN ('zincir_gorev', 'zincir_gorev_ve_onay') THEN
      v_adim := coalesce(r.zincir_aktif_adim, 1);
      SELECT z.id, z.durum INTO v_step_id, v_step_durum
      FROM public.isler_zincir_gorev_adimlari z
      WHERE z.is_id = p_is_id AND z.adim_no = v_adim
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Zincir görev adımı bulunamadı';
      END IF;
      IF coalesce(v_step_durum, '') NOT IN ('aktif', 'sira_bekliyor', 'bekliyor') THEN
        RAISE EXCEPTION 'Bu zincir adımı için sorumlu değiştirilemez';
      END IF;
      UPDATE public.isler_zincir_gorev_adimlari
      SET personel_id = v_sorumlu
      WHERE id = v_step_id;
    END IF;
  END IF;

  IF v_patch ? 'birim_id' THEN
    IF jsonb_typeof(v_patch->'birim_id') = 'null' THEN
      v_birim := null;
    ELSE
      v_birim := (v_patch->>'birim_id')::uuid;
      IF v_birim IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.birimler b
        WHERE b.id = v_birim
          AND b.ana_sirket_id = r.ana_sirket_id
          AND b.silindi_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Geçersiz birim';
      END IF;
    END IF;
  END IF;

  IF v_patch ? 'baslama_tarihi' THEN
    IF jsonb_typeof(v_patch->'baslama_tarihi') = 'null' THEN
      v_baslama := null;
    ELSE
      v_baslama := (v_patch->>'baslama_tarihi')::timestamptz;
    END IF;
  END IF;

  IF v_patch ? 'son_tarih' THEN
    IF jsonb_typeof(v_patch->'son_tarih') = 'null' THEN
      v_son := null;
    ELSE
      v_son := (v_patch->>'son_tarih')::timestamptz;
    END IF;
  END IF;

  IF v_patch ? 'puan' THEN
    IF jsonb_typeof(v_patch->'puan') = 'null' THEN
      v_puan := null;
    ELSE
      v_puan := (v_patch->>'puan')::numeric;
    END IF;
  END IF;

  IF v_patch ? 'foto_zorunlu' THEN
    v_foto_zorunlu := coalesce((v_patch->>'foto_zorunlu')::boolean, false);
    IF v_foto_zorunlu THEN
      v_video_zorunlu := false;
      v_min_video := 0;
    END IF;
  END IF;

  IF v_patch ? 'min_foto_sayisi' THEN
    v_min_foto := greatest(0, least(99, coalesce((v_patch->>'min_foto_sayisi')::int, 0)));
  END IF;

  IF v_patch ? 'video_zorunlu' THEN
    v_video_zorunlu := coalesce((v_patch->>'video_zorunlu')::boolean, false);
    IF v_video_zorunlu THEN
      v_foto_zorunlu := false;
      v_min_foto := 0;
    END IF;
  END IF;

  IF v_patch ? 'min_video_sayisi' THEN
    v_min_video := greatest(0, least(3, coalesce((v_patch->>'min_video_sayisi')::int, 0)));
  END IF;

  IF v_patch ? 'max_video_suresi_sn' THEN
    v_max_video_sn := greatest(5, least(60, coalesce((v_patch->>'max_video_suresi_sn')::int, 60)));
  END IF;

  IF v_patch ? 'aciklama_zorunlu' THEN
    v_aciklama_zorunlu := coalesce((v_patch->>'aciklama_zorunlu')::boolean, false);
  END IF;

  IF v_patch ? 'ozel_gorev' THEN
    v_ozel := coalesce((v_patch->>'ozel_gorev')::boolean, false);
  END IF;

  IF v_gorev_turu <> 'normal' THEN
    v_ozel := false;
  END IF;

  -- Satırda veya path'te kalan çakışma (eski veri / çift patch)
  IF v_foto_zorunlu AND v_video_zorunlu THEN
    IF v_patch ? 'video_zorunlu' AND coalesce((v_patch->>'video_zorunlu')::boolean, false) THEN
      v_foto_zorunlu := false;
      v_min_foto := 0;
    ELSE
      v_video_zorunlu := false;
      v_min_video := 0;
    END IF;
  END IF;

  UPDATE public.isler SET
    baslik = v_baslik,
    aciklama = v_aciklama,
    sorumlu_personel_id = v_sorumlu,
    birim_id = v_birim,
    baslama_tarihi = v_baslama,
    son_tarih = v_son,
    gorunur_tarih = v_baslama,
    puan = v_puan,
    foto_zorunlu = v_foto_zorunlu,
    min_foto_sayisi = v_min_foto,
    video_zorunlu = v_video_zorunlu,
    min_video_sayisi = v_min_video,
    max_video_suresi_sn = v_max_video_sn,
    aciklama_zorunlu = v_aciklama_zorunlu,
    ozel_gorev = v_ozel
  WHERE id = p_is_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_is_operasyonel_guncelle(uuid, jsonb) IS
  'is.duzenle ile güvenli iş güncelleme; foto ve video kanıtı aynı anda zorunlu olamaz.';

REVOKE ALL ON FUNCTION public.rpc_is_operasyonel_guncelle(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_is_operasyonel_guncelle(uuid, jsonb) TO authenticated;

COMMIT;
