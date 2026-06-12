/**
 * ExtraTask / New.jsx ile aynı kurallar — asistan hazır mı?
 */
export function validateIntent(intent, { canAssignTask = true } = {}) {
  const gaps = []
  if (!intent?.baslik?.trim()) gaps.push('baslik')
  if (!intent?.mode) gaps.push('mode')

  if (!canAssignTask) {
    return { gaps, ready: gaps.length === 0 }
  }

  const mode = intent.mode || 'normal'

  if (mode === 'sirali_gorev') {
    const steps = intent.siraliSteps || []
    const complete = steps.filter(
      (s) => s?.personel_id && s?.denetimci_personel_id && (s?.adim_baslik?.trim() || intent.baslik?.trim()),
    )
    if (complete.length < 2) gaps.push('sirali')
    else {
      const missingAuditor = steps.some((s) => s?.personel_id && !s?.denetimci_personel_id)
      if (missingAuditor) gaps.push('sirali_denetim')
    }
  } else if (mode === 'zincir_gorev') {
    if (!intent.zincirGorevIds?.length) gaps.push('zincir_gorev')
  } else if (mode === 'zincir_onay') {
    if (!intent.zincirOnayWorkerId) gaps.push('zincir_onay_worker')
    if (!intent.zincirOnayIds?.length) gaps.push('zincir_onay')
  } else if (mode === 'zincir_gorev_ve_onay') {
    if (!intent.zincirGorevIds?.length) gaps.push('zincir_gorev')
    if (!intent.zincirOnayIds?.length) gaps.push('zincir_onay')
  } else if (mode === 'sablon_gorev') {
    if (!intent.sablonId) gaps.push('sablon')
    if (!intent.assigneeIds?.length && !intent.personId) gaps.push('assignees')
  } else if (!intent.assigneeIds?.length && !intent.personId) {
    gaps.push('assignees')
  }

  return { gaps, ready: gaps.length === 0 }
}

export function gapQuestion(gap, intent) {
  switch (gap) {
    case 'baslik':
      return 'Görevin başlığı ne olsun? (ör. "Depo sayımı")'
    case 'mode':
      return 'Hangi tür? standart, şablon, zincir, zincir onay, sıralı+denetim — veya doğrudan tarif edin.'
    case 'assignees':
      return 'Kime atanacak? İsim yazın; birden fazla kişi için virgül veya "ve" kullanın.'
    case 'sablon':
      return 'Hangi şablon? Şablon adının bir kısmını yazın.'
    case 'zincir_gorev':
      return 'Görev zinciri: sırayla kimler yapacak? (ör. "Ali sonra Ayşe")'
    case 'zincir_onay':
      return 'Onay zinciri: sırayla kimler onaylayacak? (ör. "onay: Veli sonra Can")'
    case 'zincir_onay_worker':
      return 'Görevi yapacak kişi kim? (ör. "Mehmet yapsın, onay: Ali sonra Ayşe")'
    case 'sirali':
      return 'Sıralı görevde en az 2 adım gerekir. Her adım: "Ahmet yapsın Uğur denetlesin". İkinci adımı yazın.'
    case 'sirali_denetim':
      return 'Sıralı adımlarda denetimci zorunlu. "X yapsın Y denetlesin" formatında yazın.'
    default:
      return 'Biraz daha detay verir misiniz?'
  }
}

export function formatGapChecklist(intent, context) {
  const { gaps } = validateIntent(intent, context)
  const labels = {
    baslik: 'Başlık',
    mode: 'Görev türü',
    assignees: 'Atanan kişi(ler)',
    sablon: 'Şablon',
    zincir_gorev: 'Zincir (yapım sırası)',
    zincir_onay: 'Zincir (onay sırası)',
    zincir_onay_worker: 'Görevi yapacak kişi',
    sirali: 'En az 2 sıralı adım',
    sirali_denetim: 'Adım denetimcileri',
  }
  return gaps.map((g) => labels[g] || g)
}
