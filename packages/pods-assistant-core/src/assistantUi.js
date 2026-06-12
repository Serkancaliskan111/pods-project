export const HERO_GREETING = {
  title: 'Merhaba!',
  subtitle: 'Size bugün nasıl yardımcı olabilirim?',
  hint: 'Görev oluşturma, atama, zincir ve şablon — doğal dilde yazmanız yeterli.',
}

export function getSuggestionChips(canAssignTask = true) {
  if (!canAssignTask) {
    return ['Bugünkü iş planım', 'Kendime kontrol görevi', 'Yarın için hatırlatma']
  }
  return [
    'Yarın ekibe depo sayımı ata',
    'Şablonlu hijyen kontrolü planla',
    'Zincir görev: sırayla devret',
    'Sıralı görev + denetimci',
    'Acil görev, fotoğraf zorunlu',
  ]
}
