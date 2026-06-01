import { Star } from 'lucide-react'
import { cubicle } from '../../../theme/cubicle.js'
import { Text } from '../../../ui'

export const BUCKET_MODES = [
  { key: 'hourly', label: 'Saatlik' },
  { key: 'daily', label: 'Günlük' },
  { key: 'weekly', label: 'Haftalık' },
  { key: 'monthly', label: 'Aylık' },
]

export function randomCode() {
  const src = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 10; i += 1) {
    out += src[Math.floor(Math.random() * src.length)]
  }
  return out
}

export function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function startOfWeek(date) {
  const d = startOfDay(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d
}

export function startOfMonth(date) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export function fmtBucket(dt, mode) {
  const d = new Date(dt)
  if (mode === 'hourly') return `${String(d.getHours()).padStart(2, '0')}:00`
  if (mode === 'daily') return d.toLocaleDateString('tr-TR')
  if (mode === 'weekly') {
    return `H${String(Math.ceil(d.getDate() / 7))} · ${d.toLocaleDateString('tr-TR', { month: 'short' })}`
  }
  return d.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
}

export function aggregateRatings(rows, mode) {
  const m = new Map()
  for (const row of rows || []) {
    const key = fmtBucket(row.created_at, mode)
    const cur = m.get(key) || { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += Number(row.rating) || 0
    m.set(key, cur)
  }
  return Array.from(m.entries()).map(([bucket, v]) => ({
    bucket,
    count: v.count,
    avg: Number((v.sum / Math.max(1, v.count)).toFixed(2)),
  }))
}

export function buildRateUrl(code) {
  return `${window.location.origin}/rate/${encodeURIComponent(code)}`
}

export function computeRatingStats(ratings) {
  const now = new Date()
  const sod = startOfDay(now).getTime()
  const sow = startOfWeek(now).getTime()
  const som = startOfMonth(now).getTime()
  let day = 0
  let week = 0
  let month = 0
  let sum = 0
  for (const r of ratings) {
    const ts = new Date(r.created_at).getTime()
    const val = Number(r.rating) || 0
    sum += val
    if (ts >= sod) day += 1
    if (ts >= sow) week += 1
    if (ts >= som) month += 1
  }
  return {
    day,
    week,
    month,
    total: ratings.length,
    avg: Number((sum / Math.max(1, ratings.length)).toFixed(2)),
  }
}

export function StarRow({ value, size = 'sm' }) {
  const stars = Math.max(0, Math.min(5, Number(value) || 0))
  const iconClass = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${stars} yıldız`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${iconClass} ${
            s <= stars ? 'fill-amber-400 text-amber-500' : 'text-slate-200'
          }`}
        />
      ))}
    </span>
  )
}

export function BucketChart({ rows }) {
  const maxCount = Math.max(1, ...rows.map((r) => r.count))
  if (!rows.length) return null
  return (
    <div className="mb-4 space-y-2">
      {rows.slice(-12).map((r) => (
        <div
          key={r.bucket}
          className="grid grid-cols-[minmax(72px,1fr)_minmax(0,2fr)_auto] items-center gap-3"
        >
          <Text variant="caption" className="truncate font-semibold text-slate-600">
            {r.bucket}
          </Text>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(8, Math.round((r.count / maxCount) * 100))}%`,
                backgroundColor: cubicle.todayBar,
              }}
            />
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            {r.avg}
          </span>
        </div>
      ))}
    </div>
  )
}

export async function fetchRatingsForQr(supabase, qrId) {
  let { data, error } = await supabase
    .from('customer_unit_ratings')
    .select('id,qr_id,rating,yorum,created_at,foto_path,video_path')
    .eq('qr_id', qrId)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error?.code === '42703') {
    const legacy = await supabase
      .from('customer_unit_ratings')
      .select('id,qr_id,rating,created_at')
      .eq('qr_id', qrId)
      .order('created_at', { ascending: false })
      .limit(5000)
    data = legacy.data
    error = legacy.error
  }
  if (error) throw error
  return data || []
}

export async function fetchQrLink(supabase, qrId, currentCompanyId) {
  let q = supabase
    .from('customer_unit_qr_links')
    .select('id,code,birim_id,aktif,created_at,birimler(birim_adi),ana_sirket_id')
    .eq('id', qrId)
  if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data
}
