-- sohbet_kanallari_select içinde sohbet_uyeleri okunması ↔ sohbet_uyeleri_select
-- içinde sohbet_kanallari okunması döngü oluşturur (recursion detected).
-- Kanal görünürlüğü: aynı şirket + chat_kanal_uyesi_mi(kanal_id) — üye tablosuna
-- doğrudan SELECT politikasından gidilmez.

BEGIN;

DROP POLICY IF EXISTS sohbet_kanallari_select ON public.sohbet_kanallari;

CREATE POLICY sohbet_kanallari_select ON public.sohbet_kanallari
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.personeller p
      WHERE p.kullanici_id = auth.uid()
        AND p.silindi_at IS NULL
        AND sohbet_kanallari.ana_sirket_id = p.ana_sirket_id
    )
    AND public.chat_kanal_uyesi_mi(sohbet_kanallari.id)
  );

COMMIT;
