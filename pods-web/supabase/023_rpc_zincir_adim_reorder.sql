-- Zincir görev / zincir onay adımlarında (hiçbir adım tamamlanmadan) sıra güncelleme ve yeni personel ekleme.
-- Mevcut zincirdeki personeller çıkarılamaz; yalnızca ek personel ve sıra değişikliği.
-- is.duzenle + rpc_is_operasyonel_guncelle ile aynı yetki ve iş durumu kuralları.

begin;

create or replace function public.rpc_zincir_operasyon_adimlari_yeniden_sirala(
  p_is_id uuid,
  p_gorev_personel_ids uuid[] default null,
  p_onay_personel_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
  if p_is_id is null then
    raise exception 'is_id gerekli';
  end if;

  if p_gorev_personel_ids is null and p_onay_personel_ids is null then
    raise exception 'En az bir sıra listesi gerekli';
  end if;

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

    select p.ana_sirket_id, r.yetkiler
      into v_company, v_yetkiler
    from public.personeller p
    left join public.roller r on r.id = p.rol_id
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

  if p_gorev_personel_ids is not null then
    if v_gorev_turu not in ('zincir_gorev', 'zincir_gorev_ve_onay') then
      raise exception 'Bu görev tipinde zincir görev sırası yok';
    end if;

    v_g_len := cardinality(p_gorev_personel_ids);
    if v_g_len is null or v_g_len < 1 then
      raise exception 'Zincir görev sırası boş olamaz';
    end if;

    select count(*)::int into v_old_g_cnt
    from public.isler_zincir_gorev_adimlari z
    where z.is_id = p_is_id;

    if v_g_len < v_old_g_cnt then
      raise exception 'Zincir görevden personel çıkarılamaz';
    end if;

    select count(distinct x)::int into v_distinct_g from unnest(p_gorev_personel_ids) as x;
    if v_distinct_g <> v_g_len then
      raise exception 'Zincir görev sırasında tekrarlayan personel olamaz';
    end if;

    select exists (
      with old_c as (
        select z.personel_id as pid, count(*)::int as c
        from public.isler_zincir_gorev_adimlari z
        where z.is_id = p_is_id
        group by z.personel_id
      ),
      new_c as (
        select x as pid, count(*)::int as c
        from unnest(p_gorev_personel_ids) as x
        group by x
      )
      select 1 from old_c o
      left join new_c n on n.pid = o.pid
      where coalesce(n.c, 0) < o.c
      limit 1
    ) into v_bad_multiset;

    if coalesce(v_bad_multiset, false) then
      raise exception 'Zincir görevde mevcut personeller korunmalı; yalnızca yeni personel eklenebilir veya sıra değişebilir';
    end if;

    if exists (
      select 1 from public.isler_zincir_gorev_adimlari z
      where z.is_id = p_is_id
        and (
          coalesce(z.durum, '') in ('tamamlandi', 'reddedildi')
          or z.tamamlandi_at is not null
          or coalesce(jsonb_array_length(coalesce(z.kanit_resim_ler, '[]'::jsonb)), 0) > 0
        )
      limit 1
    ) then
      raise exception 'Tamamlanan veya kanıt içeren zincir görev adımında sıra değiştirilemez';
    end if;

    for i in 1..v_g_len loop
      if not exists (
        select 1 from public.personeller p
        where p.id = p_gorev_personel_ids[i]
          and p.ana_sirket_id = r.ana_sirket_id
          and p.silindi_at is null
      ) then
        raise exception 'Geçersiz zincir görev personeli';
      end if;
    end loop;

    delete from public.isler_zincir_gorev_adimlari where is_id = p_is_id;

    for i in 1..v_g_len loop
      insert into public.isler_zincir_gorev_adimlari (
        is_id,
        adim_no,
        personel_id,
        durum,
        kanit_resim_ler,
        kanit_foto_durumlari,
        aciklama,
        tamamlandi_at
      ) values (
        p_is_id,
        i,
        p_gorev_personel_ids[i],
        case when i = 1 then 'aktif' else 'sira_bekliyor' end,
        '[]'::jsonb,
        '{}'::jsonb,
        null,
        null
      );
    end loop;

    select p.birim_id into v_birim_g
    from public.personeller p
    where p.id = p_gorev_personel_ids[1]
    limit 1;

    update public.isler set
      sorumlu_personel_id = p_gorev_personel_ids[1],
      birim_id = coalesce(v_birim_g, birim_id),
      zincir_aktif_adim = 1
    where id = p_is_id;
  end if;

  if p_onay_personel_ids is not null then
    if v_gorev_turu not in ('zincir_onay', 'zincir_gorev_ve_onay') then
      raise exception 'Bu görev tipinde zincir onay sırası yok';
    end if;

    v_o_len := cardinality(p_onay_personel_ids);
    if v_o_len is null or v_o_len < 1 then
      raise exception 'Zincir onay sırası boş olamaz';
    end if;

    select count(*)::int into v_old_o_cnt
    from public.isler_zincir_onay_adimlari z
    where z.is_id = p_is_id;

    if v_o_len < v_old_o_cnt then
      raise exception 'Zincir onaydan onaylayıcı çıkarılamaz';
    end if;

    select count(distinct x)::int into v_distinct_o from unnest(p_onay_personel_ids) as x;
    if v_distinct_o <> v_o_len then
      raise exception 'Zincir onay sırasında tekrarlayan personel olamaz';
    end if;

    select exists (
      with old_c as (
        select z.onaylayici_personel_id as pid, count(*)::int as c
        from public.isler_zincir_onay_adimlari z
        where z.is_id = p_is_id
        group by z.onaylayici_personel_id
      ),
      new_c as (
        select x as pid, count(*)::int as c
        from unnest(p_onay_personel_ids) as x
        group by x
      )
      select 1 from old_c o
      left join new_c n on n.pid = o.pid
      where coalesce(n.c, 0) < o.c
      limit 1
    ) into v_bad_multiset;

    if coalesce(v_bad_multiset, false) then
      raise exception 'Zincir onayda mevcut onaylayıcılar korunmalı; yalnızca yeni kişi eklenebilir veya sıra değişebilir';
    end if;

    if exists (
      select 1 from public.isler_zincir_onay_adimlari z
      where z.is_id = p_is_id
        and (
          z.onaylandi_at is not null
          or lower(trim(coalesce(z.durum, ''))) in ('onaylandi', 'reddedildi')
        )
      limit 1
    ) then
      raise exception 'Tamamlanan zincir onay adımında sıra değiştirilemez';
    end if;

    for i in 1..v_o_len loop
      if not exists (
        select 1 from public.personeller p
        where p.id = p_onay_personel_ids[i]
          and p.ana_sirket_id = r.ana_sirket_id
          and p.silindi_at is null
      ) then
        raise exception 'Geçersiz zincir onay personeli';
      end if;
    end loop;

    delete from public.isler_zincir_onay_adimlari where is_id = p_is_id;

    for i in 1..v_o_len loop
      insert into public.isler_zincir_onay_adimlari (
        is_id,
        adim_no,
        onaylayici_personel_id,
        durum,
        yorum,
        onaylandi_at
      ) values (
        p_is_id,
        i,
        p_onay_personel_ids[i],
        'Atandı',
        null,
        null
      );
    end loop;

    v_k := coalesce(r.zincir_onay_aktif_adim, 0);
    if v_k >= 1 and v_k <= v_o_len then
      v_ap := p_onay_personel_ids[v_k];
      select p.birim_id into v_birim_ap
      from public.personeller p
      where p.id = v_ap
      limit 1;

      update public.isler set
        sorumlu_personel_id = v_ap,
        birim_id = coalesce(v_birim_ap, birim_id)
      where id = p_is_id;
    end if;
  end if;
end;
$$;

comment on function public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) is
  'is.duzenle: zincir görev/onayda tamamlanmamışken sıra güncelleme ve yeni personel ekleme (çıkarma yok).';

revoke all on function public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) from public;
grant execute on function public.rpc_zincir_operasyon_adimlari_yeniden_sirala(uuid, uuid[], uuid[]) to authenticated;

commit;
