-- 054: Gorev calisma durumu (bekliyor / aktif / tamamlandi / askiya_alindi)
-- Atanan personel gunceller; yoneticilere bildirim kaydi duser.

begin;

alter table if exists public.isler
  add column if not exists calisma_durumu text not null default 'bekliyor',
  add column if not exists calisma_durumu_guncelleme_at timestamptz,
  add column if not exists calisma_durumu_gecmisi jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'isler_calisma_durumu_chk'
  ) then
    alter table public.isler
      add constraint isler_calisma_durumu_chk
      check (calisma_durumu in ('bekliyor', 'aktif', 'tamamlandi', 'askiya_alindi'));
  end if;
end $$;

create index if not exists idx_isler_calisma_durumu
  on public.isler (ana_sirket_id, calisma_durumu, calisma_durumu_guncelleme_at desc nulls last);

create table if not exists public.gorev_calisma_durumu_bildirimleri (
  id uuid primary key default gen_random_uuid(),
  is_id uuid not null references public.isler(id) on delete cascade,
  ana_sirket_id uuid not null,
  birim_id uuid,
  alici_personel_id uuid not null references public.personeller(id) on delete cascade,
  gorev_baslik text not null,
  eski_calisma_durumu text,
  yeni_calisma_durumu text not null,
  degistiren_personel_id uuid not null references public.personeller(id) on delete cascade,
  degistiren_ad text,
  okundu_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_gcd_bildirim_alici_okunmamis
  on public.gorev_calisma_durumu_bildirimleri (alici_personel_id, created_at desc)
  where okundu_at is null;

alter table public.gorev_calisma_durumu_bildirimleri enable row level security;

drop policy if exists gcd_bildirim_select_own on public.gorev_calisma_durumu_bildirimleri;
create policy gcd_bildirim_select_own
  on public.gorev_calisma_durumu_bildirimleri
  for select
  to authenticated
  using (alici_personel_id = public.current_personel_id());

drop policy if exists gcd_bildirim_update_own on public.gorev_calisma_durumu_bildirimleri;
create policy gcd_bildirim_update_own
  on public.gorev_calisma_durumu_bildirimleri
  for update
  to authenticated
  using (alici_personel_id = public.current_personel_id())
  with check (alici_personel_id = public.current_personel_id());

create or replace function public.trg_isler_calisma_durumu_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and new.calisma_durumu is distinct from old.calisma_durumu
    and coalesce(current_setting('app.calisma_durumu_rpc', true), '') <> '1'
  then
    raise exception 'calisma_durumu yalnizca rpc_gorev_calisma_durumu_guncelle ile guncellenebilir';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_isler_calisma_durumu_guard on public.isler;
create trigger trg_isler_calisma_durumu_guard
  before update of calisma_durumu, calisma_durumu_guncelleme_at, calisma_durumu_gecmisi
  on public.isler
  for each row
  execute function public.trg_isler_calisma_durumu_guard();

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

  perform set_config('app.calisma_durumu_rpc', '1', true);

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
          'personel_id', v_pid
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
    'degisti', true
  );
end;
$$;

revoke all on function public.rpc_gorev_calisma_durumu_guncelle(uuid, text) from public;
grant execute on function public.rpc_gorev_calisma_durumu_guncelle(uuid, text) to authenticated;

commit;
