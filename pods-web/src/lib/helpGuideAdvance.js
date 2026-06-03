/** Görev atama sihirbazı sekme sırası */
export const TASK_ASSIGN_FORM_STEPS = [
  'tur',
  'detaylar-temel',
  'detaylar-atama',
  'dosyalar',
  'adimlar',
  'zamanlama',
  'tekrarlama',
  'diger',
]

/** @type {Record<string, string>} */
const SELECTOR_FORM_STEP = {
  'task-assign-tabs': 'tur',
  'task-assign-mode': 'tur',
  'task-assign-temel': 'detaylar-temel',
  'task-assign-atama': 'detaylar-atama',
  'task-assign-dosyalar': 'dosyalar',
  'task-assign-diger': 'diger',
  'task-assign-diger-kanit': 'diger',
  'task-assign-diger-tamamlama': 'diger',
  'task-assign-zamanlama': 'zamanlama',
  'task-assign-continue': 'zamanlama',
  'task-assign-cancel': 'zamanlama',
  'task-assign-submit': 'zamanlama',
}

/**
 * @param {string | undefined} selector
 */
export function requiredFormStepForSelector(selector) {
  if (!selector) return null
  for (const [key, step] of Object.entries(SELECTOR_FORM_STEP)) {
    if (selector.includes(key)) return step
  }
  return null
}

/**
 * @returns {string | null}
 */
export function getActiveTaskAssignFormStep() {
  if (typeof document === 'undefined') return null
  return document.querySelector('[data-help-form-step]')?.getAttribute('data-help-form-step') || null
}

/**
 * @param {string} required
 * @param {string | null} active
 */
export function isTaskAssignFormStepReady(required, active) {
  if (!active) return false
  const reqIdx = TASK_ASSIGN_FORM_STEPS.indexOf(required)
  const actIdx = TASK_ASSIGN_FORM_STEPS.indexOf(active)
  if (reqIdx < 0 || actIdx < 0) return active === required
  return actIdx >= reqIdx
}

/**
 * Form sekmesine karşılık gelen kılavuz adım indeksini bulur.
 * @param {import('./helpGuides.js').HelpGuide | null | undefined} guide
 * @param {string} formStep
 */
export function guideStepIndexForFormStep(guide, formStep) {
  const steps = guide?.steps || []
  let match = -1
  for (let i = 0; i < steps.length; i++) {
    const req = requiredFormStepForSelector(steps[i].selector)
    if (req === formStep) match = i
  }
  if (match >= 0) return match

  let best = -1
  for (let i = 0; i < steps.length; i++) {
    const req = requiredFormStepForSelector(steps[i].selector)
    if (req && isTaskAssignFormStepReady(req, formStep)) best = i
  }
  return best
}

/** Kılavuz «İleri» serbest; görev atama turunda form senkronu otomatik yapılır. */
export function canAdvanceHelpGuideStep() {
  return { ok: true }
}

/**
 * @param {EventTarget | null} target
 */
export function isHelpGuideKeyboardTargetEditable(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return !!target.closest('[contenteditable="true"]')
}
