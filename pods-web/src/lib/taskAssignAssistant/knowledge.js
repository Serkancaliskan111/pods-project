import { GOREV_MODU_OPTIONS } from '../gorevModuOptions'

export function createWelcomeMessage(canAssignTask, { aiOnline = false } = {}) {
  if (canAssignTask) {
    return {
      role: 'assistant',
      text: aiOnline
        ? 'Pods AI hazır. Aşağıdaki önerilerden birini seçebilir veya kendi cümlenizi yazabilirsiniz.'
        : 'Görevinizi yazın; gerekirse adım adım tamamlarız.',
      isWelcome: true,
    }
  }

  return {
    role: 'assistant',
    text: 'Ne yapmak istediğinizi kısaca yazın; ekstra görev girişinizi hazırlayayım.',
    isWelcome: true,
  }
}

export function modeLabel(value) {
  return GOREV_MODU_OPTIONS.find((o) => o.value === value)?.label || value || '—'
}

export function explainMode(value) {
  const opt = GOREV_MODU_OPTIONS.find((o) => o.value === value)
  if (!opt) return 'Bilinmeyen görev türü.'
  return `${opt.label}: ${opt.hint}`
}

export function allModesHelp() {
  return GOREV_MODU_OPTIONS.map((o) => `• **${o.label}** — ${o.hint}`).join('\n')
}

export const HELP_TRIGGERS = [
  'yardım',
  'help',
  'görev tür',
  'gorev tur',
  'modlar',
  'ne anlama',
  'farkı',
  'farki',
  'nasıl',
  'nasil',
]

export function isHelpRequest(text) {
  const t = String(text || '').toLocaleLowerCase('tr')
  return HELP_TRIGGERS.some((k) => t.includes(k))
}
