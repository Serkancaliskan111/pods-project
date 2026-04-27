import { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { isZincirGorevTuru, isZincirOnayTuru } from '../../../lib/zincirTasks.js'
import { TASK_STATUS } from '../../../lib/taskStatus.js'

const supabase = getSupabase()

export default function TaskShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const scopeReady = isSystemAdmin || personel?.scopeReady !== false
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [company, setCompany] = useState(null)
  const [person, setPerson] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [chainGorevSteps, setChainGorevSteps] = useState([])
  const [chainOnaySteps, setChainOnaySteps] = useState([])
  const [chainNameMap, setChainNameMap] = useState({})
  const [expandedChainPerson, setExpandedChainPerson] = useState(null)
  const [rejectingStepId, setRejectingStepId] = useState(null)
  const permissions = profile?.yetkiler || {}
  const canRejectChainStep =
    isSystemAdmin ||
    permissions?.gorev_onayla === true ||
    permissions?.denetim?.reddet === true ||
    permissions?.['denetim.reddet'] === true ||
    permissions?.is_admin === true ||
    permissions?.is_manager === true

  useEffect(() => {
    const load = async () => {
      if (!id) return
      setLoading(true)
      try {
        const [{ data: job, error: jobErr }] = await Promise.all([
          supabase.from('isler').select('*').eq('id', id).single(),
        ])

        if (jobErr || !job) {
          console.error(jobErr)
          toast.error('Görev detayları yüklenemedi')
          return
        }

        if (!isSystemAdmin && currentCompanyId) {
          if (String(job.ana_sirket_id) !== String(currentCompanyId)) {
            toast.error('Bu göreve erişim yetkiniz yok')
            navigate('/unauthorized', { replace: true })
            return
          }
          if (
            scopeReady &&
            accessibleUnitIds &&
            accessibleUnitIds.length &&
            job.birim_id &&
            !accessibleUnitIds.some(
              (uid) => String(uid) === String(job.birim_id),
            )
          ) {
            toast.error('Bu göreve erişim yetkiniz yok')
            navigate('/unauthorized', { replace: true })
            return
          }
        }

        setTask(job)

        setChainGorevSteps([])
        setChainOnaySteps([])
        if (job?.id && isZincirGorevTuru(job.gorev_turu)) {
          const { data: zg } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id, adim_no, personel_id, durum, kanit_resim_ler, kanit_foto_durumlari, aciklama')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (zg?.length) {
            setChainGorevSteps(zg)
            const ids = [...new Set(zg.map((r) => r.personel_id).filter(Boolean))]
            if (ids.length) {
              const { data: people } = await supabase
                .from('personeller')
                .select('id, ad, soyad')
                .in('id', ids)
              const m = {}
              ;(people || []).forEach((p) => {
                m[p.id] = p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)
              })
              setChainNameMap(m)
            }
          }
        }
        if (job?.id && isZincirOnayTuru(job.gorev_turu)) {
          const { data: zo } = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id, adim_no, onaylayici_personel_id, durum, onaylandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (zo?.length) {
            setChainOnaySteps(zo)
            const ids = [...new Set(zo.map((r) => r.onaylayici_personel_id).filter(Boolean))]
            if (ids.length) {
              const { data: people } = await supabase
                .from('personeller')
                .select('id, ad, soyad')
                .in('id', ids)
              setChainNameMap((prev) => {
                const m = { ...prev }
                ;(people || []).forEach((p) => {
                  m[p.id] = p.ad && p.soyad ? `${p.ad} ${p.soyad}` : String(p.id)
                })
                return m
              })
            }
          }
        }

        if (job.ana_sirket_id) {
          const { data: comp } = await supabase
            .from('ana_sirketler')
            .select('id,ana_sirket_adi')
            .eq('id', job.ana_sirket_id)
            .maybeSingle()
          setCompany(comp || null)
        }

        if (job.sorumlu_personel_id) {
          const { data: p } = await supabase
            .from('personeller')
            .select('id,ad,soyad,email')
            .eq('id', job.sorumlu_personel_id)
            .maybeSingle()
          setPerson(p || null)
        }
      } catch (e) {
        console.error(e)
        toast.error('Görev detayları yüklenemedi')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [
    id,
    isSystemAdmin,
    currentCompanyId,
    scopeReady,
    JSON.stringify(accessibleUnitIds || []),
    navigate,
  ])

  const extractPhotoUrls = (job) => {
    if (!job) return []

    let raw =
      job.kanit_resim_ler ??
      job.kanit_fotograflari ??
      job.fotograflar ??
      job.gorseller ??
      job.resimler ??
      job.fotograf_url ??
      job.foto_url ??
      job.photo_url ??
      job.images ??
      job.image_urls ??
      job.media

    if (!raw) return []

    if (Array.isArray(raw)) return raw.filter(Boolean)

    if (typeof raw === 'string') {
      const trimmed = raw.trim()

      try {
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            return parsed.filter(Boolean)
          }
        }
      } catch (e) {
        // ignore, aşağıda devam
      }

      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }

      return [trimmed]
    }

    return []
  }

  const photoUrls = extractPhotoUrls(task)
  const isChainTask = isZincirGorevTuru(task?.gorev_turu)

  const description =
    task?.aciklama || task?.aciklama_metni || task?.gorev_aciklamasi || ''

  const rejectChainStep = useCallback(
    async (row) => {
      if (!row?.id || !task?.id) return
      if (!canRejectChainStep) {
        toast.error('Bu işlem için yetkiniz yok')
        return
      }
      const reason = window.prompt('Red nedeni girin:')
      if (reason == null) return
      const trimmed = String(reason || '').trim()
      if (!trimmed) {
        toast.error('Red nedeni boş olamaz')
        return
      }
      setRejectingStepId(row.id)
      try {
        const { error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .update({ durum: 'reddedildi', aciklama: trimmed })
          .eq('id', row.id)
        if (stepErr) throw stepErr

        const { error: taskErr } = await supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            red_nedeni: trimmed,
            sorumlu_personel_id: row.personel_id || task?.sorumlu_personel_id || null,
            zincir_aktif_adim: Number(row.adim_no) || 1,
          })
          .eq('id', task.id)
        if (taskErr) throw taskErr

        setChainGorevSteps((prev) =>
          prev.map((s) => (s.id === row.id ? { ...s, durum: 'reddedildi', aciklama: trimmed } : s)),
        )
        setTask((prev) =>
          prev
            ? {
                ...prev,
                durum: TASK_STATUS.REJECTED,
                red_nedeni: trimmed,
                sorumlu_personel_id: row.personel_id || prev.sorumlu_personel_id,
                zincir_aktif_adim: Number(row.adim_no) || prev.zincir_aktif_adim,
              }
            : prev,
        )
        toast.success('Adım reddedildi')
      } catch (e) {
        console.error(e)
        toast.error('Adım reddedilemedi')
      } finally {
        setRejectingStepId(null)
      }
    },
    [canRejectChainStep, task?.id, task?.sorumlu_personel_id],
  )

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/admin/tasks')}
        style={{
          marginBottom: 16,
          padding: '6px 12px',
          borderRadius: 9999,
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ← Görevlere Dön
      </button>

      {loading ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
      ) : !task ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Görev bulunamadı.
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -18px rgba(15,23,42,0.35)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                {task.baslik || 'Görev Detayı'}{' '}
                {task.gorev_turu && task.gorev_turu !== 'normal' ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#4338ca',
                      marginLeft: 6,
                    }}
                  >
                    {task.gorev_turu === 'zincir_gorev' && '🔗 Zincir görev'}
                    {task.gorev_turu === 'zincir_onay' && '🔗 Zincir onay'}
                    {task.gorev_turu === 'zincir_gorev_ve_onay' && '🔗 Zincir görev + onay'}
                  </span>
                ) : null}
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  marginTop: 4,
                }}
              >
                {company?.ana_sirket_adi || '—'} •{' '}
                {person
                  ? `${person.ad || ''} ${person.soyad || ''}`.trim() ||
                    person.email
                  : '—'}
              </p>
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#9ca3af',
              }}
            >
              Oluşturma:{' '}
              {task.created_at
                ? new Date(task.created_at).toLocaleString('tr-TR')
                : '-'}
            </div>
          </div>

          {/* Öz bilgiler */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              fontSize: 12,
              color: '#4b5563',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>Durum</div>
              <div>{task.durum || '-'}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>
                Başlama Tarihi
              </div>
              <div>
                {task.baslama_tarihi
                  ? new Date(task.baslama_tarihi).toLocaleString('tr-TR')
                  : '-'}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>
                Bitiş Tarihi
              </div>
              <div>
                {task.son_tarih
                  ? new Date(task.son_tarih).toLocaleString('tr-TR')
                  : '-'}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>Acil</div>
              <div>{task.acil ? 'Evet' : 'Hayır'}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>
                Fotoğraf Zorunlu
              </div>
              <div>{task.foto_zorunlu ? 'Evet' : 'Hayır'}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#6b7280' }}>
                Minimum Fotoğraf
              </div>
              <div>
                {typeof task.min_foto_sayisi === 'number'
                  ? task.min_foto_sayisi
                  : task.min_foto_sayisi || '-'}
              </div>
            </div>
          </div>

          {description ? (
            <div
              style={{
                fontSize: 13,
                color: '#4b5563',
              }}
            >
              {description}
            </div>
          ) : null}

          {chainGorevSteps.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                border: '1px solid #e0e7ff',
                backgroundColor: '#f5f3ff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3730a3', marginBottom: 10 }}>
                🔗 Zincir görev — personel bazlı adım takibi
              </div>
              {chainGorevSteps.map((row) => {
                const pid = row.personel_id
                const name = chainNameMap[pid] || pid
                const urls = Array.isArray(row.kanit_resim_ler) ? row.kanit_resim_ler : []
                const open = expandedChainPerson === row.id
                return (
                  <div
                    key={row.id}
                    style={{
                      marginBottom: 8,
                      borderRadius: 12,
                      border: '1px solid #c7d2fe',
                      backgroundColor: '#fff',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedChainPerson(open ? null : row.id)
                      }
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: 'none',
                        background: '#eef2ff',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#312e81',
                        cursor: 'pointer',
                      }}
                    >
                      {row.adim_no}. {name}{' '}
                      <span style={{ fontWeight: 500, color: '#64748b' }}>
                        ({row.durum || '—'})
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: 12 }}>
                        {row?.aciklama ? (
                          <div
                            style={{
                              marginBottom: 10,
                              padding: '8px 10px',
                              borderRadius: 10,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              fontSize: 12,
                              color: '#334155',
                            }}
                          >
                            Açıklama: {String(row.aciklama)}
                          </div>
                        ) : null}
                        {urls.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#64748b' }}>Fotoğraf yok</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {urls.map((url, uidx) => (
                              <div
                                key={url}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                  alignItems: 'center',
                                }}
                              >
                                <img
                                  src={url}
                                  alt=""
                                  style={{
                                    width: 100,
                                    height: 100,
                                    borderRadius: 12,
                                    objectFit: 'cover',
                                    border: '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setPreviewPhoto(url)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {canRejectChainStep ? (
                          <button
                            type="button"
                            onClick={() => rejectChainStep(row)}
                            disabled={rejectingStepId === row.id}
                            style={{
                              marginTop: 10,
                              fontSize: 12,
                              padding: '6px 10px',
                              borderRadius: 8,
                              border: 'none',
                              backgroundColor: '#dc2626',
                              color: '#fff',
                              cursor: rejectingStepId === row.id ? 'not-allowed' : 'pointer',
                              opacity: rejectingStepId === row.id ? 0.6 : 1,
                            }}
                          >
                            {rejectingStepId === row.id ? 'Reddediliyor...' : 'Bu kişiyi reddet'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {chainOnaySteps.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: 14,
                borderRadius: 16,
                border: '1px solid #dbeafe',
                backgroundColor: '#eff6ff',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginBottom: 8 }}>
                🔗 Zincir onay sırası
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                {chainOnaySteps.map((r) => (
                  <li key={r.id} style={{ marginBottom: 4 }}>
                    {r.adim_no}. {chainNameMap[r.onaylayici_personel_id] || r.onaylayici_personel_id} —{' '}
                    {r.durum}
                    {r.onaylandi_at
                      ? ` (${new Date(r.onaylandi_at).toLocaleString('tr-TR')})`
                      : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!isChainTask && photoUrls.length > 0 && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {photoUrls.map((url, idx) => (
                <img
                  key={`${task.id}-${idx}`}
                  src={url}
                  alt="Görev görseli"
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 14,
                    objectFit: 'cover',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPreviewPhoto(url)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
          }}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              border: '1px solid #1f2937',
              backgroundColor: '#020617',
            }}
          >
            <img
              src={previewPhoto}
              alt="Büyük görev görseli"
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

