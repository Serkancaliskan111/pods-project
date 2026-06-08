import { getGorevModuOption } from './gorevModuOptions.js'
import { DEFAULT_OPERASYONEL_OPTS, normalizeOperasyonelOpts } from './projectTaskOperasyonel.js'

export const EMPTY_PLAN_META = {
  assigneeIds: [],
  zincirGorevIds: [],
  zincirOnayIds: [],
  sablonId: '',
  siraliAdimlar: [],
  operasyonel: { ...DEFAULT_OPERASYONEL_OPTS },
}

export function normalizePlanMeta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    assigneeIds: [...(src.assigneeIds || src.assignee_ids || [])].map(String).filter(Boolean),
    zincirGorevIds: [...(src.zincirGorevIds || src.zincir_gorev_ids || [])]
      .map(String)
      .filter(Boolean),
    zincirOnayIds: [...(src.zincirOnayIds || src.zincir_onay_ids || [])].map(String).filter(Boolean),
    sablonId: String(src.sablonId || src.sablon_id || '').trim(),
    siraliAdimlar: (src.siraliAdimlar || src.sirali_adimlar || []).map((a) => ({
      baslik: String(a?.baslik || '').trim(),
      yapan_id: a?.yapan_id ? String(a.yapan_id) : '',
      denetimci_id: a?.denetimci_id ? String(a.denetimci_id) : '',
      acil: !!a?.acil,
      foto_zorunlu: !!a?.foto_zorunlu,
      min_foto_sayisi: Math.min(5, Math.max(1, Number(a?.min_foto_sayisi) || 1)),
      video_zorunlu: !!a?.video_zorunlu,
      min_video_sayisi: Math.min(3, Math.max(1, Number(a?.min_video_sayisi) || 1)),
      max_video_suresi_sn: Math.min(60, Math.max(5, Number(a?.max_video_suresi_sn) || 60)),
      aciklama_zorunlu: !!a?.aciklama_zorunlu,
    })),
    operasyonel: normalizeOperasyonelOpts(src.operasyonel || src),
  }
}

export function collectPlanPersonIds(gorevTipi, planMeta) {
  const m = normalizePlanMeta(planMeta)
  const ids = new Set()
  const add = (id) => {
    if (id) ids.add(String(id))
  }
  switch (gorevTipi) {
    case 'normal':
    case 'sablon_gorev':
      m.assigneeIds.forEach(add)
      break
    case 'zincir_gorev':
      m.zincirGorevIds.forEach(add)
      break
    case 'zincir_onay':
      m.zincirOnayIds.forEach(add)
      break
    case 'zincir_gorev_ve_onay':
      m.zincirGorevIds.forEach(add)
      m.zincirOnayIds.forEach(add)
      break
    case 'sirali_gorev':
      for (const a of m.siraliAdimlar) {
        add(a.yapan_id)
        add(a.denetimci_id)
      }
      break
    default:
      m.assigneeIds.forEach(add)
  }
  return [...ids]
}

/** Plan katılımcısı veya birincil sorumlu */
export function isProjectTaskAssignedToPersonel(task, personelId) {
  const pid = String(personelId || '')
  if (!pid || !task) return false
  if (String(task.sorumlu_personel_id || '') === pid) return true
  const ids = collectPlanPersonIds(task.gorev_tipi || 'normal', task.plan_meta)
  return ids.includes(pid)
}

export function resolvePrimaryAssignee(gorevTipi, planMeta) {
  const m = normalizePlanMeta(planMeta)
  switch (gorevTipi) {
    case 'normal':
    case 'sablon_gorev':
      return m.assigneeIds[0] || null
    case 'zincir_gorev':
      return m.zincirGorevIds[0] || null
    case 'zincir_onay':
      return m.zincirOnayIds[0] || null
    case 'zincir_gorev_ve_onay':
      return m.zincirGorevIds[0] || m.zincirOnayIds[0] || null
    case 'sirali_gorev':
      return m.siraliAdimlar[0]?.yapan_id || null
    default:
      return m.assigneeIds[0] || null
  }
}

