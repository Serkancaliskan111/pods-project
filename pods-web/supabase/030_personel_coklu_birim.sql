-- Çoklu birim ataması: personeller ana kayıtta birincil birimi (birim_id) tutar;
-- personel_birimleri tüm atanmış kök birimleri ve alt ağaçları için seed listesini sağlar.
--
-- Bu dosya tek başına çalıştırılmalıdır (tablo + tetikleyiciler + RLS).
-- 031 yalnızca daha önce ESKİ 030 çalıştırılmış veritabanları için düzeltmedir; tablo oluşturmaz.

create table if not exists public.personel_birimleri (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references public.personeller(id) on delete cascade,
  birim_id uuid not null references public.birimler(id) on delete cascade,
  ana_sirket_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (personel_id, birim_id)
);

create index if not exists idx_personel_birimleri_personel on public.personel_birimleri (personel_id);
create index if not exists idx_personel_birimleri_birim on public.personel_birimleri (birim_id);
create index if not exists idx_personel_birimleri_sirket on public.personel_birimleri (ana_sirket_id);

create unique index if not exists uq_personel_birimleri_one_primary
  on public.personel_birimleri (personel_id)
  where is_primary = true;

insert into public.personel_birimleri (personel_id, birim_id, ana_sirket_id, is_primary)
select p.id, p.birim_id, p.ana_sirket_id, true
from public.personeller p
where p.birim_id is not null
  and p.silindi_at is null
  and p.ana_sirket_id is not null
on conflict (personel_id, birim_id) do nothing;

-- Birim ve personel aynı şirkette olmalı; ana_sirket_id tutarlılığı (SECURITY DEFINER: trigger içi SELECT RLS’e takılmasın)
create or replace function public.personel_birimleri_normalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p_company uuid;
  v_b_company uuid;
begin
  select p.ana_sirket_id into v_p_company
  from public.personeller p
  where p.id = new.personel_id
    and p.silindi_at is null
  limit 1;

  select b.ana_sirket_id into v_b_company
  from public.birimler b
  where b.id = new.birim_id
    and b.silindi_at is null
  limit 1;

  if v_p_company is null then
    raise exception 'personel_birimleri: personel bulunamadı, pasif veya ana_sirket_id boş';
  end if;
  if v_b_company is null then
    raise exception 'personel_birimleri: birim bulunamadı veya pasif';
  end if;
  if v_p_company is distinct from v_b_company then
    raise exception 'personel_birimleri: birim ve personel aynı şirkete ait olmalı';
  end if;

  new.ana_sirket_id := v_p_company;
  return new;
end;
$$;

drop trigger if exists tr_personel_birimleri_normalize on public.personel_birimleri;
create trigger tr_personel_birimleri_normalize
  before insert or update on public.personel_birimleri
  for each row
  execute function public.personel_birimleri_normalize();

-- Junction değişince personeller.birim_id = birincil birim (yoksa ilk kayıt)
create or replace function public.personel_birimleri_sync_personel_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_primary uuid;
begin
  v_pid := coalesce(new.personel_id, old.personel_id);
  if v_pid is null then
    return coalesce(new, old);
  end if;

  select pb.birim_id into v_primary
  from public.personel_birimleri pb
  where pb.personel_id = v_pid and pb.is_primary = true
  order by pb.created_at asc
  limit 1;

  if v_primary is null then
    select pb.birim_id into v_primary
    from public.personel_birimleri pb
    where pb.personel_id = v_pid
    order by pb.created_at asc
    limit 1;
  end if;

  update public.personeller p
  set birim_id = v_primary
  where p.id = v_pid;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tr_personel_birimleri_sync_primary on public.personel_birimleri;
create trigger tr_personel_birimleri_sync_primary
  after insert or update or delete on public.personel_birimleri
  for each row
  execute function public.personel_birimleri_sync_personel_primary();

-- Birim silme öncesi: junction üzerinden bağlı personele de bak (028 ile uyumlu)
create or replace function public.personeller_birim_agaci_icinde_sayisi(p_root uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  with recursive agac as (
    select id from public.birimler where id = p_root
    union all
    select b.id
    from public.birimler b
    inner join agac a on b.ust_birim_id = a.id
  )
  select count(distinct s.pid)::bigint
  from (
    select p.id as pid
    from public.personeller p
    where p.silindi_at is null
      and p.birim_id is not null
      and p.birim_id in (select id from agac)
    union all
    select p.id as pid
    from public.personel_birimleri pb
    inner join public.personeller p on p.id = pb.personel_id and p.silindi_at is null
    where pb.birim_id in (select id from agac)
  ) s
$$;

alter table public.personel_birimleri enable row level security;

drop policy if exists personel_birimleri_same_company_rw on public.personel_birimleri;
create policy personel_birimleri_same_company_rw on public.personel_birimleri
for all
to authenticated
using (
  exists (
    select 1 from public.personeller me
    where me.kullanici_id = auth.uid()
      and me.silindi_at is null
      and me.ana_sirket_id = personel_birimleri.ana_sirket_id
  )
)
with check (
  exists (
    select 1 from public.personeller me
    where me.kullanici_id = auth.uid()
      and me.silindi_at is null
      and me.ana_sirket_id = personel_birimleri.ana_sirket_id
  )
  and exists (
    select 1 from public.personeller p
    where p.id = personel_birimleri.personel_id
      and p.silindi_at is null
      and p.ana_sirket_id = personel_birimleri.ana_sirket_id
  )
);

grant select, insert, update, delete on table public.personel_birimleri to authenticated;
grant all on table public.personel_birimleri to service_role;

comment on table public.personel_birimleri is
  'Personele bağlı bir veya daha fazla kök birim; her biri alt ağaç ile genişletilerek erişim kapsamına dahil edilir.';
