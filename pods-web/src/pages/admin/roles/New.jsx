import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import Card from '../../../components/ui/Card'
import Input from '../../../components/ui/Input'
import Button from '../../../components/ui/Button'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { buildYetkilerForSave } from '../../../lib/permissions.js'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

const schema = z.object({
  rol_adi: z.string().min(1),
  ana_sirket_id: z.string().optional().nullable(),
})

const ACTIONS = {
  OPERASYON: ['is.olustur', 'is.liste_gor', 'is.detay_gor', 'is.fotograf_yukle'],
  DENETIM: ['denetim.olustur', 'denetim.onayla', 'denetim.reddet'],
  YONETIM: ['personel.yonet', 'puan.ver', 'rapor.oku'],
  SISTEM: ['rol.yonet', 'sube.yonet', 'sirket.yonet', 'is_turu.yonet', 'sistem.ayar'],
}

export default function NewRole() {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [companies, setCompanies] = useState([])
  const [permissions, setPermissions] = useState({})
  const { register, handleSubmit, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      rol_adi: '',
      ana_sirket_id: companyScoped && currentCompanyId ? String(currentCompanyId) : '',
    },
  })

  useEffect(() => {
    let q = supabase
      .from('ana_sirketler')
      .select('id,ana_sirket_adi')
      .is('silindi_at', null)
    if (companyScoped && currentCompanyId) {
      q = q.eq('id', currentCompanyId)
    }
    q.then(({ data }) => setCompanies(data || []))
    const init = {}
    Object.values(ACTIONS).flat().forEach((k) => (init[k] = false))
    setPermissions(init)
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setValue('ana_sirket_id', String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId, setValue])

  const toggle = (key) => setPermissions((p) => ({ ...p, [key]: !p[key] }))

  const applyPreset = (preset) => {
    if (preset === 'SUPER_ADMIN') {
      const allTrue = {}
      Object.keys(permissions).forEach(k => (allTrue[k] = true))
      setPermissions(allTrue)
    } else if (preset === 'PERSONEL') {
      const base = {}
      Object.keys(permissions).forEach(k => (base[k] = false))
      ['is.liste_gor','is.detay_gor','is.fotograf_yukle'].forEach(k => (base[k] = true))
      setPermissions(base)
    } else if (preset === 'DENETIMCI') {
      const base = {}
      Object.keys(permissions).forEach(k => (base[k] = false))
      ACTIONS.DENETIM.forEach(k => (base[k] = true))
      setPermissions(base)
    } else if (preset === 'YONETICI_WEB') {
      const base = {}
      Object.keys(permissions).forEach(k => (base[k] = false))
      ;[...ACTIONS.YONETIM, ...ACTIONS.OPERASYON, 'denetim.onayla'].forEach(
        (k) => {
          if (k in base) base[k] = true
        },
      )
      setPermissions(base)
    }
  }

  const onSubmit = async (vals) => {
    const anaSirketId = companyScoped
      ? currentCompanyId
      : vals.ana_sirket_id || null
    if (companyScoped && !currentCompanyId) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }
    const payload = {
      rol_adi: vals.rol_adi,
      ana_sirket_id: anaSirketId,
      yetkiler: buildYetkilerForSave(permissions),
    }
    console.log('Gönderilen Veri:', payload)
    const { data, error } = await supabase.from('roller').insert([payload]).select()
    if (error) {
      console.error('Supabase Kayıt Hatası:', error.message, error.details)
      toast.error('Hata: ' + (error.message || 'Kayıt başarısız'))
    } else {
      toast.success(`${vals.rol_adi} rolü başarıyla eklendi`)
      navigate('/admin/roles')
    }
  }

  return (
    <div className="flex items-center justify-center">
      <Card className="w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-4">Yeni Rol & Yetki Tanımı</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-upper">Rol adı</label>
            <Input {...register('rol_adi')} />
          </div>
          <div>
            <label className="label-upper">
              {companyScoped ? 'Şirket' : 'Şirket (opsiyonel)'}
            </label>
            {companyScoped && companies.length === 1 ? (
              <>
                <input
                  type="hidden"
                  {...register('ana_sirket_id')}
                />
                <div
                  className="input bg-gray-100 text-gray-900 font-semibold"
                  style={{ pointerEvents: 'none' }}
                >
                  {companies[0].ana_sirket_adi}
                </div>
              </>
            ) : (
              <select className="input" {...register('ana_sirket_id')}>
                {!companyScoped && <option value="">Global</option>}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ana_sirket_adi}
                  </option>
                ))}
              </select>
            )}
            {companyScoped && companies.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">Şirket yükleniyor…</p>
            )}
          </div>

          <div>
            <label className="label-upper">Şablon Seç</label>
            <select className="input" onChange={(e) => applyPreset(e.target.value)}>
              <option value="">-- Şablon seçin --</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN (Tüm Yetkiler)</option>
              <option value="PERSONEL">PERSONEL (Temel Operasyonlar)</option>
              <option value="DENETIMCI">DENETIMCI (Sadece Denetim)</option>
              <option value="YONETICI_WEB">Yönetici — Web panel (Yönetim + Operasyon + Onay)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Object.entries(ACTIONS).map(([cat, keys]) => (
              <div key={cat} className="p-3 border rounded">
                <div className="font-semibold mb-2 text-[var(--color-primary)]">{cat}</div>
                <div className="space-y-2">
                  {keys.map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!permissions[k]} onChange={() => toggle(k)} />
                      <span className="text-sm text-slate-600">{k}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" className="bg-gray-300 text-black" onClick={() => navigate('/admin/roles')}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

