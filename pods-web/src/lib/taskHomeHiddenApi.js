import getSupabase from './supabaseClient.js'

const supabase = getSupabase()

export async function fetchHomeForceShowTaskIds(personelId) {
  if (!personelId) return new Set()
  const { data, error } = await supabase
    .from('personel_gorev_ana_sayfa_geri_goster')
    .select('is_id')
    .eq('personel_id', personelId)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return new Set()
    throw error
  }
  return new Set((data || []).map((r) => String(r.is_id)))
}

export async function addHomeForceShowTask(personelId, isId) {
  if (!personelId || !isId) return
  const { error } = await supabase.from('personel_gorev_ana_sayfa_geri_goster').upsert(
    { personel_id: personelId, is_id: isId },
    { onConflict: 'personel_id,is_id' },
  )
  if (error) throw error
}

export async function removeHomeForceShowTask(personelId, isId) {
  if (!personelId || !isId) return
  const { error } = await supabase
    .from('personel_gorev_ana_sayfa_geri_goster')
    .delete()
    .eq('personel_id', personelId)
    .eq('is_id', isId)
  if (error) throw error
}
