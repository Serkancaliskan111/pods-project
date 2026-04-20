import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { isUnitInScope } from '../../../lib/supabaseScope.js'

const supabase = getSupabase()

const schema = z.object({
  ana_sirket_id: z.string().min(1, 'Şirket seçimi gerekli'),
  birim_adi: z.string().min(1, 'Birim adı gerekli'),
  birim_tipi: z.enum(['BOLGE', 'SUBE', 'BAYI']),
  ust_birim_id: z.string().optional().nullable(),
})

export default function UnitForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const [companies, setCompanies] = useState([])
  const [parentUnits, setParentUnits] = useState([])
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, reset, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { ana_sirket_id: '', birim_adi: '', birim_tipi: 'SUBE', ust_birim_id: null },
  })

  const watchCompany = watch('ana_sirket_id')

  useEffect(() => {
    // load companies
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
        const list = data || []
        setCompanies(list)
      }
    })
  }, [isSystemAdmin, currentCompanyId])

  useEffect(() => {
    if (id) return
    if (companyScoped && companies.length === 1) {
      setValue('ana_sirket_id', String(companies[0].id), {
        shouldValidate: true,
      })
    }
  }, [id, companyScoped, companies, setValue])

  useEffect(() => {
    if (!watchCompany) {
      setParentUnits([])
      return
    }
    // load units for selected company
    let q = supabase
      .from('birimler')
      .select('id,birim_adi,ana_sirket_id')
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
        setParentUnits(data || [])
      }
    })
  }, [watchCompany, isSystemAdmin, accessibleUnitIds])

  useEffect(() => {
    if (id) {
      setLoading(true)
      supabase
        .from('birimler')
        .select('id,ana_sirket_id,ust_birim_id,birim_adi,birim_tipi')
        .eq('id', id)
        .maybeSingle()
        .then(({ data, error }) => {
          setLoading(false)
          if (error) {
            console.error(error)
            toast.error('Birim yüklenemedi')
            navigate('/admin/units')
            return
          }
          if (data) {
            if (
              !isSystemAdmin &&
              (data.ana_sirket_id !== currentCompanyId ||
                (accessibleUnitIds &&
                  accessibleUnitIds.length &&
                  !isUnitInScope(accessibleUnitIds, data.id)))
            ) {
              toast.error('Bu birim detayına erişim yetkiniz yok.')
              navigate('/unauthorized')
              return
            }
            reset({
              ana_sirket_id: data.ana_sirket_id,
              birim_adi: data.birim_adi,
              birim_tipi: data.birim_tipi,
              ust_birim_id: data.ust_birim_id ?? '',
            })
          }
        })
    }
  }, [id, reset, navigate])

  const onSubmit = async (vals) => {
    setLoading(true)
    try {
      if (id) {
        const { error } = await supabase.from('birimler').update({
          ana_sirket_id: vals.ana_sirket_id,
          ust_birim_id: vals.ust_birim_id || null,
          birim_adi: vals.birim_adi,
          birim_tipi: vals.birim_tipi,
          durum: true,
        }).eq('id', id)
        if (error) throw error
        toast.success('Birim güncellendi')
      } else {
        const { error } = await supabase.from('birimler').insert([{
          ana_sirket_id: vals.ana_sirket_id,
          ust_birim_id: vals.ust_birim_id || null,
          birim_adi: vals.birim_adi,
          birim_tipi: vals.birim_tipi,
          durum: true,
        }])
        if (error) throw error
        toast.success('Yeni birim eklendi')
      }
      navigate('/admin/units')
    } catch (e) {
      toast.error(e.message || 'Kayıt hatası')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center">
      <Card className="w-full max-w-xl">
        <h2 className="text-xl font-semibold mb-4">{id ? 'Birim Düzenle' : 'Yeni Birim'}</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-upper">Şirket</label>
            {companyScoped && companies.length === 0 && (
              <div className="text-sm text-gray-500 py-2">Yükleniyor…</div>
            )}
            {companyScoped && companies.length === 1 ? (
              <>
                <input type="hidden" {...register('ana_sirket_id')} />
                <div
                  className="input bg-gray-100 text-gray-900 font-semibold cursor-default"
                  style={{ pointerEvents: 'none' }}
                >
                  {companies[0].ana_sirket_adi}
                </div>
              </>
            ) : (
              (!companyScoped || companies.length > 1) && (
                <select className="input" {...register('ana_sirket_id')}>
                  <option value="">Şirket seçin</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>
          <div>
            <label className="label-upper">Üst Birim (opsiyonel)</label>
            <select className="input" {...register('ust_birim_id')}>
              <option value="">-- Üst birim yok --</option>
              {parentUnits.map((u) => <option key={u.id} value={u.id}>{u.birim_adi}</option>)}
            </select>
          </div>
          <div>
            <label className="label-upper">Birim Adı</label>
            <Input {...register('birim_adi')} />
          </div>
          <div>
            <label className="label-upper">Birim Tipi</label>
            <select className="input" {...register('birim_tipi')}>
              <option value="BOLGE">BÖLGE</option>
              <option value="SUBE">ŞUBE</option>
              <option value="BAYI">BAYİ</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" className="bg-gray-300 text-black" onClick={() => navigate('/admin/units')}>İptal</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Kaydediliyor...' : 'Kaydet'}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

