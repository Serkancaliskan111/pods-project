/** URL/route seed — operasyonel onay bayraklarını doldur */
export function applySeedConfirmations(intent = {}) {
  const next = { ...intent }
  if (next.baslangic || next.bitis) {
    if (!next.baslamaSaat && !next.bitisSaat) {
      next.baslamaSaat = '09:00'
      next.bitisSaat = '18:00'
    } else if (!next.baslamaSaat) {
      next.baslamaSaat = '09:00'
    } else if (!next.bitisSaat) {
      next.bitisSaat = '18:00'
    }
    next.scheduleStart = true
    next.tarihConfirmed = true
  }
  if (next.operasyonel && typeof next.operasyonel.acil === 'boolean') {
    next.acilConfirmed = true
  }
  const op = next.operasyonel || {}
  if (
    next.sablonId ||
    op.foto_zorunlu ||
    op.video_zorunlu ||
    op.belge_zorunlu
  ) {
    next.kanitConfirmed = true
    if (op.min_foto_sayisi || op.min_video_sayisi || op.min_belge_sayisi) {
      next.kanitAdetConfirmed = true
    }
  }
  if (next.assigneeIds?.length || next.personId || next.zincirGorevIds?.length) {
    // atama dolu — gap sorma
  }
  return next
}
