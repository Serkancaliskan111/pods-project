export function getTaskTypeLabel(taskType) {
  const value = String(taskType || '').trim()
  if (!value) return '-'
  const labels = {
    normal: 'Normal',
    sablon_gorev: 'Şablon Görev',
    zincir_gorev: 'Zincir Görev',
    zincir_onay: 'Zincir Onay',
    zincir_gorev_ve_onay: 'Zincir Görev + Zincir Onay',
    sirali_gorev: 'Sıralı Görev',
  }
  if (labels[value]) return labels[value]
  return value
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}
