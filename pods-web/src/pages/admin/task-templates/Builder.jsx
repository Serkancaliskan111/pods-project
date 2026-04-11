import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Trash } from 'lucide-react'
import { AuthContext } from '../../../contexts/AuthContext.jsx'

const supabase = getSupabase()

// Requested question types
const QUESTION_TYPES = ['EVET_HAYIR', 'FOTOGRAF', 'METIN']

export default function TemplateBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [template, setTemplate] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [ad, setAd] = useState('')
  const [anaSirketId, setAnaSirketId] = useState('')
  const [puanEtkisi, setPuanEtkisi] = useState(100)
  const [companies, setCompanies] = useState([])

  useEffect(() => {
    let compQ = supabase
      .from('ana_sirketler')
      .select('id,ana_sirket_adi')
      .is('silindi_at', null)
    if (companyScoped && currentCompanyId) {
      compQ = compQ.eq('id', currentCompanyId)
    }
    compQ.then(({ data }) => setCompanies(data || []))
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    supabase
      .from('is_sablonlari')
      .select('id, ana_sirket_id, baslik, aciklama, varsayilan_puan, puan, foto_zorunlu, min_foto_sayisi')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          toast.error('Şablon yüklenemedi')
          console.error(error)
          return
        }
        if (data) {
          if (!isSystemAdmin && currentCompanyId) {
            if (
              !data.ana_sirket_id ||
              String(data.ana_sirket_id) !== String(currentCompanyId)
            ) {
              toast.error('Bu şablona erişim yetkiniz yok')
              navigate('/unauthorized', { replace: true })
              return
            }
          }
          setTemplate(data)
          setAd(data.baslik || '')
          setAnaSirketId(data.ana_sirket_id || '')
          setPuanEtkisi(Number(data.varsayilan_puan ?? data.puan ?? 100))
          supabase
            .from('is_sablon_sorulari')
            .select('id, sablon_id, soru_metni, soru_tipi, puan_degeri, foto_zorunlu, min_foto_sayisi, zorunlu_mu, sira')
            .eq('sablon_id', id)
            .order('sira', { ascending: true })
            .then(({ data: q }) => setQuestions(q || []))
        }
      })
  }, [id, isSystemAdmin, currentCompanyId, navigate])

  useEffect(() => {
    if (id) return
    if (companyScoped && currentCompanyId) {
      setAnaSirketId(String(currentCompanyId))
    }
  }, [id, companyScoped, currentCompanyId])

  const addQuestion = () => {
    setQuestions((s) => [...s, { id: uuidv4(), soru_metni: '', soru_tipi: 'EVET_HAYIR', puan_degeri: 1, foto_zorunlu: false, min_foto_sayisi: 0, zorunlu_mu: false }])
  }

  const updateQuestion = (idx, patch) => {
    setQuestions((s) => s.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  const removeQuestion = (idx) => setQuestions((s) => s.filter((_, i) => i !== idx))

  const save = async () => {
    const sirketKayit = companyScoped
      ? currentCompanyId
      : anaSirketId || null
    if (companyScoped && !currentCompanyId) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }

    setLoading(true)
    try {
      let templateId = id
      const title = ad.trim() || 'Şablon'
      if (!templateId) {
        const { data, error } = await supabase
          .from('is_sablonlari')
          .insert([
            {
              baslik: title,
              ana_sirket_id: sirketKayit,
              varsayilan_puan: Number(puanEtkisi),
              puan: Number(puanEtkisi),
            },
          ])
          .select()
        if (error) throw error
        templateId = data[0].id
      } else {
        const { error } = await supabase
          .from('is_sablonlari')
          .update({
            baslik: title,
            ana_sirket_id: sirketKayit,
            varsayilan_puan: Number(puanEtkisi),
            puan: Number(puanEtkisi),
          })
          .eq('id', templateId)
        if (error) throw error
        await supabase.from('is_sablon_sorulari').delete().eq('sablon_id', templateId)
      }

      // insert questions (bulk)
      const toInsert = questions.map((q, idx) => ({
        sablon_id: templateId,
        soru_metni: q.soru_metni,
        soru_tipi: q.soru_tipi,
        puan_degeri: Number(q.puan_degeri) || 0,
        foto_zorunlu: !!q.foto_zorunlu,
        min_foto_sayisi: Number(q.min_foto_sayisi) || 0,
        zorunlu_mu: !!q.zorunlu_mu,
        sira: idx + 1,
      }))

      if (toInsert.length) {
        const { error } = await supabase.from('is_sablon_sorulari').insert(toInsert)
        if (error) throw error
      }

      toast.success('Şablon kaydedildi')
      navigate('/admin/task-templates')
    } catch (e) {
      toast.error(e.message || 'Kaydedilemedi')
      console.error(e)
    } finally {
      setLoading(false)
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

  const sectionTitleStyle = {
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b7280',
    marginBottom: 8,
  }

  const questionCardStyle = {
    padding: 12,
    borderRadius: 16,
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Aksiyonlar */}
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
            {id ? 'Şablon Düzenle' : 'Yeni Şablon Oluştur'}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketinize özel şablon ve soruları tanımlayın.'
              : 'Görev şablonunu ve checklist sorularını tanımlayın.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/admin/task-templates')}
            style={{
              padding: '8px 14px',
              borderRadius: 9999,
              border: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              color: '#111827',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Geri
          </button>
          <button
            type="button"
            onClick={save}
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
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        {/* Şablon temel bilgileri */}
        <div style={{ marginBottom: 20 }}>
          <div style={sectionTitleStyle}>Genel Bilgiler</div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Şablon Adı</label>
              <input
                type="text"
                placeholder="Örn: Günlük Temizlik Kontrolü"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
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
              ) : companyScoped && companies.length === 0 ? (
                <p style={{ fontSize: 12, color: '#6b7280' }}>
                  Şirket bilgisi yükleniyor…
                </p>
              ) : (
                <select
                  value={anaSirketId}
                  onChange={(e) => setAnaSirketId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Şirket seçin (global şablon)</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label style={labelStyle}>Puan Etkisi (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={puanEtkisi}
                onChange={(e) => setPuanEtkisi(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Sorular */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={sectionTitleStyle}>Sorular (Checklist)</div>
            <button
              type="button"
              onClick={addQuestion}
              style={{
                padding: '6px 12px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={14} />
              Yeni Soru Ekle
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((q, idx) => (
              <div key={q.id} style={questionCardStyle}>
                <div
                  style={{
                    width: 24,
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 4,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Soru metni"
                    value={q.soru_metni}
                    onChange={(e) =>
                      updateQuestion(idx, { soru_metni: e.target.value })
                    }
                    style={inputStyle}
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <select
                      value={q.soru_tipi}
                      onChange={(e) =>
                        updateQuestion(idx, { soru_tipi: e.target.value })
                      }
                      style={{
                        ...inputStyle,
                        width: 140,
                        borderRadius: 9999,
                      }}
                    >
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={q.puan_degeri}
                      onChange={(e) =>
                        updateQuestion(idx, {
                          puan_degeri: Number(e.target.value),
                        })
                      }
                      style={{
                        ...inputStyle,
                        width: 90,
                      }}
                    />
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: '#4b5563',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!q.foto_zorunlu}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            foto_zorunlu: e.target.checked,
                          })
                        }
                      />
                      Fotoğraf Zorunlu
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: '#4b5563',
                      }}
                    >
                      Min Fotoğraf
                      <input
                        type="number"
                        value={q.min_foto_sayisi}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            min_foto_sayisi: Number(e.target.value),
                          })
                        }
                        style={{
                          ...inputStyle,
                          width: 70,
                          marginLeft: 4,
                        }}
                      />
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: '#4b5563',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!q.zorunlu_mu}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            zorunlu_mu: e.target.checked,
                          })
                        }
                      />
                      Zorunlu
                    </label>
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#fee2e2',
                        color: '#b91c1c',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <Trash size={14} />
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {!questions.length && (
              <div
                style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  paddingTop: 4,
                }}
              >
                Henüz soru eklenmedi. “Yeni Soru Ekle” butonu ile başlayın.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

