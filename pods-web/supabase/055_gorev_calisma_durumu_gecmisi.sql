-- 055: Gorev calisma durumu degisim gecmisi (raporlama icin normalize tablo)

begin;

create table if not exists public.gorev_calisma_durumu_gecmisi (
  id uuid primary key default gen_random_uuid(),
  is_id uuid not null references public.isler(id) on delete cascade,
  ana_sirket_id uuid not null,
  birim_id uuid,
  sorumlu_personel_id uuid references public.personeller(id) on delete set null,
  eski_durum text not null,
  yeni_durum text not null,
  degistiren_personel_id uuid not null references public.personeller(id) on delete restrict,
  degistiren_ad text,
  degistirme_at timestamptz not null default now(),
  -- Onceki durumda kalinan sure (saniye); ilk kayitta gorev olusturulmasindan itibaren
  onceki_durum_suresi_saniye integer,
  created_at timestamptz not null default now(),
  constraint gorev_calisma_durumu_gecmisi_eski_chk
    check (eski_durum in ('bekliyor', 'aktif', 'tamamlandi', 'askiya_alindi')),
  constraint gorev_calisma_durumu_gecmisi_yeni_chk
    check (yeni_durum in ('bekliyor', 'aktif', 'tamamlandi', 'askiya_alindi'))
);

create index if not exists idx_gcd_gecmis_is_at
  on public.gorev_calisma_durumu_gecmisi (is_id, degistirme_at desc);

create index if not exists idx_gcd_gecmis_sirket_at
  on public.gorev_calisma_durumu_gecmisi (ana_sirket_id, degistirme_at desc);

create index if not exists idx_gcd_gecmis_birim_at
  on public.gorev_calisma_durumu_gecmisi (birim_id, degistirme_at desc)
  where birim_id is not null;

create index if not exists idx_gcd_gecmis_yeni_durum_at
  on public.gorev_calisma_durumu_gecmisi (ana_sirket_id, yeni_durum, degistirme_at desc);

alter table public.gorev_calisma_durumu_gecmisi enable row level security;

drop policy if exists gcd_gecmis_select_via_isler on public.gorev_calisma_durumu_gecmisi;
create policy gcd_gecmis_select_via_isler
  on public.gorev_calisma_durumu_gecmisi
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.isler i
      where i.id = gorev_calisma_durumu_gecmisi.is_id
    )
  );

-- Mevcut jsonb gecmisinden tabloya tasin (054 uygulanmis ortamlar)
insert into public.gorev_calisma_durumu_gecmisi (
  is_id,
  ana_sirket_id,
  birim_id,
  sorumlu_personel_id,
  eski_durum,
  yeni_durum,
  degistiren_personel_id,
  degistiren_ad,
  degistirme_at,
  onceki_durum_suresi_saniye
)
select
  i.id,
  i.ana_sirket_id,
  i.birim_id,
  i.sorumlu_personel_id,
  coalesce(e.elem->>'eski', 'bekliyor'),
  coalesce(e.elem->>'yeni', 'bekliyor'),
  (e.elem->>'personel_id')::uuid,
  nullif(trim(coalesce(p.ad, '') || ' ' || coalesce(p.soyad, '')), ''),
  coalesce(
    nullif(e.elem->>'at', '')::timestamptz,
    i.calisma_durumu_guncelleme_at,
    i.updated_at,
    i.created_at
  ),
  null
from public.isler i
cross join lateral jsonb_array_elements(coalesce(i.calisma_durumu_gecmisi, '[]'::jsonb)) as e(elem)
left join public.personeller p on p.id = (e.elem->>'personel_id')::uuid
where jsonb_array_length(coalesce(i.calisma_durumu_gecmisi, '[]'::jsonb)) > 0
  and (e.elem->>'yeni') is not null
  and not exists (
    select 1
    from public.gorev_calisma_durumu_gecmisi g
    where g.is_id = i.id
      and g.degistirme_at = coalesce(
        nullif(e.elem->>'at', '')::timestamptz,
        i.calisma_durumu_guncelleme_at,
        i.updated_at,
        i.created_at
      )
      and g.yeni_durum = coalesce(e.elem->>'yeni', '')
  );

-- Sure alanlarini jsonb sirasina gore doldur
with ordered as (
  select
    g.id,
    g.is_id,
    g.degistirme_at,
    lag(g.degistirme_at) over (partition by g.is_id order by g.degistirme_at) as prev_at,
    i.created_at as is_created_at
  from public.gorev_calisma_durumu_gecmisi g
  join public.isler i on i.id = g.is_id
  where g.onceki_durum_suresi_saniye is null
)
update public.gorev_calisma_durumu_gecmisi g
set onceki_durum_suresi_saniye = greatest(
  0,
  extract(
    epoch from (
      o.degistirme_at - coalesce(o.prev_at, o.is_created_at, o.degistirme_at)
    )
  )::integer
)
from ordered o
where g.id = o.id;

