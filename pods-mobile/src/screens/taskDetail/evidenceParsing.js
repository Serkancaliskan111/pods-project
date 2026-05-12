import { isSiraliGorevTuru } from '../../lib/zincirTasks'
import { normalizeJsonObject } from './normalize'

/**
 * Şablonsuz kanıt: sıralı görevde aktif adımın `adim_istenenler.kanit` kullanılır.
 * Zincir görevde çoğu kayıtta adım satırında kanıt yoktur (`adim_istenenler` sıklıkla []);
 * foto/video kolonları ana `isler` satırındadır (web oluşturma ile uyumlu).
 */
export function resolveAdhocKanitRules(task, chainStepRow) {
  const isSirali = isSiraliGorevTuru(task?.gorev_turu)
  if (isSirali && chainStepRow) {
    const ist = normalizeJsonObject(chainStepRow.adim_istenenler)
    const knt = normalizeJsonObject(ist.kanit)
    return {
      minFoto: Number(knt.min_foto_sayisi) || 0,
      fotoZorunlu: !!knt.foto_zorunlu,
      minVideo: Number(knt.min_video_sayisi) || 0,
      videoZorunlu: !!knt.video_zorunlu,
      maxVideoSn: Math.min(60, Math.max(5, Number(knt.max_video_suresi_sn) || 60)),
      aciklamaZorunlu: !!ist.aciklama_zorunlu,
    }
  }
  return {
    minFoto: Number(task?.min_foto_sayisi) || 0,
    fotoZorunlu: !!task?.foto_zorunlu,
    minVideo: Number(task?.min_video_sayisi) || 0,
    videoZorunlu: !!task?.video_zorunlu,
    maxVideoSn: Math.min(60, Math.max(5, Number(task?.max_video_suresi_sn) || 60)),
    aciklamaZorunlu: !!task?.aciklama_zorunlu,
  }
}

export function extractPhotoUrls(task) {
  if (!task) return []
  const raw = task.kanit_resim_ler ?? task.kanit_fotograflari ?? task.fotograflar ?? task.images
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string') {
    const t = raw.trim()
    try {
      if (t.startsWith('[') && t.endsWith(']')) {
        const parsed = JSON.parse(t)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      }
    } catch {
      // ignore
    }
    return t.includes(',') ? t.split(',').map((x) => x.trim()).filter(Boolean) : [t]
  }
  return []
}

export function normalizeKanitVideoEntry(v) {
  if (v == null) return null
  if (typeof v === 'string') {
    const u = v.trim()
    return u ? { url: u } : null
  }
  if (typeof v === 'object') {
    const u = v.url ?? v.uri ?? v.src ?? v.path ?? v.video_url ?? null
    const su = u != null ? String(u).trim() : ''
    if (!su) return null
    const ds = v.duration_sec ?? v.durationSec ?? v.duration
    return {
      url: su,
      duration_sec:
        ds != null && Number.isFinite(Number(ds))
          ? Number(ds)
          : null,
    }
  }
  return null
}

export function extractKanitVideoRows(taskOrRow) {
  const raw =
    taskOrRow?.kanit_videolar ??
    taskOrRow?.videolar ??
    taskOrRow?.videos ??
    taskOrRow?.video_urls ??
    taskOrRow?.video_url ??
    null
  if (raw == null) return []
  let arr = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) arr = parsed
      else if (typeof parsed === 'string' || (typeof parsed === 'object' && parsed)) arr = [parsed]
    } catch {
      arr = [t]
    }
  } else if (typeof raw === 'object') {
    arr = [raw]
  }
  return arr.map(normalizeKanitVideoEntry).filter(Boolean)
}
