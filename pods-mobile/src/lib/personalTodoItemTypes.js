export const TODO_MADDE_TIP = {
  METIN: 'metin',
  FOTO: 'foto',
  VIDEO: 'video',
}

/** Kullanıcı arayüzünde "madde" yerine */
export const TODO_ITEM_SINGULAR = 'Adım'
export const TODO_ITEM_PLURAL = 'Adımlar'

export const TODO_MADDE_TIP_OPTIONS = [
  {
    value: TODO_MADDE_TIP.METIN,
    label: 'İşaretle',
    shortLabel: 'İşaret',
    description: 'Tamamlayınca tik atılır',
  },
  {
    value: TODO_MADDE_TIP.FOTO,
    label: 'Fotoğraf kanıtı',
    shortLabel: 'Fotoğraf',
    description: 'Fotoğraf yüklenince tamamlanır',
  },
  {
    value: TODO_MADDE_TIP.VIDEO,
    label: 'Video kanıtı',
    shortLabel: 'Video',
    description: 'Video yüklenince tamamlanır',
  },
]

export function normalizeMaddeTip(raw) {
  const t = String(raw || '').toLowerCase()
  if (t === TODO_MADDE_TIP.FOTO || t === TODO_MADDE_TIP.VIDEO) return t
  return TODO_MADDE_TIP.METIN
}

export function getTodoItemTypeOption(tip) {
  const key = normalizeMaddeTip(tip)
  return TODO_MADDE_TIP_OPTIONS.find((o) => o.value === key) || TODO_MADDE_TIP_OPTIONS[0]
}

export function isMediaMaddeTip(tip) {
  return tip === TODO_MADDE_TIP.FOTO || tip === TODO_MADDE_TIP.VIDEO
}

export function maddeTipLabel(tip) {
  return getTodoItemTypeOption(tip).shortLabel
}

export function todoItemPlaceholder(tip) {
  const key = normalizeMaddeTip(tip)
  if (key === TODO_MADDE_TIP.FOTO) return 'Örn: Vitrin fotoğrafı'
  if (key === TODO_MADDE_TIP.VIDEO) return 'Örn: Alan turu videosu'
  return 'Örn: Tezgahları temizle…'
}

/** Medya adımı tamamlanabilir mi? */
export function canCompleteMadde(item) {
  if (!isMediaMaddeTip(item?.tip)) return true
  return !!item?.medyaYol
}

export function countPendingMedia(items) {
  return (items || []).filter((m) => isMediaMaddeTip(m.tip) && !m.medyaYol && !m.tamamlandi).length
}
