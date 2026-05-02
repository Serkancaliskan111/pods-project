-- Onay Bekliyor durumundaki işler operasyonel düzenlenemez (is.duzenle / rpc_is_operasyonel_guncelle).
begin;

create or replace function public.isler_operasyon_duzenlenebilir_mi(
  p_durum text,
  p_tekrar_gonderim integer
)
returns boolean
language sql
stable
as $$
  select
    coalesce(p_tekrar_gonderim, 0) = 0
    and btrim(coalesce(p_durum, '')) not in (
      'Onay Bekliyor',
      'Onaylandı',
      'Reddedildi',
      'Tekrar Gönderildi',
      'Tamamlandı',
      'TAMAMLANDI',
      'Onaylanmadı'
    );
$$;

comment on function public.isler_operasyon_duzenlenebilir_mi(text, integer) is
  'is.duzenle ile güncelleme öncesi durum kontrolü (onay beklemiyor; reddedilmemiş ve tekrar sürecinde olmayan).';

commit;
