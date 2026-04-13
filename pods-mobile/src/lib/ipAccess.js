export function normalizeIpList(input) {
  const src = Array.isArray(input) ? input : []
  const seen = new Set()
  const out = []
  for (const raw of src) {
    const v = String(raw || '').trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export async function getClientPublicIp() {
  const endpoints = [
    'https://api64.ipify.org?format=json',
    'https://api.ipify.org?format=json',
    'https://ifconfig.me/all.json',
  ]
  for (const url of endpoints) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = await res.json()
      const ip = String(data?.ip || data?.ip_addr || '').trim()
      if (ip) return ip
    } catch {
      // continue
    }
  }
  return null
}

export function isIpAllowed(allowedIps, clientIp) {
  if (!clientIp) return false
  const list = normalizeIpList(allowedIps)
  if (!list.length) return false
  return list.some((ip) => ip === clientIp)
}
