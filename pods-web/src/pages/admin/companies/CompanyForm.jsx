import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import Card from '../../../components/ui/Card'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { normalizeIpList } from '../../../lib/ipAccess.js'

const supabase = getSupabase()

const schema = z.object({
  ana_sirket_adi: z.string().min(1, 'Şirket adı gerekli'),
  vergi_no: z
    .string()
    .min(10, 'Vergi no 10 haneli olmalı')
    .max(10, 'Vergi no 10 haneli olmalı')
    .regex(/^\d{10}$/, 'Vergi no sadece rakamlardan oluşmalı'),
})

export default function CompanyForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel, loading: authLoading } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const [loading, setLoading] = useState(false)
  const [formFixedIpEnabled, setFormFixedIpEnabled] = useState(false)
  const [formAllowedIps, setFormAllowedIps] = useState([''])

  const isIpColumnMissingError = (error) => {
    const msg = String(error?.message || '').toLowerCase()
    return (
      error?.code === '42703' ||
      msg.includes('sabit_ip_aktif') ||
      msg.includes('izinli_ipler')
    )
  }

  const switchTrackStyle = {
    position: 'relative',
    width: 44,
    height: 24,
    borderRadius: 9999,
    border: '1px solid #cbd5e1',
    backgroundColor: formFixedIpEnabled ? '#0a1e42' : '#e2e8f0',
    transition: 'all .2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    padding: 2,
    boxSizing: 'border-box',
  }

  const switchThumbStyle = {
    width: 18,
    height: 18,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px rgba(15,23,42,.25)',
    transform: formFixedIpEnabled ? 'translateX(20px)' : 'translateX(0)',
    transition: 'transform .2s ease',
  }

  const { register, handleSubmit, reset } = useForm({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (authLoading) return
    if (!id && !isSystemAdmin) {
      toast.error('Yeni şirket oluşturma yetkiniz yok.')
      navigate('/admin/companies', { replace: true })
    }
  }, [id, isSystemAdmin, navigate, authLoading])

  useEffect(() => {
    if (authLoading || !id) return
    setLoading(true)
    supabase
        .from('ana_sirketler')
      .select('id,ana_sirket_adi,vergi_no,sabit_ip_aktif,izinli_ipler')
        .eq('id', id)
        .maybeSingle()
        .then(async ({ data, error }) => {
          if (error && isIpColumnMissingError(error)) {
            const fb = await supabase
              .from('ana_sirketler')
              .select('id,ana_sirket_adi,vergi_no')
              .eq('id', id)
              .maybeSingle()
            data = fb.data
            error = fb.error
            if (data) {
              data = { ...data, sabit_ip_aktif: false, izinli_ipler: [] }
            }
          }
          setLoading(false)
          if (error) {
            toast.error('Şirket yüklenemedi')
            navigate('/admin/companies')
            return
          }
          if (data) {
            if (
              !isSystemAdmin &&
              currentCompanyId &&
              String(data.id) !== String(currentCompanyId)
            ) {
              toast.error('Bu şirkete erişim yetkiniz yok.')
              navigate('/admin/companies', { replace: true })
              return
            }
            reset({
              ana_sirket_adi: data.ana_sirket_adi,
              vergi_no: data.vergi_no,
            })
            setFormFixedIpEnabled(!!data.sabit_ip_aktif)
            setFormAllowedIps(
              (data.izinli_ipler || []).length
                ? data.izinli_ipler
                : [''],
            )
          }
        })
  }, [id, reset, navigate, isSystemAdmin, currentCompanyId, authLoading])

  const updateAllowedIp = (idx, value) => {
    setFormAllowedIps((prev) =>
      prev.map((ip, i) => (i === idx ? value : ip)),
    )
  }

  const addAllowedIpInput = () => {
    setFormAllowedIps((prev) => {
      if (prev.length >= 5) return prev
      return [...prev, '']
    })
  }

  const removeAllowedIpInput = (idx) => {
    setFormAllowedIps((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }

  const onSubmit = async (vals) => {
    if (!id && !isSystemAdmin) {
      toast.error('Yeni şirket oluşturma yetkiniz yok.')
      return
    }
    setLoading(true)
    try {
      const allowList = normalizeIpList(formAllowedIps)
      if (allowList.length > 5) {
        toast.error('En fazla 5 IP ekleyebilirsiniz')
        return
      }
      if (formFixedIpEnabled && allowList.length === 0) {
        toast.error('Sabit IP aktifken en az 1 IP girilmelidir')
        return
      }
      if (id) {
        if (
          !isSystemAdmin &&
          currentCompanyId &&
          String(id) !== String(currentCompanyId)
        ) {
          toast.error('Bu şirketi güncelleme yetkiniz yok.')
          return
        }
        let { error } = await supabase.from('ana_sirketler').update({
          ana_sirket_adi: vals.ana_sirket_adi,
          vergi_no: vals.vergi_no,
          sabit_ip_aktif: formFixedIpEnabled,
          izinli_ipler: allowList,
        }).eq('id', id)
        if (error && isIpColumnMissingError(error)) {
          const fb = await supabase
            .from('ana_sirketler')
            .update({
              ana_sirket_adi: vals.ana_sirket_adi,
              vergi_no: vals.vergi_no,
            })
            .eq('id', id)
          error = fb.error
        }
        if (error) throw error
        toast.success('Şirket güncellendi')
      } else {
        let { error } = await supabase.from('ana_sirketler').insert([{
          ana_sirket_adi: vals.ana_sirket_adi,
          vergi_no: vals.vergi_no,
          durum: true,
          sabit_ip_aktif: formFixedIpEnabled,
          izinli_ipler: allowList,
        }])
        if (error && isIpColumnMissingError(error)) {
          const fb = await supabase.from('ana_sirketler').insert([{
            ana_sirket_adi: vals.ana_sirket_adi,
            vergi_no: vals.vergi_no,
            durum: true,
          }])
          error = fb.error
        }
        if (error) throw error
        toast.success('Yeni şirket oluşturuldu')
      }
      navigate('/admin/companies')
    } catch (e) {
      toast.error(e.message || 'Kayıt hatası')
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
    maxWidth: 720,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
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

  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginBottom: 16,
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
              {id ? 'Şirket Düzenle' : 'Yeni Şirket'}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                marginTop: 4,
              }}
            >
              Ana şirket bilgilerini tanımlayın veya güncelleyin.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Şirket Adı</label>
              <input
                type="text"
                placeholder="Örn: ACME A.Ş."
                style={inputStyle}
                {...register('ana_sirket_adi')}
              />
            </div>
            <div>
              <label style={labelStyle}>Vergi No</label>
              <input
                type="text"
                placeholder="10 haneli vergi numarası"
                style={inputStyle}
                {...register('vergi_no')}
              />
            </div>
          </div>
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Sabit IP</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 9999,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f9fafb',
                }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={formFixedIpEnabled}
                  onClick={() => setFormFixedIpEnabled((v) => !v)}
                  style={{
                    ...switchTrackStyle,
                    cursor: 'pointer',
                    border: 'none',
                    outline: 'none',
                  }}
                >
                  <span style={switchThumbStyle} />
                </button>
                <button
                  type="button"
                  onClick={() => setFormFixedIpEnabled((v) => !v)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#111827',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Aktif
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>İzinli IP'ler (max 5)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {formAllowedIps.map((ip, idx) => (
                  <div
                    key={`ip-${idx}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <input
                      type="text"
                      disabled={!formFixedIpEnabled}
                      placeholder="Örn: 88.227.10.45"
                      style={{
                        ...inputStyle,
                        opacity: formFixedIpEnabled ? 1 : 0.55,
                        flex: 1,
                      }}
                      value={ip}
                      onChange={(e) => updateAllowedIp(idx, e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!formFixedIpEnabled || formAllowedIps.length <= 1}
                      onClick={() => removeAllowedIpInput(idx)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9999,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: 18,
                        lineHeight: '18px',
                        cursor:
                          formFixedIpEnabled && formAllowedIps.length > 1
                            ? 'pointer'
                            : 'not-allowed',
                        opacity: formFixedIpEnabled ? 1 : 0.55,
                      }}
                      aria-label="IP satırını sil"
                    >
                      -
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!formFixedIpEnabled || formAllowedIps.length >= 5}
                  onClick={addAllowedIpInput}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 9999,
                    border: '1px dashed #94a3b8',
                    backgroundColor: '#f8fafc',
                    color: '#334155',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      formFixedIpEnabled && formAllowedIps.length < 5
                        ? 'pointer'
                        : 'not-allowed',
                    opacity: formFixedIpEnabled ? 1 : 0.55,
                    alignSelf: 'flex-start',
                  }}
                >
                  + IP Ekle
                </button>
              </div>
            </div>
          </div>

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
              onClick={() => navigate('/admin/companies')}
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

