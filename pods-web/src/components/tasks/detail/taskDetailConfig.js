import { GOREV_MODU_MODE_ICONS, getGorevModuOption } from '../../../lib/gorevModuOptions.js'

export const TASK_DETAIL_COMMON = {
  status: true,
  workStatus: true,
  meta: true,
  rules: false,
  timeline: true,
  notes: true,
  referenceMedia: true,
  actions: true,
}

export const TASK_DETAIL_BY_TYPE = {
  normal: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: true,
    evidence: true,
    evidenceFirst: true,
    checklist: false,
    chainGorev: false,
    chainOnay: false,
    siraliSteps: false,
  },
  sablon_gorev: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: true,
    checklist: true,
    checklistFirst: true,
    evidence: false,
    chainGorev: false,
    chainOnay: false,
    siraliSteps: false,
  },
  zincir_gorev: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: true,
    chainGorev: true,
    chainFirst: true,
    chainOnay: false,
    evidence: false,
    checklist: false,
    siraliSteps: false,
  },
  zincir_onay: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: true,
    chainOnay: true,
    chainFirst: true,
    chainGorev: false,
    evidence: false,
    checklist: false,
    siraliSteps: false,
  },
  zincir_gorev_ve_onay: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: true,
    chainGorev: true,
    chainOnay: true,
    chainFirst: true,
    evidence: false,
    checklist: false,
    siraliSteps: false,
  },
  sirali_gorev: {
    ...TASK_DETAIL_COMMON,
    hero: false,
    description: false,
    siraliSteps: true,
    siraliFirst: true,
    evidence: false,
    checklist: false,
    chainGorev: false,
    chainOnay: false,
  },
}

export function getTaskDetailConfig(gorevTuru) {
  const key = String(gorevTuru || 'normal').trim() || 'normal'
  return TASK_DETAIL_BY_TYPE[key] || TASK_DETAIL_BY_TYPE.normal
}

export function getTaskTypePresentation(gorevTuru) {
  const opt = getGorevModuOption(gorevTuru)
  const Icon = GOREV_MODU_MODE_ICONS[opt.value] || GOREV_MODU_MODE_ICONS.normal
  return { ...opt, Icon }
}
