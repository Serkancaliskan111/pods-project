import { getGorevModuOption, GOREV_MODU_MODE_ICONS } from '../../../lib/gorevModuOptions.js'
import { cubicle } from '../../../theme/cubicle.js'

/** Görev detay — Cubicle / PODS web ile hizalı, türe göre layout */
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
    focusTitle: 'Denetim odaklı görünüm',
    focusHint: 'Tamamlama kanıtları ön planda; fotoğraf ve videoları büyük galeride inceleyin.',
    mainLabel: 'Kanıt inceleme',
  },
  sablon_gorev: {
    focusTitle: 'Şablon checklist denetimi',
    focusHint: 'Her madde ayrı kanıt; kabul veya red ile görevi sonuçlandırın.',
    mainLabel: 'Madde denetimi',
  },
  zincir_gorev: {
    focusTitle: 'Zincir yürütme',
    focusHint: 'Ekip sırayla devralır; aktif adım ve adım kanıtları aşağıda.',
    mainLabel: 'Yürütme akışı',
  },
  zincir_onay: {
    focusTitle: 'Zincir onay hattı',
    focusHint: 'Onaylayıcılar sırayla işlem yapar; görev seviyesinde kanıt yoktur.',
    mainLabel: 'Onay sırası',
  },
  zincir_gorev_ve_onay: {
    focusTitle: 'İki fazlı zincir',
    focusHint: 'Önce yürütme zinciri tamamlanır, ardından onay zinciri başlar.',
    mainLabel: 'Yürütme + onay',
  },
  sirali_gorev: {
    focusTitle: 'Sıralı adım görevi',
    focusHint: 'Her adımda yapan ve denetimci; adım kanıtları kartlarda.',
    mainLabel: 'Adım akışı',
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
    barColor: accent,
    label: opt.label,
    sub: opt.sub,
    hint: opt.hint,
    Icon,
    ...copy,
    heroBg: `linear-gradient(135deg, ${accent}18 0%, ${accent}06 42%, transparent 72%)`,
    heroBorder: `${accent}28`,
    iconBg: accent,
    cardRing: `${accent}22`,
    progressColor: accent,
    pageBg: cubicle.pageBg,
  }
}

export { cubicle as taskDetailCubicle }
