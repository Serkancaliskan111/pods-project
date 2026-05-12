import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
  TASK_STATUS,
} from './taskStatus'

/**
 * Web tarafı havuz görev gruplama yardımcısı.
 *
 * Bireysel = false (havuz) seçeneği ile oluşturulan görevler her atanan için ayrı `isler`
 * satırı olarak duruyor; satırlar aynı `grup_id` ile bağlı. Yönetici listelerinde (Audit,
 * Index) bu satırları tek bir kart altında göstermek için bu fonksiyon kullanılır.
 *
 *  - Aynı `grup_id`'ye sahip satırlar tek "compound" satıra sıkıştırılır.
 *  - Temsilci satır: önce kanıt taşıyan (kanit_resim_ler / kanit_videolar / personel_tamamlama_notu),
 *    yoksa PENDING_APPROVAL/RESUBMITTED durumda olan, o da yoksa en son `updated_at`'li satır.
 *  - Compound satıra `_isGrouped`, `_groupRows`, `_groupSize`, `_groupAssigneeIds`,
 *    `_groupCompletedRow`, `_groupCompletedAssigneeId` metadatası eklenir.
 *  - `grup_id`'si olmayan ve grup içi tek başına satırlar olduğu gibi korunur.
 */

function evidenceCount(row) {
  let total = 0
  const photos = row?.kanit_resim_ler
  if (Array.isArray(photos)) total += photos.length
  else if (photos && typeof photos === 'object') total += Object.keys(photos).length
  const videos = row?.kanit_videolar
  if (Array.isArray(videos)) total += videos.length
  else if (videos && typeof videos === 'object') total += Object.keys(videos).length
  return total
}

function pickRepresentativeRow(rows) {
  if (!rows?.length) return null
  const withProof = rows.find(
    (r) =>
      (r?.personel_tamamlama_notu && String(r.personel_tamamlama_notu).trim()) ||
      evidenceCount(r) > 0,
  )
  if (withProof) return withProof
  const reviewing = rows.find((r) => isPendingApprovalTaskStatus(r?.durum))
  if (reviewing) return reviewing
  return [...rows].sort((a, b) => {
    const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0
    const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0
    return tb - ta
  })[0]
}

function pickCompletedRow(rows) {
  if (!rows?.length) return null
  const withEvidence = rows.find((r) => evidenceCount(r) > 0)
  if (withEvidence) return withEvidence
  const withNote = rows.find(
    (r) => r?.personel_tamamlama_notu && String(r.personel_tamamlama_notu).trim(),
  )
  if (withNote) return withNote
  if (rows.every((r) => isApprovedTaskStatus(r?.durum))) {
    return [...rows].sort((a, b) => {
      const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0
      const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0
      return tb - ta
    })[0]
  }
  return null
}

function groupStatus(rows) {
  if (rows.every((r) => isApprovedTaskStatus(r?.durum))) return TASK_STATUS.APPROVED
  const reviewing = rows.find((r) => isPendingApprovalTaskStatus(r?.durum))
  if (reviewing) return normalizeTaskStatus(reviewing.durum)
  return normalizeTaskStatus(rows[0]?.durum)
}

/**
 * @param {Array<Object>} rows  - `isler` satırları
 * @returns {{ items: Array<Object>, allAssigneeIds: Array<string> }}
 */
export function groupTasksByGrupId(rows) {
  const items = []
  const buckets = new Map()
  const seenAssignees = new Set()

  ;(rows || []).forEach((row) => {
    if (!row || row?.id == null) return
    const gid = row?.grup_id ? String(row.grup_id) : ''
    if (gid) {
      if (!buckets.has(gid)) buckets.set(gid, [])
      buckets.get(gid).push(row)
      if (row?.sorumlu_personel_id) seenAssignees.add(String(row.sorumlu_personel_id))
    } else {
      items.push(row)
      if (row?.sorumlu_personel_id) seenAssignees.add(String(row.sorumlu_personel_id))
    }
  })

  buckets.forEach((groupRows, gid) => {
    if (!groupRows?.length) return
    if (groupRows.length === 1) {
      items.push({ ...groupRows[0], _isGrouped: false })
      return
    }
    const rep = pickRepresentativeRow(groupRows) || groupRows[0]
    const completed = pickCompletedRow(groupRows)
    const status = groupStatus(groupRows)
    const assigneeIds = [
      ...new Set(groupRows.map((r) => r?.sorumlu_personel_id).filter(Boolean)),
    ].map(String)
    items.push({
      ...rep,
      durum: status,
      _isGrouped: true,
      _groupId: gid,
      _groupRows: groupRows,
      _groupSize: groupRows.length,
      _groupAssigneeIds: assigneeIds,
      _groupCompletedRow: completed || null,
      _groupCompletedAssigneeId: completed?.sorumlu_personel_id
        ? String(completed.sorumlu_personel_id)
        : null,
    })
  })

  return {
    items,
    allAssigneeIds: Array.from(seenAssignees),
  }
}

export function collectAllAssigneeIds(rows) {
  const set = new Set()
  ;(rows || []).forEach((row) => {
    if (row?.sorumlu_personel_id) set.add(String(row.sorumlu_personel_id))
    const gr = row?._groupRows
    if (Array.isArray(gr)) {
      gr.forEach((g) => {
        if (g?.sorumlu_personel_id) set.add(String(g.sorumlu_personel_id))
      })
    }
  })
  return Array.from(set)
}
