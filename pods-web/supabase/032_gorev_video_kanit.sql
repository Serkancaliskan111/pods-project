-- 032: Video kanıt (max ~60 sn); kanit_resim_ler ve foto alanlarına dokunulmaz.
-- Sıra: bu dosyayı çalıştırdıktan sonra istemci güncellemeleri.
BEGIN;

-- Görev
ALTER TABLE public.isler
  ADD COLUMN IF NOT EXISTS video_zorunlu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_video_sayisi smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_video_suresi_sn smallint NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS kanit_videolar jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.isler.video_zorunlu IS 'Şablonsuz görevde video kanıtı zorunlu.';
COMMENT ON COLUMN public.isler.min_video_sayisi IS 'video_zorunlu ise minimum video adedi (0–3).';
COMMENT ON COLUMN public.isler.max_video_suresi_sn IS 'Politika üst süre (sn); varsayılan 60.';
COMMENT ON COLUMN public.isler.kanit_videolar IS 'Video kanıtları: [{"url","duration_sec","mime"}, ...]';

-- Görev şablonu
ALTER TABLE public.is_sablonlari
  ADD COLUMN IF NOT EXISTS video_zorunlu boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_video_sayisi smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_video_suresi_sn smallint NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.is_sablonlari.video_zorunlu IS 'Şablondan gelen görev satırında video kuralı.';

-- Checklist: soru_tipi VIDEO için süre üst sınırı
ALTER TABLE public.is_sablon_sorulari
  ADD COLUMN IF NOT EXISTS max_video_suresi_sn smallint NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.is_sablon_sorulari.max_video_suresi_sn IS 'VIDEO sorusu için izin verilen max süre (sn).';

-- Zincir görev adımı
ALTER TABLE public.isler_zincir_gorev_adimlari
  ADD COLUMN IF NOT EXISTS kanit_videolar jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.isler_zincir_gorev_adimlari.kanit_videolar IS 'Adım bazlı video kanıtları.';

DO $$
BEGIN
  ALTER TABLE public.isler
    ADD CONSTRAINT chk_isler_min_video_sayisi CHECK (min_video_sayisi >= 0 AND min_video_sayisi <= 3);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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
    ADD CONSTRAINT chk_sablon_min_video_sayisi CHECK (min_video_sayisi >= 0 AND min_video_sayisi <= 3);
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

-- Kanıt modu: görev satırında foto ve video aynı anda zorunlu olamaz
DO $$
BEGIN
  ALTER TABLE public.isler
    ADD CONSTRAINT chk_isler_kanit_foto_video_exclusive CHECK (NOT (foto_zorunlu AND video_zorunlu));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.is_sablonlari
    ADD CONSTRAINT chk_sablon_kanit_foto_video_exclusive CHECK (NOT (foto_zorunlu AND video_zorunlu));
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

