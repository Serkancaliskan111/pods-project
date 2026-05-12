-- 044: Global avatar seçimi için kullanıcı profiline avatar_id alanı.
alter table if exists public.kullanicilar
  add column if not exists avatar_id text;

comment on column public.kullanicilar.avatar_id
  is 'Mobil profil ekranında seçilen global avatar kimliği (örn: male_1).';
