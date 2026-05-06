-- Birebir (özel) görev: ozel_gorev=true yapmak için rol yetkisi is.birebir_gorev veya sistem yöneticisi.
-- İstemci kaçırılsa bile INSERT ve ozel_gorev güncellemesi DB'de kontrol edilir.

create or replace function public.isler_enforce_birebir_gorev_yetkisi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_sys boolean;
  v_pid uuid;
  v_yetkiler jsonb;
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.ozel_gorev, false) then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if not (
      coalesce(new.ozel_gorev, false)
      and not coalesce(old.ozel_gorev, false)
    ) then
      return new;
    end if;
  else
    return new;
  end if;

  v_uid := auth.uid();
  if v_uid is null then
    return new;
  end if;

  select coalesce(k.is_system_admin, false)
    into v_sys
  from public.kullanicilar k
  where k.id = v_uid
    and k.silindi_at is null
  limit 1;

  if coalesce(v_sys, false) then
    return new;
  end if;

  v_pid := public.current_personel_id();
  if v_pid is null then
    raise exception 'Birebir (özel) görev için geçerli personel oturumu gerekli'
      using errcode = '42501';
  end if;

  select rol.yetkiler
    into v_yetkiler
  from public.personeller p
  left join public.roller rol on rol.id = p.rol_id
  where p.id = v_pid
    and p.silindi_at is null
  limit 1;

  if not public.role_perm_truthy(v_yetkiler, 'is.birebir_gorev') then
    raise exception 'Birebir (özel) görev oluşturmak veya açmak için yetkiniz yok (is.birebir_gorev)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_isler_birebir_yetki_ins on public.isler;
create trigger tr_isler_birebir_yetki_ins
  before insert on public.isler
  for each row
  execute procedure public.isler_enforce_birebir_gorev_yetkisi();

drop trigger if exists tr_isler_birebir_yetki_upd on public.isler;
create trigger tr_isler_birebir_yetki_upd
  before update of ozel_gorev on public.isler
  for each row
  execute procedure public.isler_enforce_birebir_gorev_yetkisi();

comment on function public.isler_enforce_birebir_gorev_yetkisi() is
  'ozel_gorev=true (INSERT veya false→true UPDATE) için is.birebir_gorev veya sistem yöneticisi; auth.uid() yoksa (ör. service_role) geçilir.';
