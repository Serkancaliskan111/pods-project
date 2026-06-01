import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import getSupabase from '../../../lib/supabaseClient'
import { enrichRatingsWithMediaUrls } from '../../../lib/customerRatingMediaUrls'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { cubicle } from '../../../theme/cubicle.js'
import { pageSurfaceStyle } from '../../../lib/userUiPreferences'
import {
  BUCKET_MODES,
  BucketChart,
  StarRow,
  aggregateRatings,
  buildRateUrl,
  computeRatingStats,
  fetchQrLink,
  fetchRatingsForQr,
  randomCode,
} from './customerRatingsUtils'
import RatingPhotoPreview from './RatingPhotoPreview'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  MetricCard,
  PageHeader,
  Section,
  Spinner,
  StatusBadge,
  Table,
  TableBody,
  TableHead,
  TableRow,
  Td,
  Text,
  Th,
  ConfirmDialog,
} from '../../../ui'

const supabase = getSupabase()

export default function CustomerRatingShowPage() {
  const { qrId } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id

  const [qrRow, setQrRow] = useState(null)
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [bucketMode, setBucketMode] = useState('daily')
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [previewOpen, setPreviewOpen] = useState(true)

  const load = async () => {
    if (!qrId) return
    setLoading(true)
    try {
      const row = await fetchQrLink(supabase, qrId, currentCompanyId)
      if (!row) {
        setQrRow(null)
        setRatings([])
        return
      }
      setQrRow(row)
      const list = await fetchRatingsForQr(supabase, qrId)
      setRatings(await enrichRatingsWithMediaUrls(supabase, list))
    } catch (e) {
      console.error(e)
      toast.error('QR detayı yüklenemedi')
      setQrRow(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [qrId, currentCompanyId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!qrRow?.code) {
        setQrDataUrl('')
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(buildRateUrl(qrRow.code), {
          width: 360,
          margin: 1,
        })
        if (!cancelled) setQrDataUrl(dataUrl)
      } catch {
        if (!cancelled) setQrDataUrl('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [qrRow?.code])

  const stats = useMemo(() => computeRatingStats(ratings), [ratings])
  const bucketRows = useMemo(
    () => aggregateRatings([...ratings].reverse(), bucketMode),
    [ratings, bucketMode],
  )
  const recentFeedback = useMemo(
    () =>
      ratings
        .filter(
          (r) =>
            String(r?.yorum || '').trim().length > 0 ||
            r.foto_path ||
            r.video_path,
        )
        .slice(0, 25),
    [ratings],
  )

  const downloadQrPdf = async () => {
    if (!qrRow) return
    try {
      const targetUrl = buildRateUrl(qrRow.code)
      const qrData = await QRCode.toDataURL(targetUrl, { width: 640, margin: 1 })
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      doc.setFontSize(16)
      doc.text('Müşteri Değerlendirme QR', 14, 18)
      doc.setFontSize(11)
      doc.text(`Birim: ${qrRow?.birimler?.birim_adi || qrRow.birim_id}`, 14, 26)
      doc.text(`Kod: ${qrRow.code}`, 14, 32)
      doc.text(`Alan adı: ${window.location.origin}`, 14, 38)
      doc.addImage(qrData, 'PNG', 45, 45, 120, 120)
      doc.setFontSize(10)
      doc.text(targetUrl, 14, 180)
      doc.save(`qr-${qrRow.code}.pdf`)
      toast.success('PDF indirildi')
    } catch (e) {
      console.error(e)
      toast.error('PDF indirilemedi')
    }
  }

  const regenerateQr = async () => {
    if (!qrRow?.birim_id) return
    setActioning(true)
    try {
      const newCode = randomCode()
      const insertPayload = {
        code: newCode,
        birim_id: qrRow.birim_id,
        ana_sirket_id: qrRow.ana_sirket_id,
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
        .eq('id', qrRow.id)
      if (updErr) throw updErr
      toast.success('QR yenilendi. Eski kod pasife alındı.')
      navigate(`/admin/customer-ratings/${inserted.id}`, { replace: true })
    } catch (e) {
      console.error(e)
      toast.error('QR yeniden oluşturulamadı')
    } finally {
      setActioning(false)
    }
  }

  const executeDeleteQr = async () => {
    if (!qrRow?.id) return
    setActioning(true)
    try {
      const { error } = await supabase.from('customer_unit_qr_links').delete().eq('id', qrRow.id)
      if (error) throw error
      toast.success('QR silindi')
      navigate('/admin/customer-ratings')
    } catch (e) {
      console.error(e)
      toast.error('QR silinemedi')
    } finally {
      setActioning(false)
      setDeleteOpen(false)
    }
  }

  const copyRateUrl = async () => {
    if (!qrRow?.code) return
    try {
      await navigator.clipboard.writeText(buildRateUrl(qrRow.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
      toast.success('Link kopyalandı')
    } catch {
      toast.error('Link kopyalanamadı')
    }
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center px-4"
        style={pageSurfaceStyle}
      >
        <Spinner />
      </div>
    )
  }

  if (!qrRow) {
    return (
      <div className="min-h-full px-4 pb-12 pt-2 sm:px-6" style={pageSurfaceStyle}>
        <Card padding="lg" radius="2xl" className="mt-8">
          <EmptyState
            title="QR bulunamadı"
            description="Kayıt silinmiş veya erişim yetkiniz yok olabilir."
            actionLabel="Listeye dön"
            onAction={() => navigate('/admin/customer-ratings')}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full px-4 pb-12 pt-2 sm:px-6" style={pageSurfaceStyle}>
      <PageHeader
        title={qrRow?.birimler?.birim_adi || 'QR detayı'}
        subtitle={
          <span className="font-mono text-sm text-slate-500">{qrRow.code}</span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              iconLeft={<ArrowLeft size={16} />}
              onClick={() => navigate('/admin/customer-ratings')}
            >
              Listeye dön
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<RefreshCw size={16} />}
              onClick={() => void load()}
            >
              Yenile
            </Button>
          </div>
        }
      />

      <Card padding="md" radius="2xl" className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-400" />
              <Text variant="body" className="!font-bold">
                {qrRow?.birimler?.birim_adi || qrRow.birim_id}
              </Text>
              <StatusBadge tone={qrRow.aktif ? 'success' : 'soft'}>
                {qrRow.aktif ? 'Aktif' : 'Pasif'}
              </StatusBadge>
            </div>
            <Text variant="caption" className="mt-1 block text-slate-500">
              Oluşturulma: {new Date(qrRow.created_at).toLocaleString('tr-TR')}
            </Text>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              iconLeft={previewOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              onClick={() => setPreviewOpen((v) => !v)}
            >
              QR önizleme
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Download size={14} />}
              onClick={() => void downloadQrPdf()}
            >
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconLeft={copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              onClick={() => void copyRateUrl()}
            >
              Link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<ExternalLink size={14} />}
              onClick={() =>
                window.open(buildRateUrl(qrRow.code), '_blank', 'noopener,noreferrer')
              }
            >
              Form
            </Button>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<RotateCcw size={14} />}
              disabled={actioning}
              onClick={() => void regenerateQr()}
            >
              Yenile
            </Button>
            <Button
              variant="danger"
              size="sm"
              iconLeft={<Trash2 size={14} />}
              disabled={actioning}
              onClick={() => setDeleteOpen(true)}
            >
              Sil
            </Button>
          </div>
        </div>

        {previewOpen ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-center">
            <div className="flex shrink-0 justify-center rounded-lg border border-slate-100 bg-white p-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR önizleme" className="h-32 w-32" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center">
                  <Spinner />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Text variant="caption" className="mb-2 block text-slate-500">
                Müşteri değerlendirme adresi
              </Text>
              <Text variant="caption" className="break-all font-mono text-[11px] text-slate-600">
                {buildRateUrl(qrRow.code)}
              </Text>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Ortalama puan"
          value={stats.avg}
          tone="executiveAccent"
          icon={<Star size={20} className="fill-current" />}
        />
        <MetricCard label="Bugün" value={stats.day} tone="surface" />
        <MetricCard label="Bu hafta" value={stats.week} tone="surface" />
        <MetricCard label="Bu ay" value={stats.month} tone="surface" />
        <MetricCard label="Toplam değerlendirme" value={stats.total} tone="surface" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Müşteri geri bildirimleri"
          subtitle="Yorum, fotoğraf veya video içeren son kayıtlar"
          icon={<MessageSquare size={20} />}
          tone="accent"
          action={
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {recentFeedback.length}
            </span>
          }
        >
          <Card padding="md" radius="2xl">
            {recentFeedback.length === 0 ? (
              <EmptyState
                title="Geri bildirim yok"
                description="Müşteriler yorum, fotoğraf veya video eklediğinde burada listelenir."
              />
            ) : (
              <ul className="max-h-[min(480px,55vh)] space-y-2 overflow-y-auto pr-1">
                {recentFeedback.map((r) => {
                  const stars = Math.max(1, Math.min(5, Number(r.rating) || 0))
                  const tone = stars >= 4 ? 'success' : stars === 3 ? 'warning' : 'danger'
                  return (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StarRow value={stars} />
                          <StatusBadge tone={tone}>{stars}/5</StatusBadge>
                        </div>
                        <Text variant="caption">
                          {new Date(r.created_at).toLocaleString('tr-TR')}
                        </Text>
                      </div>
                      {r.yorum ? (
                        <Text variant="body" className="mt-2 whitespace-pre-wrap leading-relaxed">
                          {r.yorum}
                        </Text>
                      ) : null}
                      {r.foto_url ? <RatingPhotoPreview url={r.foto_url} /> : null}
                      {r.video_url ? (
                        <video
                          src={r.video_url}
                          controls
                          className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 bg-black"
                        />
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </Section>

        <Section
          title="Puan raporu"
          subtitle="Zaman aralığına göre özet"
          icon={<BarChart3 size={20} />}
          tone="primary"
        >
          <Card padding="md" radius="2xl">
            <div className="mb-4 flex flex-wrap gap-2">
              {BUCKET_MODES.map(({ key, label }) => (
                <Chip
                  key={key}
                  selected={bucketMode === key}
                  onClick={() => setBucketMode(key)}
                >
                  {label}
                </Chip>
              ))}
            </div>
            {bucketRows.length === 0 ? (
              <EmptyState
                title="Henüz veri yok"
                description="Bu QR için değerlendirme geldikçe grafik ve tablo dolacak."
              />
            ) : (
              <>
                <BucketChart rows={bucketRows} />
                <Table>
                  <TableHead>
                    <TableRow>
                      <Th>Periyot</Th>
                      <Th>Adet</Th>
                      <Th>Ortalama</Th>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {bucketRows.map((r) => (
                      <TableRow key={r.bucket}>
                        <Td className="font-semibold text-slate-800">{r.bucket}</Td>
                        <Td>{r.count}</Td>
                        <Td>
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
                            {r.avg}
                          </span>
                        </Td>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        </Section>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => !actioning && setDeleteOpen(false)}
        title="QR kodunu sil"
        message="Bu QR kalıcı silinsin mi? İlgili puan kayıtları da silinir."
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        loading={actioning}
        onConfirm={() => void executeDeleteQr()}
      />
    </div>
  )
}
