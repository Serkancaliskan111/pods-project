/**
 * PostgREST URL filtresi: `gte.2026-04-10T21:00:00.000Z` içindeki `.000` ayrıştırmayı bozar → 400.
 * @param {Date} date
 * @returns {string}
 */
export function formatTimestampForFilter(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
