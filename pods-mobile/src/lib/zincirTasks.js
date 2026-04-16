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
