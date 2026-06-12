/** Son kullanıcı mesajlarını atama/tarih bağlamı için birleştir */
import { isAssigneeCorrectionMessage, isBroadReassignMessage } from './unitAssignment'

export function recentUserTexts(messages = [], extra = '') {
  const fromHistory = (messages || [])
    .filter((m) => m?.role === 'user' && m?.text)
    .slice(-4)
    .map((m) => String(m.text).trim())
  const parts = [...fromHistory, String(extra || '').trim()].filter(Boolean)
  return parts.join(' ')
}

/** Atama gap'inde kısa yanıtları önceki mesajlarla birleştir */
export function buildAssignmentContextText(messages, currentText, expectedGap = '') {
  const current = String(currentText || '').trim()
  if (!current) return recentUserTexts(messages)

  const needsHistory =
    expectedGap === 'assignees' ||
    expectedGap === 'tarih' ||
    expectedGap.startsWith('person_ambiguous:') ||
    current.length < 80 ||
    isAssigneeCorrectionMessage(current) ||
    isBroadReassignMessage(current)

  if (!needsHistory) return current
  return recentUserTexts(messages, current)
}
