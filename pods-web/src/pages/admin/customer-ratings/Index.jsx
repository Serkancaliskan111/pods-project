import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Download,
  Eye,
  QrCode,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { pageSurfaceStyle } from '../../../lib/userUiPreferences'
import { buildRateUrl, randomCode } from './customerRatingsUtils'
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Section,
  Select,
  Spinner,
  StatusBadge,
  Text,
  ConfirmDialog,
} from '../../../ui'

const supabase = getSupabase()

export default function CustomerRatingsPage() {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []

  const [units, setUnits] = useState([])
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createUnitId, setCreateUnitId] = useState('')
  const [qrRows, setQrRows] = useState([])
  const [selectedQrId, setSelectedQrId] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actioningQrId, setActioningQrId] = useState('')
  const [listFilterUnitId, setListFilterUnitId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

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
  }, [currentCompanyId])

  const displayedQrRows = useMemo(() => {
    if (!listFilterUnitId) return qrRows
    return qrRows.filter((r) => String(r.birim_id) === String(listFilterUnitId))
  }, [qrRows, listFilterUnitId])

  const openCreateModal = (prefillUnitId = '') => {
    setCreateUnitId(prefillUnitId || listFilterUnitId || '')
    setCreateModalOpen(true)
  }

  const createQr = async () => {
    if (!createUnitId) {
      toast.error('Birim seçin')
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
        birim_id: createUnitId,
        ana_sirket_id:
          currentCompanyId ||
          units.find((u) => String(u.id) === String(createUnitId))?.ana_sirket_id ||
          null,
        olusturan_personel_id: personel?.id || null,
        aktif: true,
      }
      const { error } = await supabase.from('customer_unit_qr_links').insert(payload)
      if (error) throw error
      toast.success('QR oluşturuldu')
      setCreateModalOpen(false)
      await loadQrRows()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'QR oluşturulamadı')
    } finally {
      setSubmitting(false)
    }
  }

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
      toast.success('PDF indirildi')
    } catch (e) {
      console.error(e)
      toast.error('PDF indirilemedi')
    }
  }

  const executeDeleteQr = async () => {
    const row = deleteConfirm
    if (!row?.id) return
    setActioningQrId(String(row.id))
    try {
      const { error } = await supabase
        .from('customer_unit_qr_links')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      toast.success('QR silindi')
      if (String(selectedQrId) === String(row.id)) setSelectedQrId('')
      setDeleteConfirm(null)
      await loadQrRows()
    } catch (e) {
      console.error(e)
      toast.error('QR silinemedi')
    } finally {
      setActioningQrId('')
    }
  }

  return (
    <div className="min-h-full px-4 pb-12 pt-2 sm:px-6" style={pageSurfaceStyle}>
      <PageHeader
        title="Müşteri Anketi"
        subtitle="Birim bazlı QR kodları oluşturun; detay sayfasında puanları ve yorumları görün."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="accent"
              size="sm"
              iconLeft={<QrCode size={16} />}
              onClick={() => openCreateModal()}
            >
              QR oluştur
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<RefreshCw size={16} />}
              onClick={() => void loadQrRows()}
              loading={loading}
            >
              Yenile
            </Button>
          </div>
        }
      />

      <Modal
        open={createModalOpen}
        onClose={() => !submitting && setCreateModalOpen(false)}
        title="Yeni QR oluştur"
        size="sm"
      >
        <div className="px-5 pb-5 pt-1">
          <Text variant="body" className="mb-4 text-slate-600">
            Birim için müşteri değerlendirme QR kodu üretilir. Müşteriler 1–5 yıldız ve isteğe bağlı
            yorum bırakabilir.
          </Text>
          <Select
            label="Birim"
            value={createUnitId}
            onChange={(e) => setCreateUnitId(e.target.value)}
          >
            <option value="">Birim seçin…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.birim_adi}
              </option>
            ))}
          </Select>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => setCreateModalOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<QrCode size={16} />}
              loading={submitting}
              disabled={!createUnitId}
              onClick={() => void createQr()}
            >
              Oluştur
            </Button>
          </div>
        </div>
      </Modal>

      <Section
        className="mb-6"
        title="Oluşturulan QR kodları"
        subtitle="Detay, PDF ve silme işlemleri her satırdan yapılır."
        icon={<QrCode size={20} />}
        tone="primary"
        action={
          <Select
            value={listFilterUnitId}
            onChange={(e) => setListFilterUnitId(e.target.value)}
            className="!min-w-[160px] !py-2 !text-xs"
            aria-label="Birime göre filtrele"
          >
            <option value="">Tüm birimler</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.birim_adi}
              </option>
            ))}
          </Select>
        }
      >
        <Card padding="md" radius="2xl">
          {loading ? (
            <div className="flex justify-center py-14">
              <Spinner />
            </div>
          ) : displayedQrRows.length === 0 ? (
            <EmptyState
              icon={<QrCode size={40} strokeWidth={1.25} />}
              title="Henüz QR yok"
              description="QR oluştur ile birim için müşteri değerlendirme kodu üretin."
              actionLabel="QR oluştur"
              onAction={() => openCreateModal()}
            />
          ) : (
            <ul className="max-h-[min(520px,60vh)] space-y-2 overflow-y-auto pr-1">
              {displayedQrRows.map((row) => {
                const selected = String(selectedQrId) === String(row.id)
                const busy = actioningQrId === String(row.id)
                return (
                  <li key={row.id}>
                    <div
                      className={`rounded-2xl border p-3 transition ${
                        selected
                          ? 'border-primary-300 bg-primary-50/80 shadow-sm ring-1 ring-primary-200'
                          : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setSelectedQrId(String(row.id))}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Building2 size={14} className="shrink-0 text-slate-400" />
                              <Text variant="body" className="!font-bold truncate">
                                {row?.birimler?.birim_adi || row.birim_id}
                              </Text>
                            </div>
                            <Text variant="caption" className="mt-1 block font-mono text-slate-500">
                              {row.code}
                            </Text>
                            <Text variant="caption" className="mt-0.5 block text-slate-400">
                              {new Date(row.created_at).toLocaleString('tr-TR')}
                            </Text>
                          </div>
                          <StatusBadge tone={row.aktif ? 'success' : 'soft'}>
                            {row.aktif ? 'Aktif' : 'Pasif'}
                          </StatusBadge>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100/80 pt-3">
                        <Button
                          variant="primary"
                          size="sm"
                          iconLeft={<Eye size={14} />}
                          onClick={() => navigate(`/admin/customer-ratings/${row.id}`)}
                        >
                          Detay gör
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          iconLeft={<Download size={14} />}
                          onClick={() => void downloadQrPdf(row)}
                        >
                          PDF
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          iconLeft={<Trash2 size={14} />}
                          disabled={busy}
                          onClick={() => setDeleteConfirm(row)}
                        >
                          Sil
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </Section>
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => !actioningQrId && setDeleteConfirm(null)}
        title="QR kodunu sil"
        message="Bu QR kalıcı silinsin mi? İlgili puan kayıtları da silinir."
        confirmLabel="Sil"
        cancelLabel="İptal"
        variant="danger"
        loading={!!actioningQrId}
        onConfirm={() => void executeDeleteQr()}
      />
    </div>
  )
}
