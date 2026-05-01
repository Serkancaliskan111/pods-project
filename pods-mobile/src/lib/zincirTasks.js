/** Zincir görev / zincir onay sabitleri ve yardımcılar */

export const GOREV_TURU = {
  NORMAL: 'normal',
  ZINCIR_GOREV: 'zincir_gorev',
  ZINCIR_ONAY: 'zincir_onay',
  ZINCIR_GOREV_VE_ONAY: 'zincir_gorev_ve_onay',
}

export function isZincirGorevTuru(t) {
  return t === GOREV_TURU.ZINCIR_GOREV || t === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
}

export function isZincirOnayTuru(t) {
  return t === GOREV_TURU.ZINCIR_ONAY || t === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
}

export function buildKanitFotoDurumlari(urls) {
  const out = {}
  ;(urls || []).forEach((u) => {
    if (!u) return
    out[String(u)] = 'bekliyor'
  })
  return out
}

export function allFotolarOnaylandi(durumMap) {
  const vals = Object.values(durumMap || {})
  if (!vals.length) return true
  return vals.every((v) => v === 'onaylandi')
}

export function hasReddedilenFoto(durumMap) {
  return Object.values(durumMap || {}).some((v) => v === 'reddedildi')
}

function kanitUrlCount(step) {
  const k = step?.kanit_resim_ler
  if (Array.isArray(k)) return k.length
  if (k && typeof k === 'object' && typeof k.length === 'number') return k.length
  return 0
}

export function zincirGorevStepsReorderEligible(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return false
  return steps.every((s) => {
    const d = String(s?.durum || '').trim()
    return (
      d !== 'tamamlandi' &&
      d !== 'reddedildi' &&
      !s?.tamamlandi_at &&
      kanitUrlCount(s) === 0
    )
  })
}

export function zincirOnayStepsReorderEligible(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return false
  return steps.every((s) => {
    if (s?.onaylandi_at) return false
    const d = String(s?.durum || '').trim().toLowerCase()
    return d !== 'onaylandi' && d !== 'reddedildi'
  })
}
