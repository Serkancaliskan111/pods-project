-- İş silme: talep → onaylayıcı onayı → arşive taşıma + isler silme
-- Rol yetkileri (roller.yetkiler JSON): "is.sil" (talep), "is.sil.onay" (onay + silinen arşiv görüntüleme)
-- Önkoşul: Genelde 018_private_tasks_visibility.sql ile current_personel_id() gelir.
-- Bu dosya mevcut fonksiyonu ASLA replace etmez; yoksa aynı gövde ile bir kez oluşturur.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- current_personel_id — yalnızca yoksa ekle (018 ile çakışma / overwrite yok)
-- ---------------------------------------------------------------------------
do $guard$
begin
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_personel_id'
      and p.pronargs = 0
  ) then
    execute $sql$
create function public.current_personel_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $body$
  select p.id
  from public.personeller p
  where p.kullanici_id = auth.uid()
    and p.silindi_at is null
  limit 1
$body$;
$sql$;
    execute 'revoke all on function public.current_personel_id() from public';
    execute 'grant execute on function public.current_personel_id() to authenticated';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- Yardımcı: rol JSON içinde izin
-- ---------------------------------------------------------------------------
create or replace function public.role_perm_truthy(p_yetkiler jsonb, p_key text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      lower(trim(coalesce(p_yetkiler->>p_key, ''))) in ('true', 't', '1', 'yes')
      or (jsonb_typeof(p_yetkiler->p_key) = 'boolean' and (p_yetkiler->p_key)::text = 'true')
    ),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------------
