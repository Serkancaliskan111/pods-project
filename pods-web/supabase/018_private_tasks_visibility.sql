-- Özel görev: sadece görevi veren ve alan görebilsin
-- Bu migration, isler tablosuna ozel_gorev kolonu ekler ve
-- private görev görünürlüğünü RLS ile sınırlar.

alter table if exists public.isler
  add column if not exists ozel_gorev boolean not null default false;

update public.isler
set ozel_gorev = false
where ozel_gorev is null;

comment on column public.isler.ozel_gorev is
  'true ise görev sadece atayan_personel_id ve sorumlu_personel_id tarafından görülebilir.';

create index if not exists idx_isler_ozel_gorev
  on public.isler (ozel_gorev);

create or replace function public.current_personel_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.personeller p
  where p.kullanici_id = auth.uid()
    and p.silindi_at is null
  limit 1
$$;

revoke all on function public.current_personel_id() from public;
grant execute on function public.current_personel_id() to authenticated;

alter table if exists public.isler enable row level security;

drop policy if exists isler_private_select_only_participants on public.isler;
create policy isler_private_select_only_participants
on public.isler
for select
to authenticated
using (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
    )
  )
);

drop policy if exists isler_private_update_only_participants on public.isler;
create policy isler_private_update_only_participants
on public.isler
for update
to authenticated
using (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
    )
  )
)
with check (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
    )
  )
);

drop policy if exists isler_private_delete_only_participants on public.isler;
create policy isler_private_delete_only_participants
on public.isler
for delete
to authenticated
using (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
    )
  )
);

drop policy if exists isler_private_insert_only_creator_or_assignee on public.isler;
create policy isler_private_insert_only_creator_or_assignee
on public.isler
for insert
to authenticated
with check (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
    )
  )
);
