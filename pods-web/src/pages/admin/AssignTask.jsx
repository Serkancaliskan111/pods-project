import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import getSupabase from '../../lib/supabaseClient'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { toast } from 'sonner'
import { ASSIGN_TASK_PERSON_LIMIT } from '../../lib/supabaseScope.js'

const supabase = getSupabase()

function useQuery() {
  return new URLSearchParams(useLocation().search)
}

export default function AssignTask() {
  const query = useQuery()
  const navigate = useNavigate()
  const personId = query.get('personId')
  const [person, setPerson] = useState(null)
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedPuan, setSelectedPuan] = useState(0)
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedUnit, setSelectedUnit] = useState(personId ? '' : '')
  const [persons, setPersons] = useState([])
  const [baslik, setBaslik] = useState('')
  const [fotoZorunlu, setFotoZorunlu] = useState(false)
  const [minFoto, setMinFoto] = useState(0)
  const [aciklama, setAciklama] = useState('')
  const [aciklamaZorunlu, setAciklamaZorunlu] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      const [tplRes, compRes] = await Promise.all([
        supabase.from('is_sablonlari').select('id,baslik').is('silindi_at', null),
        supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
      ])
      if (tplRes.error) console.error('is_sablonlari load error', tplRes.error)
      setTemplates(tplRes.data || [])

      if (compRes.error) {
        console.error('ana_sirketler load error', compRes.error)
        const fb = await supabase
          .from('ana_sirketler')
          .select('*')
          .is('silindi_at', null)
        if (fb.error) console.error('ana_sirketler fallback error', fb.error)
        setCompanies(fb.data || [])
      } else {
        setCompanies(compRes.data || [])
      }

      if (personId) {
        const { data, error } = await supabase
          .from('personeller')
          .select('id,ad,soyad,email,ana_sirket_id,birim_id,rol_id,durum')
          .eq('id', personId)
          .maybeSingle()
        if (error) {
          console.error('personel load error', error)
          toast.error('Personel yüklenemedi')
        } else {
          setPerson(data || null)
          if (data?.birim_id) {
            setSelectedUnit(data.birim_id)
          }
        }
      }
    }
    run()
  }, [personId])

  useEffect(() => {
    if (!selectedCompany) {
      setUnits([])
      return
    }
    supabase.from('birimler').select('id,birim_adi').eq('ana_sirket_id', selectedCompany).is('silindi_at', null).then(({ data }) => setUnits(data || []))
  }, [selectedCompany])

  useEffect(() => {
    if (personId) return // person already loaded
    if (!selectedUnit) {
      supabase
        .from('personeller')
        .select('id,ad,soyad,email,birim_id')
        .is('silindi_at', null)
        .order('ad', { ascending: true })
        .limit(ASSIGN_TASK_PERSON_LIMIT)
        .then(({ data }) => setPersons(data || []))
      return
    }
    supabase
      .from('personeller')
      .select('id,ad,soyad,email,birim_id')
      .eq('birim_id', selectedUnit)
      .is('silindi_at', null)
      .order('ad', { ascending: true })
      .limit(ASSIGN_TASK_PERSON_LIMIT)
      .then(({ data }) => setPersons(data || []))
  }, [selectedUnit, personId])

  const submit = async () => {
    // allow assigning without a template (ad-hoc) if aciklama or baslik provided
    if (!selectedTemplate && !aciklama && !person) return toast.error('Şablon seçin veya açıklama girin')
    if (fotoZorunlu && Number(minFoto) <= 0) return toast.error('Minimum fotoğraf sayısı 1 veya daha fazla olmalı')
    setLoading(true)
    try {
      const insert = {
        is_sablon_id: selectedTemplate || null,
        ana_sirket_id: selectedCompany || person?.ana_sirket_id || null,
        birim_id: selectedUnit || person?.birim_id || null,
        sorumlu_personel_id: personId || null,
        puan: typeof selectedPuan !== 'undefined' ? Number(selectedPuan) : null,
        atayan_personel_id: null,
        durum: 'ATANDI',
        son_tarih: selectedDate || null,
        foto_zorunlu: !!fotoZorunlu,
        min_foto_sayisi: Number(minFoto) || 0,
        aciklama_zorunlu: !!aciklamaZorunlu,
        aciklama: aciklama || null,
      }
      console.log('AssignTask payload:', insert)
      const { data: inserted, error } = await supabase.from('isler').insert([insert]).select()
      if (error) {
        console.error('Supabase insert error:', error)
        throw error
      }
      console.log('Inserted isler:', inserted)
      toast.success('Görev atandı')
      navigate('/admin/task-templates')
    } catch (e) {
      console.error('Görev atama hata:', e)
      toast.error(e?.message || JSON.stringify(e) || 'Atama hatası')
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
    padding: 20,
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
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
          gap: 20,
        }}
      >
        {/* Sol: seçili personel */}
        <div>
          <div style={cardStyle}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
                color: '#0a1e42',
              }}
            >
              Seçili Personel
            </h3>
            {person ? (
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#111827',
                  }}
                >
                  {person.ad && person.soyad
                    ? `${person.ad} ${person.soyad}`
                    : person.email || person.id}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 2,
                  }}
                >
                  {person.birimler?.birim_adi ?? person.birim_adi ?? ''}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    marginTop: 2,
                  }}
                >
                  {person.email || ''}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                }}
              >
                Hiçbir personel seçilmedi. Personel listesinden veya ilgili
                butondan bir personel seçin.
              </div>
            )}
          </div>
        </div>

        {/* Sağ: görev atama formu */}
        <div>
          <div style={cardStyle}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 12,
                color: '#0a1e42',
              }}
            >
              Görev Atama
            </h3>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div>
                <label style={labelStyle}>Şablon</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Şablon seçin --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.baslik}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Şirket</label>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Şirket seçin --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ana_sirket_adi}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Birim</label>
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
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

              {!personId && (
                <div>
                  <label style={labelStyle}>Personel (opsiyonel)</label>
                  <select
                    value={person ? person.id : ''}
                    onChange={(e) => {
                      const pid = e.target.value
                      const found = persons.find((x) => x.id === pid)
                      if (found) setPerson(found)
                      else {
                        supabase
                          .from('personeller')
                          .select('id,ad,soyad,email,birim_id')
                          .eq('id', pid)
                          .maybeSingle()
                          .then(({ data }) => setPerson(data || null))
                      }
                    }}
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
              )}

              <div>
                <label style={labelStyle}>Tarih</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Puan (opsiyonel)</label>
                <input
                  type="number"
                  min={0}
                  value={selectedPuan}
                  onChange={(e) => setSelectedPuan(Number(e.target.value))}
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
                  marginTop: 4,
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
                    checked={fotoZorunlu}
                    onChange={(e) => setFotoZorunlu(e.target.checked)}
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
                    value={minFoto}
                    onChange={(e) => setMinFoto(Number(e.target.value))}
                    style={{
                      ...inputStyle,
                      width: 80,
                    }}
                  />
                </label>
              </div>

              <div>
                <label style={labelStyle}>Açıklama (opsiyonel)</label>
                <input
                  type="text"
                  value={aciklama}
                  onChange={(e) => setAciklama(e.target.value)}
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
                    checked={aciklamaZorunlu}
                    onChange={(e) => setAciklamaZorunlu(e.target.checked)}
                  />
                  Açıklama Zorunlu
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 16,
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
                  {loading ? 'Atanıyor...' : 'Görev Ata'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

