import { GOREV_TURU } from '../zincirTasks.js'
import { TASK_STATUS } from '../taskStatus.js'
import { formatTaskTitleCase } from '../formatTaskTitle.js'
import { normalizeOperasyonelOpts } from '../projectTaskOperasyonel.js'
import { deriveGorunurFromBaslamaIso } from '../taskVisibility.js'
import { linkProjectTaskToOperational } from '../projectApi.js'
import { validateIntent } from './validateIntent.js'
import { buildSiraliPayload } from './buildSiraliPayload.js'

function modeToGorevTuru(mode) {
  const map = {
    normal: GOREV_TURU.NORMAL,
    sablon_gorev: GOREV_TURU.NORMAL,
    zincir_gorev: GOREV_TURU.ZINCIR_GOREV,
    zincir_onay: GOREV_TURU.ZINCIR_ONAY,
    zincir_gorev_ve_onay: GOREV_TURU.ZINCIR_GOREV_VE_ONAY,
    sirali_gorev: GOREV_TURU.SIRALI_GOREV,
  }
  return map[mode] || GOREV_TURU.NORMAL
}

function mergeDateTime(datePart, timePart = '09:00') {
  if (!datePart) return null
  const d = String(datePart)
  if (d.includes('T')) return d
  const t = String(timePart).slice(0, 5)
  return `${d.slice(0, 10)}T${t}:00`
}

function findPerson(personnel, id) {
  return (personnel || []).find((p) => String(p.id) === String(id)) || null
}

function stripIslerOptionalColumns(row) {
  const next = { ...(row || {}) }
  delete next.gorunur_tarih
  delete next.referans_medya
  delete next.ozel_gorev
  delete next.proje_id
  if (next.gorev_turu) {
    delete next.gorev_turu
    delete next.zincir_aktif_adim
    delete next.zincir_onay_aktif_adim
  }
  return next
}

function isMissingColumnError(err) {
  if (!err) return false
  if (err.code === '42703' || err.code === 'PGRST204') return true
  return /Could not find the .* column|column .* does not exist/i.test(String(err.message || ''))
}

async function insertIslerRows(supabase, payloads) {
  let { data, error } = await supabase.from('isler').insert(payloads).select()
  if (error && isMissingColumnError(error)) {
    const res = await supabase.from('isler').insert(payloads.map(stripIslerOptionalColumns)).select()
    data = res.data
    error = res.error
  }
  if (error) {
    const msg = String(error.message || error.details || error.hint || '').trim()
    throw new Error(msg || 'Görev veritabanına kaydedilemedi.')
  }
  if (!data?.length) throw new Error('Görev oluşturuldu ancak kayıt alınamadı.')
  return Array.isArray(data) ? data : data ? [data] : []
}

