import { modeLabel } from './knowledge.js'
import { looksLikeMetaSummary, buildPersonnelAciklama } from './personnelAciklama.js'

export function isGenericInferredBaslik(baslik) {
  if (!baslik?.trim()) return true
  if (/—\s*(Standart|Şablon|Zincir|Sıralı|Operasyonel|Zincir onay)/i.test(baslik)) return true
  return isModeLabelTitle(baslik)
}

export function isModeLabelTitle(baslik) {
  return /^(standart|şablon|zincir|sıralı|sirali|operasyonel|zincir onay)(\s+görev|\s+gorev)?$/i.test(
    String(baslik || '').trim(),
  )
}

/** Kullanıcıya gösterilecek görev adı */
export function displayTaskTitle(intent) {
  const candidates = [intent?.gorevKonusu, intent?.baslik, intent?.sablonName]
  for (const c of candidates) {
    const t = String(c || '').trim()
    if (t && !isGenericInferredBaslik(t) && !isModeLabelTitle(t)) return t
  }
  return ''
}

/** Kullanıcı başlık vermezse bağlamdan üret */
export function inferIntentBaslik(intent) {
  if (intent?.gorevKonusu?.trim()) return intent.gorevKonusu.trim()
  if (intent?.baslik?.trim() && !isGenericInferredBaslik(intent.baslik)) return intent.baslik.trim()
  if (intent?.sablonName?.trim()) return intent.sablonName.trim()

  const mode = intent?.mode || 'normal'
  if (mode === 'sirali_gorev' && intent?.siraliSteps?.length) {
    const first = intent.siraliSteps[0]?.adim_baslik?.trim()
    if (first) return first.replace(/\s*—\s*\d+$/, '').trim()
  }

  return modeLabel(mode) || 'Operasyonel görev'
}

/** Kullanıcı açıklama vermezse görev adından personel talimatı üret */
export function inferIntentAciklama(intent) {
  return buildPersonnelAciklama(intent)
}

export function enrichIntentBaslikAciklama(intent) {
  const next = { ...intent }
  if (next.gorevKonusu?.trim() && (!next.baslik?.trim() || isGenericInferredBaslik(next.baslik) || isModeLabelTitle(next.baslik))) {
    next.baslik = next.gorevKonusu.trim()
  }
  if (!next.baslik?.trim() || isGenericInferredBaslik(next.baslik) || isModeLabelTitle(next.baslik)) {
    next.baslik = inferIntentBaslik(next)
  }
  if (!next.aciklama?.trim() || looksLikeMetaSummary(next.aciklama)) {
    const aciklama = inferIntentAciklama(next)
    if (aciklama) next.aciklama = aciklama
  }
  return next
}
