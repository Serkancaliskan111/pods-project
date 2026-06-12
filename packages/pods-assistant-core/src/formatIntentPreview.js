import { modeLabel } from './knowledge.js'
import { formatGapChecklist } from './validateIntent.js'

function fmtDate(ymd) {
  if (!ymd) return '—'
  const [y, m, d] = ymd.split('-')
  return `${d}.${m}.${y}`
}

function opSummary(op = {}) {
  const bits = []
  if (op.acil) bits.push('Acil')
  if (op.foto_zorunlu) bits.push(`Foto zorunlu${op.min_foto_sayisi > 1 ? ` (${op.min_foto_sayisi})` : ''}`)
  if (op.video_zorunlu) bits.push(`Video zorunlu (${op.max_video_suresi_sn || 60} sn)`)
  if (op.belge_zorunlu) bits.push('Belge zorunlu')
  if (op.aciklama_zorunlu) bits.push('Açıklama zorunlu')
  if (op.ozel_gorev) bits.push('Özel görev')
  if (op.coklu_atama) bits.push(op.bireysel === false ? 'Çoklu (ortak)' : 'Çoklu atama')
  if (op.puan > 0) bits.push(`${op.puan} puan`)
  return bits.length ? bits.join(' · ') : '—'
}

export function formatIntentPreview(intent, context) {
  if (!intent) return []
  const lines = []
  if (intent.projeId) lines.push({ label: 'Proje', value: `#${intent.projeId}` })
  lines.push({ label: 'Tür', value: modeLabel(intent.mode || 'normal') })
  lines.push({ label: 'Başlık', value: intent.baslik || '—' })
  if (intent.aciklama) lines.push({ label: 'Açıklama', value: intent.aciklama })
  if (intent.sablonName) lines.push({ label: 'Şablon', value: intent.sablonName })
  if (intent.assigneeNames?.length) {
    lines.push({ label: 'Atanan', value: intent.assigneeNames.join(', ') })
  }
  if (intent.zincirOnayWorkerName) {
    lines.push({ label: 'Yapan (onay modu)', value: intent.zincirOnayWorkerName })
  }
  if (intent.zincirGorevNames?.length) {
    lines.push({ label: 'Zincir (yapım)', value: intent.zincirGorevNames.join(' → ') })
  }
  if (intent.zincirOnayNames?.length) {
    lines.push({ label: 'Zincir (onay)', value: intent.zincirOnayNames.join(' → ') })
  }
  if (intent.siraliSteps?.length) {
    intent.siraliSteps.forEach((s, i) => {
      const who = s.workerName || s.personel_id || '—'
      const aud = s.auditorName || s.denetimci_personel_id || '—'
      lines.push({ label: `Adım ${i + 1}`, value: `${who} → denetim: ${aud}` })
    })
  }
  if (intent.baslangic || intent.bitis) {
    lines.push({
      label: 'Tarih',
      value: `${fmtDate(intent.baslangic)}${intent.bitis && intent.bitis !== intent.baslangic ? ` – ${fmtDate(intent.bitis)}` : ''}`,
    })
  }
  lines.push({ label: 'Operasyonel', value: opSummary(intent.operasyonel) })

  if (context) {
    const gaps = formatGapChecklist(intent, context)
    if (gaps.length) {
      lines.push({ label: 'Eksik', value: gaps.join(', '), warn: true })
    }
  }
  return lines
}
