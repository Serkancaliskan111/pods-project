import { PROJECT_TASK_STATUS } from './projectStatus.js'
import { normalizeTaskStatus, TASK_STATUS } from './taskStatus.js'

export function mapIslerDurumToProjectTaskDurum(durum) {
  const n = normalizeTaskStatus(durum)
  if (n === TASK_STATUS.APPROVED) return PROJECT_TASK_STATUS.DONE
  if (n === TASK_STATUS.REJECTED) return PROJECT_TASK_STATUS.BLOCKED
  if (n === TASK_STATUS.PENDING_APPROVAL || n === TASK_STATUS.RESUBMITTED) {
    return PROJECT_TASK_STATUS.IN_PROGRESS
  }
  return PROJECT_TASK_STATUS.TODO
}

function datePartFromIso(iso) {
  if (!iso) return null
  const s = String(iso).slice(0, 10)
  return s.length === 10 ? s : null
}

/** Operasyonel is satırını proje görev listesi UI şekline çevirir (yalnız planlama satırı yoksa). */
export function mapOperationalIsToProjectTaskRow(is, projeId) {
  const bas = datePartFromIso(is.baslama_tarihi) || datePartFromIso(is.gorunur_tarih)
  const bit = datePartFromIso(is.son_tarih) || bas
  return {
    id: is.id,
    proje_id: projeId || is.proje_id,
    parent_id: null,
    baslik: is.baslik || 'Görev',
    aciklama: is.aciklama || null,
    baslangic_tarihi: bas || new Date().toISOString().slice(0, 10),
    bitis_tarihi: bit || bas || new Date().toISOString().slice(0, 10),
    durum: mapIslerDurumToProjectTaskDurum(is.durum),
    ilerleme: mapIslerDurumToProjectTaskDurum(is.durum) === PROJECT_TASK_STATUS.DONE ? 100 : 0,
    yapilan_is: 0,
    toplam_is: 1,
    sira: 0,
    sorumlu_personel_id: is.sorumlu_personel_id || null,
    gorev_tipi: is.gorev_turu || 'normal',
    plan_meta: null,
    bagli_is_id: is.id,
    olusturulma_at: is.created_at,
    guncelleme_at: is.updated_at,
    silindi_at: null,
    acil: !!is.acil,
    _operational_only: true,
  }
}

/**
 * Planlama görevleri + proje_id dolu operasyonel isler (bagli_is_id ile zaten temsil edilenler hariç).
 */
export function mergeProjectTaskSources(planningTasks = [], operationalIsler = [], projeId) {
  const linkedIsIds = new Set(
    (planningTasks || [])
      .map((t) => (t.bagli_is_id ? String(t.bagli_is_id) : ''))
      .filter(Boolean),
  )
  const merged = [...(planningTasks || [])]
  for (const is of operationalIsler || []) {
    const isId = String(is.id)
    if (linkedIsIds.has(isId)) continue
    merged.push(mapOperationalIsToProjectTaskRow(is, projeId))
  }
  return merged
}
