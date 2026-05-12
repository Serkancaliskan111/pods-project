/** JSONB / string kaynaklı zaman çizelgesi satırlarını diziye çevirir */
export function normalizeTimelineArray(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export function timelineAt(row) {
  return row?.at ?? row?.timestamp ?? row?.created_at ?? row?.time ?? null
}

export function fullNamePerson(p) {
  if (!p) return ''
  const n = `${p.ad || ''} ${p.soyad || ''}`.trim()
  return n || p.email || ''
}

/** İsim RLS/birim kapsamı yüzünden gelmese bile kullanıcıya bir iz göster */
export function personLabelOrRef(row, idUuid) {
  const label = fullNamePerson(row)
  if (label) return label
  if (idUuid) return `Personel (ref: ${String(idUuid).slice(0, 8)}…)`
  return '—'
}

/** Zincir adımlarında uuid karşılaştırması (boşluk / kaynak tutarsızlığı) */
export function samePersonelId(a, b) {
  const x = String(a ?? '').trim()
  const y = String(b ?? '').trim()
  if (!x || !y) return false
  return x === y
}
