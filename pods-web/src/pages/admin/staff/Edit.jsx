import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canEditStaffRecord, canManageStaff } from '../../../lib/permissions.js'
import { isUnitInScope } from '../../../lib/supabaseScope.js'
import { replacePersonelBirimleri } from '../../../lib/personelBirimleri.js'
import StaffBirimMultiSelect from './StaffBirimMultiSelect.jsx'

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
  // Kullanıcı kendi kaydını düzenliyor mu? Bu durumda yalnız `rol.yonet`
  // yetkisi olsa da (personel.yonet olmasa bile) izin veriyoruz; ayrıca
  // birim/şirket scope kontrolünü de kendi kaydında atlayacağız.
  const isOwnRecord = !!(id && personel?.id && String(id) === String(personel.id))
  const allowStaffEdit = canEditStaffRecord(permissions, isSystemAdmin, {
    isOwnRecord,
  })
  // Sınırlı yetkili kullanıcı (yalnız rol.yonet) yalnızca kendi rolünü
  // değiştirebilsin diye diğer alanları salt-okunur kılıyoruz.
  const limitedSelfEditor =
    !isSystemAdmin && !canManageStaff(permissions, false) && isOwnRecord

  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadedEmail, setLoadedEmail] = useState('')
  const [kullaniciId, setKullaniciId] = useState(null)
  const [birimState, setBirimState] = useState({
    selectedIds: [],
    primaryId: null,
  })
  const prevCompanyRef = useRef(undefined)
  const hydratingRef = useRef(false)

  const { register, handleSubmit, watch, reset, setValue } = useForm({
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
    if (hydratingRef.current) {
      prevCompanyRef.current = watchCompany
      return
    }
    if (
      prevCompanyRef.current !== undefined &&
      prevCompanyRef.current !== watchCompany
    ) {
      setBirimState({ selectedIds: [], primaryId: null })
      setValue('birim_id', null, { shouldValidate: true })
    }
    prevCompanyRef.current = watchCompany
  }, [watchCompany, setValue])

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

      const { data: pbRows, error: pbErr } = await supabase
        .from('personel_birimleri')
        .select('birim_id,is_primary')
        .eq('personel_id', id)

      let loadedSelected = []
      let loadedPrimary = null
      if (!pbErr && Array.isArray(pbRows) && pbRows.length) {
        loadedSelected = [
          ...new Set(pbRows.map((r) => String(r.birim_id)).filter(Boolean)),
        ]
        const primRow = pbRows.find((r) => r.is_primary)
        loadedPrimary = primRow?.birim_id
          ? String(primRow.birim_id)
          : row.birim_id
            ? String(row.birim_id)
            : loadedSelected[0] || null
      } else {
        if (row.birim_id) {
          loadedSelected = [String(row.birim_id)]
          loadedPrimary = String(row.birim_id)
        }
      }
      setBirimState({
        selectedIds: loadedSelected,
        primaryId: loadedPrimary,
      })

      // Kendi kaydını düzenleyen kullanıcı için şirket/birim kapsamı engeline
      // takılma — `rol.yonet` yetkisiyle gelen kullanıcının kendi rolünü
      // değiştirebilmesi için bu kapı açık kalmalı.
      if (!isSystemAdmin && !isOwnRecord) {
        if (currentCompanyId && row.ana_sirket_id !== currentCompanyId) {
          toast.error('Bu kayda erişim yetkiniz yok.')
          navigate('/unauthorized', { replace: true })
          setPageLoading(false)
          return
        }
        if (accessibleUnitIds && accessibleUnitIds.length) {
          const scopeSeedIds =
            loadedSelected.length > 0
              ? loadedSelected
              : row.birim_id
                ? [String(row.birim_id)]
                : []
          const anySeedInScope = scopeSeedIds.some((bid) =>
            isUnitInScope(accessibleUnitIds, bid),
          )
          if (!anySeedInScope) {
            toast.error('Bu kayda erişim yetkiniz yok.')
            navigate('/unauthorized', { replace: true })
            setPageLoading(false)
            return
          }
        }
      }

      setLoadedEmail(row.email || '')
      setKullaniciId(row.kullanici_id || null)

      hydratingRef.current = true
      reset({
        ad: row.ad || '',
        soyad: row.soyad || '',
        personel_kodu: row.personel_kodu || '',
        ana_sirket_id: row.ana_sirket_id || '',
        birim_id: loadedPrimary || row.birim_id || null,
        rol_id: row.rol_id || '',
        durum: row.durum !== false && row.durum !== 'false',
      })
      queueMicrotask(() => {
        hydratingRef.current = false
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

      // Sınırlı yetkili kullanıcı: yalnız `rol_id` güncellenir, diğer alanlar
      // göz ardı edilir. Birim/şirket doğrulamaları rol değişikliğine göre
      // tetiklenmez (kullanıcı mevcut organizasyon bilgisini düzenlemiyor).
      if (limitedSelfEditor) {
        const { error: pErr } = await supabase
          .from('personeller')
          .update({ rol_id: vals.rol_id })
          .eq('id', id)
        if (pErr) {
          console.error(pErr)
          toast.error(pErr.message || 'Rol güncellenemedi')
          setSaving(false)
          return
        }
        toast.success('Rolünüz güncellendi')
        navigate('/admin')
        return
      }

      if (
        (roleName === 'YONETICI' || roleName === 'PERSONEL') &&
        (!vals.ana_sirket_id ||
          !birimState.selectedIds?.length ||
          !birimState.primaryId)
      ) {
        toast.error(
          'Yönetici ve Personel için şirket ve en az bir birim (birincil dahil) zorunludur',
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

      if (
        !isSystemAdmin &&
        accessibleUnitIds &&
        accessibleUnitIds.length &&
        birimState.selectedIds.some(
          (bid) => !bid || !isUnitInScope(accessibleUnitIds, bid),
        )
      ) {
        toast.error('Seçilen birimlerden biri için yetkiniz yok.')
        setSaving(false)
        return
      }

      const primaryBid = birimState.primaryId || null
      const payload = {
        ad: vals.ad,
        soyad: vals.soyad,
        personel_kodu: vals.personel_kodu,
        ana_sirket_id: vals.ana_sirket_id || null,
        birim_id: primaryBid,
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

      try {
        const allBirimIds = [
          ...new Set(birimState.selectedIds.filter(Boolean).map(String)),
        ]
        if (vals.ana_sirket_id) {
          await replacePersonelBirimleri(supabase, {
            personelId: id,
            anaSirketId: vals.ana_sirket_id,
            birimIds: allBirimIds,
            primaryBirimId: primaryBid,
          })
        }
      } catch (junctionErr) {
        console.error(junctionErr)
        toast.error(
          junctionErr?.message ||
            'Birim atamaları güncellenemedi; personel bilgisi kaydedildi.',
        )
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

  /** Şirket + birim: klasik iki sütun (birim sağda) */
  const orgPairRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 24,
    marginBottom: 20,
    alignItems: 'start',
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
          {limitedSelfEditor && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: '#eef2ff',
                color: '#3730a3',
                fontSize: 12,
                lineHeight: 1.5,
                border: '1px solid #c7d2fe',
              }}
            >
              Sadece kendi rolünüzü değiştirebilirsiniz. Diğer kimlik ve
              organizasyon bilgileri için bir personel yöneticisine başvurun.
            </div>
          )}
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Kimlik</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Ad</label>
                <input
                  type="text"
                  style={inputStyle}
                  disabled={limitedSelfEditor}
                  {...register('ad')}
                />
              </div>
              <div>
                <label style={labelStyle}>Soyad</label>
                <input
                  type="text"
                  style={inputStyle}
                  disabled={limitedSelfEditor}
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
                  disabled={limitedSelfEditor}
                  {...register('personel_kodu')}
                />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Organizasyon</div>
            <div style={orgPairRowStyle}>
              <div style={{ minWidth: 0 }}>
                <label style={labelStyle}>Şirket</label>
                <select
                  style={inputStyle}
                  disabled={limitedSelfEditor}
                  {...register('ana_sirket_id')}
                >
                  <option value="">Şirket seçin</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 0 }}>
                <input type="hidden" {...register('birim_id')} />
                <StaffBirimMultiSelect
                  units={units}
                  selectedIds={birimState.selectedIds}
                  primaryId={birimState.primaryId}
                  disabled={limitedSelfEditor}
                  onChange={(next) => {
                    setBirimState(next)
                    setValue('birim_id', next.primaryId || null, {
                      shouldValidate: true,
                    })
                  }}
                  hint="Menüyü açıp bir veya daha fazla birim işaretleyin; çoklu seçimde birincili seçin."
                />
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
                <input
                  type="checkbox"
                  id="durum"
                  disabled={limitedSelfEditor}
                  {...register('durum')}
                />
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