create table if not exists public.isler_silme_talepleri (
  id uuid primary key default gen_random_uuid(),
  is_id uuid references public.isler(id) on delete set null,
  ana_sirket_id uuid not null,
  talep_eden_personel_id uuid not null references public.personeller(id),
  talep_aciklama text,
  durum text not null default 'bekliyor'
    check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  onaylayan_personel_id uuid references public.personeller(id),
  onaylandi_at timestamptz,
  red_nedeni text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_isler_silme_bekleyen_per_is
  on public.isler_silme_talepleri (is_id)
  where durum = 'bekliyor' and is_id is not null;

create index if not exists idx_isler_silme_talepleri_sirket_durum
  on public.isler_silme_talepleri (ana_sirket_id, durum);

create index if not exists idx_isler_silme_talepleri_created
  on public.isler_silme_talepleri (created_at desc);

create table if not exists public.silinen_isler (
  id uuid primary key default gen_random_uuid(),
  original_is_id uuid not null,
  ana_sirket_id uuid not null,
  silme_talep_id uuid references public.isler_silme_talepleri(id) on delete set null,
  talep_eden_personel_id uuid references public.personeller(id),
  onaylayan_personel_id uuid references public.personeller(id),
  snapshot jsonb not null default '{}'::jsonb,
  silindi_at timestamptz not null default now()
);

create index if not exists idx_silinen_isler_sirket_silindi
  on public.silinen_isler (ana_sirket_id, silindi_at desc);

create index if not exists idx_silinen_isler_original
  on public.silinen_isler (original_is_id);

comment on table public.isler_silme_talepleri is
  'İş silme talebi; onay sonrası kayıt güncellenir, iş silinen_isler''e arşivlenir.';
comment on table public.silinen_isler is
  'Onaylı silinen işlerin JSON anlık görüntüsü; yalnızca is.sil.onay yetkisi ile görüntülenmeli (uygulama + RLS).';

-- updated_at tetikleyici (yalnızca ekleme)
create or replace function public.touch_isler_silme_talepleri_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_isler_silme_talepleri_updated_at on public.isler_silme_talepleri;
create trigger trg_isler_silme_talepleri_updated_at
  before update on public.isler_silme_talepleri
  for each row
  execute function public.touch_isler_silme_talepleri_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: talep oluştur (is.sil)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_is_silme_talebi_olustur(
  p_is_id uuid,
  p_aciklama text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_company uuid;
  v_job_company uuid;
  v_can boolean;
  v_yetkiler jsonb;
  v_new_id uuid;
begin
  v_pid := public.current_personel_id();
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

  v_can := public.role_perm_truthy(v_yetkiler, 'is.sil');
  if not v_can then
    raise exception 'İş silme talebi yetkisi yok (is.sil)';
  end if;

  select i.ana_sirket_id into v_job_company
  from public.isler i
  where i.id = p_is_id
  limit 1;

  if v_job_company is null then
    raise exception 'Görev bulunamadı';
  end if;

  if v_job_company <> v_company then
    raise exception 'Bu görev için talep oluşturamazsınız';
  end if;

  insert into public.isler_silme_talepleri (
    is_id,
    ana_sirket_id,
    talep_eden_personel_id,
    talep_aciklama,
    durum
  )
  values (
    p_is_id,
    v_company,
    v_pid,
    nullif(trim(coalesce(p_aciklama, '')), ''),
    'bekliyor'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.rpc_is_silme_talebi_olustur(uuid, text) from public;
grant execute on function public.rpc_is_silme_talebi_olustur(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: onayla → arşiv + isler sil (is.sil.onay)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_is_silme_onayla(p_talep_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_company uuid;
  v_can boolean;
  v_yetkiler jsonb;
  r_talep record;
  v_snap jsonb;
  v_archive_id uuid;
begin
  v_pid := public.current_personel_id();
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

  v_can := public.role_perm_truthy(v_yetkiler, 'is.sil.onay');
  if not v_can then
    raise exception 'İş silme onay yetkisi yok (is.sil.onay)';
  end if;

  select * into r_talep
  from public.isler_silme_talepleri t
  where t.id = p_talep_id
  for update;

  if not found then
    raise exception 'Talep bulunamadı';
  end if;

  if r_talep.ana_sirket_id <> v_company then
    raise exception 'Bu talebi onaylayamazsınız';
  end if;

  if r_talep.durum <> 'bekliyor' then
    raise exception 'Talep artık beklemede değil';
  end if;

  if r_talep.is_id is null then
    raise exception 'Talep görev referansı eksik';
  end if;

  select to_jsonb(i.*) into v_snap
  from public.isler i
  where i.id = r_talep.is_id
  limit 1;

  if v_snap is null then
    raise exception 'Görev kaydı bulunamadı (zaten silinmiş olabilir)';
  end if;

  insert into public.silinen_isler (
    original_is_id,
    ana_sirket_id,
    silme_talep_id,
    talep_eden_personel_id,
    onaylayan_personel_id,
    snapshot
  )
  values (
    r_talep.is_id,
    r_talep.ana_sirket_id,
    r_talep.id,
    r_talep.talep_eden_personel_id,
    v_pid,
    coalesce(v_snap, '{}'::jsonb)
  )
  returning id into v_archive_id;

  delete from public.isler where id = r_talep.is_id;

  update public.isler_silme_talepleri
  set
    durum = 'onaylandi',
    onaylayan_personel_id = v_pid,
    onaylandi_at = now(),
    is_id = null
  where id = p_talep_id;

  return v_archive_id;
end;
$$;

revoke all on function public.rpc_is_silme_onayla(uuid) from public;
grant execute on function public.rpc_is_silme_onayla(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: reddet (is.sil.onay)
-- ---------------------------------------------------------------------------
create or replace function public.rpc_is_silme_reddet(p_talep_id uuid, p_red_nedeni text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_company uuid;
  v_can boolean;
  v_yetkiler jsonb;
  r_talep record;
begin
  v_pid := public.current_personel_id();
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

  v_can := public.role_perm_truthy(v_yetkiler, 'is.sil.onay');
  if not v_can then
    raise exception 'İş silme onay yetkisi yok (is.sil.onay)';
  end if;

  select * into r_talep
  from public.isler_silme_talepleri t
  where t.id = p_talep_id
  for update;

  if not found then
    raise exception 'Talep bulunamadı';
  end if;

  if r_talep.ana_sirket_id <> v_company then
    raise exception 'Bu talebi reddedemezsiniz';
  end if;

  if r_talep.durum <> 'bekliyor' then
    raise exception 'Talep artık beklemede değil';
  end if;

  update public.isler_silme_talepleri
  set
    durum = 'reddedildi',
    onaylayan_personel_id = v_pid,
    onaylandi_at = now(),
    red_nedeni = nullif(trim(coalesce(p_red_nedeni, '')), '')
  where id = p_talep_id;
end;
$$;

revoke all on function public.rpc_is_silme_reddet(uuid, text) from public;
grant execute on function public.rpc_is_silme_reddet(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table if exists public.isler_silme_talepleri enable row level security;
alter table if exists public.silinen_isler enable row level security;

drop policy if exists isler_silme_talepleri_select_scoped on public.isler_silme_talepleri;
create policy isler_silme_talepleri_select_scoped
on public.isler_silme_talepleri
for select
to authenticated
using (
  ana_sirket_id = (
    select p.ana_sirket_id from public.personeller p
    where p.id = public.current_personel_id() and p.silindi_at is null
    limit 1
  )
  and (
    talep_eden_personel_id = public.current_personel_id()
    or exists (
      select 1
      from public.personeller p
      join public.roller r on r.id = p.rol_id
      where p.id = public.current_personel_id()
        and p.silindi_at is null
        and public.role_perm_truthy(r.yetkiler, 'is.sil.onay')
    )
  )
);

drop policy if exists silinen_isler_select_onaylayici on public.silinen_isler;
create policy silinen_isler_select_onaylayici
on public.silinen_isler
for select
to authenticated
using (
  ana_sirket_id = (
    select p.ana_sirket_id from public.personeller p
    where p.id = public.current_personel_id() and p.silindi_at is null
    limit 1
  )
  and exists (
    select 1
    from public.personeller p
    join public.roller r on r.id = p.rol_id
    where p.id = public.current_personel_id()
      and p.silindi_at is null
      and public.role_perm_truthy(r.yetkiler, 'is.sil.onay')
  )
);

-- Doğrudan yazma kapalı; akış RPC ile (SECURITY DEFINER).
drop policy if exists isler_silme_talepleri_no_insert on public.isler_silme_talepleri;
create policy isler_silme_talepleri_no_insert
on public.isler_silme_talepleri for insert to authenticated with check (false);

drop policy if exists isler_silme_talepleri_no_update on public.isler_silme_talepleri;
create policy isler_silme_talepleri_no_update
on public.isler_silme_talepleri for update to authenticated using (false) with check (false);

drop policy if exists isler_silme_talepleri_no_delete on public.isler_silme_talepleri;
create policy isler_silme_talepleri_no_delete
on public.isler_silme_talepleri for delete to authenticated using (false);

drop policy if exists silinen_isler_no_insert on public.silinen_isler;
create policy silinen_isler_no_insert
on public.silinen_isler for insert to authenticated with check (false);

drop policy if exists silinen_isler_no_update on public.silinen_isler;
create policy silinen_isler_no_update
on public.silinen_isler for update to authenticated using (false) with check (false);

drop policy if exists silinen_isler_no_delete on public.silinen_isler;
create policy silinen_isler_no_delete
on public.silinen_isler for delete to authenticated using (false);

commit;

-- PostgREST şema önbelleği
notify pgrst, 'reload schema';
