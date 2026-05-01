import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canApproveTaskDeletion } from '../../../lib/permissions.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'

const supabase = getSupabase()

export default function TaskDeletionRequests() {
  const navigate = useNavigate()
  const { profile } = useContext(AuthContext)
  const perms = profile?.yetkiler || {}
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [dialog, setDialog] = useState(null)

  const allowed = canApproveTaskDeletion(perms)

  const load = useCallback(async () => {
    if (!allowed) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('isler_silme_talepleri')
        .select('id,is_id,talep_aciklama,created_at,talep_eden_personel_id')
        .eq('durum', 'bekliyor')
        .order('created_at', { ascending: false })

      if (error) throw error

      const jobIds = [...new Set((data || []).map((r) => r.is_id).filter(Boolean))]
      let jobTitleMap = {}
      if (jobIds.length) {
        const { data: jobs } = await supabase.from('isler').select('id,baslik').in('id', jobIds)
        jobTitleMap = Object.fromEntries((jobs || []).map((j) => [j.id, j.baslik]))
      }

      const talepIds = [...new Set((data || []).map((r) => r.talep_eden_personel_id).filter(Boolean))]
      let nameMap = {}
      if (talepIds.length) {
        const { data: people } = await supabase
          .from('personeller')
          .select('id,ad,soyad')
          .in('id', talepIds)
        nameMap = Object.fromEntries(
          (people || []).map((p) => [
            p.id,
            p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id),
          ]),
        )
      }

      setRows(
        (data || []).map((r) => ({
          ...r,
          _requesterName: nameMap[r.talep_eden_personel_id] || '—',
          _jobTitle: jobTitleMap[r.is_id] || '—',
        })),
      )
    } catch (e) {
      console.error(e)
      toast.error('Talepler yüklenemedi')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [allowed])

  useEffect(() => {
    load()
  }, [load])

  const approveExecute = async (id) => {
    setBusyId(id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_onayla', { p_talep_id: id })
      if (error) throw error
      toast.success('İş silindi ve arşive alındı')
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Onay başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const rejectExecute = async (id, reasonTrimmed) => {
    setBusyId(id)
    try {
      const { error } = await supabase.rpc('rpc_is_silme_reddet', {
        p_talep_id: id,
        p_red_nedeni: reasonTrimmed || null,
      })
      if (error) throw error
      toast.success('Talep reddedildi')
      await load()
    } catch (e) {
      console.error(e)
      toast.error(e?.message || 'Red işlemi başarısız')
    } finally {
      setBusyId(null)
    }
  }

  const deletionDialogConfig = useMemo(() => {
    if (!dialog) return null
    if (dialog.type === 'approve') {
      return {
        title: 'İşi sil ve arşivle',
        message:
          'Bu işin silinmesini onaylamak istediğinize emin misiniz? İş kalıcı olarak silinir ve arşivlenir; bu işlem geri alınamaz.',
        confirmLabel: 'Evet, sil',
        variant: 'danger',
        reasonInput: false,
      }
    }
    return {
      title: 'Silme talebini reddet',
      message:
        'Bu silme talebini reddetmek istediğinize emin misiniz? İsterseniz aşağıya not düşebilirsiniz.',
      confirmLabel: 'Reddet',
      variant: 'default',
      reasonInput: true,
      reasonRequired: false,
      reasonLabel: 'Red nedeni (isteğe bağlı)',
      reasonPlaceholder: 'Kısa açıklama…',
    }
  }, [dialog])

  const handleDeletionDialogConfirm = (reason) => {
    if (!dialog?.id) return
    const { type, id } = dialog
    setDialog(null)
    if (type === 'approve') void approveExecute(id)
    else void rejectExecute(id, String(reason || '').trim() || undefined)
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#64748b' }}>Bu sayfa için iş silme onay yetkisi gerekir.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 32px 32px', backgroundColor: '#f3f4f6', minHeight: 'calc(100vh - 72px)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
        Bekleyen iş silme talepleri
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Onayladığınızda görev kalıcı olarak silinir ve arşivlenir.
      </p>

      {loading ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 20,
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            fontSize: 13,
            color: '#64748b',
          }}
        >
          Bekleyen talep yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                borderRadius: 14,
                border: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r._jobTitle}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Talep eden: <strong>{r._requesterName}</strong>
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Tarih:{' '}
                {r.created_at
                  ? new Date(r.created_at).toLocaleString('tr-TR')
                  : '—'}
              </div>
              {r.talep_aciklama ? (
                <div style={{ fontSize: 12, color: '#334155' }}>
                  Silme nedeni: {r.talep_aciklama}
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => r.is_id && navigate(`/admin/tasks/${r.is_id}`)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: r.is_id ? 'pointer' : 'not-allowed',
                    opacity: r.is_id ? 1 : 0.5,
                  }}
                >
                  Görevi aç
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => setDialog({ type: 'approve', id: r.id })}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: 'none',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: busyId === r.id ? 'not-allowed' : 'pointer',
                    opacity: busyId === r.id ? 0.6 : 1,
                  }}
                >
                  {busyId === r.id ? 'İşleniyor…' : 'Onayla ve sil'}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => setDialog({ type: 'reject', id: r.id })}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid #94a3b8',
                    backgroundColor: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busyId === r.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        key={dialog ? `${dialog.type}-${dialog.id}` : 'deletion-dialog-idle'}
        open={!!dialog}
        onClose={() => setDialog(null)}
        {...(deletionDialogConfig || {})}
        cancelLabel="İptal"
        onConfirm={handleDeletionDialogConfirm}
      />
    </div>
  )
}
