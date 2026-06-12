function mergeDateAndTime(datePart, timePart = '09:00') {
  const d = String(datePart || '').slice(0, 10)
  if (!d) return ''
  const t = String(timePart || '09:00').slice(0, 5)
  return `${d}T${t}:00`
}

const STEP_DEFAULTS = {
  adim_aciklama: '',
  puan: 0,
  acil: false,
  aciklama_zorunlu: false,
  foto_zorunlu: false,
  min_foto_sayisi: 1,
  video_zorunlu: false,
  min_video_sayisi: 1,
  max_video_suresi_sn: 60,
  belge_zorunlu: false,
  min_belge_sayisi: 1,
  referans_dosyalar: [],
}

/** Intent sıralı adımları → ExtraTask / New.jsx JSONB şeması */
export function buildSiraliPayload(intent) {
  const steps = intent?.siraliSteps || []
  if (!steps.length) return []
  const nowIso = new Date().toISOString()
  const hasScheduledStart = !!(intent.scheduleStart || intent.baslamaZamanSec)
  const bas = intent.baslangic || nowIso.slice(0, 10)
  const bit = intent.bitis || bas
  const firstStepStart = hasScheduledStart
    ? mergeDateAndTime(bas, '09:00')
    : nowIso

  return steps.map((step, i) => ({
    ...STEP_DEFAULTS,
    adim_baslik: step.adim_baslik?.trim() || `${intent.baslik || 'Adım'} — ${i + 1}`,
    personel_id: step.personel_id || null,
    denetimci_personel_id: step.denetimci_personel_id || null,
    baslama_tarihi: i === 0 ? firstStepStart : '',
    bitis_tarihi: mergeDateAndTime(i === steps.length - 1 ? bit : bas, '18:00'),
    ...(step.operasyonel || {}),
  }))
}
