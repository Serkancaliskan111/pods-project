import { useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

const schema = z
  .object({
    ad: z.string().min(1, 'Ad zorunludur'),
    soyad: z.string().min(1, 'Soyad zorunludur'),
    email: z.string().email('Geçerli bir e-posta girin'),
    sifre: z.string().min(6, 'Parola en az 6 karakter olmalıdır'),
    sifre_tekrar: z.string().min(1, 'Parolayı tekrar girin'),
    personel_kodu: z.string().min(1, 'Personel kodu zorunludur'),
    ana_sirket_id: z.string().optional(),
    birim_id: z.string().optional().nullable(),
    rol_id: z.string().optional(),
  })
  .refine((data) => data.sifre === data.sifre_tekrar, {
    message: 'Parolalar eşleşmiyor',
    path: ['sifre_tekrar'],
  })

export default function NewStaff() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const queryCompanyId = params.get('company') || ''

  const { profile, personel, loading: authLoading } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(false)
  const [showSifre, setShowSifre] = useState(false)

  const initialCompanyId =
    companyScoped && currentCompanyId
      ? String(currentCompanyId)
      : queryCompanyId

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      ana_sirket_id: initialCompanyId,
    },
  })

  const watchCompany = watch('ana_sirket_id')

  useEffect(() => {
    if (authLoading) return

    let q = supabase
      .from('ana_sirketler')
      .select('id,ana_sirket_adi')
      .is('silindi_at', null)
    if (companyScoped && currentCompanyId) {
      q = q.eq('id', currentCompanyId)
    }
    q.then(({ data }) => setCompanies(data || []))

    if (isSystemAdmin) {
      supabase
        .from('roller')
        .select('id,rol_adi,ana_sirket_id')
        .is('ana_sirket_id', null)
        .then(({ data }) => setRoles(data || []))
    }
  }, [authLoading, companyScoped, currentCompanyId, isSystemAdmin])

  useEffect(() => {
    if (authLoading) return
    if (companyScoped && currentCompanyId) {
      setValue('ana_sirket_id', String(currentCompanyId), {
        shouldValidate: true,
      })
    }
  }, [authLoading, companyScoped, currentCompanyId, setValue])

  useEffect(() => {
    if (!watchCompany) {
      setUnits([])
      setRoles([])
      return
    }
    let unitQ = supabase
      .from('birimler')
      .select('id,birim_adi')
      .eq('ana_sirket_id', watchCompany)
      .is('silindi_at', null)
    if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
      unitQ = unitQ.in('id', accessibleUnitIds)
    }
    unitQ.then(({ data }) => setUnits(data || []))

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
  }, [
    watchCompany,
    isSystemAdmin,
    JSON.stringify(accessibleUnitIds || []),
  ])

  const errorTextStyle = {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 4,
  }

  const onInvalid = (formErrors) => {
    console.warn('[NewStaff] Form doğrulama başarısız:', formErrors)
    const firstMsg = Object.values(formErrors)
      .map((e) => e?.message)
      .find(Boolean)
    toast.error(
      firstMsg
        ? String(firstMsg)
        : 'Lütfen zorunlu alanları eksiksiz doldurun.',
    )
  }

  const onSubmit = async (vals) => {
    console.log('[NewStaff] Kayıt işlemi başladı')
    setLoading(true)
    try {
      // Basit client-side rate-limit koruması (Supabase 429 tekrarını azaltır)
      try {
        const lockUntilRaw = localStorage.getItem('pods_signup_lock_until')
        const lockUntil = lockUntilRaw ? Number(lockUntilRaw) : 0
        if (lockUntil && Date.now() < lockUntil) {
          const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
          toast.error(
            `Çok hızlı işlem yapıldı. Lütfen ${remaining} sn sonra tekrar deneyin.`,
          )
          setLoading(false)
          return
        }
      } catch {
        // localStorage opsiyonel
      }

      const effectiveCompanyId = companyScoped
        ? String(currentCompanyId)
        : vals.ana_sirket_id || ''

      if (companyScoped && currentCompanyId) {
        if (String(vals.ana_sirket_id) !== String(currentCompanyId)) {
          toast.error('Geçersiz şirket seçimi.')
          setLoading(false)
          return
        }
      }

      const selectedRole = roles.find((r) => r.id === vals.rol_id)
      const roleName = selectedRole?.rol_adi
      if (!selectedRole) {
        toast.error('Lütfen geçerli bir rol seçin')
        setLoading(false)
        return
      }

      if (
        !companyScoped &&
        (roleName === 'YONETICI' || roleName === 'PERSONEL') &&
        (!vals.ana_sirket_id || !vals.birim_id)
      ) {
        toast.error(
          'Yönetici ve Personel için şirket ve birim seçimi zorunludur',
        )
        setLoading(false)
        return
      }

      if (
        companyScoped &&
        vals.birim_id &&
        accessibleUnitIds &&
        accessibleUnitIds.length &&
        !accessibleUnitIds.some(
          (uid) => String(uid) === String(vals.birim_id),
        )
      ) {
        toast.error('Seçilen birim için yetkiniz yok.')
        setLoading(false)
        return
      }

      if (
        (roleName === 'DENETIMCI' || roleName === 'SIRKET_SAHIBI') &&
        !effectiveCompanyId
      ) {
        toast.error('Denetimci ve Şirket Sahibi için şirket seçimi zorunludur')
        setLoading(false)
        return
      }

      if (
        (roleName === 'YONETICI' || roleName === 'PERSONEL') &&
        !effectiveCompanyId
      ) {
        toast.error('Bu rol için şirket bilgisi gerekli')
        setLoading(false)
        return
      }

      // Ön kontrol: aynı email ile personel / kullanıcı kaydı var mı?
      try {
        const [{ data: existingK }, { data: existingP }] = await Promise.all([
          supabase
            .from('kullanicilar')
            .select('id')
            .eq('email', vals.email)
            .maybeSingle(),
          supabase
            .from('personeller')
            .select('id')
            .eq('email', vals.email)
            .is('silindi_at', null)
            .maybeSingle(),
        ])

        if (existingK || existingP) {
          toast.error('Bu e-posta ile kayıtlı bir kullanıcı zaten var.')
          setLoading(false)
          return
        }
      } catch {
        // Ön kontrol başarısızsa signUp ile devam et (RLS olabilir)
      }

      // 1) Auth hesabı oluştur (Edge Function — geçit JWT için kullanıcı access_token şart)
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession()
      if (sessionErr || !session?.access_token) {
        toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
        setLoading(false)
        return
      }

      // Edge Function ayrıntılı yetki logu: .env → VITE_ADMIN_CREATE_USER_DEBUG=true
      const adminCreateUserDebug =
        typeof import.meta !== 'undefined' &&
        import.meta.env?.VITE_ADMIN_CREATE_USER_DEBUG === 'true'

      const { data: fnData, error: fnErr, response: fnResponse } =
        await supabase.functions.invoke('admin-create-user', {
          body: {
            email: vals.email,
            password: vals.sifre,
            full_name: `${vals.ad} ${vals.soyad}`.trim(),
            role: roleName || '',
            company_id: effectiveCompanyId || null,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(adminCreateUserDebug
              ? { 'x-pods-auth-debug': '1' }
              : {}),
          },
        })

      let fnServerError = ''
      if (fnErr && fnResponse) {
        try {
          const j = await fnResponse.clone().json()
          fnServerError = typeof j?.error === 'string' ? j.error : ''
          if (!fnServerError && j?.message) fnServerError = String(j.message)
          console.error('admin-create-user sunucu yanıtı:', j)
        } catch {
          try {
            fnServerError = (await fnResponse.clone().text()).slice(0, 300)
          } catch {
            /* ignore */
          }
        }
      }

      if (fnErr) {
        console.error('admin-create-user invoke error:', fnErr)
        const msg = fnServerError || String(fnErr.message || '')
        const lower = msg.toLowerCase()

        if (lower.includes('failed to fetch') || lower.includes('network')) {
          toast.error(
            'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin veya biraz sonra tekrar deneyin.',
          )
        } else if (lower.includes('cors')) {
          toast.error(
            'Sunucu bağlantısı engellendi (CORS). Edge Function CORS ayarını kontrol edin.',
          )
        } else if (
          lower.includes('rate limit') ||
          lower.includes('too many') ||
          fnErr.status === 429
        ) {
          toast.error('Çok fazla istek atıldı. Lütfen biraz sonra tekrar deneyin.')
        } else if (
          lower.includes('already') ||
          lower.includes('exists') ||
          lower.includes('registered')
        ) {
          toast.error('Bu e-posta ile kayıtlı bir kullanıcı zaten var.')
        } else if (
          (fnErr?.context && fnErr.context.status === 401) ||
          fnResponse?.status === 401
        ) {
          toast.error('Oturum doğrulanamadı. Çıkış yapıp tekrar giriş yapın.')
        } else if (
          (fnErr?.context && fnErr.context.status === 403) ||
          fnResponse?.status === 403
        ) {
          toast.error('Bu işlem için yetkiniz yok.')
        } else if (fnResponse?.status === 400 && fnServerError) {
          toast.error(fnServerError)
        } else {
          toast.error(msg || 'Kullanıcı oluşturulamadı.')
        }

        setLoading(false)
        return
      }

      const authUserId = fnData?.user?.id || fnData?.userId || null

      if (!authUserId) {
        toast.error('Kullanıcı hesabı oluşturulamadı.')
        setLoading(false)
        return
      }

      // 2) kullanicilar tablosuna kayıt
      const isSystemAdminFlag =
        roleName === 'SUPER_ADMIN' || roleName === 'Admin'

      // kullanicilar: id auth.uid() ile aynı olmalı. Çakışma olursa upsert ile güncelle.
      const { error: profileErr } = await supabase.from('kullanicilar').upsert(
        [
          {
            id: authUserId,
            email: vals.email,
            ad_soyad: `${vals.ad} ${vals.soyad}`.trim(),
            is_system_admin: isSystemAdminFlag,
          },
        ],
        { onConflict: 'id' },
      )

      if (profileErr) {
        console.error('kullanicilar insert error:', profileErr)
        toast.error('Kullanıcı profili oluşturulamadı.')
        setLoading(false)
        return
      }

      // 3) personeller tablosuna kayıt
      const payload = {
        ana_sirket_id: effectiveCompanyId || null,
        birim_id: vals.birim_id || null,
        kullanici_id: authUserId,
        rol_id: vals.rol_id,
        personel_kodu: vals.personel_kodu,
        durum: true,
        ad: vals.ad,
        soyad: vals.soyad,
        email: vals.email,
      }

      const { error: pErr } = await supabase.from('personeller').insert([
        payload,
      ])
      if (pErr) {
        console.error('personeller insert error:', pErr)
        throw pErr
      }

      toast.success('Personel ve kullanıcı hesabı oluşturuldu')
      navigate('/admin/staff')
    } catch (e) {
      console.error('DETAYLI HATA:', e)
      toast.error(e.message || 'Hata oluştu')
    } finally {
      setLoading(false)
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
    boxSizing: 'border-box',
  }

  const passwordFieldWrapStyle = {
    position: 'relative',
    width: '100%',
  }

  const passwordInputStyle = {
    ...inputStyle,
    paddingRight: 44,
  }

  const passwordToggleStyle = {
    position: 'absolute',
    right: 6,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 32,
    border: 'none',
    borderRadius: 9999,
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
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
              Yeni Personel Ekle
            </h2>
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                marginTop: 4,
              }}
            >
              {companyScoped
                ? 'Birim (isteğe bağlı) ve rol seçerek şirketinize personel ekleyin.'
                : 'Şirket ve birim atamasını yaparak yeni bir personel kaydı oluşturun.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
          {/* Kimlik Bilgileri */}
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Kimlik Bilgileri</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Ad</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet"
                  style={inputStyle}
                  {...register('ad')}
                />
                {errors.ad?.message && (
                  <div style={errorTextStyle}>{String(errors.ad.message)}</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Soyad</label>
                <input
                  type="text"
                  placeholder="Örn: Yılmaz"
                  style={inputStyle}
                  {...register('soyad')}
                />
                {errors.soyad?.message && (
                  <div style={errorTextStyle}>
                    {String(errors.soyad.message)}
                  </div>
                )}
              </div>
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>E-posta</label>
                <input
                  type="email"
                  placeholder="ornek@firma.com"
                  style={inputStyle}
                  {...register('email')}
                />
                {errors.email?.message && (
                  <div style={errorTextStyle}>
                    {String(errors.email.message)}
                  </div>
                )}
              </div>
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Parola</label>
                <div style={passwordFieldWrapStyle}>
                  <input
                    type={showSifre ? 'text' : 'password'}
                    placeholder="En az 6 karakter"
                    style={passwordInputStyle}
                    autoComplete="new-password"
                    {...register('sifre')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSifre((v) => !v)}
                    style={passwordToggleStyle}
                    title={showSifre ? 'Gizle' : 'Göster'}
                    aria-label={showSifre ? 'Parolayı gizle' : 'Parolayı göster'}
                  >
                    {showSifre ? (
                      <EyeOff size={18} strokeWidth={2} />
                    ) : (
                      <Eye size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>
                {errors.sifre?.message && (
                  <div style={errorTextStyle}>
                    {String(errors.sifre.message)}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Parola (tekrar)</label>
                <div style={passwordFieldWrapStyle}>
                  <input
                    type={showSifre ? 'text' : 'password'}
                    placeholder="Parolayı yeniden girin"
                    style={passwordInputStyle}
                    autoComplete="new-password"
                    {...register('sifre_tekrar')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSifre((v) => !v)}
                    style={passwordToggleStyle}
                    title={showSifre ? 'Gizle' : 'Göster'}
                    aria-label={showSifre ? 'Parolayı gizle' : 'Parolayı göster'}
                  >
                    {showSifre ? (
                      <EyeOff size={18} strokeWidth={2} />
                    ) : (
                      <Eye size={18} strokeWidth={2} />
                    )}
                  </button>
                </div>
                {errors.sifre_tekrar?.message && (
                  <div style={errorTextStyle}>
                    {String(errors.sifre_tekrar.message)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Organizasyon Bilgileri */}
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            <div style={sectionTitleStyle}>Organizasyon</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Şirket</label>
                {companyScoped && companies.length === 1 ? (
                  <>
                    <input
                      type="hidden"
                      {...register('ana_sirket_id')}
                    />
                    <div
                      style={{
                        ...inputStyle,
                        backgroundColor: '#f1f5f9',
                        fontWeight: 600,
                        cursor: 'default',
                      }}
                    >
                      {companies[0].ana_sirket_adi}
                    </div>
                  </>
                ) : companyScoped && companies.length === 0 ? (
                  <>
                    <input type="hidden" {...register('ana_sirket_id')} />
                    <div style={{ ...inputStyle, color: '#6b7280' }}>
                      Yükleniyor…
                    </div>
                  </>
                ) : (
                  <select style={inputStyle} {...register('ana_sirket_id')}>
                    <option value="">Şirket seçin</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ana_sirket_adi}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Birim (opsiyonel)</label>
                <select style={inputStyle} {...register('birim_id')}>
                  <option value="">Birim seçilmedi</option>
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
              <div>
                <label style={labelStyle}>Personel Kodu</label>
                <input
                  type="text"
                  placeholder="Örn: P-1024"
                  style={inputStyle}
                  {...register('personel_kodu')}
                />
                {errors.personel_kodu?.message && (
                  <div style={errorTextStyle}>
                    {String(errors.personel_kodu.message)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Alt butonlar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 20,
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
              disabled={loading}
              style={{
                padding: '8px 18px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#0a1e42',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

