-- 056: Gecikmis (bugunun disinda) gorevleri ana sayfadan gizleme + kullanici "geri goster" tercihi

begin;

create table if not exists public.personel_gorev_ana_sayfa_geri_goster (
  personel_id uuid not null references public.personeller(id) on delete cascade,
  is_id uuid not null references public.isler(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (personel_id, is_id)
);

create index if not exists idx_pgag_personel
  on public.personel_gorev_ana_sayfa_geri_goster (personel_id, created_at desc);

alter table public.personel_gorev_ana_sayfa_geri_goster enable row level security;

drop policy if exists pgag_select_own on public.personel_gorev_ana_sayfa_geri_goster;
create policy pgag_select_own
  on public.personel_gorev_ana_sayfa_geri_goster
  for select to authenticated
  using (personel_id = public.current_personel_id());

drop policy if exists pgag_insert_own on public.personel_gorev_ana_sayfa_geri_goster;
create policy pgag_insert_own
  on public.personel_gorev_ana_sayfa_geri_goster
  for insert to authenticated
  with check (personel_id = public.current_personel_id());

drop policy if exists pgag_delete_own on public.personel_gorev_ana_sayfa_geri_goster;
create policy pgag_delete_own
  on public.personel_gorev_ana_sayfa_geri_goster
  for delete to authenticated
  using (personel_id = public.current_personel_id());

commit;
