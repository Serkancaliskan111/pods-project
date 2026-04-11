import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

export default function NewTask() {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const [templates, setTemplates] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [persons, setPersons] = useState([])
  const [form, setForm] = useState({
    sablon_id: '',
    baslik: '',
    ana_sirket_id: '',
    birim_id: '',
    personel_id: '',
    bitis_tarihi: '',
    acil: false,
    foto_zorunlu: false,
    min_foto_sayisi: 0,
    aciklama_zorunlu: false,
    aciklama: '',
    puan: 0,
  })

  useEffect(() => {
    supabase
      .from('is_sablonlari')
      .select('id,baslik,ana_sirket_id')
      .is('silindi_at', null)
      .then(({ data, error }) => {
        if (error) console.error('is_sablonlari load error', error)
        let list = data || []
        if (companyScoped && currentCompanyId) {
          list = list.filter(
            (x) =>
              !x.ana_sirket_id ||
              String(x.ana_sirket_id) === String(currentCompanyId),
          )
        }
        setTemplates(list)
      })

    let compQ = supabase
      .from('ana_sirketler')
      .select('id,ana_sirket_adi')
      .is('silindi_at', null)
    if (companyScoped && currentCompanyId) {
      compQ = compQ.eq('id', currentCompanyId)
    }
    compQ.then(({ data, error }) => {
      if (error) {
        console.error('ana_sirketler load error', error)
        supabase
          .from('ana_sirketler')
          .select('*')
          .is('silindi_at', null)
          .then(({ data: d2, error: e2 }) => {
            if (e2) console.error('ana_sirketler fallback error', e2)
            let list = d2 || []
            if (companyScoped && currentCompanyId) {
              list = list.filter(
                (c) => String(c.id) === String(currentCompanyId),
              )
            }
            setCompanies(list)
          })
      } else {
        setCompanies(data || [])
      }
    })
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    if (companyScoped && currentCompanyId && companies.length === 1) {
      setForm((f) =>
        f.ana_sirket_id
          ? f
          : { ...f, ana_sirket_id: String(companies[0].id) },
      )
    }
  }, [companyScoped, currentCompanyId, companies])

  useEffect(() => {
    if (!form.ana_sirket_id) {
      setUnits([])
      return
    }
    let uq = supabase
      .from('birimler')
      .select('id,birim_adi')
      .eq('ana_sirket_id', form.ana_sirket_id)
      .is('silindi_at', null)
    if (!isSystemAdmin && accessibleUnitIds && accessibleUnitIds.length) {
      uq = uq.in('id', accessibleUnitIds)
    }
    uq.then(({ data }) => setUnits(data || []))
  }, [
    form.ana_sirket_id,
    isSystemAdmin,
    JSON.stringify(accessibleUnitIds || []),
  ])

  useEffect(() => {
    let q = supabase
      .from('personeller')
      .select(
        'id,personel_kodu,ad,soyad,kullanici_id,ana_sirket_id,birim_id,rol_id,durum,email',
      )
      .is('silindi_at', null)
    if (form.birim_id) {
      q = q.eq('birim_id', form.birim_id)
    } else if (!isSystemAdmin && currentCompanyId) {
      q = q.eq('ana_sirket_id', currentCompanyId)
      if (accessibleUnitIds && accessibleUnitIds.length) {
        q = q.in('birim_id', accessibleUnitIds)
      }
    }
    q.then(({ data, error }) => {
      if (error) {
        console.error('personeller load error', error)
        setPersons([])
        return
      }
      setPersons(data || [])
    })
  }, [
    form.birim_id,
    isSystemAdmin,
    currentCompanyId,
    JSON.stringify(accessibleUnitIds || []),
  ])

  const submit = async () => {
    if (!form.sablon_id && !form.baslik) return toast.error('Şablon veya başlık gerekli')
    if (!form.birim_id && !form.personel_id) return toast.error('Birim veya personel seçin')
    if (form.foto_zorunlu && Number(form.min_foto_sayisi) <= 0) return toast.error('Minimum fotoğraf sayısı 1 veya daha fazla olmalı')
    const anaSirketId = companyScoped
      ? currentCompanyId
      : form.ana_sirket_id || null
    if (companyScoped && !anaSirketId) {
      return toast.error('Şirket bilgisi bulunamadı')
    }
    if (
      companyScoped &&
      form.birim_id &&
      accessibleUnitIds &&
      accessibleUnitIds.length &&
      !accessibleUnitIds.some((id) => String(id) === String(form.birim_id))
    ) {
      return toast.error('Seçilen birim için yetkiniz yok')
    }
    try {
      const insert = {
        is_sablon_id: form.sablon_id || null,
        baslik: form.baslik || (templates.find(t => t.id === form.sablon_id)?.baslik ?? 'Görev'),
        ana_sirket_id: anaSirketId,
        birim_id: form.birim_id || null,
        sorumlu_personel_id: form.personel_id || null,
        puan: typeof form.puan !== 'undefined' ? Number(form.puan) : null,
        atayan_personel_id: null,
        durum: form.acil ? 'ACIL' : 'ATANDI',
        baslama_tarihi: new Date().toISOString(),
        son_tarih: form.bitis_tarihi || null,
        foto_zorunlu: !!form.foto_zorunlu,
        min_foto_sayisi: Number(form.min_foto_sayisi) || 0,
        aciklama_zorunlu: !!form.aciklama_zorunlu,
        aciklama: form.aciklama || null,
      }
      console.log('Görev insert payload:', insert)
      const { data: inserted, error } = await supabase.from('isler').insert([insert]).select()
      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }
      console.log('Inserted isler:', inserted)
      toast.success('Görev oluşturuldu')
      navigate('/admin/tasks')
    } catch (e) {
      console.error('Görev oluşturma hata:', e)
      toast.error(e?.message || JSON.stringify(e) || 'Hata')
    }
  }

  const containerStyle = {
    padding: '32px',
    backgroundColor: '#f3f4f6',
    minHeight: '100vh',
  }

  const cardStyle = {
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

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#0a1e42',
              letterSpacing: '-0.03em',
            }}
          >
            Yeni Görev Oluştur
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şablon, birim ve personel ile şirketiniz için görev oluşturun.'
              : 'Şablon, şirket ve personel seçerek hızlıca yeni bir görev tanımlayın.'}
          </p>
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Şablon (opsiyonel)</label>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <select
                value={form.sablon_id}
                onChange={(e) =>
                  setForm({ ...form, sablon_id: e.target.value })
                }
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">-- Şablon seçin --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.baslik}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => navigate('/admin/task-templates/new')}
                style={{
                  padding: '8px 12px',
                  borderRadius: 9999,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Plus size={14} />
                Yeni Şablon
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Başlık (şablon yoksa)</label>
            <input
              type="text"
              value={form.baslik}
              onChange={(e) =>
                setForm({ ...form, baslik: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Şirket</label>
            {companyScoped && companies.length === 1 ? (
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
            ) : (
              <select
                value={form.ana_sirket_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ana_sirket_id: e.target.value,
                    birim_id: '',
                  })
                }
                style={inputStyle}
              >
                <option value="">Şirket seçin</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ana_sirket_adi}
                  </option>
                ))}
              </select>
            )}
            {companyScoped && companies.length === 0 && (
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Şirket bilgisi yükleniyor…
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Birim</label>
            <select
              value={form.birim_id}
              onChange={(e) =>
                setForm({ ...form, birim_id: e.target.value })
              }
              style={inputStyle}
            >
              <option value="">-- Birim seçin --</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.birim_adi}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Personel (opsiyonel)</label>
            <select
              value={form.personel_id}
              onChange={(e) =>
                setForm({ ...form, personel_id: e.target.value })
              }
              style={inputStyle}
            >
              <option value="">-- Personel seçin --</option>
              {persons.map((p) => {
                const name =
                  p.ad && p.soyad
                    ? `${p.ad} ${p.soyad}`
                    : p.email || p.id
                return (
                  <option key={p.id} value={p.id}>
                    {name}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Bitiş Tarihi</label>
            <input
              type="datetime-local"
              value={form.bitis_tarihi}
              onChange={(e) =>
                setForm({ ...form, bitis_tarihi: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Puan (opsiyonel)</label>
            <input
              type="number"
              min={0}
              value={form.puan}
              onChange={(e) =>
                setForm({ ...form, puan: Number(e.target.value) })
              }
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 12,
              color: '#4b5563',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={form.acil}
                onChange={(e) =>
                  setForm({ ...form, acil: e.target.checked })
                }
              />
              Acil Görev
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <input
                type="checkbox"
                checked={form.foto_zorunlu}
                onChange={(e) =>
                  setForm({ ...form, foto_zorunlu: e.target.checked })
                }
              />
              Fotoğraf Zorunlu
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Min Fotoğraf Sayısı
              <input
                type="number"
                value={form.min_foto_sayisi}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_foto_sayisi: Number(e.target.value),
                  })
                }
                style={{
                  ...inputStyle,
                  width: 80,
                }}
              />
            </label>
          </div>

          <div>
            <label style={labelStyle}>Açıklama</label>
            <input
              type="text"
              value={form.aciklama}
              onChange={(e) =>
                setForm({ ...form, aciklama: e.target.value })
              }
              style={inputStyle}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#4b5563',
                marginTop: 6,
              }}
            >
              <input
                type="checkbox"
                checked={form.aciklama_zorunlu}
                onChange={(e) =>
                  setForm({
                    ...form,
                    aciklama_zorunlu: e.target.checked,
                  })
                }
              />
              Açıklama Zorunlu
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/admin/tasks')}
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
              type="button"
              onClick={submit}
              style={{
                padding: '8px 18px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#0a1e42',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

