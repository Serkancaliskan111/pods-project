/**
 * RPC ile yazılan otomatik zaman çizelgesi notları — kullanıcıya gösterilmez.
 * İnsan tarafından yazılmış reddetme vb. metinler burada filtrelenmez.
 */
export function shouldShowTimelineNoteUi(note) {
  const n = String(note ?? '').trim()
  if (!n) return false
  const low = n.toLowerCase()
  const internalOnly = new Set([
    'completion',
    'resubmitted-completion',
    'resubmitted',
    'approve',
    'approve-group',
    'checklist-reject',
    'checklist-approve-all',
    'chain-approve-step',
  ])
  return !internalOnly.has(low)
}
