import { getGorevModuOption, GOREV_MODU_MODE_ICONS } from './gorevModuOptions'

export const TASK_DETAIL_LAYOUTS = {
  normal: 'audit',
  sablon_gorev: 'checklist',
  zincir_gorev: 'chain-exec',
  zincir_onay: 'chain-approve',
  zincir_gorev_ve_onay: 'chain-hybrid',
  sirali_gorev: 'sequential',
}

const COPY = {
  normal: {
    focusTitle: 'Standart görev',
    focusHint: 'Kanıt fotoğraf ve videolarını yükleyip görevi tamamlayın.',
    mainLabel: 'Kanıtlar',
  },
  sablon_gorev: {
    focusTitle: 'Şablon checklist',
    focusHint: 'Her madde için kanıt; yönetici kabul veya red verir.',
    mainLabel: 'Checklist',
  },
  zincir_gorev: {
    focusTitle: 'Zincir yürütme',
    focusHint: 'Sıradaki adımı tamamlayın; ekip üyeleri sırayla devralır.',
    mainLabel: 'Yürütme adımları',
  },
  zincir_onay: {
    focusTitle: 'Zincir onay',
    focusHint: 'Onaylayıcılar sırayla işlem yapar; görev kanıtı yoktur.',
    mainLabel: 'Onay hattı',
  },
  zincir_gorev_ve_onay: {
    focusTitle: 'Yürütme + onay',
    focusHint: 'Önce yürütme zinciri, ardından onay zinciri tamamlanır.',
    mainLabel: 'İki faz',
  },
  sirali_gorev: {
    focusTitle: 'Sıralı adım',
    focusHint: 'Her adımda yapan ve denetimci; adım kanıtları kartlarda.',
    mainLabel: 'Adımlar',
  },
}

export function getTaskDetailDesign(gorevTuru) {
  const opt = getGorevModuOption(gorevTuru)
  const key = opt.value
  const Icon = GOREV_MODU_MODE_ICONS[key] || GOREV_MODU_MODE_ICONS.normal
  const copy = COPY[key] || COPY.normal
  const accent = opt.color

  return {
    key,
    layout: TASK_DETAIL_LAYOUTS[key] || 'audit',
    accent,
    label: opt.label,
    sub: opt.sub,
    hint: opt.hint,
    Icon,
    ...copy,
    accentSoft: `${accent}18`,
    accentBorder: `${accent}40`,
  }
}