async function resolveAssignerPersonelId(supabase, { personel, user, anaSirketId }) {
  if (personel?.id) return personel.id
  if (!user?.id) return null
  let q = supabase
    .from('personeller')
    .select('id')
    .eq('kullanici_id', user.id)
    .is('silindi_at', null)
  if (anaSirketId) q = q.eq('ana_sirket_id', anaSirketId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data?.id || null
}

function buildSiraliStepRows(taskId, siraliAdimlar) {
  const clampInt = (raw, min, max, fallback) => {
    const n = Number.parseInt(String(raw ?? '').trim(), 10)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, n))
  }

  return siraliAdimlar.map((adim, i) => {
    const fotoZ = !!adim.foto_zorunlu
    const videoZ = !!adim.video_zorunlu
    const adimBaslamaIso = i === 0 ? mergeDateTime(adim.baslama_tarihi) : null
    const adimBitisIso = mergeDateTime(adim.bitis_tarihi, '18:00')
    return {
      is_id: taskId,
      adim_no: i + 1,
      personel_id: adim.personel_id,
      denetimci_personel_id: adim.denetimci_personel_id,
      adim_baslik: String(adim.adim_baslik || `${i + 1}. adım`).trim(),
      adim_istenenler: {
        aciklama: String(adim.adim_aciklama || '').trim() || null,
        baslama_tarihi: adimBaslamaIso,
        bitis_tarihi: adimBitisIso,
        puan: clampInt(adim.puan, 0, 1000, 0),
        aciklama_zorunlu: !!adim.aciklama_zorunlu,
        acil: !!adim.acil,
        kanit: {
          foto_zorunlu: fotoZ,
          min_foto_sayisi: fotoZ ? clampInt(adim.min_foto_sayisi, 1, 5, 1) : 0,
          video_zorunlu: videoZ,
          min_video_sayisi: videoZ ? clampInt(adim.min_video_sayisi, 1, 3, 1) : 0,
          max_video_suresi_sn: videoZ ? clampInt(adim.max_video_suresi_sn, 5, 60, 60) : 60,
          belge_zorunlu: !!adim.belge_zorunlu,
          min_belge_sayisi: adim.belge_zorunlu ? clampInt(adim.min_belge_sayisi, 1, 5, 1) : 0,
        },
        referans_medya: [],
      },
      durum: i === 0 ? 'aktif' : 'sira_bekliyor',
      adim_durum: i === 0 ? 'aktif' : 'sira_bekliyor',
    }
  })
}

/**
 * Pods AI intent → doğrudan `isler` kaydı (manuel forma yönlendirme yok).
 */
