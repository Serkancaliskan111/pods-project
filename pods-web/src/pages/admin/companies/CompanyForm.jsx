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
        .select('id,ana_sirket_adi,vergi_no')
        .eq('id', id)
        .maybeSingle()
        .then(({ data, error }) => {
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
          }
        })
  }, [id, reset, navigate, isSystemAdmin, currentCompanyId, authLoading])

  const onSubmit = async (vals) => {
    if (!id && !isSystemAdmin) {
      toast.error('Yeni şirket oluşturma yetkiniz yok.')
      return
    }
    setLoading(true)
    try {
      if (id) {
        if (
          !isSystemAdmin &&
          currentCompanyId &&
          String(id) !== String(currentCompanyId)
        ) {
          toast.error('Bu şirketi güncelleme yetkiniz yok.')
          return
        }
        const { error } = await supabase.from('ana_sirketler').update({
          ana_sirket_adi: vals.ana_sirket_adi,
          vergi_no: vals.vergi_no,
        }).eq('id', id)
        if (error) throw error
        toast.success('Şirket güncellendi')
      } else {
        const { error } = await supabase.from('ana_sirketler').insert([{
          ana_sirket_adi: vals.ana_sirket_adi,
          vergi_no: vals.vergi_no,
          durum: true,
        }])
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

