BEGIN;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.personeller;
  EXCEPTION WHEN duplicate_object THEN
    -- already added
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.personel_online_kayitlari;
  EXCEPTION WHEN duplicate_object THEN
    -- already added
    NULL;
  END;
END $$;

COMMIT;

