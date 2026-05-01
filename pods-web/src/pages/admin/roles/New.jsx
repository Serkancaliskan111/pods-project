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
import {
  emptyRoleSwitchState,
  mergeRoleYetkilerForSave,
} from '../../../lib/permissions.js'
import { ROLE_ACTIONS_BY_CATEGORY } from '../../../lib/roleActionKeys.js'
import RolePermissionsEditor from '../../../components/admin/RolePermissionsEditor.jsx'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

const schema = z.object({
  rol_adi: z.string().min(1),
  ana_sirket_id: z.string().optional().nullable(),
})

export default function NewRole() {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [companies, setCompanies] = useState([])
  const [permissions, setPermissions] = useState(() => emptyRoleSwitchState())
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
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setValue('ana_sirket_id', String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId, setValue])

  const applyPreset = (preset) => {
    const base = emptyRoleSwitchState()
    if (preset === 'SUPER_ADMIN') {
      Object.keys(base).forEach((k) => {
        base[k] = true
      })
      setPermissions(base)
    } else if (preset === 'PERSONEL') {
      ;['is.liste_gor', 'is.detay_gor', 'is.fotograf_yukle'].forEach((k) => {
        base[k] = true
      })
      setPermissions(base)
    } else if (preset === 'DENETIMCI') {
      ROLE_ACTIONS_BY_CATEGORY.DENETIM.forEach((k) => {
        base[k] = true
      })
      setPermissions(base)
    } else if (preset === 'YONETICI_WEB') {
      ;[
        ...ROLE_ACTIONS_BY_CATEGORY.YONETIM,
        ...ROLE_ACTIONS_BY_CATEGORY.OPERASYON,
        'denetim.onayla',
      ].forEach((k) => {
        if (k in base) base[k] = true
      })
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
      yetkiler: mergeRoleYetkilerForSave({}, permissions),
    }
    const { error } = await supabase.from('roller').insert([payload]).select()
    if (error) {
      console.error('Supabase Kayıt Hatası:', error.message, error.details)
      toast.error('Hata: ' + (error.message || 'Kayıt başarısız'))
    } else {
      toast.success(`${vals.rol_adi} rolü başarıyla eklendi`)
      navigate('/admin/roles')
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] w-full px-3 py-6 md:px-6 md:py-7">
      <Card className="mx-auto w-full max-w-[min(920px,calc(100vw-1.5rem))] px-5 py-6 shadow-md md:px-7 md:py-7">
        <h2 className="mb-1.5 text-lg font-bold tracking-tight text-[#0a1e42] md:text-xl">
          Yeni rol ve yetki tanımı
        </h2>
        <p className="mb-6 max-w-2xl text-xs leading-relaxed text-slate-600 md:text-[13px]">
          Rol adını seçin, şablonla hızlı başlayın veya her yetkiyi tek tek açın/kapatın. Kaydedilen anahtarlar
          sistemde aynen kullanılır.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 md:space-y-5">
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

          <div>
            <label className="label-upper mb-2 block text-[11px]">Yetkiler</label>
            <div className="max-h-[min(480px,calc(100vh-280px))] overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 md:p-4">
              <RolePermissionsEditor
                permissions={permissions}
                onToggle={(key, value) =>
                  setPermissions((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" className="bg-gray-300 text-black" onClick={() => navigate('/admin/roles')}>İptal</Button>
            <Button type="submit">Kaydet</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

