# Supabase şema referansı (Pods prod özeti)

Bu dosya, **2026-05 civarı** canlı veritabanından alınan `information_schema.columns` çıktısına dayanır. Kod veya migrasyon yazarken **burada listelenmeyen tablo/kolon adları kullanılmamalıdır**.

## Şema kapsamı

- Uygulama verisi: **`public`**.
- **`auth`**, **`storage`**, **`realtime`**, **`vault`**, **`extensions`**: Supabase platform tabloları; iş mantığında doğrudan tablo adı uydurmayın.

## `public` tabloları (tam liste)

| Tablo |
|-------|
| `aktif_personeller` |
| `ana_sirketler` |
| `aylik_performans_ozeti` |
| `birimler` |
| `cihaz_tokenlari` |
| `customer_unit_qr_links` |
| `customer_unit_ratings` |
| `duyurular` |
| `inisiyatif_bonuslari` |
| `is_cevaplari` |
| `is_sablon_sorulari` |
| `is_sablonlari` |
| **`isler`** |
| `isler_silme_talepleri` |
| `isler_zincir_gorev_adimlari` |
| `isler_zincir_onay_adimlari` |
| `kullanicilar` |
| `personel_birimleri` |
| `personel_online_kayitlari` |
| `personeller` |
| `puan_hareketleri` |
| `roller` |
| `rutin_set_icerigi` |
| `rutin_setleri` |
| `silinen_isler` |
| `sistem_gunlugu` |
| `sohbet_kanallari` |
| `sohbet_mesajlari` |
| `sohbet_push_kuyrugu` |
| `sohbet_uyeleri` |

## `public.isler` kolonları

Canlı DB’de **`yonetici_notu`**, **`denetim_notu`**, **`review_note` kolonları yoktur** — select/API/model tarafında kullanılmamalıdır.

| Kolon | Tür (özet) | Not |
|-------|------------|-----|
| `id` | uuid | PK |
| `birim_id` | uuid | |
| `sablon_id` | uuid | |
| `sorumlu_personel_id` | uuid | |
| `atayan_personel_id` | uuid | |
| `baslik` | varchar | |
| `durum` | varchar | |
| `baslama_tarihi` | timestamptz | |
| `bitis_tarihi` | timestamptz | |
| `olusturma_tarihi` | timestamptz | |
| **`red_nedeni`** | text | Red / geri bildirim metni |
| `is_sablon_id` | uuid | |
| `foto_zorunlu` | boolean | |
| `min_foto_sayisi` | integer | |
| `son_tarih` | timestamptz | |
| `aciklama_zorunlu` | boolean | |
| **`aciklama`** | text | Görev açıklaması / atayan tarafı metin |
| `ana_sirket_id` | uuid | |
| `puan` | integer | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `kanit_resim_ler` | array | |
| `acil` | boolean | |
| `checklist_cevaplari` | jsonb | |
| `grup_id` | uuid | |
| `gorev_turu` | text | |
| `zincir_aktif_adim` | integer | |
| `zincir_onay_aktif_adim` | integer | |
| `tamamlama_gecmisi` | jsonb | |
| **`denetim_gecmisi`** | jsonb | Denetim geçmişi (yapılandırılmış); tek satır “denetim notu” kolonu değildir |
| `tekrar_gonderim_sayisi` | integer | |
| `ozel_gorev` | boolean | |
| `gorunur_tarih` | timestamptz | |
| `tekrar_tipi` | text | |
| `tekrar_saat_araligi_dakika` | integer | |
| `tekrar_hafta_gunleri` | jsonb | |
| `video_zorunlu` | boolean | |
| `min_video_sayisi` | smallint | |
| `max_video_suresi_sn` | smallint | |
| `kanit_videolar` | jsonb | |
| **`personel_tamamlama_notu`** | text | Personel tamamlama notu |
| `sirali_gorev_meta` | jsonb | |
| `referans_medya` | jsonb | |

## Zincir / sıralı görev yardımcı tabloları

- **`isler_zincir_gorev_adimlari`**: örn. `aciklama`, `adim_baslik`, `adim_onay_notu`, `kanit_resim_ler`, `kanit_videolar`, `denetimci_personel_id`, …
- **`isler_zincir_onay_adimlari`**: örn. `yorum`, `onaylandi_at`, …

## UI / kod yönlendirmesi

- **“Yönetici notu” benzeri tekst (iş kaydı üzerinden)**:`red_nedeni` + gerektiğinde `aciklama` (mobilde zincir işçi odaklı ekranda `aciklama` çift göstermemek için ayrı kural var).
- **Son denetim satırı metni** gerekiyorsa: yeni kolon varsaymadan önce **`denetim_gecmisi` JSON** içeriği parse edilmeli.

## Güncelleme

Şema değişince Supabase’te şu sorguyla `public` kolonlarını yeniden alıp bu dosyayı güncelleyin:

```sql
SELECT table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```