-- Zincir sıra RPC — kanit_videolar dolu adımı da kilitle
CREATE OR REPLACE FUNCTION public.rpc_zincir_operasyon_adimlari_yeniden_sirala(
  p_is_id uuid,
  p_gorev_personel_ids uuid[] DEFAULT NULL,
  p_onay_personel_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_sys_admin boolean := false;
  v_company uuid;
  v_yetkiler jsonb;
  v_can boolean;
  r public.isler%rowtype;
  v_gorev_turu text;

  v_old_g_cnt int;
  v_old_o_cnt int;
  v_bad_multiset boolean;
  v_k int;
  v_ap uuid;
  v_birim_ap uuid;
  v_birim_g uuid;
  i int;
  v_g_len int;
  v_o_len int;
  v_distinct_g int;
  v_distinct_o int;
BEGIN
  IF p_is_id IS NULL THEN
    RAISE EXCEPTION 'is_id gerekli';
  END IF;

  IF p_gorev_personel_ids IS NULL AND p_onay_personel_ids IS NULL THEN
    RAISE EXCEPTION 'En az bir sıra listesi gerekli';
  END IF;

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

  IF p_gorev_personel_ids IS NOT NULL THEN
    IF v_gorev_turu NOT IN ('zincir_gorev', 'zincir_gorev_ve_onay') THEN
      RAISE EXCEPTION 'Bu görev tipinde zincir görev sırası yok';
    END IF;

    v_g_len := cardinality(p_gorev_personel_ids);
    IF v_g_len IS NULL OR v_g_len < 1 THEN
      RAISE EXCEPTION 'Zincir görev sırası boş olamaz';
    END IF;

    SELECT count(*)::int INTO v_old_g_cnt
    FROM public.isler_zincir_gorev_adimlari z
    WHERE z.is_id = p_is_id;

    IF v_g_len < v_old_g_cnt THEN
      RAISE EXCEPTION 'Zincir görevden personel çıkarılamaz';
    END IF;

    SELECT count(DISTINCT x)::int INTO v_distinct_g FROM unnest(p_gorev_personel_ids) AS x;
    IF v_distinct_g <> v_g_len THEN
      RAISE EXCEPTION 'Zincir görev sırasında tekrarlayan personel olamaz';
    END IF;

    SELECT EXISTS (
      WITH old_c AS (
        SELECT z.personel_id AS pid, count(*)::int AS c
        FROM public.isler_zincir_gorev_adimlari z
        WHERE z.is_id = p_is_id
        GROUP BY z.personel_id
      ),
      new_c AS (
        SELECT x AS pid, count(*)::int AS c
        FROM unnest(p_gorev_personel_ids) AS x
        GROUP BY x
      )
      SELECT 1 FROM old_c o
      LEFT JOIN new_c n ON n.pid = o.pid
      WHERE coalesce(n.c, 0) < o.c
      LIMIT 1
    ) INTO v_bad_multiset;

    IF coalesce(v_bad_multiset, false) THEN
      RAISE EXCEPTION 'Zincir görevde mevcut personeller korunmalı; yalnızca yeni personel eklenebilir veya sıra değişebilir';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.isler_zincir_gorev_adimlari z
      WHERE z.is_id = p_is_id
        AND (
          coalesce(z.durum, '') IN ('tamamlandi', 'reddedildi')
          OR z.tamamlandi_at IS NOT NULL
          OR coalesce(jsonb_array_length(coalesce(z.kanit_resim_ler, '[]'::jsonb)), 0) > 0
          OR coalesce(jsonb_array_length(coalesce(z.kanit_videolar, '[]'::jsonb)), 0) > 0
        )
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Tamamlanan veya kanıt içeren zincir görev adımında sıra değiştirilemez';
    END IF;

    FOR i IN 1..v_g_len LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.personeller p
        WHERE p.id = p_gorev_personel_ids[i]
          AND p.ana_sirket_id = r.ana_sirket_id
          AND p.silindi_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Geçersiz zincir görev personeli';
      END IF;
    END LOOP;

    DELETE FROM public.isler_zincir_gorev_adimlari WHERE is_id = p_is_id;

    FOR i IN 1..v_g_len LOOP
      INSERT INTO public.isler_zincir_gorev_adimlari (
        is_id,
        adim_no,
        personel_id,
        durum,
        kanit_resim_ler,
        kanit_videolar,
        kanit_foto_durumlari,
        aciklama,
        tamamlandi_at
      ) VALUES (
        p_is_id,
        i,
        p_gorev_personel_ids[i],
        CASE WHEN i = 1 THEN 'aktif' ELSE 'sira_bekliyor' END,
        '[]'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        NULL,
        NULL
      );
    END LOOP;

    SELECT p.birim_id INTO v_birim_g
    FROM public.personeller p
    WHERE p.id = p_gorev_personel_ids[1]
    LIMIT 1;

    UPDATE public.isler SET
      sorumlu_personel_id = p_gorev_personel_ids[1],
      birim_id = coalesce(v_birim_g, birim_id),
      zincir_aktif_adim = 1
    WHERE id = p_is_id;
  END IF;

  IF p_onay_personel_ids IS NOT NULL THEN
    IF v_gorev_turu NOT IN ('zincir_onay', 'zincir_gorev_ve_onay') THEN
      RAISE EXCEPTION 'Bu görev tipinde zincir onay sırası yok';
    END IF;

    v_o_len := cardinality(p_onay_personel_ids);
    IF v_o_len IS NULL OR v_o_len < 1 THEN
      RAISE EXCEPTION 'Zincir onay sırası boş olamaz';
    END IF;

    SELECT count(*)::int INTO v_old_o_cnt
    FROM public.isler_zincir_onay_adimlari z
    WHERE z.is_id = p_is_id;

    IF v_o_len < v_old_o_cnt THEN
      RAISE EXCEPTION 'Zincir onaydan onaylayıcı çıkarılamaz';
    END IF;

    SELECT count(DISTINCT x)::int INTO v_distinct_o FROM unnest(p_onay_personel_ids) AS x;
    IF v_distinct_o <> v_o_len THEN
      RAISE EXCEPTION 'Zincir onay sırasında tekrarlayan personel olamaz';
    END IF;

    SELECT EXISTS (
      WITH old_c AS (
        SELECT z.onaylayici_personel_id AS pid, count(*)::int AS c
        FROM public.isler_zincir_onay_adimlari z
        WHERE z.is_id = p_is_id
        GROUP BY z.onaylayici_personel_id
      ),
      new_c AS (
        SELECT x AS pid, count(*)::int AS c
        FROM unnest(p_onay_personel_ids) AS x
        GROUP BY x
      )
      SELECT 1 FROM old_c o
      LEFT JOIN new_c n ON n.pid = o.pid
      WHERE coalesce(n.c, 0) < o.c
      LIMIT 1
    ) INTO v_bad_multiset;

    IF coalesce(v_bad_multiset, false) THEN
      RAISE EXCEPTION 'Zincir onayda mevcut onaylayıcılar korunmalı; yalnızca yeni kişi eklenebilir veya sıra değişebilir';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.isler_zincir_onay_adimlari z
      WHERE z.is_id = p_is_id
        AND (
          z.onaylandi_at IS NOT NULL
          OR lower(trim(coalesce(z.durum, ''))) IN ('onaylandi', 'reddedildi')
        )
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Tamamlanan zincir onay adımında sıra değiştirilemez';
    END IF;

    FOR i IN 1..v_o_len LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.personeller p
        WHERE p.id = p_onay_personel_ids[i]
          AND p.ana_sirket_id = r.ana_sirket_id
          AND p.silindi_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Geçersiz zincir onay personeli';
      END IF;
    END LOOP;

    DELETE FROM public.isler_zincir_onay_adimlari WHERE is_id = p_is_id;

    FOR i IN 1..v_o_len LOOP
      INSERT INTO public.isler_zincir_onay_adimlari (
        is_id,
        adim_no,
        onaylayici_personel_id,
        durum,
        yorum,
        onaylandi_at
      ) VALUES (
        p_is_id,
        i,
        p_onay_personel_ids[i],
        'Atandı',
        NULL,
        NULL
      );
    END LOOP;

    v_k := coalesce(r.zincir_onay_aktif_adim, 0);
    IF v_k >= 1 AND v_k <= v_o_len THEN
      v_ap := p_onay_personel_ids[v_k];
      SELECT p.birim_id INTO v_birim_ap
      FROM public.personeller p
      WHERE p.id = v_ap
      LIMIT 1;

      UPDATE public.isler SET
        sorumlu_personel_id = v_ap,
        birim_id = coalesce(v_birim_ap, birim_id)
      WHERE id = p_is_id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) IS
  'Zincir görev/onay sırası; video kanıtı olan adım da kilitlenir.';

REVOKE ALL ON FUNCTION public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) TO authenticated;

COMMIT;
