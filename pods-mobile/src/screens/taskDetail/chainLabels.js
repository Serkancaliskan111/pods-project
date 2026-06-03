import { GOREV_TURU } from '../../lib/zincirTasks'
import { normalizeStepStatus } from '../../lib/taskStatus'
import { normalizeJsonObject } from './normalize'

/**
 * Sıralı/zincir adım durumunu kullanıcıya gösterilebilir etikete çevirir.
 * Tek tip kaynak `normalizeStepStatus` üzerinden geçer; böylece tüm sistemde
 * (mobil + web) aynı yazım (örn. "Onaylandı", "Onay Bekliyor", "Aktif",
 * "Beklemede", "Reddedildi") garantilenir.
 */
export function formatSiraliAdimDurumu(raw) {
  const label = normalizeStepStatus(raw)
  return label || '—'
}

export function buildSiraliRequirementHint(step) {
  const ist = normalizeJsonObject(step?.adim_istenenler)
  const kanit = normalizeJsonObject(ist.kanit)
  const parts = []
  if (kanit.foto_zorunlu) {
    const n = Number(kanit.min_foto_sayisi) || 0
    parts.push(n > 0 ? `Foto (en az ${n})` : 'Foto zorunlu')
  }
  if (kanit.video_zorunlu) {
    const n = Number(kanit.min_video_sayisi) || 0
    parts.push(n > 0 ? `Video (en az ${n})` : 'Video zorunlu')
  }
  if (kanit.belge_zorunlu) {
    const n = Number(kanit.min_belge_sayisi) || 0
    parts.push(n > 0 ? `Belge (en az ${n})` : 'Belge zorunlu')
  }
  if (ist.aciklama_zorunlu) parts.push('Açıklama zorunlu')
  return parts.length ? parts.join(' · ') : null
}

export function formatTaskTypeShortLabel(gorevTuru) {
  const t = String(gorevTuru || '').trim()
  if (!t || t === GOREV_TURU.NORMAL || t === 'normal') return null
  switch (t) {
    case GOREV_TURU.ZINCIR_GOREV:
      return 'Zincir görev'
    case GOREV_TURU.ZINCIR_ONAY:
      return 'Zincir onay'
    case GOREV_TURU.ZINCIR_GOREV_VE_ONAY:
      return 'Zincir Görev + Zincir Onay'
    case GOREV_TURU.SIRALI_GOREV:
      return 'Sıralı görev'
    default:
      return null
  }
}
