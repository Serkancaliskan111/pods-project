import { useContext, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Download,
  MessageSquare,
  QrCode,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

function randomCode() {
  const src = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 10; i += 1) {
    out += src[Math.floor(Math.random() * src.length)]
  }
  return out
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfWeek(date) {
  const d = startOfDay(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return d
}

function startOfMonth(date) {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

function fmtBucket(dt, mode) {
  const d = new Date(dt)
  if (mode === 'hourly') return `${String(d.getHours()).padStart(2, '0')}:00`
  if (mode === 'daily') return d.toLocaleDateString('tr-TR')
  if (mode === 'weekly') return `H${String(Math.ceil(d.getDate() / 7))} - ${d.toLocaleDateString('tr-TR', { month: 'short' })}`
  return d.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
}

function aggregateRatings(rows, mode) {
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

export default function CustomerRatingsPage() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []

  const [units, setUnits] = useState([])
  const [selectedUnitId, setSelectedUnitId] = useState('')
  const [qrRows, setQrRows] = useState([])
  const [selectedQrId, setSelectedQrId] = useState('')
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actioningQrId, setActioningQrId] = useState('')
  const [bucketMode, setBucketMode] = useState('daily')
  const [copied, setCopied] = useState(false)
  const [selectedQrDataUrl, setSelectedQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let q = supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null)
      if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q.order('birim_adi', { ascending: true })
      if (cancelled) return
      if (error) {
        console.error(error)
        toast.error('Birimler yüklenemedi')
        return
      }
      const scoped = (data || []).filter((u) => {
        if (isSystemAdmin) return true
        if (!accessibleUnitIds?.length) return true
        return accessibleUnitIds.some((id) => String(id) === String(u.id))
      })
      setUnits(scoped)
    })()
    return () => {
      cancelled = true
    }
  }, [currentCompanyId, isSystemAdmin, JSON.stringify(accessibleUnitIds || [])])

  const loadQrRows = async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('customer_unit_qr_links')
        .select('id,code,birim_id,aktif,created_at,birimler(birim_adi),ana_sirket_id')
      if (currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      setQrRows(data || [])
      if (data?.length) {
        if (!selectedQrId || !data.some((r) => String(r.id) === String(selectedQrId))) {
          setSelectedQrId(String(data[0].id))
        }
      } else {
        setSelectedQrId('')
      }
    } catch (e) {
      console.error(e)
      toast.error('QR listesi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQrRows()
  }, [currentCompanyId, selectedUnitId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!selectedQrId) {
        setRatings([])
        return
      }
      try {
        let { data, error } = await supabase
          .from('customer_unit_ratings')
          .select('id,qr_id,rating,yorum,created_at')
          .eq('qr_id', selectedQrId)
          .order('created_at', { ascending: false })
          .limit(5000)
        // `yorum` kolonu eski projeye eklenmemişse şemada yoktur (PostgREST 42703).
        // Bu durumda yorumsuz fallback select ile yüklemeye düşelim.
        if (error?.code === '42703') {
          const legacy = await supabase
            .from('customer_unit_ratings')
            .select('id,qr_id,rating,created_at')
            .eq('qr_id', selectedQrId)
            .order('created_at', { ascending: false })
            .limit(5000)
          data = legacy.data
          error = legacy.error
        }
        if (cancelled) return
        if (error) throw error
        setRatings(data || [])
      } catch (e) {
        console.error(e)
        toast.error('Puan verileri yüklenemedi')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedQrId])

  const stats = useMemo(() => {
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
  }, [ratings])

  const bucketRows = useMemo(
    () => aggregateRatings([...ratings].reverse(), bucketMode),
    [ratings, bucketMode],
  )

  // Sadece yorumlu (boş olmayan) en son değerlendirmeler.
  const recentComments = useMemo(() => {
    return ratings
      .filter((r) => String(r?.yorum || '').trim().length > 0)
      .slice(0, 25)
  }, [ratings])

  const createQr = async () => {
    if (!selectedUnitId) {
      toast.error('Önce birim seçin')
      return
    }
    if (!currentCompanyId && !isSystemAdmin) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }
    setSubmitting(true)
    try {
      const code = randomCode()
      const payload = {
        code,
        birim_id: selectedUnitId,
        ana_sirket_id:
          currentCompanyId ||
          units.find((u) => String(u.id) === String(selectedUnitId))?.ana_sirket_id ||
          null,
        olusturan_personel_id: personel?.id || null,
        aktif: true,
      }
      const { error } = await supabase.from('customer_unit_qr_links').insert(payload)
      if (error) throw error
      toast.success('QR oluşturuldu')
      await loadQrRows()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'QR oluşturulamadı')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedQrRow = useMemo(
    () => qrRows.find((r) => String(r.id) === String(selectedQrId)) || null,
    [qrRows, selectedQrId],
  )

  const normalizeBaseUrl = (raw) => {
    const src = String(raw || '').trim()
    if (!src) return ''
    const withProto = /^https?:\/\//i.test(src) ? src : `https://${src}`
    try {
      const u = new URL(withProto)
      return `${u.protocol}//${u.host}`
    } catch {
      return ''
    }
  }

  const buildRateUrl = (code) => {
    return `${window.location.origin}/rate/${encodeURIComponent(code)}`
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!selectedQrRow?.code) {
        setSelectedQrDataUrl('')
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(buildRateUrl(selectedQrRow.code), {
          width: 360,
          margin: 1,
        })
        if (!cancelled) setSelectedQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setSelectedQrDataUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedQrRow?.code])

  const downloadQrPdf = async (row) => {
    try {
      const targetUrl = buildRateUrl(row.code)
      const qrData = await QRCode.toDataURL(targetUrl, { width: 640, margin: 1 })
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      doc.setFontSize(16)
      doc.text('Müşteri Değerlendirme QR', 14, 18)
      doc.setFontSize(11)
      doc.text(`Birim: ${row?.birimler?.birim_adi || row.birim_id}`, 14, 26)
      doc.text(`Kod: ${row.code}`, 14, 32)
      doc.text(`Alan adı: ${window.location.origin}`, 14, 38)
      doc.addImage(qrData, 'PNG', 45, 45, 120, 120)
      doc.setFontSize(10)
      doc.text(targetUrl, 14, 180)
      doc.save(`qr-${row.code}.pdf`)
    } catch (e) {
      console.error(e)
      toast.error('PDF indirilemedi')
    }
  }

  const regenerateQr = async (row) => {
    if (!row?.birim_id) return
    setActioningQrId(String(row.id))
    try {
      const newCode = randomCode()
      const insertPayload = {
        code: newCode,
        birim_id: row.birim_id,
        ana_sirket_id: row.ana_sirket_id,
        olusturan_personel_id: personel?.id || null,
        aktif: true,
      }
      const { data: inserted, error: insErr } = await supabase
        .from('customer_unit_qr_links')
        .insert(insertPayload)
        .select('id')
        .single()
      if (insErr) throw insErr
      const { error: updErr } = await supabase
        .from('customer_unit_qr_links')
        .update({ aktif: false })
        .eq('id', row.id)
      if (updErr) throw updErr
      setSelectedQrId(String(inserted?.id || ''))
      toast.success('QR yeniden oluşturuldu. Eski QR pasife alındı.')
      await loadQrRows()
    } catch (e) {
      console.error(e)
      toast.error('QR yeniden oluşturulamadı')
    } finally {
      setActioningQrId('')
    }
  }

  const deleteQr = async (row) => {
    if (!row?.id) return
    const ok = window.confirm('Bu QR kalıcı silinsin mi? İlgili puan kayıtları da silinir.')
    if (!ok) return
    setActioningQrId(String(row.id))
    try {
      const { error } = await supabase
        .from('customer_unit_qr_links')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      toast.success('QR silindi')
      if (String(selectedQrId) === String(row.id)) setSelectedQrId('')
      await loadQrRows()
    } catch (e) {
      console.error(e)
      toast.error('QR silinemedi')
    } finally {
      setActioningQrId('')
    }
  }

  const copySelectedRateUrl = async () => {
    if (!selectedQrRow?.code) return
    try {
      await navigator.clipboard.writeText(buildRateUrl(selectedQrRow.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
      toast.success('Link kopyalandı')
    } catch {
      toast.error('Link kopyalanamadı')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6">
      <section className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/30 p-5 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Müşteri QR Değerlendirme</h1>
        <p className="mt-1 text-sm text-slate-500">
          Birim bazlı QR üretin, PDF indirin ve müşteri yıldız puanlarını saatlik/günlük/haftalık/aylık izleyin.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">Birim seçin</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.birim_adi}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createQr}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <QrCode className="h-4 w-4" />
            QR oluştur
          </button>
          <button
            type="button"
            onClick={() => void loadQrRows()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
        </div>
      </section>

      <section className="mb-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-slate-900">Oluşturulan QR'lar</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Yükleniyor...</p>
        ) : qrRows.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz QR yok.</p>
        ) : (
          <div className="grid gap-2">
            {qrRows.map((row) => (
              <div
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                  String(selectedQrId) === String(row.id)
                    ? 'border-indigo-300 bg-indigo-50/60'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setSelectedQrId(String(row.id))}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {row?.birimler?.birim_adi || row.birim_id}
                  </div>
                  <div className="text-xs text-slate-500">
                    Kod: {row.code} · {new Date(row.created_at).toLocaleString('tr-TR')}
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void downloadQrPdf(row)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                  <button
                    type="button"
                    disabled={actioningQrId === String(row.id)}
                    onClick={() => void regenerateQr(row)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Yeniden oluştur
                  </button>
                  <button
                    type="button"
                    disabled={actioningQrId === String(row.id)}
                    onClick={() => void deleteQr(row)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Seçili QR Önizleme</h3>
          {!selectedQrRow ? (
            <p className="text-sm text-slate-500">Listeden bir QR seçin.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Birim</div>
                <div className="text-sm font-semibold text-slate-900">
                  {selectedQrRow?.birimler?.birim_adi || selectedQrRow.birim_id}
                </div>
                <div className="mt-1 text-xs text-slate-500">Kod: {selectedQrRow.code}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                {selectedQrDataUrl ? (
                  <div className="mx-auto w-full max-w-[220px]">
                    <img
                      src={selectedQrDataUrl}
                      alt="QR önizleme"
                      className="h-auto w-full"
                    />
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-500">QR önizleme hazırlanıyor...</div>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="truncate text-xs text-slate-600">{buildRateUrl(selectedQrRow.code)}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void downloadQrPdf(selectedQrRow)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-4 w-4" />
                  PDF indir
                </button>
                <button
                  type="button"
                  onClick={() => void copySelectedRateUrl()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  Link
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
            Müşteri Yorumları
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {recentComments.length} yorum
          </span>
        </div>
        {!selectedQrId ? (
          <p className="text-sm text-slate-500">
            Listeden bir QR seçtiğinizde son yorumlar burada görünür.
          </p>
        ) : recentComments.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz açıklamalı bir değerlendirme yok.</p>
        ) : (
          <div className="grid gap-2">
            {recentComments.map((r) => {
              const stars = Math.max(1, Math.min(5, Number(r.rating) || 0))
              const tone =
                stars >= 4
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : stars === 3
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-rose-200 bg-rose-50/60'
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border px-3 py-2.5 ${tone}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3.5 w-3.5 ${
                            s <= stars
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                      <span className="ml-1.5 text-xs font-semibold text-slate-700">
                        {stars}/5
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {new Date(r.created_at).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                    {r.yorum}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-slate-900">Raporlar</h2>
        <div className="grid gap-2 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Ortalama</div>
            <div className="mt-0.5 text-lg font-bold text-slate-900">{stats.avg}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Bugün</div>
            <div className="mt-0.5 text-lg font-bold text-slate-900">{stats.day}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Bu hafta</div>
            <div className="mt-0.5 text-lg font-bold text-slate-900">{stats.week}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Bu ay</div>
            <div className="mt-0.5 text-lg font-bold text-slate-900">{stats.month}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Toplam</div>
            <div className="mt-0.5 text-lg font-bold text-slate-900">{stats.total}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {[
            ['hourly', 'Saatlik'],
            ['daily', 'Günlük'],
            ['weekly', 'Haftalık'],
            ['monthly', 'Aylık'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBucketMode(key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                bucketMode === key
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Periyot</th>
                <th className="px-3 py-2 text-left">Değerlendirme</th>
                <th className="px-3 py-2 text-left">Ortalama</th>
              </tr>
            </thead>
            <tbody>
              {bucketRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={3}>
                    Veri yok.
                  </td>
                </tr>
              ) : (
                bucketRows.map((r) => (
                  <tr key={r.bucket} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.bucket}</td>
                    <td className="px-3 py-2 text-slate-700">{r.count}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-100">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                        {r.avg}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
