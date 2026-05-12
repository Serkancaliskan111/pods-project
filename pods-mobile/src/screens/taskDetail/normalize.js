/** JSONB / düz obje için güvenli “object” görünümü */
export function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}
