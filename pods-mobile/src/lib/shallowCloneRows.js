/**
 * JSON ile derin klon yerine satır dizileri için yeterli sığ kopya (liste görünümleri).
 */
export function shallowCloneRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => (row && typeof row === 'object' ? { ...row } : row))
}
