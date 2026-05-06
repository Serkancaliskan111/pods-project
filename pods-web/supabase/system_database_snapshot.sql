-- ============================================================================
-- CANLI VERİTABANI ANLIK GÖRÜNTÜSÜ — özet + uyumluluk notları
--
-- Kaynak: export_schema_snapshot.sql çıktısı (2026-05-02 13:35:30+00).
-- Tam fonksiyon gövdeleri çok uzun olduğu için bu dosyada özet + kritik farklar.
-- Birebir tam metin için: scripts/export_schema_snapshot.sql veya pg_dump schema-only.
-- ============================================================================

/* <<< SNAPSHOT_BASLANGIC */

-- ----------------------------------------------------------------------
-- EXTENSIONS (snapshot)
-- ----------------------------------------------------------------------
-- pg_stat_statements 1.11 | pgcrypto 1.3 | supabase_vault 0.3.1 | uuid-ossp 1.1

-- ----------------------------------------------------------------------
-- TABLOLAR (snapshot — public)
-- ----------------------------------------------------------------------
-- ana_sirketler
-- aylik_performans_ozeti
-- birimler
-- cihaz_tokenlari
-- duyurular
-- inisiyatif_bonuslari
-- is_cevaplari
-- is_sablon_sorulari
-- is_sablonlari
-- isler
-- isler_silme_talepleri
-- isler_zincir_gorev_adimlari
-- isler_zincir_onay_adimlari
-- kullanicilar
-- personel_online_kayitlari
-- personeller
-- puan_hareketleri
-- roller
-- rutin_set_icerigi
-- rutin_setleri
-- silinen_isler
-- sistem_gunlugu
--
-- ÖNEMLİ — REPODAKİ ŞEMA İLE FARK:
-- • Bu snapshot'ta **personel_birimleri** tablosu YOK → pods-web/supabase/030_personel_coklu_birim.sql
--   henüz bu projede uygulanmamış.

-- ----------------------------------------------------------------------
-- personeller_birim_agaci_icinde_sayisi (snapshot gövdesi — eski)
-- ----------------------------------------------------------------------
-- DB'deki tanım yalnızca personeller.birim_id üzerinden recursive agaç sayımı yapıyor.
-- Repo migration 028 + 030: junction **personel_birimleri** ile bağlı personeli de sayacak şekilde
-- güncellenmeli (birim silme guard ile uyum).

-- ----------------------------------------------------------------------
-- Örnek: aktif_personeller görünümü (snapshot özeti)
-- ----------------------------------------------------------------------
-- SELECT ... FROM personeller WHERE silindi_at IS NULL

-- ----------------------------------------------------------------------
-- Tetikleyiciler (snapshot’tan isimler)
-- ----------------------------------------------------------------------
-- tr_ana_sirketler_guard_personel → block_entity_soft_delete_if_active_personel
-- tr_birimler_guard_personel → block_entity_soft_delete_if_active_personel
-- tr_isler_birebir_yetki_ins / _upd → isler_enforce_birebir_gorev_yetkisi
-- trg_isler_silme_talepleri_updated_at → touch_isler_silme_talepleri_updated_at
-- tr_roller_guard_personel → block_entity_soft_delete_if_active_personel

-- ----------------------------------------------------------------------
-- Fonksiyonlar (snapshot’tan isimler — gövdeler DB’de)
-- ----------------------------------------------------------------------
-- block_entity_soft_delete_if_active_personel
-- current_personel_id
-- handle_new_user
-- isler_enforce_birebir_gorev_yetkisi
-- isler_operasyon_duzenlenebilir_mi
-- log_task_timeline_event
-- personeller_birim_agaci_icinde_sayisi  (← junction öncesi gövde)
-- role_perm_truthy
-- rpc_is_operasyonel_guncelle
-- rpc_is_silme_onayla | rpc_is_silme_reddet | rpc_is_silme_talebi_olustur
-- touch_isler_silme_talepleri_updated_at

-- ----------------------------------------------------------------------
-- RLS / politikalar
-- ----------------------------------------------------------------------
-- Snapshot’ta isler, personeller, duyurular, silinen_isler, silme talepleri vb. için çok sayıda policy var.
-- Chat çıktısı son policy satırında kesilmiş olabilir; tam liste için export script’i tekrar çalıştır.

/* SNAPSHOT_BITIS >>> */
