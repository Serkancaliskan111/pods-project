-- Standardize task statuses across web/mobile.
-- Final canonical list:
-- Atandı, Onay Bekliyor, Onaylandı, Tekrar Gönderildi, Reddedildi

update public.isler
set durum = 'Atandı'
where durum in ('ATANDI', 'atandi', 'bekliyor');

update public.isler
set durum = 'Onaylandı'
where durum in ('TAMAMLANDI', 'Tamamlandı', 'tamamlandi', 'onaylandi');

update public.isler
set durum = 'Reddedildi'
where durum in ('Onaylanmadı', 'onaylanmadi', 'reddedildi');

