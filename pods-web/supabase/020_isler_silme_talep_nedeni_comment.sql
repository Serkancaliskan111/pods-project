-- isler_silme_talepleri.talep_aciklama: silme talep nedeni (UI: "Silme nedeni")
-- Kolon 019_is_silme_onay_workflow.sql ile mevcut; yalnızca şema yorumu güncellenir.

begin;

comment on column public.isler_silme_talepleri.talep_aciklama is
  'Silme talebi nedeni / gerekçe (ör. web işler listesinden zorunlu metin; RPC p_aciklama).';

commit;
