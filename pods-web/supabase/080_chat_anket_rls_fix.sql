-- Anket gönderimi: 078 yalnızca SELECT politikası tanımladı; INSERT yoktu.
-- chat_anket_gonder SECURITY INVOKER iken sohbet_anketleri / secenekleri RLS hatası veriyordu.
-- Üyelik + gönderen kontrolü INSERT politikalarında; RPC row_security kapatılır.

BEGIN;

-- ---------------------------------------------------------------------------
-- INSERT RLS: anket başlığı ve seçenekleri
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS sohbet_anketleri_insert ON public.sohbet_anketleri;
CREATE POLICY sohbet_anketleri_insert ON public.sohbet_anketleri
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.sohbet_uyeleri u
        ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      JOIN public.personeller p
        ON p.kullanici_id = auth.uid() AND p.silindi_at IS NULL
      JOIN public.sohbet_kanallari k
        ON k.id = m.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
      WHERE m.id = sohbet_anketleri.mesaj_id
        AND m.gonderen_kullanici_id = auth.uid()
        AND m.mesaj_tipi = 'poll'
    )
  );

DROP POLICY IF EXISTS sohbet_anket_secenekleri_insert ON public.sohbet_anket_secenekleri;
CREATE POLICY sohbet_anket_secenekleri_insert ON public.sohbet_anket_secenekleri
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sohbet_mesajlari m
      JOIN public.sohbet_uyeleri u
        ON u.kanal_id = m.kanal_id AND u.kullanici_id = auth.uid()
      JOIN public.personeller p
        ON p.kullanici_id = auth.uid() AND p.silindi_at IS NULL
      JOIN public.sohbet_kanallari k
        ON k.id = m.kanal_id AND k.ana_sirket_id = p.ana_sirket_id
      WHERE m.id = sohbet_anket_secenekleri.mesaj_id
        AND m.gonderen_kullanici_id = auth.uid()
        AND m.mesaj_tipi = 'poll'
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: 078 RESET row_security → OFF (INSERT politikaları ile birlikte)
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.chat_anket_gonder(uuid, text, text[], boolean) SET row_security = off;
ALTER FUNCTION public.chat_anket_oyla(bigint, bigint) SET row_security = off;

COMMIT;
