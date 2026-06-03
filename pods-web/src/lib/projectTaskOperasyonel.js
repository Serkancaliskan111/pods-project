export const DEFAULT_OPERASYONEL_OPTS = {
  coklu_atama: false,
  bireysel: true,
  acil: false,
  aciklama_zorunlu: false,
  foto_zorunlu: false,
  min_foto_sayisi: 1,
  video_zorunlu: false,
  min_video_sayisi: 1,
  max_video_suresi_sn: 60,
  ozel_gorev: false,
  puan: 0,
}

export function normalizeOperasyonelOpts(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}
  return {
    coklu_atama: !!s.coklu_atama,
    bireysel: s.bireysel !== false,
    acil: !!s.acil,
    aciklama_zorunlu: !!s.aciklama_zorunlu,
    foto_zorunlu: !!s.foto_zorunlu,
    min_foto_sayisi: Math.min(5, Math.max(1, Number(s.min_foto_sayisi) || 1)),
    video_zorunlu: !!s.video_zorunlu,
    min_video_sayisi: Math.min(3, Math.max(1, Number(s.min_video_sayisi) || 1)),
    max_video_suresi_sn: Math.min(60, Math.max(5, Number(s.max_video_suresi_sn) || 60)),
    ozel_gorev: !!s.ozel_gorev,
    puan: Math.max(0, Number(s.puan) || 0),
  }
}
