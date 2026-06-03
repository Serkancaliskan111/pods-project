import getSupabase from './supabaseClient'

const supabase = getSupabase()

/** PostgREST: fonksiyon yok / şema önbelleği güncel değil → doğrudan roller tablosuna düş */
function isRpcUnavailable(err) {
  if (!err) return false
  const code = String(err.code || '')
  const msg = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /could not find the function|function.*does not exist|schema cache/i.test(msg)
  )
}

function formatRoleSaveError(e) {
  const code = String(e?.code || '')
  const msg = e?.message || e?.details || ''
  if (code === '42501' || /permission denied|row-level security|policy|yetkiniz yok|kapsam/i.test(msg)) {
    return `Rol kaydedilemedi: ${msg || 'veritabanı izni yok'}. Supabase SQL Editor’da 068, 069 ve 070 migration dosyalarını çalıştırın.`
  }
  return msg || 'Rol kaydedilemedi'
}

/**
 * Rol oluştur / güncelle — önce SECURITY DEFINER RPC, yoksa doğrudan tablo.
 */
export async function saveRollerRole({
  rolId = null,
  rolAdi,
  anaSirketId = null,
  yetkiler,
}) {
  const payload = {
    p_rol_id: rolId || null,
    p_rol_adi: String(rolAdi || '').trim(),
    p_ana_sirket_id: anaSirketId || null,
    p_yetkiler: yetkiler ?? {},
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_save_roller_role', payload)
  if (!rpcError && rpcData) {
    return { ok: true, data: rpcData }
  }

  if (rpcError && !isRpcUnavailable(rpcError)) {
    throw Object.assign(new Error(formatRoleSaveError(rpcError)), { code: rpcError.code })
  }

  const row = {
    rol_adi: payload.p_rol_adi,
    ana_sirket_id: payload.p_ana_sirket_id,
    yetkiler: payload.p_yetkiler,
  }
  const q = rolId
    ? supabase.from('roller').update(row).eq('id', rolId).select('id').maybeSingle()
    : supabase.from('roller').insert([row]).select('id').maybeSingle()
  const { data: saved, error } = await q
  if (error) {
    throw Object.assign(new Error(formatRoleSaveError(error)), { code: error.code })
  }
  if (!saved?.id) {
    throw new Error(
      'Kayıt uygulanmadı. Supabase’de 068–070 migration dosyalarını çalıştırın; düzenlediğiniz rolün şirketinize ait olduğundan emin olun.',
    )
  }
  return { ok: true, data: saved }
}
