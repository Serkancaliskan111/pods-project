-- 076: Operasyonel düzenleme RPC — belge_zorunlu / min_belge_sayisi whitelist

begin;

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
  v_belge_zorunlu boolean;
  v_min_belge int;
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
      'belge_zorunlu',
      'min_belge_sayisi',
      'aciklama_zorunlu',
      'ozel_gorev',
      'acil'
    ) then
      raise exception 'Geçersiz güncelleme alanı: %', v_key;
    end if;
  end loop;

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

  if v_patch ? 'ozel_gorev' then
    if v_gorev_turu <> 'normal' and coalesce((v_patch->>'ozel_gorev')::boolean, false) then
      raise exception 'Özel görev yalnızca normal görev tipinde açılabilir';
    end if;
  end if;

  if v_gorev_turu in ('zincir_gorev', 'zincir_gorev_ve_onay') and v_patch ? 'birim_id' then
    raise exception 'Zincir görevde birim bu yolla değiştirilemez';
  end if;

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
  v_belge_zorunlu := coalesce(r.belge_zorunlu, false);
  v_min_belge := coalesce(r.min_belge_sayisi, 0)::int;
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

  if v_patch ? 'belge_zorunlu' then
    v_belge_zorunlu := coalesce((v_patch->>'belge_zorunlu')::boolean, false);
  end if;

  if v_patch ? 'min_belge_sayisi' then
    v_min_belge := greatest(0, least(5, coalesce((v_patch->>'min_belge_sayisi')::int, 0)));
  end if;

  if v_foto_zorunlu and v_video_zorunlu then
    raise exception 'Fotoğraf ve video zorunluluğu aynı anda etkin olamaz';
  end if;

  if not v_video_zorunlu then
    v_min_video := 0;
  end if;

  if not v_belge_zorunlu then
    v_min_belge := 0;
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
    belge_zorunlu = v_belge_zorunlu,
    min_belge_sayisi = v_min_belge,
    aciklama_zorunlu = v_aciklama_zorunlu,
    ozel_gorev = v_ozel,
    acil = v_acil
  where id = p_is_id;
end;
$$;

comment on function public.rpc_is_operasyonel_guncelle(uuid, jsonb) is
  'is.duzenle ile güvenli iş güncelleme; belge alanları dahil. Foto/video mutex, tarih sırası ve sınır validasyonları zorlanır.';

commit;
