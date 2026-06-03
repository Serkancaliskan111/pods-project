import { normalizePlanMeta } from './projectTaskPlan.js'

function mergeDateAndTime(datePart, timePart = '09:00') {
  const d = String(datePart || '').slice(0, 10)
  if (!d) return ''
  const t = String(timePart || '09:00').slice(0, 5)
  return `${d}T${t}:00`
}

/** Planlama görevinden operasyonel atama paneli URL parametreleri */
export function buildOperationalPrefillParams(task, { project, projectId } = {}) {
  if (!task) return {}
  const meta = normalizePlanMeta(task.plan_meta)
  const gorevTipi = task.gorev_tipi || 'normal'

  const params = {
    mode: gorevTipi,
    projeId: projectId,
    projeGorevId: task.id,
    baslik: task.baslik || '',
    baslangic: task.baslangic_tarihi?.slice?.(0, 10) || '',
    bitis: task.bitis_tarihi?.slice?.(0, 10) || '',
    aciklama: task.aciklama || '',
  }

  if (project?.ana_sirket_id) params.company = project.ana_sirket_id
  if (project?.birim_id) params.unitId = project.birim_id

  if (task.sorumlu_personel_id) params.personId = task.sorumlu_personel_id

  if (meta.sablonId) params.sablonId = meta.sablonId

  if (gorevTipi === 'normal' || gorevTipi === 'sablon_gorev') {
    if (meta.assigneeIds.length > 1) {
      params.assignees = meta.assigneeIds.join(',')
      params.cokluAtama = '1'
    } else if (meta.assigneeIds[0]) {
      params.personId = meta.assigneeIds[0]
    }
  }

  if (gorevTipi === 'zincir_gorev' || gorevTipi === 'zincir_gorev_ve_onay') {
    if (meta.zincirGorevIds.length) params.zincirGorev = meta.zincirGorevIds.join(',')
  }

  if (gorevTipi === 'zincir_onay' || gorevTipi === 'zincir_gorev_ve_onay') {
    if (meta.zincirOnayIds.length) params.zincirOnay = meta.zincirOnayIds.join(',')
    if (gorevTipi === 'zincir_onay' && meta.zincirOnayIds[0] && !params.personId) {
      params.personId = meta.zincirOnayIds[0]
    }
  }

  try {
    params.operasyonel = btoa(unescape(encodeURIComponent(JSON.stringify(meta.operasyonel))))
  } catch {
    /* ignore */
  }

  const op = meta.operasyonel
  if (op.acil) params.acil = '1'
  if (op.coklu_atama) params.cokluAtama = '1'
  if (op.bireysel === false) params.bireysel = '0'
  if (op.aciklama_zorunlu) params.aciklamaZorunlu = '1'
  if (op.foto_zorunlu) params.fotoZorunlu = '1'
  if (op.video_zorunlu) params.videoZorunlu = '1'
  if (op.ozel_gorev) params.ozelGorev = '1'
  if (op.puan) params.puan = String(op.puan)
  if (op.foto_zorunlu && op.min_foto_sayisi) params.minFoto = String(op.min_foto_sayisi)
  if (op.video_zorunlu) {
    params.minVideo = String(op.min_video_sayisi)
    params.maxVideoSn = String(op.max_video_suresi_sn)
  }

  if (gorevTipi === 'sirali_gorev' && meta.siraliAdimlar.length) {
    const steps = meta.siraliAdimlar.map((a, i) => ({
      adim_baslik: a.baslik || `${i + 1}. adım`,
      adim_aciklama: '',
      baslama_tarihi:
        i === 0
          ? mergeDateAndTime(task.baslangic_tarihi, '09:00')
          : '',
      bitis_tarihi: mergeDateAndTime(
        i === meta.siraliAdimlar.length - 1 ? task.bitis_tarihi : task.baslangic_tarihi,
        '18:00',
      ),
      puan: 0,
      personel_id: a.yapan_id || '',
      denetimci_personel_id: a.denetimci_id || '',
      acil: false,
      aciklama_zorunlu: false,
      foto_zorunlu: false,
      min_foto_sayisi: 1,
      video_zorunlu: false,
      min_video_sayisi: 1,
      max_video_suresi_sn: 60,
      referans_dosyalar: [],
    }))
    try {
      params.sirali = btoa(unescape(encodeURIComponent(JSON.stringify(steps))))
    } catch {
      /* ignore encoding errors */
    }
  }

  return params
}
