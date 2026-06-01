import { isSiraliGorevTuru } from './zincirTasks.js'

function normalizeJsonObject(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** Şablonsuz kanıt kuralları — mobil TaskDetail ile uyumlu */
export function resolveAdhocKanitRules(task, chainStepRow) {
  if (isSiraliGorevTuru(task?.gorev_turu) && chainStepRow) {
    const ist = normalizeJsonObject(chainStepRow.adim_istenenler)
    const knt = normalizeJsonObject(ist.kanit)
    const fotoZorunlu = !!knt.foto_zorunlu
    const videoZorunlu = !!knt.video_zorunlu
    const minFoto = fotoZorunlu
      ? Math.max(1, Number(knt.min_foto_sayisi) || 1)
      : Number(knt.min_foto_sayisi) || 0
    return {
      minFoto,
      fotoZorunlu,
      minVideo: videoZorunlu
        ? Math.max(1, Number(knt.min_video_sayisi) || 1)
        : Number(knt.min_video_sayisi) || 0,
      videoZorunlu,
      maxVideoSn: Math.min(60, Math.max(5, Number(knt.max_video_suresi_sn) || 60)),
      aciklamaZorunlu: !!ist.aciklama_zorunlu,
      showVideoSection: fotoZorunlu ? videoZorunlu : videoZorunlu || true,
      showPhotoSection: fotoZorunlu || !videoZorunlu,
    }
  }
  const fotoZorunlu = !!task?.foto_zorunlu
  const videoZorunlu = !!task?.video_zorunlu
  const minFoto = fotoZorunlu
    ? Math.max(1, Number(task?.min_foto_sayisi) || 1)
    : Number(task?.min_foto_sayisi) || 0

  return {
    minFoto,
    fotoZorunlu,
    minVideo: videoZorunlu
      ? Math.max(1, Number(task?.min_video_sayisi) || 1)
      : Number(task?.min_video_sayisi) || 0,
    videoZorunlu,
    maxVideoSn: Math.min(60, Math.max(5, Number(task?.max_video_suresi_sn) || 60)),
    aciklamaZorunlu: !!task?.aciklama_zorunlu,
    /** Fotoğraf zorunlu görevde video alanı gösterilmez */
    showVideoSection: fotoZorunlu ? videoZorunlu : videoZorunlu || true,
    showPhotoSection: fotoZorunlu || !videoZorunlu,
  }
}