export async function createOperationalTaskFromIntent({
  supabase,
  intent,
  seed = {},
  personel,
  user,
  personnel = [],
  templates = [],
  canAssignTask = true,
}) {
  const context = { canAssignTask }
  const { ready, gaps } = validateIntent(intent, context)
  if (!ready) {
    throw new Error(`Eksik bilgiler: ${gaps.join(', ')}`)
  }

  const anaSirketId = personel?.ana_sirket_id || seed?.company || null
  if (!anaSirketId) throw new Error('Şirket bilgisi bulunamadı.')

  const atayanPersonelId = await resolveAssignerPersonelId(supabase, {
    personel,
    user,
    anaSirketId,
  })
  if (!atayanPersonelId) {
    throw new Error('Görev atayan personel bilgisi bulunamadı.')
  }

  const mode = intent.mode || 'normal'
  const tur = modeToGorevTuru(mode)
  const tplRow = intent.sablonId
    ? (templates || []).find((t) => String(t.id) === String(intent.sablonId))
    : null

  const titleTrim = formatTaskTitleCase(
    (tplRow?.baslik && String(tplRow.baslik).trim()) || (intent.baslik || '').trim(),
  )
  if (!titleTrim) throw new Error('Görev başlığı gerekli.')

  const op = normalizeOperasyonelOpts(intent.operasyonel || {})
  const baslamaIso = mergeDateTime(intent.baslangic) || new Date().toISOString()
  const sonIso = mergeDateTime(intent.bitis, '18:00') || null
  const gorunurIso = deriveGorunurFromBaslamaIso(baslamaIso)

  const projeId = intent.projeId || seed?.projeId || null
  const projeGorevId = intent.projeGorevId || seed?.projeGorevId || null

  const payloadCommon = {
    atayan_personel_id: atayanPersonelId,
    ana_sirket_id: anaSirketId,
    baslik: !canAssignTask ? `Ekstra görev girişi - ${titleTrim}` : titleTrim,
    aciklama: (intent.aciklama || tplRow?.aciklama || '').trim() || null,
    is_sablon_id: mode === 'sablon_gorev' && intent.sablonId ? intent.sablonId : null,
    puan: canAssignTask ? (Number(tplRow?.varsayilan_puan ?? tplRow?.puan ?? op.puan) || 0) : 0,
    durum: canAssignTask && op.acil && tur !== GOREV_TURU.SIRALI_GOREV ? 'ACIL' : TASK_STATUS.ASSIGNED,
    acil: canAssignTask && tur !== GOREV_TURU.SIRALI_GOREV ? !!op.acil : false,
    foto_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : !!(tplRow?.foto_zorunlu || op.foto_zorunlu),
    min_foto_sayisi:
      tur === GOREV_TURU.SIRALI_GOREV
        ? 0
        : tplRow?.foto_zorunlu
          ? Math.min(5, Math.max(1, Number(tplRow.min_foto_sayisi) || 1))
          : op.foto_zorunlu
            ? op.min_foto_sayisi
            : 0,
    video_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : !!(tplRow?.video_zorunlu || op.video_zorunlu),
    min_video_sayisi:
      tur === GOREV_TURU.SIRALI_GOREV
        ? 0
        : op.video_zorunlu || tplRow?.video_zorunlu
          ? tplRow?.video_zorunlu
            ? Math.min(3, Math.max(1, Number(tplRow.min_video_sayisi) || 1))
            : op.min_video_sayisi
          : 0,
    max_video_suresi_sn: op.video_zorunlu ? op.max_video_suresi_sn : 60,
    belge_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : !!op.belge_zorunlu,
    min_belge_sayisi: tur === GOREV_TURU.SIRALI_GOREV ? 0 : op.belge_zorunlu ? op.min_belge_sayisi : 0,
    aciklama_zorunlu: tur === GOREV_TURU.SIRALI_GOREV ? false : !!op.aciklama_zorunlu,
    ozel_gorev: mode === 'normal' && !!op.ozel_gorev,
    gorev_turu: tur,
    zincir_aktif_adim: 1,
    zincir_onay_aktif_adim: 0,
    tekrar_tipi: 'none',
    referans_medya: [],
    ...(projeId ? { proje_id: projeId } : {}),
  }

  let rows = []

  if (!canAssignTask) {
    rows = await insertIslerRows(supabase, [
      {
        ...payloadCommon,
        gorev_turu: GOREV_TURU.NORMAL,
        sorumlu_personel_id: personel.id,
        birim_id: personel.birim_id || null,
        baslama_tarihi: baslamaIso,
        son_tarih: sonIso,
        gorunur_tarih: gorunurIso,
      },
    ])
  } else if (tur === GOREV_TURU.SIRALI_GOREV) {
    const siraliAdimlar = buildSiraliPayload(intent)
    const firstWorkerId = siraliAdimlar[0]?.personel_id
    const firstRow = findPerson(personnel, firstWorkerId)
    const birimForInsert =
      intent.unitId || firstRow?.birim_id || personel?.birim_id || null
    if (!birimForInsert) throw new Error('Sıralı görev için birim bilgisi gerekli.')

    const startIso = mergeDateTime(siraliAdimlar[0]?.baslama_tarihi) || baslamaIso
    const endIso =
      mergeDateTime(siraliAdimlar[siraliAdimlar.length - 1]?.bitis_tarihi, '18:00') ||
      sonIso ||
      baslamaIso

    rows = await insertIslerRows(supabase, [
      {
        ...payloadCommon,
        sorumlu_personel_id: firstWorkerId,
        birim_id: birimForInsert,
        baslama_tarihi: startIso,
        son_tarih: endIso,
        gorunur_tarih: startIso,
        acil: false,
        durum: TASK_STATUS.ASSIGNED,
        foto_zorunlu: false,
        min_foto_sayisi: 0,
      },
    ])

    const taskId = rows[0]?.id
    if (!taskId) throw new Error('Sıralı görev oluşturulamadı.')

    const stepRows = buildSiraliStepRows(taskId, siraliAdimlar)
    let { error: stepErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(stepRows)
    if (isMissingColumnError(stepErr)) {
      const fallbackRows = stepRows.map((row) => ({
        is_id: row.is_id,
        adim_no: row.adim_no,
        personel_id: row.personel_id,
        durum: row.durum,
      }))
      const res = await supabase.from('isler_zincir_gorev_adimlari').insert(fallbackRows)
      stepErr = res.error
    }
    if (stepErr) throw stepErr
  } else if (
    tur === GOREV_TURU.ZINCIR_GOREV ||
    tur === GOREV_TURU.ZINCIR_ONAY ||
    tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
  ) {
    const zincirGorevSira = intent.zincirGorevIds || []
    const zincirOnaySira = intent.zincirOnayIds || []
    const zincirOnayWorkerId = intent.zincirOnayWorkerId

    const firstWorkerId =
      tur === GOREV_TURU.ZINCIR_ONAY
        ? zincirOnayWorkerId
        : zincirGorevSira[0]

    if (String(firstWorkerId) === String(atayanPersonelId) && tur !== GOREV_TURU.ZINCIR_ONAY) {
      throw new Error('Kendinizi görevin ilk sorumlusu yapamazsınız.')
    }

    const firstRow = findPerson(personnel, firstWorkerId)
    const birimForInsert =
      intent.unitId || firstRow?.birim_id || personel?.birim_id || null
    if (
      (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) &&
      !birimForInsert
    ) {
      throw new Error('Zincir görev için birim bilgisi gerekli.')
    }

    rows = await insertIslerRows(supabase, [
      {
        ...payloadCommon,
        sorumlu_personel_id: firstWorkerId,
        birim_id: birimForInsert,
        baslama_tarihi: gorunurIso,
        son_tarih: sonIso,
        gorunur_tarih: gorunurIso,
      },
    ])

    const taskIds = rows.map((r) => r.id).filter(Boolean)
    if (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
      const gorevRows = taskIds.flatMap((taskId) =>
        zincirGorevSira.map((pid, i) => ({
          is_id: taskId,
          adim_no: i + 1,
          personel_id: pid,
          durum: i === 0 ? 'aktif' : 'sira_bekliyor',
        })),
      )
      const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
      if (zgErr) throw zgErr
    }

    if (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY) {
      const onayRows = taskIds.flatMap((taskId) =>
        zincirOnaySira.map((pid, i) => ({
          is_id: taskId,
          adim_no: i + 1,
          onaylayici_personel_id: pid,
          durum: TASK_STATUS.ASSIGNED,
        })),
      )
      const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
      if (zoErr) throw zoErr
    }
  } else {
    const assigneeIds = (
      intent.assigneeIds?.length
        ? intent.assigneeIds
        : intent.personId
          ? [String(intent.personId)]
          : []
    ).filter((id) => String(id) !== String(atayanPersonelId))

    if (!assigneeIds.length) throw new Error('Atanacak kişi seçilmedi.')

    const usePoolGrup = assigneeIds.length > 1 && !op.bireysel && mode !== 'sablon_gorev'
    const grupId = usePoolGrup ? crypto.randomUUID() : null

    const payloads = assigneeIds.map((aid) => {
      const row = findPerson(personnel, aid)
      return {
        ...payloadCommon,
        sorumlu_personel_id: aid,
        birim_id: row?.birim_id || intent.unitId || personel?.birim_id || null,
        baslama_tarihi: gorunurIso,
        son_tarih: sonIso,
        gorunur_tarih: gorunurIso,
        grup_id: grupId,
      }
    })

    rows = await insertIslerRows(supabase, payloads)
  }

  const taskIds = rows.map((r) => r.id).filter(Boolean)
  const primaryId = taskIds[0]

  if (projeGorevId && primaryId) {
    try {
      await linkProjectTaskToOperational(projeGorevId, primaryId)
    } catch (linkErr) {
      console.error('proje görev bağlantısı', linkErr)
    }
  }

  return {
    ok: true,
    taskIds,
    primaryId,
    title: titleTrim,
    mode,
    message:
      taskIds.length > 1
        ? `${taskIds.length} görev başarıyla atandı.`
        : projeGorevId
          ? 'Görev atandı ve proje planına bağlandı.'
          : 'Görev başarıyla atandı.',
  }
}
