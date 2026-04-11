import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

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
  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [company, setCompany] = useState(null)
  const [person, setPerson] = useState(null)
  const [previewPhoto, setPreviewPhoto] = useState(null)

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

  const description =
    task?.aciklama || task?.aciklama_metni || task?.gorev_aciklamasi || ''

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
                {task.baslik || 'Görev Detayı'}
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

          {photoUrls.length > 0 && (
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

