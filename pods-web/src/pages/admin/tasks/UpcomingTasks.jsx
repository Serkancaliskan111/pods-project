import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  enrichScopeWithJunctionPersonelIds,
  scopePersonelQuery,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope.js'
import {
  getTaskVisibleAt,
  isTaskVisibilityInstantInFuture,
  isTaskVisibleToPerson,
} from '../../../lib/taskVisibility.js'
import { normalizeTaskStatus } from '../../../lib/taskStatus.js'

const supabase = getSupabase()

const UPCOMING_FETCH_LIMIT = 900

const jobsSelectWithVisibleAt =
  'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,gorunur_tarih,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim,ozel_gorev'

const jobsSelectLegacy =
  'id,baslik,durum,aciklama,baslama_tarihi,son_tarih,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,is_sablon_id,gorev_turu,zincir_aktif_adim,ozel_gorev'

export default function UpcomingTasks() {
  const navigate = useNavigate()
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIdsRaw = isSystemAdmin ? [] : personel?.accessibleUnitIds
  const accessibleUnitIds = isSystemAdmin
    ? null
    : Array.isArray(accessibleUnitIdsRaw)
      ? accessibleUnitIdsRaw
      : null
  const localScopeReady = isSystemAdmin
    ? true
    : Boolean(currentCompanyId) && Array.isArray(accessibleUnitIdsRaw)
  const canLoadWithScope = Boolean(scopeReady) && localScopeReady
  const companyScoped = !isSystemAdmin && !!currentCompanyId

  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [search, setSearch] = useState('')
  const [extraStaffLabels, setExtraStaffLabels] = useState({})

  const hasLoadedRef = useRef(false)

  const load = async () => {
    if (!canLoadWithScope) return
    if (!hasLoadedRef.current) setLoading(true)
    const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    })
    const nowIso = new Date().toISOString()
    const orWithGorunur = `baslama_tarihi.gt.${nowIso},gorunur_tarih.gt.${nowIso},created_at.gt.${nowIso}`
    const orLegacy = `baslama_tarihi.gt.${nowIso},created_at.gt.${nowIso}`

    try {
      const [
        { data: comps, error: compErr },
        { data: unitsData, error: unitsErr },
        { data: staffData, error: staffErr },
      ] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase
            .from('ana_sirketler')
            .select('id,ana_sirket_adi')
            .is('silindi_at', null),
          scope,
        ),
        scopeBirimlerQuery(
          supabase
            .from('birimler')
            .select('id,birim_adi,ana_sirket_id')
            .is('silindi_at', null),
          scope,
        ),
        scopePersonelQuery(
          supabase
            .from('personeller')
            .select('id,ad,soyad,email,ana_sirket_id,birim_id')
            .is('silindi_at', null),
          scope,
        ),
      ])

      let usedLegacySelect = false
      let jobsQuery = supabase
        .from('isler')
        .select(jobsSelectWithVisibleAt)
        .or(orWithGorunur)
        .order('baslama_tarihi', { ascending: true })
        .limit(UPCOMING_FETCH_LIMIT)

      let jobsRes = await scopeIslerQuery(jobsQuery, scope)
      let { data: jobs, error: jobsErr } = jobsRes

      if (jobsErr?.code === '42703') {
        usedLegacySelect = true
        jobsQuery = supabase
          .from('isler')
          .select(jobsSelectLegacy)
          .or(orLegacy)
          .order('baslama_tarihi', { ascending: true })
          .limit(UPCOMING_FETCH_LIMIT)
        jobsRes = await scopeIslerQuery(jobsQuery, scope)
        jobs = jobsRes.data
        jobsErr = jobsRes.error
      }

      if (!jobsErr && personel?.id && currentCompanyId) {
        try {
          const sel = usedLegacySelect ? jobsSelectLegacy : jobsSelectWithVisibleAt
          const orActive = usedLegacySelect ? orLegacy : orWithGorunur
          const { data: privateAssignedByMe, error: privateErr } = await supabase
            .from('isler')
            .select(sel)
            .eq('ana_sirket_id', currentCompanyId)
            .eq('atayan_personel_id', personel.id)
            .eq('ozel_gorev', true)
            .or(orActive)
            .order('created_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT)

          if (!privateErr && Array.isArray(privateAssignedByMe) && privateAssignedByMe.length) {
            const mergedMap = new Map()
            for (const row of jobs || []) mergedMap.set(String(row?.id || ''), row)
            for (const row of privateAssignedByMe) mergedMap.set(String(row?.id || ''), row)
            jobs = Array.from(mergedMap.values())
          }
        } catch (_) {
          // ana listeyi koru
        }
      }

      if (compErr || staffErr || jobsErr || unitsErr) {
        console.error(compErr || staffErr || jobsErr || unitsErr)
        toast.error('İleri Tarihli Görevler yüklenemedi')
        setTasks([])
        setCompanies(comps || [])
        setStaff(staffData || [])
      } else {
        setCompanies(comps || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        const now = new Date()
        const upcoming = (jobs || []).filter(
          (t) =>
            isTaskVisibilityInstantInFuture(t, now) &&
            isTaskVisibleToPerson(t, personel?.id),
        )
        upcoming.sort((a, b) => {
          const ta = new Date(getTaskVisibleAt(a) || 0).getTime()
          const tb = new Date(getTaskVisibleAt(b) || 0).getTime()
          return ta - tb
        })
        setTasks(upcoming)
      }
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [
    canLoadWithScope,
    isSystemAdmin,
    currentCompanyId,
    personel?.id,
    JSON.stringify(accessibleUnitIds || []),
  ])

  useEffect(() => {
    setExtraStaffLabels({})
  }, [currentCompanyId, isSystemAdmin])

  useEffect(() => {
    if (!canLoadWithScope || !tasks?.length) return
    const staffIds = new Set((staff || []).map((s) => String(s?.id || '').trim()).filter(Boolean))
    const need = new Set()
    for (const t of tasks) {
      const s = t?.sorumlu_personel_id
      const a = t?.atayan_personel_id
      if (s && !staffIds.has(String(s))) need.add(String(s))
      if (a && !staffIds.has(String(a))) need.add(String(a))
    }
    const ids = [...need]
    if (!ids.length) return

    let cancelled = false
    ;(async () => {
      let q = supabase.from('personeller').select('id,ad,soyad,email').in('id', ids)
      if (!isSystemAdmin && currentCompanyId) q = q.eq('ana_sirket_id', currentCompanyId)
      const { data, error } = await q
      if (cancelled) return

      setExtraStaffLabels((prev) => {
        const next = { ...prev }
        let touched = false
        const seen = new Set()
        for (const p of data || []) {
          if (!p?.id) continue
          const k = String(p.id)
          seen.add(k)
          const label =
            p.ad || p.soyad
              ? `${p.ad || ''} ${p.soyad || ''}`.trim()
              : p.email || `Personel (ref: ${k.slice(0, 8)}…)`
          if (next[k] !== label) {
            next[k] = label
            touched = true
          }
        }
        for (const id of ids) {
          if (seen.has(id)) continue
          const placeholder = `Personel (ref: ${String(id).slice(0, 8)}…)`
          if (next[id] !== placeholder) {
            next[id] = placeholder
            touched = true
          }
        }
        return touched ? next : prev
      })

      if (error && import.meta.env?.DEV) console.warn('upcoming tasks extra staff', error)
    })()

    return () => {
      cancelled = true
    }
  }, [tasks, staff, canLoadWithScope, currentCompanyId, isSystemAdmin])

  const companyNameById = useMemo(
    () =>
      (companies || []).reduce((acc, c) => {
        acc[String(c.id)] = c?.ana_sirket_adi || '-'
        return acc
      }, {}),
    [companies],
  )

  const unitNameById = useMemo(
    () =>
      (units || []).reduce((acc, u) => {
        acc[String(u.id)] = u?.birim_adi || ''
        return acc
      }, {}),
    [units],
  )

  const staffNameById = useMemo(
    () =>
      (staff || []).reduce((acc, s) => {
        const name =
          s && (s.ad || s.soyad)
            ? `${s.ad || ''} ${s.soyad || ''}`.trim()
            : s?.email || '-'
        acc[String(s.id)] = name
        return acc
      }, {}),
    [staff],
  )

  const getCompanyName = (id) => companyNameById[String(id)] || '-'
  const getUnitName = (id) => unitNameById[String(id)] || ''
  const getStaffName = (id) => {
    if (!id) return '-'
    const k = String(id)
    return staffNameById[k] || extraStaffLabels[k] || '-'
  }

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tasks
    return tasks.filter((t) => {
      const title = String(t.baslik || '').toLowerCase()
      const assignee = getStaffName(t.sorumlu_personel_id).toLowerCase()
      const company = getCompanyName(t.ana_sirket_id).toLowerCase()
      const unit = getUnitName(t.birim_id).toLowerCase()
      return (
        title.includes(term) ||
        assignee.includes(term) ||
        company.includes(term) ||
        unit.includes(term)
      )
    })
  }, [tasks, search, staffNameById, extraStaffLabels, companyNameById, unitNameById])

  const containerStyle = {
    padding: '16px 32px 32px',
    backgroundColor: '#f3f4f6',
    minHeight: 'calc(100vh - 72px)',
  }

  const cardStyle = {
    background: 'linear-gradient(180deg, #ffffff 0%, #fcfdff 100%)',
    borderRadius: '16px',
    padding: '16px 18px',
    marginBottom: '12px',
    border: '1px solid #dbe4ef',
    boxShadow: '0 12px 28px -22px rgba(15,23,42,0.45)',
  }

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 18 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          İleri Tarihli Görevler
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', maxWidth: 720, lineHeight: 1.55 }}>
          Başlangıç / görünürlük zamanı henüz gelmemiş görevler burada listelenir (Görevler sayfasında
          varsayılan olarak gösterilmezler). Şirket ve birim kapsamınız ile uyumludur.
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#475569',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 6,
          }}
        >
          Ara
        </label>
        <input
          type="text"
          placeholder={
            companyScoped
              ? 'Başlık, birim veya personel…'
              : 'Başlık, şirket, birim veya personel…'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 420,
            minHeight: 42,
            borderRadius: 14,
            border: '1px solid #d2dcea',
            padding: '10px 13px',
            fontSize: 13,
          }}
        />
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 13, color: '#64748b', padding: '12px 0' }}>
          İleri Tarihli Görev Kaydı bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((t) => {
          const visibleAt = getTaskVisibleAt(t)
          const durum = normalizeTaskStatus(t.durum) || t.durum || '-'
          return (
            <div key={t.id} style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: '1 1 240px' }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#0f172a',
                      marginBottom: 8,
                    }}
                  >
                    {t.baslik || 'Başlıksız iş'}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                    <div>
                      <strong>Planlanan görünürlük:</strong> {formatDateTime(visibleAt)}
                    </div>
                    <div>
                      <strong>Bitiş:</strong> {formatDateTime(t.son_tarih)}
                    </div>
                    {!companyScoped && (
                      <div>
                        <strong>Şirket:</strong> {getCompanyName(t.ana_sirket_id)}
                      </div>
                    )}
                    <div>
                      <strong>Birim:</strong> {getUnitName(t.birim_id) || '—'}
                    </div>
                    <div>
                      <strong>Sorumlu:</strong> {getStaffName(t.sorumlu_personel_id)}
                    </div>
                    <div>
                      <strong>Durum:</strong> {durum}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/tasks/${t.id}`)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 9999,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer',
                  }}
                >
                  Detay
                </button>
              </div>
            </div>
          )
        })}
    </div>
  )
}
