-- Şirket bazlı sabit IP giriş kuralı
alter table if exists public.ana_sirketler
  add column if not exists sabit_ip_aktif boolean not null default false;

alter table if exists public.ana_sirketler
  add column if not exists izinli_ipler text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ana_sirketler_izinli_ipler_max5_chk'
  ) then
    alter table public.ana_sirketler
      add constraint ana_sirketler_izinli_ipler_max5_chk
      check (cardinality(izinli_ipler) <= 5);
  end if;
end
$$;
