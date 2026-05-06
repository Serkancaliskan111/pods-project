/**
 * personel_birimleri tablosunu personel başına yeniden yazar (çoklu kök birim).
 */
export async function replacePersonelBirimleri(
  supabase,
  { personelId, anaSirketId, birimIds, primaryBirimId },
) {
  if (!personelId || !anaSirketId) return

  const uniq = [...new Set((birimIds || []).filter(Boolean).map(String))]
  const { error: delErr } = await supabase
    .from('personel_birimleri')
    .delete()
    .eq('personel_id', personelId)
  if (delErr) throw delErr

  if (!uniq.length) return

  let primary =
    primaryBirimId && uniq.includes(String(primaryBirimId))
      ? String(primaryBirimId)
      : uniq[0]

  const rows = uniq.map((bid) => ({
    personel_id: personelId,
    birim_id: bid,
    ana_sirket_id: anaSirketId,
    is_primary: bid === primary,
  }))

  const { error: insErr } = await supabase
    .from('personel_birimleri')
    .insert(rows)
  if (insErr) throw insErr
}
