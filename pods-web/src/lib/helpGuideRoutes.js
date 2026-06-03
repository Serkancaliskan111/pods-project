/**
 * Kılavuz adımlarında rota eşleşmesi (alt sayfalar dahil).
 * @param {string} pathname
 * @param {string} [route]
 */
export function helpRouteMatches(pathname, route) {
  if (!route) return true
  const p = (pathname || '/').replace(/\/$/, '') || '/'
  const r = route.replace(/\/$/, '') || '/'
  if (r === '/admin') return p === '/admin'
  return p === r || p.startsWith(`${r}/`)
}
