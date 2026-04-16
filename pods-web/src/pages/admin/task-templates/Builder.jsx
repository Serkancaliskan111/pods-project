import { useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [ad, setAd] = useState('')
  const [anaSirketId, setAnaSirketId] = useState('')
  const [companies, setCompanies] = useState([])
  const [templateId, setTemplateId] = useState(id || '')
  const hydratedRef = useRef(false)
  const lastSavedSnapshotRef = useRef('')
  const genelPuan = useMemo(
    () => (questions || []).reduce((sum, q) => sum + (Number(q?.puan_degeri) || 0), 0),
    [questions],
  )

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
          setTemplateId(data.id || id || '')
          setAd(data.baslik || '')
          setAnaSirketId(data.ana_sirket_id || '')
          supabase
            .from('is_sablon_sorulari')
            .select('id, sablon_id, soru_metni, soru_tipi, puan_degeri, foto_zorunlu, min_foto_sayisi, zorunlu_mu, sira')
            .eq('sablon_id', id)
            .order('sira', { ascending: true })
            .then(({ data: q }) => {
              const normalized = (q || []).map((x) => normalizeQuestion(x))
              setQuestions(normalized)
              hydratedRef.current = true
              lastSavedSnapshotRef.current = JSON.stringify({
                ad: data.baslik || '',
                anaSirketId: String(data.ana_sirket_id || ''),
                questions: normalized,
              })
            })
        }
      })
  }, [id, isSystemAdmin, currentCompanyId, navigate])

  useEffect(() => {
    if (id) return
    if (companyScoped && currentCompanyId) {
      setAnaSirketId(String(currentCompanyId))
    }
    hydratedRef.current = true
  }, [id, companyScoped, currentCompanyId])

  const normalizeQuestion = (q = {}) => {
    const soruTipi = q.soru_tipi || 'EVET_HAYIR'
    const fotoTipi = soruTipi === 'FOTOGRAF'
    const fotoZorunlu = fotoTipi ? !!q.foto_zorunlu : false
    const minFotoSayisi = fotoZorunlu ? Math.min(5, Math.max(1, Number(q.min_foto_sayisi) || 1)) : 0
    return {
      id: q.id || uuidv4(),
      soru_metni: q.soru_metni || '',
      soru_tipi: soruTipi,
      puan_degeri: Number.isFinite(Number(q.puan_degeri)) ? Number(q.puan_degeri) : 1,
      foto_zorunlu: fotoZorunlu,
      min_foto_sayisi: minFotoSayisi,
      zorunlu_mu: !!q.zorunlu_mu,
    }
  }

  const addQuestion = () => {
    setQuestions((s) => [
      ...s,
      normalizeQuestion({
        id: uuidv4(),
        soru_metni: '',
        soru_tipi: 'EVET_HAYIR',
        puan_degeri: 1,
        foto_zorunlu: false,
        min_foto_sayisi: 0,
        zorunlu_mu: false,
      }),
    ])
  }

  const updateQuestion = (idx, patch) => {
    setQuestions((s) =>
      s.map((q, i) => (i === idx ? normalizeQuestion({ ...q, ...patch }) : q)),
    )
  }

  const removeQuestion = (idx) => setQuestions((s) => s.filter((_, i) => i !== idx))

  const save = async (silent = false) => {
    const sirketKayit = companyScoped
      ? currentCompanyId
      : anaSirketId || null
    if (companyScoped && !currentCompanyId) {
      toast.error('Şirket bilgisi bulunamadı')
      return
    }

    setSaving(true)
    setSaveStatus('Kaydediliyor...')
    try {
      let nextTemplateId = templateId || id
      const title = ad.trim() || 'Şablon'
      if (!nextTemplateId) {
        const { data, error } = await supabase
          .from('is_sablonlari')
          .insert([
            {
              baslik: title,
              ana_sirket_id: sirketKayit,
              varsayilan_puan: Number(genelPuan),
              puan: Number(genelPuan),
            },
          ])
          .select()
        if (error) throw error
        nextTemplateId = data?.[0]?.id
        setTemplateId(nextTemplateId)
      } else {
        const { error } = await supabase
          .from('is_sablonlari')
          .update({
            baslik: title,
            ana_sirket_id: sirketKayit,
            varsayilan_puan: Number(genelPuan),
            puan: Number(genelPuan),
          })
          .eq('id', nextTemplateId)
        if (error) throw error
        await supabase.from('is_sablon_sorulari').delete().eq('sablon_id', nextTemplateId)
      }

      // insert questions (bulk)
      const toInsert = questions.map((q, idx) => ({
        sablon_id: nextTemplateId,
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

      lastSavedSnapshotRef.current = JSON.stringify({
        ad,
        anaSirketId: String(anaSirketId || ''),
        questions: questions.map((q) => normalizeQuestion(q)),
      })
      setSaveStatus('Kaydedildi')
      if (!silent) toast.success('Şablon kaydedildi')
    } catch (e) {
      setSaveStatus('Kaydedilemedi')
      if (!silent) toast.error(e.message || 'Kaydedilemedi')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!hydratedRef.current) return
    const snapshot = JSON.stringify({
      ad,
      anaSirketId: String(anaSirketId || ''),
      questions: questions.map((q) => normalizeQuestion(q)),
    })
    if (snapshot === lastSavedSnapshotRef.current) return
    const t = setTimeout(() => {
      save(true)
    }, 550)
    return () => clearTimeout(t)
  }, [ad, anaSirketId, questions])

  const containerStyle = {
    padding: '28px 32px 40px',
    background:
      'radial-gradient(1200px 500px at -10% -10%, rgba(79,70,229,0.10), transparent 60%), radial-gradient(900px 400px at 110% -20%, rgba(14,165,233,0.10), transparent 55%), #f8fafc',
    minHeight: '100vh',
  }

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    boxShadow: '0 24px 55px rgba(15,23,42,0.12)',
    border: '1px solid #e2e8f0',
    maxWidth: 1180,
    margin: '0 auto',
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
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    padding: '12px 14px',
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
  }

  const sectionTitleStyle = {
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    color: '#475569',
    marginBottom: 10,
  }

  const questionCardStyle = {
    padding: 18,
    borderRadius: 18,
    border: '1px solid #e2e8f0',
    backgroundColor: '#fcfdff',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    boxShadow: '0 2px 10px rgba(15,23,42,0.05)',
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Aksiyonlar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          maxWidth: 1180,
          marginInline: 'auto',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: '#0a1e42',
              letterSpacing: '-0.03em',
            }}
          >
            {id ? 'Şablon Düzenle' : 'Yeni Şablon Oluştur'}
          </h1>
          <p
            style={{
              fontSize: 16,
              color: '#64748b',
              marginTop: 6,
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
            onClick={() => save(false)}
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
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Şimdi Kaydet'}
          </button>
        </div>
      </div>
      {saveStatus ? (
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto 12px',
            fontSize: 12,
            color: saveStatus === 'Kaydedilemedi' ? '#b91c1c' : '#0f172a',
            backgroundColor: saveStatus === 'Kaydedilemedi' ? '#fee2e2' : '#ecfeff',
            border: `1px solid ${saveStatus === 'Kaydedilemedi' ? '#fecaca' : '#bae6fd'}`,
            borderRadius: 12,
            padding: '8px 10px',
          }}
        >
          Otomatik kayıt durumu: <strong>{saveStatus}</strong>
        </div>
      ) : null}

      <div style={cardStyle}>
        {/* Şablon temel bilgileri */}
        <div style={{ marginBottom: 22 }}>
          <div style={sectionTitleStyle}>Genel Bilgiler</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
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
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                background:
                  'linear-gradient(145deg, rgba(79,70,229,0.09), rgba(14,165,233,0.07))',
                padding: '12px 14px',
              }}
            >
              <div style={{ ...labelStyle, marginBottom: 2 }}>Genel Puan (Otomatik)</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{genelPuan}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Sistem toplam puanı, tüm soru puanlarının toplamı olarak hesaplar.
              </div>
            </div>
          </div>
        </div>

        {/* Sorular */}
        <div>
          <div style={sectionTitleStyle}>Sorular (Checklist)</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((q, idx) => (
              <div key={q.id} style={questionCardStyle}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                      Checklist maddesi
                    </div>
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
                  <input
                    type="text"
                    placeholder="Örn: Alan temizliği tamamlandı mı?"
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
                      gap: 10,
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
                          {t === 'EVET_HAYIR' ? 'Evet / Hayır' : t === 'FOTOGRAF' ? 'Fotoğraf' : 'Metin'}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 9999,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Puan</span>
                      <input
                        type="number"
                        min={0}
                        value={q.puan_degeri}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            puan_degeri: Number(e.target.value),
                          })
                        }
                        style={{
                          ...inputStyle,
                          width: 72,
                          marginBottom: 0,
                          padding: '6px 10px',
                          borderRadius: 10,
                          backgroundColor: '#fff',
                        }}
                      />
                    </div>
                    {q.soru_tipi === 'FOTOGRAF' ? (
                      <>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 12,
                            color: '#4b5563',
                          }}
                        >
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!!q.foto_zorunlu}
                            onClick={() =>
                              updateQuestion(idx, {
                                foto_zorunlu: !q.foto_zorunlu,
                              })
                            }
                            style={{
                              position: 'relative',
                              width: 40,
                              height: 22,
                              borderRadius: 9999,
                              border: 'none',
                              backgroundColor: q.foto_zorunlu ? '#4f46e5' : '#cbd5e1',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s ease',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: 2,
                                left: q.foto_zorunlu ? 20 : 2,
                                width: 18,
                                height: 18,
                                borderRadius: 9999,
                                backgroundColor: '#fff',
                                boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
                                transition: 'left 0.2s ease',
                              }}
                            />
                          </button>
                          Fotoğraf Zorunlu
                        </label>
                        {q.foto_zorunlu ? (
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
                              min={1}
                              max={5}
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
                        ) : null}
                      </>
                    ) : null}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: '#4b5563',
                      }}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!q.zorunlu_mu}
                        onClick={() =>
                          updateQuestion(idx, {
                            zorunlu_mu: !q.zorunlu_mu,
                          })
                        }
                        style={{
                          position: 'relative',
                          width: 40,
                          height: 22,
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: q.zorunlu_mu ? '#4f46e5' : '#cbd5e1',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: 2,
                            left: q.zorunlu_mu ? 20 : 2,
                            width: 18,
                            height: 18,
                            borderRadius: 9999,
                            backgroundColor: '#fff',
                            boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
                            transition: 'left 0.2s ease',
                          }}
                        />
                      </button>
                      Zorunlu cevap
                    </label>
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
                Henüz checklist maddesi yok. Aşağıdaki “Soru Ekle” butonuyla başlayın.
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              onClick={addQuestion}
              style={{
                padding: '10px 16px',
                borderRadius: 9999,
                border: 'none',
                background:
                  'linear-gradient(90deg, rgba(79,70,229,1) 0%, rgba(37,99,235,1) 100%)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 8px 20px rgba(37,99,235,0.28)',
              }}
            >
              <Plus size={14} />
              Soru Ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

