-- ============================================================================
-- ÖN KOŞUL: public.personel_birimleri tablosu bu projede YOKSA bu dosyayı ÇALIŞTIRMAYIN.
-- Önce repodaki `030_personel_coklu_birim.sql` dosyasının TAMAMINI aynı Supabase projesinde çalıştırın.
-- 031 tablo/index/RLS oluşturmaz; yalnızca fonksiyon + tetikleyici düzeltmesidir.
-- ============================================================================
--
-- personel_birimleri INSERT sırasında ana_sirket_id'nin null kalması:
-- 1) BEFORE INSERT OR UPDATE OF ... ile INSERT bazen beklenmedik şekilde kapsam dışı kalabiliyordu;
--    tüm INSERT/UPDATE satırlarında normalize çalışsın diye koşul kaldırıldı.
-- 2) TRIGGER içi SELECT, çağıran rolün RLS'i yüzünden personel/birim göremeyebilir; SECURITY DEFINER ile
--    şirket kimliği tablolardan okunur.
-- 3) ana_sirket_id her zaman geçerli personel satırından atanır.

do $guard$
begin
  if to_regclass('public.personel_birimleri') is null then
    raise exception
      using message = 'personel_birimleri tablosu yok. Önce 030_personel_coklu_birim.sql (tam dosya) çalıştırın; 031 tablo oluşturmaz.';
  end if;
end;
$guard$;

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

-- Junction sonrası personeller.birim_id güncellemesi de RLS yüzünden başarısız olmasın.
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
