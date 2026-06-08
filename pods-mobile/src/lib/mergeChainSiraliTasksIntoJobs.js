import {
  isApprovedTaskStatus,
  normalizeTaskStatus,
} from './taskStatus'
import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from './zincirTasks'

function dedupeTasksById(rows) {
  const m = new Map()
  for (const r of rows || []) {
    if (r?.id != null) m.set(String(r.id), r)
  }
  return [...m.values()]
}

export async function mergeChainSiraliTasksIntoJobs(client, baseJobs, opts) {
  const {
    personelId,
    companyId,
    isSystemAdmin,
    jobsSelectWithVisibleAt,
    jobsSelectLegacy,
  } = opts
  if (!personelId) return baseJobs || []

  const workerJoinedQ = client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
    .eq('personel_id', personelId)
  const denetimJoinedQ = client
    .from('isler_zincir_gorev_adimlari')
    .select('is_id, adim_no, adim_durum, durum, isler(gorev_turu)')
    .eq('denetimci_personel_id', personelId)
  const onayPendingQ = client
    .from('isler_zincir_onay_adimlari')
    .select('is_id, adim_no')
    .eq('onaylayici_personel_id', personelId)
    .eq('durum', 'bekliyor')
  const onayAllQ = client
    .from('isler_zincir_onay_adimlari')
    .select('is_id')
    .eq('onaylayici_personel_id', personelId)

  const [workerJoinedRes, denetimJoinedRes, onayPendingRes, onayAllRes] = await Promise.all([
    workerJoinedQ,
    denetimJoinedQ,
    onayPendingQ,
    onayAllQ,
  ])

  let zincirGorevStepsRes = workerJoinedRes
  let workerStepsJoined = !zincirGorevStepsRes?.error
  if (zincirGorevStepsRes?.error?.code === '42703') {
    zincirGorevStepsRes = await client
      .from('isler_zincir_gorev_adimlari')
      .select('is_id, adim_no, adim_durum, durum')
      .eq('personel_id', personelId)
    workerStepsJoined = false
    if (zincirGorevStepsRes?.error?.code === '42703') {
      zincirGorevStepsRes = await client
        .from('isler_zincir_gorev_adimlari')
        .select('is_id, adim_no, durum')
        .eq('personel_id', personelId)
    }
  }

  const zincirOnayStepsData = onayPendingRes?.data
  const zincirOnayAllMine = onayAllRes?.data

  let siraliDenetimRes = denetimJoinedRes
  let denetimJoined = !siraliDenetimRes?.error
  if (siraliDenetimRes?.error?.code === '42703') {
    siraliDenetimRes = await client
      .from('isler_zincir_gorev_adimlari')
      .select('is_id, adim_no, adim_durum, durum')
      .eq('denetimci_personel_id', personelId)
    denetimJoined = false
    if (siraliDenetimRes?.error?.code === '42703') {
      siraliDenetimRes = { data: [] }
    }
  }

  const gorevMap = new Map()
  const siraliWorkerStepMap = new Map()
  const chainJobParticipantIds = new Set()
  const zincirOnayPastParticipantIds = new Set()
  ;(zincirOnayAllMine || []).forEach((r) => {
    if (r?.is_id) zincirOnayPastParticipantIds.add(String(r.is_id))
  })
  ;(zincirGorevStepsRes?.data || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    chainJobParticipantIds.add(String(r.is_id))
    const tur = workerStepsJoined ? r?.isler?.gorev_turu : null
    const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
    const zincireUygun = !workerStepsJoined || tur == null || isZincirGorevTuru(tur)
    const siraliUygun = !workerStepsJoined || tur == null || isSiraliGorevTuru(tur)
    if (
      zincireUygun &&
      (adimDurum === 'aktif' || adimDurum === 'bekliyor' || adimDurum === 'sira_bekliyor')
    ) {
      gorevMap.set(String(r.is_id), Number(r.adim_no))
    }
    if (siraliUygun && (adimDurum === 'aktif' || adimDurum === 'bekliyor')) {
      siraliWorkerStepMap.set(String(r.is_id), Number(r.adim_no))
    }
  })

  const onayMap = new Map()
  ;(zincirOnayStepsData || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    onayMap.set(String(r.is_id), Number(r.adim_no))
  })

  const siraliDenetimMap = new Map()
  ;(siraliDenetimRes?.data || []).forEach((r) => {
    if (!r?.is_id || r?.adim_no == null) return
    const tur = denetimJoined ? r?.isler?.gorev_turu : null
    if (denetimJoined && !isSiraliGorevTuru(tur)) return
    const adimDurum = String(r?.adim_durum || r?.durum || '').toLowerCase()
    if (adimDurum === 'onay_bekliyor') {
      siraliDenetimMap.set(String(r.is_id), Number(r.adim_no))
    }
  })

  const chainIds = [
    ...new Set([
      ...gorevMap.keys(),
      ...onayMap.keys(),
      ...siraliDenetimMap.keys(),
      ...chainJobParticipantIds,
      ...zincirOnayPastParticipantIds,
    ]),
  ]
  if (!chainIds.length) return baseJobs || []

  let chainQ = client.from('isler').select(jobsSelectWithVisibleAt).in('id', chainIds)
  if (!isSystemAdmin && companyId) chainQ = chainQ.eq('ana_sirket_id', companyId)
  let { data: chainTasksData, error: chainTasksError } = await chainQ

  if (chainTasksError?.code === '42703' && jobsSelectLegacy) {
    let chainQ2 = client.from('isler').select(jobsSelectLegacy).in('id', chainIds)
    if (!isSystemAdmin && companyId) chainQ2 = chainQ2.eq('ana_sirket_id', companyId)
    const legacy = await chainQ2
    chainTasksData = legacy.data
    chainTasksError = legacy.error
  }

  if (chainTasksError || !chainTasksData?.length) return baseJobs || []

  const visibleChainTasks = chainTasksData.filter((task) => {
    const taskId = String(task?.id || '')
    const durumLower = String(normalizeTaskStatus(task?.durum) || '').toLowerCase()
    if (durumLower.includes('redded')) return false
    if (isApprovedTaskStatus(task?.durum)) {
      const gt = task?.gorev_turu
      const chainTyped =
        isZincirGorevTuru(gt) || isZincirOnayTuru(gt) || isSiraliGorevTuru(gt)
      if (!chainTyped) return false
      if (chainJobParticipantIds.has(taskId)) return true
      if (zincirOnayPastParticipantIds.has(taskId)) return true
      return false
    }
    if (isZincirGorevTuru(task?.gorev_turu)) {
      const myStep = gorevMap.get(taskId)
      if (myStep != null && Number(task?.zincir_aktif_adim || 1) === myStep) return true
    }
    if (isZincirOnayTuru(task?.gorev_turu)) {
      const myStep = onayMap.get(taskId)
      if (myStep != null && Number(task?.zincir_onay_aktif_adim || 1) === myStep) return true
    }
    if (isSiraliGorevTuru(task?.gorev_turu)) {
      const myActiveStep = siraliWorkerStepMap.get(taskId)
      if (myActiveStep != null && Number(task?.zincir_aktif_adim || 1) === myActiveStep) return true
      const myAuditStep = siraliDenetimMap.get(taskId)
      if (myAuditStep != null && Number(task?.zincir_aktif_adim || 1) === myAuditStep) return true
    }
    return false
  })

  if (!visibleChainTasks.length) return baseJobs || []
  return dedupeTasksById([...(baseJobs || []), ...visibleChainTasks])
}
