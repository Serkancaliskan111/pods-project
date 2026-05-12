import { isApprovedTaskStatus, isPendingApprovalTaskStatus, normalizeTaskStatus, TASK_STATUS } from './taskStatus'

/**
 * Havuz görev gruplama yardımcısı.
 *
 * Bireysel = false (havuz) seçeneği ile oluşturulan görevler veritabanında her atanan için
 * ayrı `isler` satırı olarak duruyor; bu satırlar aynı `grup_id` ile bağlı. UI tarafında bu
 * satırları tek bir kart altında göstermek için aşağıdaki fonksiyon kullanılır:
 *
 *  - Aynı `grup_id`'ye sahip satırlar tek bir "compound" objeye sıkıştırılır.
 *  - Temsilci satır olarak: önce `personel_tamamlama_notu`/`kanit_resim_ler` dolu olan,
 *    yoksa en yeni `updated_at`'e sahip, o da yoksa ilk satır seçilir.
 *  - Compound obje, temsilci satırın tüm alanlarını taşır; ek olarak grup metadatasını
 *    `_groupRows`, `_groupAssigneeIds`, `_groupSize`, `_groupCompletedRow`, `_isGrouped`
 *    alanlarında tutar.
 *  - `grup_id`'si olmayan satırlar olduğu gibi (ek metadata olmadan) korunur.
 *
 * Bu sayede mevcut listeleme/kart kodu tek satır mantığıyla çalışmaya devam eder; sadece
 * havuz kartlarında ek "Sorumlular" / "Tamamlayan" rozetleri gösterilir.
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
  // 1) Tamamlama notu / kanıt taşıyan satır (ilk gönderen kazanır)
  const withProof = rows.find(
    (r) => (r?.personel_tamamlama_notu && String(r.personel_tamamlama_notu).trim()) || evidenceCount(r) > 0,
  )
  if (withProof) return withProof
  // 2) PENDING_APPROVAL / RESUBMITTED durumda olan satır
  const reviewing = rows.find((r) => isPendingApprovalTaskStatus(r?.durum))
  if (reviewing) return reviewing
  // 3) En son güncellenen satır
  const sorted = [...rows].sort((a, b) => {
    const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0
    const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0
    return tb - ta
  })
  return sorted[0]
}

function pickCompletedRow(rows) {
  if (!rows?.length) return null
  // Önce kanıt yükleyen satırı tamamlayan say.
  const withEvidence = rows.find((r) => evidenceCount(r) > 0)
  if (withEvidence) return withEvidence
  const withNote = rows.find(
    (r) => r?.personel_tamamlama_notu && String(r.personel_tamamlama_notu).trim(),
  )
  if (withNote) return withNote
  // Hiç kanıt yoksa: APPROVED ise en son güncellenen satır kazanır (havuzda son senkronizasyon).
  const allApproved = rows.every((r) => isApprovedTaskStatus(r?.durum))
  if (allApproved) {
    return [...rows].sort((a, b) => {
      const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0
      const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0
      return tb - ta
    })[0]
  }
  return null
}

function groupStatus(rows) {
  // Havuzda satırların hepsi APPROVED ise APPROVED, herhangi biri PENDING_APPROVAL ise onu öncele.
  if (rows.every((r) => isApprovedTaskStatus(r?.durum))) return TASK_STATUS.APPROVED
  const reviewing = rows.find((r) => isPendingApprovalTaskStatus(r?.durum))
  if (reviewing) return normalizeTaskStatus(reviewing.durum)
  return normalizeTaskStatus(rows[0]?.durum)
}

/**
 * @param {Array<Object>} rows - `isler` satırları
 * @param {Object} [options]
 * @param {boolean} [options.includeAllAssigneeIds=true] - Yönetici dış sorgu için satır içi liste döndür
 * @returns {{ items: Array<Object>, allAssigneeIds: Array<string> }}
 */
export function groupTasksByGrupId(rows, options = {}) {
  const includeAllAssigneeIds = options.includeAllAssigneeIds !== false
  const items = []
  const buckets = new Map() // grup_id -> rows[]
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
      // Tek satır: gruplamaya gerek yok ama metadatada grup_id'yi koru.
      items.push({ ...groupRows[0], _isGrouped: false })
      return
    }
    const rep = pickRepresentativeRow(groupRows) || groupRows[0]
    const completed = pickCompletedRow(groupRows)
    const status = groupStatus(groupRows)
    const assigneeIds = [...new Set(groupRows.map((r) => r?.sorumlu_personel_id).filter(Boolean))].map(String)
    items.push({
      ...rep,
      durum: status,
      _isGrouped: true,
      _groupId: gid,
      _groupRows: groupRows,
      _groupSize: groupRows.length,
      _groupAssigneeIds: assigneeIds,
      _groupCompletedRow: completed || null,
      _groupCompletedAssigneeId: completed?.sorumlu_personel_id ? String(completed.sorumlu_personel_id) : null,
    })
  })

  return {
    items,
    allAssigneeIds: includeAllAssigneeIds ? Array.from(seenAssignees) : [],
  }
}

/**
 * Yardımcı: Bir dizi grup_id'li/ayrık satırdan denetim/dış sorguda kullanılacak
 * tüm sorumlu_personel_id koleksiyonunu döndürür (ad/soyad eşleme için).
 */
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
