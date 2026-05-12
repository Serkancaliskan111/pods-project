-- 045: Sirali gorev (adim bazli yapan + denetimci onayi)
-- Mevcut zincir gorev altyapisini backward-compatible genisletir.

begin;

alter table if exists public.isler
  add column if not exists sirali_gorev_meta jsonb not null default '{}'::jsonb;

alter table if exists public.isler
  alter column gorev_turu set default 'normal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'isler_gorev_turu_chk_v2'
  ) then
    alter table public.isler
      drop constraint if exists isler_gorev_turu_check;
    alter table public.isler
      add constraint isler_gorev_turu_chk_v2
      check (gorev_turu in ('normal', 'zincir_gorev', 'zincir_onay', 'zincir_gorev_ve_onay', 'sirali_gorev'));
  end if;
end $$;

alter table if exists public.isler_zincir_gorev_adimlari
  add column if not exists denetimci_personel_id uuid references public.personeller(id) on delete set null,
  add column if not exists adim_baslik text,
  add column if not exists adim_istenenler jsonb not null default '[]'::jsonb,
  add column if not exists adim_durum text not null default 'aktif',
  add column if not exists adim_gonderim_at timestamptz,
  add column if not exists adim_onay_at timestamptz,
  add column if not exists adim_onay_notu text;

update public.isler_zincir_gorev_adimlari
set adim_durum = case
  when coalesce(durum, '') in ('aktif') then 'aktif'
  when coalesce(durum, '') in ('tamamlandi') then 'onaylandi'
  when coalesce(durum, '') in ('reddedildi') then 'reddedildi'
  else 'sira_bekliyor'
end
where adim_durum is null or adim_durum = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'isler_zincir_gorev_adimlari_adim_durum_chk'
  ) then
    alter table public.isler_zincir_gorev_adimlari
      add constraint isler_zincir_gorev_adimlari_adim_durum_chk
      check (adim_durum in ('aktif', 'sira_bekliyor', 'onay_bekliyor', 'onaylandi', 'reddedildi'));
  end if;
end $$;

create index if not exists idx_isler_zincir_gorev_adimlari_is_adim_durum
  on public.isler_zincir_gorev_adimlari (is_id, adim_durum);

create index if not exists idx_isler_zincir_gorev_adimlari_denetimci
  on public.isler_zincir_gorev_adimlari (denetimci_personel_id);

