import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canManageStaff } from '../../../lib/permissions.js'
import { isUnitInScope } from '../../../lib/supabaseScope.js'

const supabase = getSupabase()

const schema = z.object({
  ad: z.string().min(1, 'Ad gerekli'),
  soyad: z.string().min(1, 'Soyad gerekli'),
  personel_kodu: z.string().min(1, 'Personel kodu gerekli'),
  ana_sirket_id: z.string().optional(),
  birim_id: z.string().optional().nullable(),
  rol_id: z.string().optional(),
  durum: z.boolean(),
})

export default function EditStaff() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const permissions = profile?.yetkiler || {}
  const allowStaffEdit = canManageStaff(permissions, isSystemAdmin)

  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadedEmail, setLoadedEmail] = useState('')
  const [kullaniciId, setKullaniciId] = useState(null)

  const { register, handleSubmit, watch, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      ad: '',
      soyad: '',
      personel_kodu: '',
      ana_sirket_id: '',
      birim_id: null,
      rol_id: '',
      durum: true,
    },
  })

  const watchCompany = watch('ana_sirket_id')

  useEffect(() => {
    if (!allowStaffEdit) {
      navigate('/unauthorized', { replace: true })
    }
  }, [allowStaffEdit, navigate])

  useEffect(() => {
    let q = supabase
      .from('ana_sirketler')
      .select('id,ana_sirket_adi')
      .is('silindi_at', null)
      .order('ana_sirket_adi')

    if (!isSystemAdmin && currentCompanyId) {
      q = q.eq('id', currentCompanyId)
    }

    q.then(({ data, error }) => {
      if (error) {
        console.error(error)
        toast.error('Şirketler yüklenemedi')
      } else {
        setCompanies(data || [])
      }
    })
  }, [isSystemAdmin, currentCompanyId])

  useEffect(() => {
    if (!watchCompany) {
      setUnits([])
      return
    }
    let q = supabase
      .from('birimler')
      .select('id,birim_adi')
      .eq('ana_sirket_id', watchCompany)
      .is('silindi_at', null)
      .order('birim_adi')

    if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
      q = q.in('id', accessibleUnitIds)
    }

    q.then(({ data, error }) => {
      if (error) {
        console.error(error)
        toast.error('Birimler yüklenemedi')
      } else {
        setUnits(data || [])
      }
    })
  }, [watchCompany, isSystemAdmin, accessibleUnitIds])

  useEffect(() => {
    if (!watchCompany) {
      setRoles([])
      return
    }
    supabase
      .from('roller')
      .select('id,rol_adi,ana_sirket_id')
      .or(`ana_sirket_id.eq.${watchCompany},ana_sirket_id.is.null`)
      .then(({ data, error }) => {
        if (error) {
          console.error(error)
          toast.error('Roller yüklenemedi')
        } else {
          setRoles(data || [])
        }
      })
  }, [watchCompany])

  useEffect(() => {
    if (!id || !allowStaffEdit) return

    let cancelled = false
    ;(async () => {
      setPageLoading(true)
      const { data: row, error } = await supabase
        .from('personeller')
        .select(
          'id,ad,soyad,email,personel_kodu,ana_sirket_id,birim_id,rol_id,durum,kullanici_id',
        )
        .eq('id', id)
        .is('silindi_at', null)
        .maybeSingle()

      if (cancelled) return

      if (error || !row) {
        console.error(error)
        toast.error('Personel bulunamadı')
        navigate('/admin/staff')
        setPageLoading(false)
        return
      }

      if (!isSystemAdmin) {
        if (currentCompanyId && row.ana_sirket_id !== currentCompanyId) {
          toast.error('Bu kayda erişim yetkiniz yok.')
          navigate('/unauthorized', { replace: true })
          setPageLoading(false)
          return
        }
        if (
          accessibleUnitIds &&
          accessibleUnitIds.length &&
          row.birim_id &&
          !isUnitInScope(accessibleUnitIds, row.birim_id)
        ) {
          toast.error('Bu kayda erişim yetkiniz yok.')
          navigate('/unauthorized', { replace: true })
          setPageLoading(false)
          return
        }
      }

      setLoadedEmail(row.email || '')
      setKullaniciId(row.kullanici_id || null)

      reset({
        ad: row.ad || '',
        soyad: row.soyad || '',
        personel_kodu: row.personel_kodu || '',
        ana_sirket_id: row.ana_sirket_id || '',
        birim_id: row.birim_id || null,
        rol_id: row.rol_id || '',
        durum: row.durum !== false && row.durum !== 'false',
      })

      setPageLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [
    id,
    allowStaffEdit,
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIds,
    navigate,
    reset,
  ])

  const onSubmit = async (vals) => {
    if (!id) return
    setSaving(true)
    try {
      const selectedRole = roles.find((r) => r.id === vals.rol_id)
      const roleName = selectedRole?.rol_adi
      if (!selectedRole) {
        toast.error('Lütfen geçerli bir rol seçin')
        setSaving(false)
        return
      }

      if (
        (roleName === 'YONETICI' || roleName === 'PERSONEL') &&
        (!vals.ana_sirket_id || !vals.birim_id)
      ) {
        toast.error(
          'Yönetici ve Personel için şirket ve birim seçimi zorunludur',
        )
        setSaving(false)
        return
      }

      if (
        (roleName === 'DENETIMCI' || roleName === 'SIRKET_SAHIBI') &&
        !vals.ana_sirket_id
      ) {
        toast.error('Denetimci ve Şirket Sahibi için şirket seçimi zorunludur')
        setSaving(false)
        return
      }

      const payload = {
        ad: vals.ad,
        soyad: vals.soyad,
        personel_kodu: vals.personel_kodu,
        ana_sirket_id: vals.ana_sirket_id || null,
        birim_id: vals.birim_id || null,
        rol_id: vals.rol_id,
        durum: vals.durum,
      }

      const { error: pErr } = await supabase
        .from('personeller')
        .update(payload)
        .eq('id', id)

      if (pErr) {
        console.error(pErr)
        toast.error(pErr.message || 'Güncelleme başarısız')
        setSaving(false)
        return
      }

      if (kullaniciId) {
        const { error: kErr } = await supabase
          .from('kullanicilar')
          .update({
            ad_soyad: `${vals.ad} ${vals.soyad}`.trim(),
          })
          .eq('id', kullaniciId)

        if (kErr) {
          console.warn('kullanicilar güncellenemedi', kErr)
          toast.warning(
            'Personel güncellendi; panel kullanıcı adı eşitlenemedi.',
          )
        } else {
          toast.success('Personel güncellendi')
        }
      } else {
        toast.success('Personel güncellendi')
      }
      navigate('/admin/staff')
    } catch (e) {
      console.error(e)
      toast.error(e.message || 'Hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const containerStyle = {
    padding: '32px',
    backgroundColor: '#f3f4f6',
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
  }

  const cardStyle = {
    width: '100%',
    maxWidth: 960,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    boxShadow: '0 18px 45px rgba(15,23,42,0.16)',
    border: '1px solid #e5e7eb',
  }

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#4b5563',
    marginBottom: 4,
  }

  const inputStyle = {
    width: '100%',
    borderRadius: 9999,
    border: '1px solid #e2e8f0',
    padding: '8px 12px',
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#f9fafb',
  }

  const sectionTitleStyle = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#9ca3af',
    marginBottom: 8,
  }

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 24,
    marginBottom: 20,
  }

  if (!allowStaffEdit) {
    return null
  }

  if (pageLoading) {
    return (
      <div style={containerStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', color: '#6b7280' }}>
          Yükleniyor...
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: '#0a1e42',
                letterSpacing: '-0.03em',
              }}
            >
              Personel Düzenle
            </h2>
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                marginTop: 4,
              }}
            >
              Kayıt bilgilerini güncelleyin. Giriş e-postası değiştirilmez;
              yeni hesap için personel silip yeniden ekleyin.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Kimlik</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Ad</label>
                <input
                  type="text"
                  style={inputStyle}
                  {...register('ad')}
                />
              </div>
              <div>
                <label style={labelStyle}>Soyad</label>
                <input
                  type="text"
                  style={inputStyle}
                  {...register('soyad')}
                />
              </div>
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>E-posta (giriş)</label>
                <input
                  type="email"
                  readOnly
                  value={loadedEmail}
                  style={{
                    ...inputStyle,
                    backgroundColor: '#f1f5f9',
                    color: '#64748b',
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Personel kodu</label>
                <input
                  type="text"
                  style={inputStyle}
                  {...register('personel_kodu')}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Organizasyon</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Şirket</label>
                <select style={inputStyle} {...register('ana_sirket_id')}>
                  <option value="">Şirket seçin</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Birim</label>
                <select style={inputStyle} {...register('birim_id')}>
                  <option value="">Birim seçin</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.birim_adi}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Rol</label>
                <select style={inputStyle} {...register('rol_id')}>
                  <option value="">Rol seçin</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.rol_adi}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ ...rowStyle, marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="durum" {...register('durum')} />
                <label
                  htmlFor="durum"
                  style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}
                >
                  Aktif personel
                </label>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/admin/staff')}
              style={{
                padding: '8px 16px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#e5e7eb',
                color: '#111827',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 18px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#0a1e42',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
