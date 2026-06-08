/** Mesaj id’sinden deterministik dalga formu (her ses balonu aynı kalır). */
export function seedWaveformBars(seed, count = 40) {
  const s = String(seed ?? 'voice')
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  const bars = []
  for (let i = 0; i < count; i += 1) {
    h = (h * 1103515245 + 12345 + i) | 0
    const n = Math.abs(h % 100) / 100
    bars.push(0.12 + n * 0.88)
  }
  return bars
}

/** iOS metering dB → 0..1 */
export function normalizeAudioMeter(metering) {
  if (metering == null || Number.isNaN(metering)) return 0.08
  const clamped = Math.max(-60, Math.min(0, Number(metering)))
  return 0.08 + ((clamped + 60) / 60) * 0.92
}

export function pushMeterSample(prev, value, maxLen = 48) {
  const next = [...(prev || []), Math.max(0.06, Math.min(1, value))]
  if (next.length > maxLen) return next.slice(next.length - maxLen)
  return next
}

export function padWaveformBars(bars, count = 40) {
  const src = bars?.length ? bars : [0.2]
  if (src.length >= count) return src.slice(0, count)
  const out = [...src]
  while (out.length < count) {
    out.push(src[out.length % src.length] * (0.85 + (out.length % 5) * 0.03))
  }
  return out
}
