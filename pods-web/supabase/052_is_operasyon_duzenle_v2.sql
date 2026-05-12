-- Operasyonel iş düzenleme v2:
--  - `rpc_is_operasyonel_guncelle` whitelist'i video alanlarını ve acil bayrağını
--    da kabul edecek şekilde genişletildi.
--  - Foto/video zorunluluğunun mutex'i, tarih sıralaması ve sınır
--    validasyonları DB tarafına da taşındı (UI bypass edilse bile koruma).
--  - Yeni RPC: `rpc_sirali_adim_guncelle` — sıralı görevde yalnızca yapılmamış
--    adımları (aktif | sira_bekliyor) günceller; tamamlanmış/onay sürecindeki
--    adımları reddeder.
--  - Geriye uyumlu: tüm fonksiyonlar `create or replace`, yeni alanlar opsiyonel.

begin;

-- ============================================================================
-- 1) rpc_is_operasyonel_guncelle: video alanları + acil + mutex/range validasyon
-- ============================================================================
create or replace function public.rpc_is_operasyonel_guncelle(
  p_is_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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
  v_gorunur timestamptz;
  v_puan numeric;
  v_foto_zorunlu boolean;
  v_min_foto int;
  v_video_zorunlu boolean;
  v_min_video int;
  v_max_video_sn int;
  v_aciklama_zorunlu boolean;
  v_ozel boolean;
  v_acil boolean;

  v_gorev_turu text;
  v_step_id uuid;
  v_step_durum text;
  v_adim int;
begin
  if p_is_id is null then
    raise exception 'is_id gerekli';
  end if;

  select count(*)::int into v_patch_nkeys from jsonb_object_keys(v_patch);
  if coalesce(v_patch_nkeys, 0) = 0 then
    raise exception 'Güncellenecek alan yok';
  end if;

  select coalesce(array_agg(s.k order by s.k), array[]::text[])
    into v_patch_keys
  from (select jsonb_object_keys as k from jsonb_object_keys(v_patch)) s;

  foreach v_key in array v_patch_keys
  loop
    if v_key not in (
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
      'ozel_gorev',
      'acil'
    ) then
      raise exception 'Geçersiz güncelleme alanı: %', v_key;
    end if;
  end loop;

  -- Yetki + kapsam doğrulamaları
  select coalesce(k.is_system_admin, false)
    into v_sys_admin
  from public.kullanicilar k
  where k.id = auth.uid()
    and k.silindi_at is null
  limit 1;

  v_pid := public.current_personel_id();

  if not v_sys_admin then
    if v_pid is null then
      raise exception 'Oturum veya personel kaydı bulunamadı';
    end if;

    select p.ana_sirket_id, rol.yetkiler
      into v_company, v_yetkiler
    from public.personeller p
    left join public.roller rol on rol.id = p.rol_id
    where p.id = v_pid
      and p.silindi_at is null
    limit 1;

    if v_company is null then
      raise exception 'Şirket bilgisi bulunamadı';
    end if;

    v_can := public.role_perm_truthy(v_yetkiler, 'is.duzenle');
    if not v_can then
      raise exception 'İş operasyonel düzenleme yetkisi yok (is.duzenle)';
    end if;
  end if;

  select * into r from public.isler where id = p_is_id limit 1;
  if not found then
    raise exception 'Görev bulunamadı';
  end if;

  if not public.isler_operasyon_duzenlenebilir_mi(
    r.durum::text,
    coalesce(r.tekrar_gonderim_sayisi, 0)::integer
  ) then
    raise exception 'Bu görev durumunda düzenleme yapılamaz (onaylı, reddedilmiş veya tekrar sürecinde)';
  end if;

  if exists (
    select 1 from public.isler_silme_talepleri t
    where t.is_id = p_is_id and t.durum = 'bekliyor'
    limit 1
  ) then
    raise exception 'Silme talebi bekleyen görev düzenlenemez';
  end if;

  if not v_sys_admin then
    if r.ana_sirket_id is distinct from v_company then
      raise exception 'Bu görev için düzenleme yapamazsınız';
    end if;
  end if;

  v_gorev_turu := nullif(trim(coalesce(r.gorev_turu, '')), '');
  if v_gorev_turu is null then
    v_gorev_turu := 'normal';
  end if;

  -- Tip bağımlı erken kontroller
  if v_patch ? 'ozel_gorev' then
    if v_gorev_turu <> 'normal' and coalesce((v_patch->>'ozel_gorev')::boolean, false) then
      raise exception 'Özel görev yalnızca normal görev tipinde açılabilir';
    end if;
  end if;

  if v_gorev_turu in ('zincir_gorev', 'zincir_gorev_ve_onay') and v_patch ? 'birim_id' then
    raise exception 'Zincir görevde birim bu yolla değiştirilemez';
  end if;

  -- Mevcut değerleri yükle
  v_baslik := r.baslik;
  v_aciklama := r.aciklama;
  v_sorumlu := r.sorumlu_personel_id;
  v_birim := r.birim_id;
  v_baslama := r.baslama_tarihi;
  v_son := r.son_tarih;
  v_gorunur := r.gorunur_tarih;
  v_puan := r.puan;
  v_foto_zorunlu := coalesce(r.foto_zorunlu, false);
  v_min_foto := coalesce(r.min_foto_sayisi, 0)::int;
  v_video_zorunlu := coalesce(r.video_zorunlu, false);
  v_min_video := coalesce(r.min_video_sayisi, 0)::int;
  v_max_video_sn := coalesce(r.max_video_suresi_sn, 60)::int;
  v_aciklama_zorunlu := coalesce(r.aciklama_zorunlu, false);
  v_ozel := coalesce(r.ozel_gorev, false);
  v_acil := coalesce(r.acil, false);

  if v_patch ? 'baslik' then
    v_baslik := nullif(trim(v_patch->>'baslik'), '');
    if v_baslik is null then
      raise exception 'Başlık boş olamaz';
    end if;
  end if;

  if v_patch ? 'aciklama' then
    if jsonb_typeof(v_patch->'aciklama') = 'null' then
      v_aciklama := null;
    else
      v_aciklama := nullif(trim(v_patch->>'aciklama'), '');
    end if;
  end if;

  if v_patch ? 'sorumlu_personel_id' then
    if jsonb_typeof(v_patch->'sorumlu_personel_id') = 'null' then
      raise exception 'Sorumlu personel boş olamaz';
    end if;
    v_sorumlu := (v_patch->>'sorumlu_personel_id')::uuid;
    if not exists (
      select 1 from public.personeller p
      where p.id = v_sorumlu
        and p.ana_sirket_id = r.ana_sirket_id
        and p.silindi_at is null
    ) then
      raise exception 'Geçersiz sorumlu personel';
    end if;

    if v_gorev_turu in ('zincir_gorev', 'zincir_gorev_ve_onay') then
      v_adim := coalesce(r.zincir_aktif_adim, 1);
      select z.id, z.durum into v_step_id, v_step_durum
      from public.isler_zincir_gorev_adimlari z
      where z.is_id = p_is_id and z.adim_no = v_adim
      limit 1;
      if not found then
        raise exception 'Zincir görev adımı bulunamadı';
      end if;
      if coalesce(v_step_durum, '') not in ('aktif', 'sira_bekliyor', 'bekliyor') then
        raise exception 'Bu zincir adımı için sorumlu değiştirilemez';
      end if;
      update public.isler_zincir_gorev_adimlari
      set personel_id = v_sorumlu
      where id = v_step_id;
    end if;
  end if;

  if v_patch ? 'birim_id' then
    if jsonb_typeof(v_patch->'birim_id') = 'null' then
      v_birim := null;
    else
      v_birim := (v_patch->>'birim_id')::uuid;
      if v_birim is not null and not exists (
        select 1 from public.birimler b
        where b.id = v_birim
          and b.ana_sirket_id = r.ana_sirket_id
          and b.silindi_at is null
      ) then
        raise exception 'Geçersiz birim';
      end if;
    end if;
  end if;

  if v_patch ? 'baslama_tarihi' then
    if jsonb_typeof(v_patch->'baslama_tarihi') = 'null' then
      v_baslama := null;
    else
      v_baslama := (v_patch->>'baslama_tarihi')::timestamptz;
    end if;
  end if;

  if v_patch ? 'son_tarih' then
    if jsonb_typeof(v_patch->'son_tarih') = 'null' then
      v_son := null;
    else
      v_son := (v_patch->>'son_tarih')::timestamptz;
    end if;
  end if;

  -- Tarih sırası: her ikisi doluysa son_tarih > baslama_tarihi
  if v_baslama is not null and v_son is not null and v_son <= v_baslama then
    raise exception 'Bitiş tarihi başlangıçtan sonra olmalı';
  end if;

  if v_patch ? 'puan' then
    if jsonb_typeof(v_patch->'puan') = 'null' then
      v_puan := null;
    else
      v_puan := (v_patch->>'puan')::numeric;
      if v_puan < 0 then
        raise exception 'Puan negatif olamaz';
      end if;
    end if;
  end if;

  if v_patch ? 'foto_zorunlu' then
    v_foto_zorunlu := coalesce((v_patch->>'foto_zorunlu')::boolean, false);
  end if;

  if v_patch ? 'min_foto_sayisi' then
    v_min_foto := greatest(0, least(99, coalesce((v_patch->>'min_foto_sayisi')::int, 0)));
  end if;

  if v_patch ? 'video_zorunlu' then
    v_video_zorunlu := coalesce((v_patch->>'video_zorunlu')::boolean, false);
  end if;

  if v_patch ? 'min_video_sayisi' then
    v_min_video := greatest(0, least(3, coalesce((v_patch->>'min_video_sayisi')::int, 0)));
  end if;

  if v_patch ? 'max_video_suresi_sn' then
    v_max_video_sn := greatest(5, least(60, coalesce((v_patch->>'max_video_suresi_sn')::int, 60)));
  end if;

  -- Foto/video zorunlu mutex
  if v_foto_zorunlu and v_video_zorunlu then
    raise exception 'Fotoğraf ve video zorunluluğu aynı anda etkin olamaz';
  end if;

  -- min_video pozitif ama video_zorunlu kapalıysa sıfırla
  if not v_video_zorunlu then
    v_min_video := 0;
  end if;

  if v_patch ? 'aciklama_zorunlu' then
    v_aciklama_zorunlu := coalesce((v_patch->>'aciklama_zorunlu')::boolean, false);
  end if;

  if v_patch ? 'ozel_gorev' then
    v_ozel := coalesce((v_patch->>'ozel_gorev')::boolean, false);
  end if;

  if v_patch ? 'acil' then
    v_acil := coalesce((v_patch->>'acil')::boolean, false);
  end if;

  if v_gorev_turu <> 'normal' then
    v_ozel := false;
  end if;

  -- gorunur_tarih her zaman baslama_tarihi ile senkron
  v_gorunur := v_baslama;

  update public.isler set
    baslik = v_baslik,
    aciklama = v_aciklama,
    sorumlu_personel_id = v_sorumlu,
    birim_id = v_birim,
    baslama_tarihi = v_baslama,
    son_tarih = v_son,
    gorunur_tarih = v_gorunur,
    puan = v_puan,
    foto_zorunlu = v_foto_zorunlu,
    min_foto_sayisi = v_min_foto,
    video_zorunlu = v_video_zorunlu,
    min_video_sayisi = v_min_video,
    max_video_suresi_sn = v_max_video_sn,
    aciklama_zorunlu = v_aciklama_zorunlu,
    ozel_gorev = v_ozel,
    acil = v_acil
  where id = p_is_id;
end;
$$;

comment on function public.rpc_is_operasyonel_guncelle(uuid, jsonb) is
  'is.duzenle ile güvenli iş güncelleme; video alanları ve acil bayrağı dahil. Foto/video mutex, tarih sırası ve sınır validasyonları zorlanır.';

revoke all on function public.rpc_is_operasyonel_guncelle(uuid, jsonb) from public;
grant execute on function public.rpc_is_operasyonel_guncelle(uuid, jsonb) to authenticated;

-- ============================================================================
-- 2) rpc_sirali_adim_guncelle: sadece yapılmamış adımlar (aktif | sira_bekliyor)
--    UI tip bazlı: tamamlanmış/denetimde olan adımlar reddedilir.
--    Patch alanları:
--      - personel_id (uuid)
--      - denetimci_personel_id (uuid|null)
--      - adim_baslik (text|null)
--      - adim_istenenler (jsonb) — TAM nesne yerine kısmi merge yapılır:
--          { aciklama, baslama_tarihi, bitis_tarihi, puan, aciklama_zorunlu,
--            acil, kanit: { foto_zorunlu, min_foto_sayisi, video_zorunlu,
--                            min_video_sayisi, max_video_suresi_sn } }
-- ============================================================================
create or replace function public.rpc_sirali_adim_guncelle(
  p_is_id uuid,
  p_adim_no integer,
  p_patch jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(nullif(p_patch, 'null'::jsonb), '{}'::jsonb);
  v_pid uuid;
  v_sys_admin boolean := false;
  v_company uuid;
  v_yetkiler jsonb;
  v_can boolean;
  v_task public.isler%rowtype;
  v_step public.isler_zincir_gorev_adimlari%rowtype;
  v_prev_step public.isler_zincir_gorev_adimlari%rowtype;
  v_next_step public.isler_zincir_gorev_adimlari%rowtype;

  v_personel uuid;
  v_denetimci uuid;
  v_adim_baslik text;
  v_istenenler jsonb;
  v_kanit jsonb;

  v_foto_zorunlu boolean;
  v_video_zorunlu boolean;
  v_min_foto int;
  v_min_video int;
  v_max_video_sn int;
  v_puan numeric;
  v_baslama timestamptz;
  v_bitis timestamptz;
begin
  if p_is_id is null or p_adim_no is null then
    raise exception 'is_id ve adim_no gerekli';
  end if;

  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'patch object olmalı';
  end if;

  -- Yetki + şirket
  select coalesce(k.is_system_admin, false)
    into v_sys_admin
  from public.kullanicilar k
  where k.id = auth.uid()
    and k.silindi_at is null
  limit 1;

  v_pid := public.current_personel_id();

  if not v_sys_admin then
    if v_pid is null then
      raise exception 'Oturum veya personel kaydı bulunamadı';
    end if;

    select p.ana_sirket_id, rol.yetkiler
      into v_company, v_yetkiler
    from public.personeller p
    left join public.roller rol on rol.id = p.rol_id
    where p.id = v_pid
      and p.silindi_at is null
    limit 1;

    if v_company is null then
      raise exception 'Şirket bilgisi bulunamadı';
    end if;

    v_can := public.role_perm_truthy(v_yetkiler, 'is.duzenle');
    if not v_can then
      raise exception 'İş operasyonel düzenleme yetkisi yok (is.duzenle)';
    end if;
  end if;

  select * into v_task from public.isler where id = p_is_id limit 1;
  if not found then
    raise exception 'Görev bulunamadı';
  end if;

  if coalesce(v_task.gorev_turu, '') <> 'sirali_gorev' then
    raise exception 'Bu RPC yalnızca sirali_gorev için kullanılabilir';
  end if;

  if not v_sys_admin and v_task.ana_sirket_id is distinct from v_company then
    raise exception 'Bu görev için düzenleme yapamazsınız';
  end if;

  if exists (
    select 1 from public.isler_silme_talepleri t
    where t.is_id = p_is_id and t.durum = 'bekliyor'
    limit 1
  ) then
    raise exception 'Silme talebi bekleyen görev düzenlenemez';
  end if;

  select * into v_step
  from public.isler_zincir_gorev_adimlari
  where is_id = p_is_id and adim_no = p_adim_no
  limit 1;
  if not found then
    raise exception 'Adım bulunamadı';
  end if;

  if coalesce(v_step.adim_durum, '') not in ('aktif', 'sira_bekliyor') then
    raise exception 'Bu adım yapılmış veya denetim sürecinde; düzenlenemez';
  end if;

  -- Mevcut değerleri taşı
  v_personel := v_step.personel_id;
  v_denetimci := v_step.denetimci_personel_id;
  v_adim_baslik := v_step.adim_baslik;
  v_istenenler := coalesce(v_step.adim_istenenler, '{}'::jsonb);
  if jsonb_typeof(v_istenenler) <> 'object' then
    v_istenenler := '{}'::jsonb;
  end if;
  v_kanit := coalesce(v_istenenler->'kanit', '{}'::jsonb);
  if jsonb_typeof(v_kanit) <> 'object' then
    v_kanit := '{}'::jsonb;
  end if;

  -- personel_id
  if v_patch ? 'personel_id' then
    if jsonb_typeof(v_patch->'personel_id') = 'null' then
      raise exception 'Adımın sorumlusu boş olamaz';
    end if;
    v_personel := (v_patch->>'personel_id')::uuid;
    if not exists (
      select 1 from public.personeller p
      where p.id = v_personel
        and p.ana_sirket_id = v_task.ana_sirket_id
        and p.silindi_at is null
    ) then
      raise exception 'Geçersiz adım sorumlusu';
    end if;
  end if;

  -- denetimci_personel_id (null'a izin var → denetimsiz adım)
  if v_patch ? 'denetimci_personel_id' then
    if jsonb_typeof(v_patch->'denetimci_personel_id') = 'null' then
      v_denetimci := null;
    else
      v_denetimci := (v_patch->>'denetimci_personel_id')::uuid;
      if not exists (
        select 1 from public.personeller p
        where p.id = v_denetimci
          and p.ana_sirket_id = v_task.ana_sirket_id
          and p.silindi_at is null
      ) then
        raise exception 'Geçersiz denetimci';
      end if;
    end if;
  end if;

  if v_patch ? 'adim_baslik' then
    if jsonb_typeof(v_patch->'adim_baslik') = 'null' then
      v_adim_baslik := null;
    else
      v_adim_baslik := nullif(trim(v_patch->>'adim_baslik'), '');
    end if;
  end if;

  -- adim_istenenler — kısmi merge
  if v_patch ? 'adim_istenenler' then
    declare
      v_p_ist jsonb := v_patch->'adim_istenenler';
      v_p_kanit jsonb;
    begin
      if jsonb_typeof(v_p_ist) <> 'object' then
        raise exception 'adim_istenenler nesne olmalı';
      end if;

      -- Skaler alanlar
      if v_p_ist ? 'aciklama' then
        if jsonb_typeof(v_p_ist->'aciklama') = 'null' then
          v_istenenler := v_istenenler - 'aciklama';
        else
          v_istenenler := jsonb_set(
            v_istenenler, '{aciklama}',
            to_jsonb(nullif(trim(v_p_ist->>'aciklama'), ''))
          );
        end if;
      end if;

      if v_p_ist ? 'baslama_tarihi' then
        if jsonb_typeof(v_p_ist->'baslama_tarihi') = 'null' then
          v_baslama := null;
        else
          v_baslama := (v_p_ist->>'baslama_tarihi')::timestamptz;
        end if;
        v_istenenler := jsonb_set(
          v_istenenler, '{baslama_tarihi}',
          coalesce(to_jsonb(v_baslama), 'null'::jsonb)
        );
      end if;

      if v_p_ist ? 'bitis_tarihi' then
        if jsonb_typeof(v_p_ist->'bitis_tarihi') = 'null' then
          v_bitis := null;
        else
          v_bitis := (v_p_ist->>'bitis_tarihi')::timestamptz;
        end if;
        v_istenenler := jsonb_set(
          v_istenenler, '{bitis_tarihi}',
          coalesce(to_jsonb(v_bitis), 'null'::jsonb)
        );
      end if;

      -- Adım kronolojisi: bitis > baslama (her ikisi doluysa)
      v_baslama := nullif(v_istenenler->>'baslama_tarihi', '')::timestamptz;
      v_bitis := nullif(v_istenenler->>'bitis_tarihi', '')::timestamptz;
      if v_baslama is not null and v_bitis is not null and v_bitis <= v_baslama then
        raise exception 'Adım bitiş tarihi başlangıcından sonra olmalı';
      end if;

      -- Önceki adımın bitişinden sonra olmalı
      if v_bitis is not null and p_adim_no > 1 then
        select * into v_prev_step
        from public.isler_zincir_gorev_adimlari
        where is_id = p_is_id and adim_no = p_adim_no - 1
        limit 1;
        if found and v_prev_step.adim_istenenler is not null
           and (v_prev_step.adim_istenenler->>'bitis_tarihi') is not null then
          if v_bitis <= (v_prev_step.adim_istenenler->>'bitis_tarihi')::timestamptz then
            raise exception 'Adım bitiş tarihi önceki adımın bitişinden sonra olmalı';
          end if;
        end if;
      end if;

      -- Sonraki adımın bitişinden önce olmalı
      if v_bitis is not null then
        select * into v_next_step
        from public.isler_zincir_gorev_adimlari
        where is_id = p_is_id and adim_no = p_adim_no + 1
        limit 1;
        if found and v_next_step.adim_istenenler is not null
           and (v_next_step.adim_istenenler->>'bitis_tarihi') is not null then
          if v_bitis >= (v_next_step.adim_istenenler->>'bitis_tarihi')::timestamptz then
            raise exception 'Adım bitiş tarihi sonraki adımın bitişinden önce olmalı';
          end if;
        end if;
      end if;

      if v_p_ist ? 'puan' then
        if jsonb_typeof(v_p_ist->'puan') = 'null' then
          v_istenenler := jsonb_set(v_istenenler, '{puan}', '0'::jsonb);
        else
          v_puan := (v_p_ist->>'puan')::numeric;
          if v_puan < 0 then
            raise exception 'Adım puanı negatif olamaz';
          end if;
          v_istenenler := jsonb_set(v_istenenler, '{puan}', to_jsonb(v_puan));
        end if;
      end if;

      if v_p_ist ? 'aciklama_zorunlu' then
        v_istenenler := jsonb_set(
          v_istenenler, '{aciklama_zorunlu}',
          to_jsonb(coalesce((v_p_ist->>'aciklama_zorunlu')::boolean, false))
        );
      end if;

      if v_p_ist ? 'acil' then
        v_istenenler := jsonb_set(
          v_istenenler, '{acil}',
          to_jsonb(coalesce((v_p_ist->>'acil')::boolean, false))
        );
      end if;

      -- Kanıt alt nesnesi
      if v_p_ist ? 'kanit' then
        v_p_kanit := v_p_ist->'kanit';
        if jsonb_typeof(v_p_kanit) <> 'object' then
          raise exception 'kanit nesne olmalı';
        end if;

        v_foto_zorunlu := coalesce((v_kanit->>'foto_zorunlu')::boolean, false);
        v_video_zorunlu := coalesce((v_kanit->>'video_zorunlu')::boolean, false);
        v_min_foto := coalesce((v_kanit->>'min_foto_sayisi')::int, 0);
        v_min_video := coalesce((v_kanit->>'min_video_sayisi')::int, 0);
        v_max_video_sn := coalesce((v_kanit->>'max_video_suresi_sn')::int, 60);

        if v_p_kanit ? 'foto_zorunlu' then
          v_foto_zorunlu := coalesce((v_p_kanit->>'foto_zorunlu')::boolean, false);
        end if;
        if v_p_kanit ? 'video_zorunlu' then
          v_video_zorunlu := coalesce((v_p_kanit->>'video_zorunlu')::boolean, false);
        end if;
        if v_p_kanit ? 'min_foto_sayisi' then
          v_min_foto := greatest(0, least(5, coalesce((v_p_kanit->>'min_foto_sayisi')::int, 0)));
        end if;
        if v_p_kanit ? 'min_video_sayisi' then
          v_min_video := greatest(0, least(3, coalesce((v_p_kanit->>'min_video_sayisi')::int, 0)));
        end if;
        if v_p_kanit ? 'max_video_suresi_sn' then
          v_max_video_sn := greatest(5, least(60, coalesce((v_p_kanit->>'max_video_suresi_sn')::int, 60)));
        end if;

        if v_foto_zorunlu and v_video_zorunlu then
          raise exception 'Adımda fotoğraf ve video zorunluluğu aynı anda etkin olamaz';
        end if;
        if not v_video_zorunlu then
          v_min_video := 0;
        end if;
        if not v_foto_zorunlu then
          v_min_foto := 0;
        end if;

        v_kanit := jsonb_build_object(
          'foto_zorunlu', v_foto_zorunlu,
          'video_zorunlu', v_video_zorunlu,
          'min_foto_sayisi', v_min_foto,
          'min_video_sayisi', v_min_video,
          'max_video_suresi_sn', v_max_video_sn
        );
        v_istenenler := jsonb_set(v_istenenler, '{kanit}', v_kanit);
      end if;
    end;
  end if;

  update public.isler_zincir_gorev_adimlari
  set
    personel_id = v_personel,
    denetimci_personel_id = v_denetimci,
    adim_baslik = v_adim_baslik,
    adim_istenenler = v_istenenler
  where id = v_step.id;

  -- Eğer aktif adım güncellendiyse üst görevin sorumlusu da yenilensin
  if coalesce(v_step.adim_durum, '') = 'aktif'
     and v_personel is distinct from v_step.personel_id then
    update public.isler
    set sorumlu_personel_id = v_personel
    where id = p_is_id;
  end if;
end;
$$;

comment on function public.rpc_sirali_adim_guncelle(uuid, integer, jsonb) is
  'Sıralı görev adımı düzenleme: yalnızca yapılmamış (aktif | sira_bekliyor) adımlar düzenlenebilir.';

revoke all on function public.rpc_sirali_adim_guncelle(uuid, integer, jsonb) from public;
grant execute on function public.rpc_sirali_adim_guncelle(uuid, integer, jsonb) to authenticated;

commit;