export function summarizeProjectTaskPlan(gorevTipi, planMeta) {
  const m = normalizePlanMeta(planMeta)
  const typeLabel = getGorevModuOption(gorevTipi).label
  switch (gorevTipi) {
    case 'normal':
      return m.assigneeIds.length > 1
        ? `${typeLabel} · ${m.assigneeIds.length} kişi`
        : typeLabel
    case 'sablon_gorev':
      return `${typeLabel}${m.assigneeIds.length ? ` · ${m.assigneeIds.length} kişi` : ''}`
    case 'zincir_gorev':
      return `${typeLabel} · ${m.zincirGorevIds.length} adım`
    case 'zincir_onay':
      return `${typeLabel} · ${m.zincirOnayIds.length} onay`
    case 'zincir_gorev_ve_onay':
      return `${typeLabel} · ${m.zincirGorevIds.length}+${m.zincirOnayIds.length}`
    case 'sirali_gorev':
      return `${typeLabel} · ${m.siraliAdimlar.length} adım`
    default:
      return typeLabel
  }
}

export function moveListItem(list, index, direction) {
  const next = [...list]
  const j = index + direction
  if (j < 0 || j >= next.length) return list
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

export function defaultPlanMetaForType(gorevTipi, prev = null) {
  const p = prev ? normalizePlanMeta(prev) : normalizePlanMeta({})
  switch (gorevTipi) {
    case 'normal':
    case 'sablon_gorev':
      return {
        assigneeIds: p.assigneeIds,
        zincirGorevIds: [],
        zincirOnayIds: [],
        sablonId: gorevTipi === 'sablon_gorev' ? p.sablonId : '',
        siraliAdimlar: [],
        operasyonel: p.operasyonel,
      }
    case 'zincir_gorev':
      return {
        assigneeIds: [],
        zincirGorevIds: p.zincirGorevIds.length ? p.zincirGorevIds : p.assigneeIds,
        zincirOnayIds: [],
        sablonId: '',
        siraliAdimlar: [],
        operasyonel: p.operasyonel,
      }
    case 'zincir_onay':
      return {
        assigneeIds: [],
        zincirGorevIds: [],
        zincirOnayIds: p.zincirOnayIds.length ? p.zincirOnayIds : p.assigneeIds,
        sablonId: '',
        siraliAdimlar: [],
        operasyonel: p.operasyonel,
      }
    case 'zincir_gorev_ve_onay':
      return {
        assigneeIds: [],
        zincirGorevIds: p.zincirGorevIds,
        zincirOnayIds: p.zincirOnayIds,
        sablonId: '',
        siraliAdimlar: [],
        operasyonel: p.operasyonel,
      }
    case 'sirali_gorev':
      return {
        assigneeIds: [],
        zincirGorevIds: [],
        zincirOnayIds: [],
        sablonId: '',
        siraliAdimlar: p.siraliAdimlar.length
          ? p.siraliAdimlar
          : [
              {
                baslik: '',
                yapan_id: '',
                denetimci_id: '',
                acil: false,
                foto_zorunlu: false,
                min_foto_sayisi: 1,
                video_zorunlu: false,
                min_video_sayisi: 1,
                max_video_suresi_sn: 60,
                aciklama_zorunlu: false,
              },
            ],
        operasyonel: p.operasyonel,
      }
    default:
      return normalizePlanMeta({})
  }
}

function listHasDuplicates(ids) {
  const s = new Set(ids.map(String))
  return s.size !== ids.length
}

export function validateProjectTaskForm(form, project) {
  if (!form.baslik?.trim()) return 'Görev adı zorunludur.'
  if (!form.baslangic_tarihi || !form.bitis_tarihi) {
    return 'Başlangıç ve bitiş tarihi zorunludur.'
  }
  const start = new Date(`${form.baslangic_tarihi}T12:00:00`)
  const end = new Date(`${form.bitis_tarihi}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Geçersiz tarih.'
  }
  if (end < start) return 'Bitiş tarihi başlangıçtan önce olamaz.'

  if (project?.baslangic_tarihi) {
    const pStart = new Date(`${String(project.baslangic_tarihi).slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(pStart.getTime()) && start < pStart) {
      return 'Görev başlangıcı proje başlangıcından önce olamaz.'
    }
  }
  if (project?.bitis_tarihi) {
    const pEnd = new Date(`${String(project.bitis_tarihi).slice(0, 10)}T12:00:00`)
    if (!Number.isNaN(pEnd.getTime()) && end > pEnd) {
      return 'Görev bitişi proje bitiş tarihinden sonra olamaz.'
    }
  }
  return null
}

export function validateProjectTaskPlan(gorevTipi, planMeta) {
  const m = normalizePlanMeta(planMeta)
  const dup = (ids, label) =>
    listHasDuplicates(ids) ? `${label} listesinde aynı kişi birden fazla seçilemez.` : null

  switch (gorevTipi) {
    case 'normal':
      if (!m.assigneeIds.length) return 'En az bir proje ekibi üyesi seçin.'
      if (!m.operasyonel.coklu_atama && m.assigneeIds.length > 1) {
        return 'Tek atama modunda yalnızca bir sorumlu seçin veya çoklu atamayı açın.'
      }
      return dup(m.assigneeIds, 'Sorumlu')
    case 'sablon_gorev':
      if (!m.sablonId) return 'Görev şablonu seçin.'
      if (!m.assigneeIds.length) return 'En az bir sorumlu seçin.'
      return dup(m.assigneeIds, 'Sorumlu')
    case 'zincir_gorev':
      if (!m.zincirGorevIds.length) return 'Zincir görev sırasına en az bir kişi ekleyin.'
      return dup(m.zincirGorevIds, 'Zincir görev')
    case 'zincir_onay':
      if (!m.zincirOnayIds.length) return 'Zincir onay sırasına en az bir kişi ekleyin.'
      return dup(m.zincirOnayIds, 'Zincir onay')
    case 'zincir_gorev_ve_onay':
      if (!m.zincirGorevIds.length) return 'Zincir görev sırasına en az bir kişi ekleyin.'
      if (!m.zincirOnayIds.length) return 'Zincir onay sırasına en az bir kişi ekleyin.'
      return dup(m.zincirGorevIds, 'Zincir görev') || dup(m.zincirOnayIds, 'Zincir onay')
    case 'sirali_gorev': {
      if (!m.siraliAdimlar.length) return 'En az bir sıralı adım ekleyin.'
      for (let i = 0; i < m.siraliAdimlar.length; i += 1) {
        const a = m.siraliAdimlar[i]
        if (!a.baslik) return `Adım ${i + 1}: başlık zorunludur.`
        if (!a.yapan_id) return `Adım ${i + 1}: yapan seçin.`
        if (!a.denetimci_id) return `Adım ${i + 1}: denetimci seçin.`
        if (a.yapan_id && a.denetimci_id && String(a.yapan_id) === String(a.denetimci_id)) {
          return `Adım ${i + 1}: yapan ve denetimci farklı olmalıdır.`
        }
      }
      return null
    }
    default:
      return null
  }
}

/** Üst görev döngüsünü önlemek için alt görev id'leri */
export function collectDescendantTaskIds(taskId, tasks) {
  const ids = new Set()
  const walk = (pid) => {
    for (const t of tasks || []) {
      if (String(t.parent_id) === String(pid)) {
        ids.add(String(t.id))
        walk(t.id)
      }
    }
  }
  if (taskId) walk(taskId)
  return ids
}

export function personNameFromMap(personMap, personelId) {
  if (!personelId) return null
  const p = personMap?.[String(personelId)]
  if (!p) return null
  return [p.ad, p.soyad].filter(Boolean).join(' ').trim() || p.email || null
}

export function formatPlanAssigneeDetail(gorevTipi, planMeta, personMap = {}) {
  const m = normalizePlanMeta(planMeta)
  const n = (id) => personNameFromMap(personMap, id) || 'Personel'

  switch (gorevTipi) {
    case 'normal':
    case 'sablon_gorev':
      return m.assigneeIds.map(n).join(', ')
    case 'zincir_gorev':
      return m.zincirGorevIds.map((id, i) => `${i + 1}. ${n(id)}`).join(' → ')
    case 'zincir_onay':
      return m.zincirOnayIds.map((id, i) => `${i + 1}. ${n(id)}`).join(' → ')
    case 'zincir_gorev_ve_onay':
      return [
        m.zincirGorevIds.length
          ? `Görev: ${m.zincirGorevIds.map((id, i) => `${i + 1}.${n(id)}`).join('→')}`
          : '',
        m.zincirOnayIds.length
          ? `Onay: ${m.zincirOnayIds.map((id, i) => `${i + 1}.${n(id)}`).join('→')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    case 'sirali_gorev':
      return m.siraliAdimlar
        .map((a, i) => `${i + 1}. ${a.baslik || 'Adım'} (${n(a.yapan_id)})`)
        .join(' · ')
    default:
      return ''
  }
}
