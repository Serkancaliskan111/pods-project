-- Özel görev (ozel_gorev): zincir/sıralı adım işçisi, denetçi ve zincir onaycısı da ana iş satırını görebilsin.
-- Aksi halde yalnızca atayan/sorumlu SELECT edebildiği için liste birleştirmesi veya detay yüklemesi boşa düşer.

drop policy if exists isler_private_select_only_participants on public.isler;

create policy isler_private_select_only_participants
on public.isler
for select
to authenticated
using (
  coalesce(ozel_gorev, false) = false
  or (
    coalesce(ozel_gorev, false) = true
    and public.current_personel_id() is not null
    and (
      atayan_personel_id = public.current_personel_id()
      or sorumlu_personel_id = public.current_personel_id()
      or exists (
        select 1
        from public.isler_zincir_gorev_adimlari z
        where z.is_id = isler.id
          and (
            z.personel_id = public.current_personel_id()
            or z.denetimci_personel_id = public.current_personel_id()
          )
      )
      or exists (
        select 1
        from public.isler_zincir_onay_adimlari o
        where o.is_id = isler.id
          and o.onaylayici_personel_id = public.current_personel_id()
      )
    )
  )
);
