# Supabase

SQL, Edge Functions ve yapılandırma.

## Edge Function: `admin-create-user`

Tarayıcıdan **asla** service role / `sb_secret_...` kullanmayın. Sadece şu secret’lar **Supabase Dashboard → Edge Functions → Secrets** (veya CLI) ile tanımlanır:

| Secret | Açıklama |
|--------|----------|
| `SUPABASE_URL` | Proje URL’i (çoğu ortamda otomatik) |
| `SUPABASE_SERVICE_ROLE_KEY` | Hosted ortamda çoğunlukla **otomatik** (Dashboard’dan elle eklenmez) |
| `PODS_SERVICE_ROLE_KEY` | CLI ile manuel: `bash supabase/set-edge-secrets.sh` — `SUPABASE_` ile başlayan secret adları CLI’da **yasak** |

Web uygulaması yalnızca `VITE_SUPABASE_URL` + publishable/anon anahtar kullanır (`pods-web/.env.example`).

### Girişte “web paneline erişim yok” ama rol atanmış

1. **`roller` sorgusu**: Auth artık `silindi_at` ile filtrelemiyor (sütun yoksa sorgu düşüyordu).
2. **RLS**: Oturum açan kullanıcının `personeller.rol_id = roller.id` satırını okuyabildiğinden emin olun. Örnek: `007_roller_select_for_own_personel.sql` (yorumları açıp uygulayın).
3. **`yetkiler`**: Rol kaydında en az bir eylem `true` veya `panel_erisim: true` olmalı; yeni kayıtlar `buildYetkilerForSave` ile `panel_erisim` alır.

### Service role’u benim yerime sen ayarlayamaz mısın?

Hayır: Benim Supabase hesabına veya projene bağlanma yetkim yok. Anahtarı **repoya veya `pods-web/.env`’e yazmak da doğru değil** (web paketine sızmaz ama yanlışlıkla commit riski ve sızıntı).

**Senin yapman gereken (2 dk):**

1. `cp supabase/.env.example supabase/.env`
2. `supabase/.env` içinde **`PODS_SERVICE_ROLE_KEY=`** sonrasına (tek satırda) **service_role** JWT yazın. (`supabase secrets set` komutu `SUPABASE_*` isimlerini **reddeder**.)
3. `supabase login` → `bash supabase/set-edge-secrets.sh` (secret adı: `PODS_SERVICE_ROLE_KEY`)
4. `supabase functions deploy admin-create-user --project-ref uvsemkioahjrkryetltp`

İstersen sadece Dashboard’dan da yapılır: **Edge Functions → Secrets → `SUPABASE_SERVICE_ROLE_KEY`**.

---

### `admin-create-user` — 401 (Unauthorized)

Supabase geçidi varsayılan olarak JWT ister; **publishable** anahtar bazen geçitte reddedilir. Bu yüzden `config.toml` içinde `[functions.admin-create-user] verify_jwt = false` kullanılıyor; doğrulama fonksiyon içinde yapılır.

CLI ile deploy: `supabase functions deploy admin-create-user` (bağlı projede `config.toml` uygulanır).

Sadece Dashboard’dan deploy ediyorsanız: **Edge Functions → admin-create-user → “Enforce JWT” / Verify JWT** seçeneğini kapatın; yoksa yine 401 alırsınız.

### 400 (Bad Request) — `admin-create-user`

Web arayüzünde toast artık sunucunun döndürdüğü `error` metnini gösterir; tarayıcı konsolunda `admin-create-user sunucu yanıtı:` ile tam JSON görünür.

Yaygın nedenler:

- **E-posta zaten kayıtlı** (Auth tarafında).
- **Şifre politikası** (projede minimum uzunluk / karmaşıklık).
- **`sb_secret_...` ile Auth Admin API uyumsuzluğu:** Dashboard → **Settings → API** bölümünden **eski (legacy) `service_role` JWT** anahtarını kopyalayıp Edge Function secret `SUPABASE_SERVICE_ROLE_KEY` olarak deneyin (yeni secret bazı projelerde yalnızca REST ile sınırlı olabiliyor).

