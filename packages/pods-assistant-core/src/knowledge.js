import { GOREV_MODU_OPTIONS } from './deps/gorevModuOptions.js'

export function createWelcomeMessage(canAssignTask, { aiOnline = false } = {}) {
  if (canAssignTask) {
    return {
      role: 'assistant',
      text: aiOnline
        ? 'Görevi kısaca yazın (kime, ne). Eksik bir şey varsa sorarım, tamamlanınca otomatik atarım.'
        : 'Görevi yazın (kime, ne). Eksikleri sorarım, tamamlanınca oluştururum.',
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
  const t = String(text || '').toLocaleLowerCase('tr').trim()
  if (!t) return false
  if (/^(yardım|help|modlar)$/.test(t)) return true
  if (/\b(görev\s*tür|gorev\s*tur|modların?\s+fark|ne\s+anlama\s+gel)/.test(t)) return true
  if (/^(nasıl\s+(kullan|yap|at|çalış)|nasil\s+(kullan|yap|at|calis))/.test(t)) return true
  if (/\b(yardım|help)\b/.test(t) && t.length < 48) return true
  return false
}