create or replace function public.rpc_sirali_adim_tamamla(
  p_is_id uuid,
  p_adim_no integer,
  p_aciklama text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_actor_company uuid;
  v_step public.isler_zincir_gorev_adimlari%rowtype;
  v_task public.isler%rowtype;
  v_now timestamptz := now();
  v_birim uuid;
begin
  v_pid := public.current_personel_id();
  if v_pid is null then
    raise exception 'Personel oturumu bulunamadı';
  end if;

  select p.ana_sirket_id
  into v_actor_company
  from public.personeller p
  where p.id = v_pid
    and p.silindi_at is null
  limit 1;

  select * into v_task from public.isler where id = p_is_id limit 1;
  if not found then
    raise exception 'Görev bulunamadı';
  end if;
  if coalesce(v_task.gorev_turu, 'normal') <> 'sirali_gorev' then
    raise exception 'Bu RPC yalnızca sirali_gorev için kullanılabilir';
  end if;
  if v_actor_company is distinct from v_task.ana_sirket_id then
    raise exception 'Şirket kapsamı dışında işlem yapılamaz';
  end if;

  select * into v_step
  from public.isler_zincir_gorev_adimlari
  where is_id = p_is_id and adim_no = p_adim_no
  limit 1;
  if not found then
    raise exception 'Adım bulunamadı';
  end if;
  if v_step.personel_id is distinct from v_pid then
    raise exception 'Bu adımı yalnızca atanmış kişi tamamlayabilir';
  end if;
  if coalesce(v_step.adim_durum, 'aktif') <> 'aktif' then
    raise exception 'Adım aktif durumda değil';
  end if;

  update public.isler_zincir_gorev_adimlari
  set
    durum = 'tamamlandi',
    tamamlandi_at = v_now,
    aciklama = coalesce(nullif(trim(p_aciklama), ''), aciklama),
    adim_durum = 'onay_bekliyor',
    adim_gonderim_at = v_now
  where id = v_step.id;

  if v_step.denetimci_personel_id is not null then
    select p.birim_id into v_birim
    from public.personeller p
    where p.id = v_step.denetimci_personel_id
    limit 1;
    update public.isler
    set
      durum = 'onay_bekliyor',
      sorumlu_personel_id = v_step.denetimci_personel_id,
      birim_id = coalesce(v_birim, birim_id)
    where id = p_is_id;
  else
    update public.isler
    set durum = 'onay_bekliyor'
    where id = p_is_id;
  end if;
end;
$$;

create or replace function public.rpc_sirali_adim_onayla_reddet(
  p_is_id uuid,
  p_adim_no integer,
  p_karar text,
  p_yorum text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
  v_now timestamptz := now();
  v_actor_company uuid;
  v_actor_perms jsonb;
  v_can_approve boolean := false;
  v_step public.isler_zincir_gorev_adimlari%rowtype;
  v_next public.isler_zincir_gorev_adimlari%rowtype;
  v_karar text := lower(trim(coalesce(p_karar, '')));
  v_birim uuid;
begin
  if v_karar not in ('onayla', 'reddet') then
    raise exception 'Geçersiz karar: onayla | reddet';
  end if;

  v_pid := public.current_personel_id();
  if v_pid is null then
    raise exception 'Personel oturumu bulunamadı';
  end if;

  select p.ana_sirket_id, r.yetkiler
  into v_actor_company, v_actor_perms
  from public.personeller p
  left join public.roller r on r.id = p.rol_id
  where p.id = v_pid
    and p.silindi_at is null
  limit 1;

  select * into v_step
  from public.isler_zincir_gorev_adimlari
  where is_id = p_is_id and adim_no = p_adim_no
  limit 1;
  if not found then
    raise exception 'Adım bulunamadı';
  end if;
  if v_step.denetimci_personel_id is distinct from v_pid then
    raise exception 'Bu adımı yalnızca atanmış denetimci onaylayabilir/reddedebilir';
  end if;
  if coalesce(v_step.adim_durum, '') <> 'onay_bekliyor' then
    raise exception 'Adım onay bekleme durumunda değil';
  end if;
  if v_actor_company is distinct from (
    select i.ana_sirket_id from public.isler i where i.id = p_is_id
  ) then
    raise exception 'Şirket kapsamı dışında işlem yapılamaz';
  end if;

  v_can_approve :=
    public.role_perm_truthy(v_actor_perms, 'gorev_onayla') or
    public.role_perm_truthy(v_actor_perms, 'denetim.onayla') or
    public.role_perm_truthy(v_actor_perms, 'denetim.reddet');
  if not v_can_approve then
    raise exception 'Denetim/onay yetkisi bulunamadı';
  end if;

  if v_karar = 'reddet' then
    update public.isler_zincir_gorev_adimlari
    set
      adim_durum = 'reddedildi',
      adim_onay_at = v_now,
      adim_onay_notu = nullif(trim(p_yorum), '')
    where id = v_step.id;

    update public.isler
    set
      durum = 'reddedildi',
      red_nedeni = coalesce(nullif(trim(p_yorum), ''), red_nedeni)
    where id = p_is_id;
    return;
  end if;

  update public.isler_zincir_gorev_adimlari
  set
    adim_durum = 'onaylandi',
    adim_onay_at = v_now,
    adim_onay_notu = nullif(trim(p_yorum), '')
  where id = v_step.id;

  select * into v_next
  from public.isler_zincir_gorev_adimlari
  where is_id = p_is_id
    and adim_no > p_adim_no
  order by adim_no asc
  limit 1;

  if found then
    update public.isler_zincir_gorev_adimlari
    set
      adim_durum = 'aktif',
      durum = 'aktif',
      tamamlandi_at = null
    where id = v_next.id;

    select p.birim_id into v_birim
    from public.personeller p
    where p.id = v_next.personel_id
    limit 1;

    update public.isler
    set
      durum = 'atandı',
      sorumlu_personel_id = v_next.personel_id,
      birim_id = coalesce(v_birim, birim_id),
      zincir_aktif_adim = v_next.adim_no
    where id = p_is_id;
  else
    update public.isler
    set
      durum = 'onaylandı',
      zincir_aktif_adim = p_adim_no
    where id = p_is_id;
  end if;
end;
$$;

comment on function public.rpc_sirali_adim_tamamla(uuid, integer, text)
  is 'Sirali gorevde aktif adimi tamamlayip denetime gonderir.';

comment on function public.rpc_sirali_adim_onayla_reddet(uuid, integer, text, text)
  is 'Sirali gorev adimini denetimci tarafinda onaylar veya reddeder.';

commit;