create or replace function public.rpc_gorev_calisma_durumu_guncelle(
  p_is_id uuid,
  p_yeni_durum text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_task public.isler%rowtype;
  v_eski text;
  v_actor_ad text;
  v_now timestamptz := now();
  v_can_assignee boolean := false;
  v_prev_at timestamptz;
  v_duration_sec integer;
  v_log_id uuid;
begin
  v_pid := public.current_personel_id();
  if v_pid is null then
    raise exception 'Oturum gerekli';
  end if;

  p_yeni_durum := lower(trim(coalesce(p_yeni_durum, '')));
  if p_yeni_durum not in ('bekliyor', 'aktif', 'tamamlandi', 'askiya_alindi') then
    raise exception 'Gecersiz calisma durumu: %', p_yeni_durum;
  end if;

  select * into v_task from public.isler where id = p_is_id for update;
  if not found then
    raise exception 'Gorev bulunamadi';
  end if;

  v_eski := coalesce(v_task.calisma_durumu, 'bekliyor');
  if v_eski = p_yeni_durum then
    return jsonb_build_object(
      'is_id', v_task.id,
      'calisma_durumu', v_eski,
      'degisti', false
    );
  end if;

  v_can_assignee := v_task.sorumlu_personel_id = v_pid;
  if not v_can_assignee then
    select exists (
      select 1
      from public.isler_zincir_gorev_adimlari z
      where z.is_id = v_task.id
        and z.personel_id = v_pid
        and z.adim_durum in ('aktif', 'onay_bekliyor')
    ) into v_can_assignee;
  end if;

  if not v_can_assignee then
    raise exception 'Bu gorev icin calisma durumu guncelleme yetkiniz yok';
  end if;

  select trim(coalesce(p.ad, '') || ' ' || coalesce(p.soyad, ''))
  into v_actor_ad
  from public.personeller p
  where p.id = v_pid;

  select g.degistirme_at
  into v_prev_at
  from public.gorev_calisma_durumu_gecmisi g
  where g.is_id = v_task.id
  order by g.degistirme_at desc
  limit 1;

  v_prev_at := coalesce(v_prev_at, v_task.created_at, v_now);
  v_duration_sec := greatest(0, extract(epoch from (v_now - v_prev_at))::integer);

  perform set_config('app.calisma_durumu_rpc', '1', true);

  insert into public.gorev_calisma_durumu_gecmisi (
    is_id,
    ana_sirket_id,
    birim_id,
    sorumlu_personel_id,
    eski_durum,
    yeni_durum,
    degistiren_personel_id,
    degistiren_ad,
    degistirme_at,
    onceki_durum_suresi_saniye
  )
  values (
    v_task.id,
    v_task.ana_sirket_id,
    v_task.birim_id,
    v_task.sorumlu_personel_id,
    v_eski,
    p_yeni_durum,
    v_pid,
    nullif(trim(v_actor_ad), ''),
    v_now,
    v_duration_sec
  )
  returning id into v_log_id;

  update public.isler
  set
    calisma_durumu = p_yeni_durum,
    calisma_durumu_guncelleme_at = v_now,
    calisma_durumu_gecmisi = coalesce(calisma_durumu_gecmisi, '[]'::jsonb)
      || jsonb_build_array(
        jsonb_build_object(
          'at', v_now,
          'eski', v_eski,
          'yeni', p_yeni_durum,
          'personel_id', v_pid,
          'personel_ad', nullif(trim(v_actor_ad), ''),
          'onceki_durum_suresi_saniye', v_duration_sec,
          'log_id', v_log_id
        )
      ),
    updated_at = v_now
  where id = v_task.id;

  insert into public.gorev_calisma_durumu_bildirimleri (
    is_id,
    ana_sirket_id,
    birim_id,
    alici_personel_id,
    gorev_baslik,
    eski_calisma_durumu,
    yeni_calisma_durumu,
    degistiren_personel_id,
    degistiren_ad
  )
  select distinct on (p.id)
    v_task.id,
    v_task.ana_sirket_id,
    v_task.birim_id,
    p.id,
    coalesce(v_task.baslik, 'Gorev'),
    v_eski,
    p_yeni_durum,
    v_pid,
    nullif(trim(v_actor_ad), '')
  from public.personeller p
  left join public.roller r on r.id = p.rol_id
  where p.ana_sirket_id = v_task.ana_sirket_id
    and p.silindi_at is null
    and p.id <> v_pid
    and (
      (v_task.atayan_personel_id is not null and p.id = v_task.atayan_personel_id)
      or public.role_perm_truthy(r.yetkiler, 'gorev_onayla')
      or public.role_perm_truthy(r.yetkiler, 'is.onay')
      or public.role_perm_truthy(r.yetkiler, 'is.duzenle')
    )
  order by p.id, p.created_at nulls last;

  return jsonb_build_object(
    'is_id', v_task.id,
    'eski', v_eski,
    'yeni', p_yeni_durum,
    'calisma_durumu', p_yeni_durum,
    'degisti', true,
    'degistirme_at', v_now,
    'onceki_durum_suresi_saniye', v_duration_sec,
    'log_id', v_log_id
  );
end;
$$;

revoke all on function public.rpc_gorev_calisma_durumu_guncelle(uuid, text) from public;
grant execute on function public.rpc_gorev_calisma_durumu_guncelle(uuid, text) to authenticated;

commit;
