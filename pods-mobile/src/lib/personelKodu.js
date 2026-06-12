/** Personel kodu — normalize, müsaitlik ve öneri (web ile aynı) */

export function normalizePersonelKodu(raw) {
  return String(raw || '').trim()
}

export function personelKoduDuplicateMessage(kod) {
  const k = normalizePersonelKodu(kod)
  return k
    ? `"${k}" personel kodu zaten kullanılıyor. Farklı bir kod girin.`
    : 'Bu personel kodu zaten kullanılıyor.'
}

export function isPersonelKoduUniqueViolation(err) {
  const msg = String(err?.message || err || '').toLowerCase()
  return err?.code === '23505' && msg.includes('personel_kodu')
}

export async function isPersonelKoduTaken(supabase, kod, { excludePersonelId } = {}) {
  const normalized = normalizePersonelKodu(kod)
  if (!normalized) return false

  let q = supabase
    .from('personeller')
    .select('id')
    .eq('personel_kodu', normalized)
    .is('silindi_at', null)
    .limit(1)

  if (excludePersonelId) {
    q = q.neq('id', excludePersonelId)
  }

  const { data, error } = await q.maybeSingle()
  if (error && error.code !== 'PGRST116') throw error
  return !!data
}

export async function suggestNextPersonelKodu(supabase, opts = {}) {
  const prefix = String(opts.prefix || 'P-').trim() || 'P-'
  const companyId = opts.companyId

  let q = supabase
    .from('personeller')
    .select('personel_kodu')
    .is('silindi_at', null)
    .not('personel_kodu', 'is', null)

  if (companyId) {
    q = q.eq('ana_sirket_id', companyId)
  }

  const { data, error } = await q.limit(800)
  if (error) throw error

  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${esc}(\\d+)$`, 'i')
  let max = 0

  for (const row of data || []) {
    const m = normalizePersonelKodu(row.personel_kodu).match(re)
    if (m) {
      max = Math.max(max, parseInt(m[1], 10) || 0)
    }
  }

  for (let n = Math.max(max, 0) + 1; n < max + 2000; n += 1) {
    const candidate = `${prefix}${String(n).padStart(4, '0')}`
    const taken = await isPersonelKoduTaken(supabase, candidate)
    if (!taken) return candidate
  }

  return `${prefix}${Date.now().toString(36).slice(-6).toUpperCase()}`
}
