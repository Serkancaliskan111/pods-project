import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import getSupabase from '../../../lib/supabaseClient'
import {
  AlignLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Link2,
  Lock,
  Plus,
  Repeat,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { GOREV_TURU } from '../../../lib/zincirTasks.js'

const supabase = getSupabase()

function addDaysIso(isoString, days) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return isoString
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function personName(p) {
  if (!p) return ''
  const n = [p.ad, p.soyad].filter(Boolean).join(' ').trim()
  return n || p.email || String(p.id)
}

function FieldSwitch({ id, checked, onChange, disabled, label, description }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 transition ${
        disabled ? 'opacity-55' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description ? <p className="mt-0.5 text-xs leading-snug text-slate-500">{description}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'

const sectionCardClass =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]'

const GOREV_MODU_OPTIONS = [
  { value: 'normal', label: 'Standart', sub: 'Tek sorumlu' },
  { value: 'zincir_gorev', label: 'Zincir görev', sub: 'Sırayla yürütme' },
  { value: 'zincir_onay', label: 'Zincir onay', sub: 'Sırayla onay' },
  { value: 'zincir_gorev_ve_onay', label: 'Görev + onay', sub: 'İkisi birden' },
]

export default function NewTask() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const currentPersonelId = personel?.id ? String(personel.id) : ''
  const accessibleUnitIds = isSystemAdmin ? null : personel?.accessibleUnitIds || []
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
    baslama_tarihi: '',
    bitis_tarihi: '',
    acil: false,
    foto_zorunlu: false,
    min_foto_sayisi: 0,
    aciklama_zorunlu: false,
    aciklama: '',
    puan: 0,
    tekrarlayan: false,
    tekrar_gun: 30,
  })

  const [gorevModu, setGorevModu] = useState('normal')
  const templateAllowedInMode = gorevModu === 'normal'
  const [zincirGorevSira, setZincirGorevSira] = useState([])
  const [zincirOnaySira, setZincirOnaySira] = useState([])
  const [zincirEkleGorev, setZincirEkleGorev] = useState('')
  const [zincirEkleOnay, setZincirEkleOnay] = useState('')
  /** Şablon checklist soruları — foto tekrarını gizlemek için */
  const [sablonSorular, setSablonSorular] = useState([])
  const lastAppliedSablonId = useRef('')

  const accessibleUnitIdsKey = JSON.stringify(accessibleUnitIds || [])

  const selectedTemplate = useMemo(
    () =>
      templateAllowedInMode
        ? templates.find((t) => String(t.id) === String(form.sablon_id))
        : null,
    [templates, form.sablon_id, templateAllowedInMode],
  )

  /** Şablon checklist’inde foto maddesi var mı (ham veri; mod kontrolü ayrı) */
  const sablonChecklistFotoVar = useMemo(
    () =>
      (sablonSorular || []).some(
        (q) =>
          q?.soru_tipi === 'FOTOGRAF' ||
          !!q?.foto_zorunlu ||
          (Number(q?.min_foto_sayisi) || 0) > 0,
      ),
    [sablonSorular],
  )

  /** Checklist yalnızca standart görev modunda işlenir */
  const hasChecklistPhoto = gorevModu === 'normal' && sablonChecklistFotoVar

  /** Şablon seçiliyken görev seviyesinde foto sorma (şablon satırı veya — standart modda — checklist) */
  const fotoSablondanGeliyor =
    !!form.sablon_id &&
    !!selectedTemplate &&
    (!!selectedTemplate.foto_zorunlu || hasChecklistPhoto)

  const checklistMaxMinFoto = useMemo(() => {
    if (gorevModu !== 'normal') return 0
    const qs = sablonSorular || []
    let max = 0
    for (const q of qs) {
      if (q?.soru_tipi === 'FOTOGRAF' || q?.foto_zorunlu) {
        const n = Math.min(5, Math.max(1, Number(q.min_foto_sayisi) || 1))
        if (n > max) max = n
      }
    }
    return max
  }, [sablonSorular, gorevModu])

  const sablonPuan = useMemo(() => {
    if (!selectedTemplate) return null
    const v = Number(selectedTemplate.varsayilan_puan ?? selectedTemplate.puan ?? 0)
    return Number.isFinite(v) ? v : 0
  }, [selectedTemplate])

  useEffect(() => {
    const pid = searchParams.get('personId')
    const cid = searchParams.get('company')
    if (pid) setForm((f) => ({ ...f, personel_id: String(pid) }))
    if (cid && isSystemAdmin) setForm((f) => ({ ...f, ana_sirket_id: String(cid) }))
  }, [searchParams, isSystemAdmin])

  useEffect(() => {
    supabase
      .from('is_sablonlari')
      .select(
        'id,baslik,aciklama,ana_sirket_id,varsayilan_puan,puan,foto_zorunlu,min_foto_sayisi',
      )
      .is('silindi_at', null)
      .then(({ data, error }) => {
        if (error) console.error('is_sablonlari load error', error)
        let list = data || []
        if (companyScoped && currentCompanyId) {
          list = list.filter(
            (x) => !x.ana_sirket_id || String(x.ana_sirket_id) === String(currentCompanyId),
          )
        }
        setTemplates(list)
      })

    let compQ = supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null)
    if (companyScoped && currentCompanyId) compQ = compQ.eq('id', currentCompanyId)
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
              list = list.filter((c) => String(c.id) === String(currentCompanyId))
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
      setForm((f) => (f.ana_sirket_id ? f : { ...f, ana_sirket_id: String(companies[0].id) }))
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
  }, [form.ana_sirket_id, isSystemAdmin, accessibleUnitIdsKey])

  useEffect(() => {
    let q = supabase
      .from('personeller')
      .select('id,personel_kodu,ad,soyad,kullanici_id,ana_sirket_id,birim_id,rol_id,durum,email')
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
  }, [form.birim_id, isSystemAdmin, currentCompanyId, accessibleUnitIdsKey])

  /** Şablon değişince şablon satırını yeniden uygulamaya izin ver */
  useEffect(() => {
    lastAppliedSablonId.current = ''
  }, [form.sablon_id])

  useEffect(() => {
    if (!form.sablon_id || gorevModu !== 'normal') {
      setSablonSorular([])
      return
    }
    let cancelled = false
    supabase
      .from('is_sablon_sorulari')
      .select('soru_tipi, foto_zorunlu, min_foto_sayisi, soru_metni')
      .eq('sablon_id', form.sablon_id)
      .order('sira', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('is_sablon_sorulari load error', error)
          setSablonSorular([])
          return
        }
        setSablonSorular(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [form.sablon_id, gorevModu])

  /** Şablon seçilince başlık/açıklama/puan/foto şablondan senkron (liste geç yüklenirse tekrar dener) */
  useEffect(() => {
    if (!form.sablon_id) return
    const t = templates.find((x) => String(x.id) === String(form.sablon_id))
    if (!t) return
    if (lastAppliedSablonId.current === String(form.sablon_id)) return
    lastAppliedSablonId.current = String(form.sablon_id)
    const puanTpl = Number(t.varsayilan_puan ?? t.puan ?? 0)
    const fz = !!t.foto_zorunlu
    const mf = fz ? Math.min(5, Math.max(1, Number(t.min_foto_sayisi) || 1)) : 0
    setForm((f) => ({
      ...f,
      baslik: t.baslik != null ? String(t.baslik) : '',
      aciklama: t.aciklama != null ? String(t.aciklama) : '',
      puan: Number.isFinite(puanTpl) ? puanTpl : 0,
      foto_zorunlu: fz,
      min_foto_sayisi: mf,
      aciklama_zorunlu: false,
    }))
  }, [form.sablon_id, templates])

  const setFotoZorunlu = (on) => {
    setForm((f) => ({
      ...f,
      foto_zorunlu: on,
      min_foto_sayisi: on ? Math.max(1, Number(f.min_foto_sayisi) || 1) : 0,
    }))
  }

  const moveZincirGorev = (index, dir) => {
    setZincirGorevSira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const moveZincirOnay = (index, dir) => {
    setZincirOnaySira((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const resolvedGorevTuru = () => {
    if (gorevModu === 'normal') return GOREV_TURU.NORMAL
    if (gorevModu === 'zincir_gorev') return GOREV_TURU.ZINCIR_GOREV
    if (gorevModu === 'zincir_onay') return GOREV_TURU.ZINCIR_ONAY
    return GOREV_TURU.ZINCIR_GOREV_VE_ONAY
  }

  const zincirDisabled = form.tekrarlayan

  /** Zincir görev / onay personel blokları: önce şirket ve birim */
  const zincirAtamaHazir = !!form.ana_sirket_id && !!form.birim_id

  /** Bu modlarda sorumlular yalnızca zincir görev sırasından gelir */
  const personelAlaniZincirGorevden = gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay'

  useEffect(() => {
    if (gorevModu !== 'zincir_gorev' && gorevModu !== 'zincir_gorev_ve_onay') return
    setForm((f) => (f.personel_id ? { ...f, personel_id: '' } : f))
  }, [gorevModu])

  useEffect(() => {
    if (!currentPersonelId) return
    if (!form.personel_id) return
    if (String(form.personel_id) !== currentPersonelId) return
    setForm((f) => ({ ...f, personel_id: '' }))
  }, [form.personel_id, currentPersonelId])

  useEffect(() => {
    if (templateAllowedInMode) return
    setForm((f) =>
      f.sablon_id
        ? {
            ...f,
            sablon_id: '',
            foto_zorunlu: false,
            min_foto_sayisi: 0,
          }
        : f,
    )
  }, [templateAllowedInMode])

  const submit = async () => {
    const effectiveSablonId = templateAllowedInMode ? form.sablon_id : ''
    const tplRow = templates.find((t) => String(t.id) === String(effectiveSablonId))
    const resolvedBaslik =
      (tplRow?.baslik && String(tplRow.baslik).trim()) ||
      String(form.baslik || '').trim() ||
      ''
    if (!effectiveSablonId && !resolvedBaslik) return toast.error('Şablon veya başlık gerekli')
    if (!form.birim_id && !form.personel_id && gorevModu !== 'zincir_gorev' && gorevModu !== 'zincir_gorev_ve_onay') {
      return toast.error('Birim veya personel seçin')
    }
    if (form.tekrarlayan && gorevModu !== 'normal') {
      return toast.error('Tekrarlayan görev yalnızca standart modda kullanılabilir')
    }
    if (form.tekrarlayan) {
      if (!form.baslama_tarihi || !form.bitis_tarihi) {
        return toast.error('Tekrarlayan görev için başlangıç ve bitiş tarihi girin')
      }
      if (new Date(form.bitis_tarihi) <= new Date(form.baslama_tarihi)) {
        return toast.error('Bitiş tarihi başlangıçtan sonra olmalıdır')
      }
    }
    if (gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') {
      if (zincirGorevSira.length < 2) return toast.error('Zincir görev için en az 2 kişi ekleyin')
      if (currentPersonelId && String(zincirGorevSira[0]) === currentPersonelId) {
        return toast.error('Kendinizi görevin ilk sorumlusu yapamazsınız')
      }
    }
    if (gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') {
      if (zincirOnaySira.length < 2) return toast.error('Zincir onay için en az 2 onaylayıcı ekleyin')
    }
    if (gorevModu === 'zincir_onay' && !form.personel_id) {
      return toast.error('Zincir onayda görevi yapacak personeli seçin')
    }
    if (currentPersonelId && form.personel_id && String(form.personel_id) === currentPersonelId) {
      return toast.error('Kendinize görev atayamazsınız')
    }
    const tplFoto = !!tplRow?.foto_zorunlu
    const chkFoto = !!effectiveSablonId && gorevModu === 'normal' && sablonChecklistFotoVar
    const effectiveFotoZorunlu = effectiveSablonId
      ? tplFoto || chkFoto
      : !!form.foto_zorunlu
    let effectiveMinFoto = 0
    if (effectiveFotoZorunlu) {
      if (tplFoto) {
        const m = Math.min(5, Math.max(1, Number(tplRow.min_foto_sayisi) || 1))
        effectiveMinFoto = Math.max(m, checklistMaxMinFoto)
      } else if (chkFoto) {
        effectiveMinFoto = Math.max(1, checklistMaxMinFoto)
      } else {
        effectiveMinFoto = Number(form.min_foto_sayisi) || 0
      }
    }
    if (effectiveFotoZorunlu && effectiveMinFoto <= 0) {
      return toast.error('Minimum fotoğraf sayısı en az 1 olmalıdır')
    }

    const anaSirketId = companyScoped ? currentCompanyId : form.ana_sirket_id || null
    if (companyScoped && !anaSirketId) return toast.error('Şirket bilgisi bulunamadı')

    const firstZincirPerson = zincirGorevSira[0]
      ? persons.find((p) => String(p.id) === String(zincirGorevSira[0]))
      : null
    const resolvedBirimId =
      form.birim_id ||
      (firstZincirPerson?.birim_id ? String(firstZincirPerson.birim_id) : '')
    if ((gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') && !resolvedBirimId) {
      return toast.error('Zincir görev için birim seçin veya ilk personelin birimi tanımlı olsun')
    }
    const birimForInsert = resolvedBirimId || form.birim_id || null
    if (
      companyScoped &&
      birimForInsert &&
      accessibleUnitIds &&
      accessibleUnitIds.length &&
      !accessibleUnitIds.some((id) => String(id) === String(birimForInsert))
    ) {
      return toast.error('Seçilen birim için yetkiniz yok')
    }

    try {
      const tur = resolvedGorevTuru()
      const firstWorker =
        tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY
          ? zincirGorevSira[0]
          : form.personel_id || null

      const repeatActive = !!(form.tekrarlayan && gorevModu === 'normal')
      const repeatCount = repeatActive
        ? Math.min(90, Math.max(2, Number(form.tekrar_gun) || 30))
        : 1

      const resolvedPuan = effectiveSablonId
        ? Number(tplRow?.varsayilan_puan ?? tplRow?.puan ?? form.puan)
        : Number(form.puan)
      const resolvedAciklama = effectiveSablonId
        ? tplRow?.aciklama != null
          ? String(tplRow.aciklama)
          : null
        : form.aciklama || null

      const basePayload = {
        is_sablon_id: effectiveSablonId || null,
        baslik: resolvedBaslik || 'Görev',
        ana_sirket_id: anaSirketId,
        birim_id: birimForInsert,
        sorumlu_personel_id: firstWorker,
        puan: Number.isFinite(resolvedPuan) ? resolvedPuan : null,
        atayan_personel_id: null,
        durum: form.acil ? 'ACIL' : 'ATANDI',
        acil: !!form.acil,
        foto_zorunlu: effectiveFotoZorunlu,
        min_foto_sayisi: effectiveMinFoto,
        aciklama_zorunlu: effectiveSablonId ? false : !!form.aciklama_zorunlu,
        aciklama: resolvedAciklama,
        gorev_turu: tur,
        zincir_aktif_adim: 1,
        zincir_onay_aktif_adim: 0,
      }

      const payloads = []
      for (let offset = 0; offset < repeatCount; offset++) {
        const baslamaIso =
          form.baslama_tarihi && String(form.baslama_tarihi).trim() !== ''
            ? addDaysIso(new Date(form.baslama_tarihi).toISOString(), offset)
            : new Date().toISOString()
        const sonIso =
          form.bitis_tarihi && String(form.bitis_tarihi).trim() !== ''
            ? addDaysIso(new Date(form.bitis_tarihi).toISOString(), offset)
            : null
        payloads.push({
          ...basePayload,
          baslama_tarihi: baslamaIso,
          son_tarih: sonIso,
        })
      }

      let inserted = null
      const res = await supabase.from('isler').insert(payloads).select()
      if (res.error) {
        const msg = String(res.error?.message || '').toLowerCase()
        if (res.error?.code === '42703' && (msg.includes('gorev_turu') || msg.includes('zincir') || msg.includes('acil'))) {
          const fallbackPayloads = payloads.map((p) => {
            const next = { ...p }
            delete next.gorev_turu
            delete next.zincir_aktif_adim
            delete next.zincir_onay_aktif_adim
            delete next.acil
            return next
          })
          const res2 = await supabase.from('isler').insert(fallbackPayloads).select()
          if (res2.error) throw res2.error
          inserted = res2.data
        } else {
          throw res.error
        }
      } else {
        inserted = res.data
      }

      const rows = Array.isArray(inserted) ? inserted : inserted ? [inserted] : []
      const row = rows[0]
      const isId = row?.id

      if (isId && rows.length === 1 && (tur === GOREV_TURU.ZINCIR_GOREV || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
        const gorevRows = zincirGorevSira.map((pid, i) => ({
          is_id: isId,
          adim_no: i + 1,
          personel_id: pid,
          durum: i === 0 ? 'aktif' : 'sira_bekliyor',
        }))
        const { error: zgErr } = await supabase.from('isler_zincir_gorev_adimlari').insert(gorevRows)
        if (zgErr) {
          console.error('zincir gorev adimlari', zgErr)
          toast.error('Zincir görev adımları kaydedilemedi (migration 014 uygulandı mı?)')
        }
      }
      if (isId && rows.length === 1 && (tur === GOREV_TURU.ZINCIR_ONAY || tur === GOREV_TURU.ZINCIR_GOREV_VE_ONAY)) {
        const onayRows = zincirOnaySira.map((pid, i) => ({
          is_id: isId,
          adim_no: i + 1,
          onaylayici_personel_id: pid,
          durum: 'bekliyor',
        }))
        const { error: zoErr } = await supabase.from('isler_zincir_onay_adimlari').insert(onayRows)
        if (zoErr) {
          console.error('zincir onay adimlari', zoErr)
          toast.error('Zincir onay adımları kaydedilemedi (migration 014 uygulandı mı?)')
        }
      }

      toast.success(
        repeatActive && repeatCount > 1
          ? `${repeatCount} günlük tekrarlayan görev planlandı`
          : 'Görev oluşturuldu',
      )
      navigate('/admin/tasks')
    } catch (e) {
      console.error('Görev oluşturma hata:', e)
      toast.error(e?.message || JSON.stringify(e) || 'Hata')
    }
  }

  const sablonOzetFotoMetni = (() => {
    if (!selectedTemplate) return ''
    const parcalar = []
    if (selectedTemplate.foto_zorunlu) {
      parcalar.push(
        `Görev şablonu: en az ${Math.min(5, Math.max(1, Number(selectedTemplate.min_foto_sayisi) || 1))} fotoğraf`,
      )
    }
    if (hasChecklistPhoto) {
      parcalar.push(
        checklistMaxMinFoto > 0
          ? `Checklist: fotoğraf maddeleri (en az ${checklistMaxMinFoto})`
          : 'Checklist: fotoğraf maddeleri',
      )
    }
    return parcalar.join(' · ')
  })()

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-2 sm:px-6">
      <header className={`mb-8 ${sectionCardClass} bg-gradient-to-br from-slate-50 via-white to-indigo-50/[0.35] px-5 py-6 sm:px-8 sm:py-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Görevler</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Yeni görev oluştur</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          {companyScoped
            ? 'Şablon, birim ve personel ile görev tanımlayın; isteğe bağlı zincir görev veya zincir onay ekleyin.'
            : 'Şirket ve personel seçerek görev oluşturun; zincir modları ile sıralı yürütme veya onay tanımlayın.'}
        </p>
      </header>

      <div className="space-y-5">
        {/* Görev türü — segment */}
        <section className={`${sectionCardClass} p-5 sm:p-6`}>
          <div className="mb-4 flex items-center gap-2 text-slate-900">
            <Link2 className="h-5 w-5 text-indigo-600" aria-hidden />
            <h2 className="text-base font-bold">Görev türü</h2>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Standart görevde tek sorumlu kullanılır. Zincir görevde iş sırayla kişilerden geçer; zincir onayda
            tamamlanan iş sırayla onaylayıcılara gider.
          </p>
          <div
            className={`grid gap-2 sm:grid-cols-2 ${zincirDisabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            {GOREV_MODU_OPTIONS.map((opt) => {
              const active = gorevModu === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGorevModu(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-500/25'
                      : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className={`text-sm font-bold ${active ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {opt.label}
                  </div>
                  <div className="text-xs text-slate-500">{opt.sub}</div>
                </button>
              )
            })}
          </div>
          {zincirDisabled ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
              Tekrarlayan görev açıkken zincir modları kullanılamaz; önce tekrarı kapatın.
            </p>
          ) : null}
        </section>

        {/* Ana form */}
        <section className={`${sectionCardClass} p-5 sm:p-6`}>
          <h2 className="mb-1 text-base font-bold text-slate-900">Temel bilgiler</h2>
          <p className="mb-4 text-xs text-slate-500">
            Şablon seçtiğinizde başlık, açıklama, puan ve şablon satırındaki fotoğraf kuralları gelir;{' '}
            <strong className="font-semibold text-slate-700">checklist maddeleri yalnızca standart görev</strong> türünde
            kullanılır.
          </p>
          <div className="space-y-4">
            {templateAllowedInMode ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Şablon (opsiyonel)
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <select
                    value={form.sablon_id}
                    onChange={(e) => setForm({ ...form, sablon_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Şablon seçin — veya aşağıda serbest başlık</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.baslik}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/task-templates/new')}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    <Plus size={16} />
                    Yeni şablon
                  </button>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Zincir modlarda şablon kullanılmaz; görev detaylarını manuel girin.
              </p>
            )}

            {form.sablon_id && selectedTemplate ? (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 sm:p-5">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                    <FileText className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Seçilen şablon</p>
                    <p className="text-base font-bold text-slate-900">{selectedTemplate.baslik || '—'}</p>
                    {selectedTemplate.aciklama ? (
                      <p className="text-sm leading-relaxed text-slate-600">{String(selectedTemplate.aciklama)}</p>
                    ) : (
                      <p className="text-sm italic text-slate-400">Açıklama tanımlı değil</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                        Puan: {sablonPuan ?? 0}
                      </span>
                      {fotoSablondanGeliyor ? (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-indigo-100">
                          <Camera className="mr-1 h-3.5 w-3.5 text-slate-500" aria-hidden />
                          {sablonOzetFotoMetni || 'Fotoğraf checklist / şablonda'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-100">
                          Fotoğraf zorunluluğu yok (aşağıdan ekleyebilirsiniz)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {!form.sablon_id ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Görev başlığı
                </label>
                <input
                  type="text"
                  value={form.baslik}
                  onChange={(e) => setForm({ ...form, baslik: e.target.value })}
                  className={inputClass}
                  placeholder="Örn: Stok sayımı"
                />
              </div>
            ) : null}

            {form.sablon_id && !selectedTemplate ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Şablon bilgisi yükleniyor veya bu şirket için uygun şablon bulunamadı. Listeden tekrar seçin.
              </p>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Şirket
              </label>
              {companyScoped && companies.length === 1 ? (
                <div className={`${inputClass} bg-slate-100 font-medium`}>{companies[0].ana_sirket_adi}</div>
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
                  className={inputClass}
                >
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Birim
              </label>
              <select
                value={form.birim_id}
                onChange={(e) => setForm({ ...form, birim_id: e.target.value })}
                className={inputClass}
              >
                <option value="">Birim seçin</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.birim_adi}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={
                personelAlaniZincirGorevden
                  ? 'rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4'
                  : ''
              }
            >
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Personel{' '}
                {personelAlaniZincirGorevden ? (
                  <span className="font-normal text-slate-400">(bu modda kapalı)</span>
                ) : gorevModu === 'zincir_onay' ? (
                  <span className="text-red-600">*</span>
                ) : (
                  '(opsiyonel)'
                )}
              </label>
              <select
                value={form.personel_id}
                onChange={(e) => setForm({ ...form, personel_id: e.target.value })}
                disabled={personelAlaniZincirGorevden}
                aria-disabled={personelAlaniZincirGorevden}
                className={`${inputClass} ${personelAlaniZincirGorevden ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500' : ''}`}
              >
                <option value="">
                  {personelAlaniZincirGorevden ? 'Zincir görev sırasından ekleyin' : 'Personel seçin'}
                </option>
                {!personelAlaniZincirGorevden
                  ? persons.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={!!currentPersonelId && String(p.id) === currentPersonelId}
                      >
                        {personName(p)}
                        {currentPersonelId && String(p.id) === currentPersonelId
                          ? ' (Kendinize atanamaz)'
                          : ''}
                      </option>
                    ))
                  : null}
              </select>
              {personelAlaniZincirGorevden ? (
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Yürütme sırasındaki kişiler yalnızca <strong className="font-semibold text-slate-800">Zincir görev</strong>{' '}
                  bölümünden eklenir. Onay adımları varsa ayrıca <strong className="font-semibold text-slate-800">Zincir onay</strong>{' '}
                  bölümünden tanımlanır.
                </p>
              ) : gorevModu === 'zincir_onay' ? (
                <p className="mt-1.5 text-xs text-slate-500">İşi yapacak kişi (onay zinciri buna göre başlar).</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Zincir görev */}
        {(gorevModu === 'zincir_gorev' || gorevModu === 'zincir_gorev_ve_onay') && !zincirDisabled && (
          <section className="overflow-hidden rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50/90 to-white shadow-[0_4px_24px_-8px_rgba(14,116,144,0.35)] ring-1 ring-sky-900/5">
            <div className="border-b border-sky-100/90 bg-sky-500/10 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2 font-bold text-sky-950">
                <Users className="h-5 w-5 text-sky-600" />
                Zincir görev — yürütme sırası
              </div>
              <p className="mt-1 text-xs text-sky-900/80">
                En az <strong>2</strong> kişi ekleyin. İlk sıradaki aktif adımdır; sıra ilerledikçe diğerleri devreye
                girer.
              </p>
            </div>
            {!zincirAtamaHazir ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center sm:py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100/90 text-sky-600 shadow-inner">
                  <Lock className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Önce şirket ve birim seçin</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Zincir görev personel ataması için yukarıdan şirket ve birim seçildiğinde bu bölüm etkinleşir.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={zincirEkleGorev}
                    onChange={(e) => setZincirEkleGorev(e.target.value)}
                    className={`${inputClass} min-w-[200px] flex-1 border-sky-100`}
                  >
                    <option value="">Listeden kişi seçin</option>
                    {persons
                      .filter((p) => !currentPersonelId || String(p.id) !== currentPersonelId)
                      .map((p) => (
                      <option key={p.id} value={p.id}>
                        {personName(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!zincirEkleGorev) return
                      if (zincirGorevSira.some((id) => String(id) === String(zincirEkleGorev))) return
                      setZincirGorevSira((prev) => [...prev, zincirEkleGorev])
                      setZincirEkleGorev('')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                  >
                    <Plus className="h-4 w-4" />
                    Sıraya ekle
                  </button>
                </div>
                {zincirGorevSira.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-sky-200 bg-white/70 py-10 text-center text-sm text-slate-500">
                    Henüz kimse eklenmedi.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {zincirGorevSira.map((pid, idx) => {
                      const p = persons.find((x) => String(x.id) === String(pid))
                      return (
                        <li
                          key={`zg-${String(pid)}-${idx}`}
                          className="flex items-center gap-3 rounded-xl border border-sky-100/90 bg-white px-3 py-2.5 shadow-sm"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sm font-bold text-sky-800">
                            {idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-slate-900">{personName(p)}</span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              title="Yukarı"
                              onClick={() => moveZincirGorev(idx, -1)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Aşağı"
                              onClick={() => moveZincirGorev(idx, 1)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Kaldır"
                              onClick={() => setZincirGorevSira((prev) => prev.filter((_, i) => i !== idx))}
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* Zincir onay */}
        {(gorevModu === 'zincir_onay' || gorevModu === 'zincir_gorev_ve_onay') && !zincirDisabled && (
          <section className="overflow-hidden rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 to-white shadow-[0_4px_24px_-8px_rgba(67,56,202,0.35)] ring-1 ring-indigo-900/5">
            <div className="border-b border-indigo-100/90 bg-indigo-500/10 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-2 font-bold text-indigo-950">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                Zincir onay — onaylayıcı sırası
              </div>
              <p className="mt-1 text-xs text-indigo-900/80">
                En az <strong>2</strong> onaylayıcı. Sırayla onaylanır; son onayda puan girilebilir (uygulama
                kurallarına göre).
              </p>
            </div>
            {!zincirAtamaHazir ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center sm:py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100/90 text-indigo-600 shadow-inner">
                  <Lock className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Önce şirket ve birim seçin</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Onaylayıcı ataması için yukarıdan şirket ve birim seçildiğinde bu bölüm etkinleşir.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={zincirEkleOnay}
                    onChange={(e) => setZincirEkleOnay(e.target.value)}
                    className={`${inputClass} min-w-[200px] flex-1 border-indigo-100`}
                  >
                    <option value="">Onaylayıcı seçin</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personName(p)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!zincirEkleOnay) return
                      if (zincirOnaySira.some((id) => String(id) === String(zincirEkleOnay))) return
                      setZincirOnaySira((prev) => [...prev, zincirEkleOnay])
                      setZincirEkleOnay('')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <UserCheck className="h-4 w-4" />
                    Sıraya ekle
                  </button>
                </div>
                {zincirOnaySira.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-indigo-200 bg-white/70 py-10 text-center text-sm text-slate-500">
                    Henüz onaylayıcı eklenmedi.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {zincirOnaySira.map((pid, idx) => {
                      const p = persons.find((x) => String(x.id) === String(pid))
                      return (
                        <li
                          key={`zo-${String(pid)}-${idx}`}
                          className="flex items-center gap-3 rounded-xl border border-indigo-100/90 bg-white px-3 py-2.5 shadow-sm"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-900">
                            {idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 font-medium text-slate-900">{personName(p)}</span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              title="Yukarı"
                              onClick={() => moveZincirOnay(idx, -1)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Aşağı"
                              onClick={() => moveZincirOnay(idx, 1)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Kaldır"
                              onClick={() => setZincirOnaySira((prev) => prev.filter((_, i) => i !== idx))}
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {/* Tarih & puan */}
        <section className={`${sectionCardClass} p-5 sm:p-6`}>
          <h2 className="mb-4 text-base font-bold text-slate-900">Süre ve puan</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Başlangıç
              </label>
              <input
                type="datetime-local"
                value={form.baslama_tarihi}
                onChange={(e) => setForm({ ...form, baslama_tarihi: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">Boşsa kayıt anı kullanılır. Tekrarlayan görevde zorunlu.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bitiş
              </label>
              <input
                type="datetime-local"
                value={form.bitis_tarihi}
                onChange={(e) => setForm({ ...form, bitis_tarihi: e.target.value })}
                className={inputClass}
              />
            </div>
            {!form.sablon_id ? (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Puan (opsiyonel)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.puan}
                  onChange={(e) => setForm({ ...form, puan: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                Puan şablondan gelir ({sablonPuan ?? 0}).
              </div>
            )}
          </div>
        </section>

        {/* Seçenekler */}
        <section className={`${sectionCardClass} bg-slate-50/40 p-5 sm:p-6`}>
          <h2 className="mb-1 text-base font-bold text-slate-900">Seçenekler</h2>
          <p className="mb-4 text-xs text-slate-500">Görev davranışını özelleştirin.</p>
          <div className="space-y-3">
            <FieldSwitch
              id="sw-acil"
              checked={form.acil}
              onChange={(v) => setForm((f) => ({ ...f, acil: v }))}
              label="Acil görev"
              description="Durum ACIL olarak kaydedilir."
            />
            <FieldSwitch
              id="sw-tekrar"
              checked={form.tekrarlayan}
              onChange={(v) => {
                setForm((f) => ({ ...f, tekrarlayan: v }))
                if (v) setGorevModu('normal')
              }}
              disabled={gorevModu !== 'normal'}
              label={
                <span className="inline-flex items-center gap-2">
                  <Repeat className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                  Tekrarlayan görev
                </span>
              }
              description={
                gorevModu !== 'normal'
                  ? 'Önce standart görev türüne dönün.'
                  : 'Başlangıç ve bitiş tarihine göre ardışık günler için kopya oluşturur.'
              }
            />
            {form.tekrarlayan && gorevModu === 'normal' ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Kaç gün tekrar etsin? (2–90)</label>
                <input
                  type="number"
                  min={2}
                  max={90}
                  value={form.tekrar_gun}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tekrar_gun: Math.min(90, Math.max(2, Number(e.target.value) || 30)),
                    }))
                  }
                  className={`${inputClass} max-w-[140px]`}
                />
              </div>
            ) : null}
            {!fotoSablondanGeliyor ? (
              <>
                <FieldSwitch
                  id="sw-foto"
                  checked={form.foto_zorunlu}
                  onChange={setFotoZorunlu}
                  label={
                    <span className="inline-flex items-center gap-2">
                      <Camera className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                      Fotoğraf zorunlu
                    </span>
                  }
                  description="Şablonda veya checklistte foto tanımlıysa bu ayar gizlenir."
                />
                {form.foto_zorunlu ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Minimum fotoğraf (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={form.min_foto_sayisi}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          min_foto_sayisi: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                        }))
                      }
                      className={`${inputClass} max-w-[140px]`}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                Fotoğraf gereksinimi şablon veya checklist üzerinden tanımlı; görev formunda tekrar sorulmaz.
                {sablonOzetFotoMetni ? (
                  <span className="mt-1 block text-xs text-slate-500">{sablonOzetFotoMetni}</span>
                ) : null}
              </p>
            )}
          </div>
        </section>

        {/* Açıklama — şablonsuz görevlerde */}
        {!form.sablon_id ? (
          <section className={`${sectionCardClass} p-5 sm:p-6`}>
            <h2 className="mb-1 text-base font-bold text-slate-900">Açıklama</h2>
            <p className="mb-4 text-xs text-slate-500">Şablonsuz görevlerde serbest metin ve zorunluluk ayarı.</p>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Metin
            </label>
            <textarea
              value={form.aciklama}
              onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
              rows={3}
              className={inputClass}
              placeholder="İsteğe bağlı detay"
            />
            <div className="mt-4">
              <FieldSwitch
                id="sw-aciklama-zorunlu"
                checked={form.aciklama_zorunlu}
                onChange={(v) => setForm((f) => ({ ...f, aciklama_zorunlu: v }))}
                label={
                  <span className="inline-flex items-center gap-2">
                    <AlignLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                    Açıklama zorunlu
                  </span>
                }
                description="Tamamlanırken açıklama girilmesi istenir."
              />
            </div>
          </section>
        ) : null}

        <div
          className={`${sectionCardClass} flex flex-col-reverse gap-3 p-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4`}
        >
          <button
            type="button"
            onClick={() => navigate('/admin/tasks')}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-[#0a1e42] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#0d2a5c] hover:shadow-lg"
          >
            Oluştur
          </button>
        </div>
      </div>
    </div>
  )
}
