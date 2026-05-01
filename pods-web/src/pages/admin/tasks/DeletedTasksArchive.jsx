import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canApproveTaskDeletion } from '../../../lib/permissions.js'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopePersonelQuery,
} from '../../../lib/supabaseScope.js'
import {
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../../lib/taskStatus.js'

const supabase = getSupabase()
const ARCHIVE_LIMIT = 800

/** Silinen işler sayfası — renk ve yüzey tutarlılığı */
const AR = {
  navy: '#0a1e42',
  navySoft: '#153a6e',
  ink: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  muted2: '#94a3b8',
  line: '#e2e8f0',
  lineSoft: '#edf2f7',
  surface: '#ffffff',
  surface2: '#f8fafc',
  surface3: '#f1f5f9',
  cardShadow:
    '0 14px 40px -22px rgba(10, 30, 66, 0.16), 0 4px 14px -8px rgba(10, 30, 66, 0.08)',
  filterShadow: '0 16px 44px -28px rgba(10, 30, 66, 0.14), inset 0 1px 0 rgba(255,255,255,0.85)',
  reasonInk: '#9a3412',
  reasonMuted: '#c2410c',
  warn: '#b91c1c',
  accentBar: 'linear-gradient(180deg, #0a1e42 0%, #1e4976 100%)',
}

function snapshotToTaskLike(row) {
  const snap = row?.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {}
  return {
    ...snap,
    ana_sirket_id: snap.ana_sirket_id ?? row?.ana_sirket_id,
    birim_id: snap.birim_id,
    durum: snap.durum,
    baslik: snap.baslik,
    gorev_turu: snap.gorev_turu,
    is_sablon_id: snap.is_sablon_id,
    baslama_tarihi: snap.baslama_tarihi,
    son_tarih: snap.son_tarih,
    created_at: snap.created_at,
    updated_at: snap.updated_at,
    sorumlu_personel_id: snap.sorumlu_personel_id,
    atayan_personel_id: snap.atayan_personel_id,
    aciklama: snap.aciklama,
  }
}

function truncateSummaryText(text, max = 96) {
  const s = String(text ?? '').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function isOverdueTask(task, now = new Date()) {
  const durum = normalizeTaskStatus(task?.durum)
  if (!task?.son_tarih) return false
  if (isApprovedTaskStatus(durum)) return false
  const due = new Date(task.son_tarih)
  if (Number.isNaN(due.getTime()) || due >= now) return false
  if (isPendingApprovalTaskStatus(durum)) {
    const completedAt = new Date(task.updated_at || task.created_at || 0)
    if (!Number.isNaN(completedAt.getTime()) && completedAt <= due) {
      return false
    }
  }
  return true
}

function matchesArchiveFilters(row, ctx) {
  const {
    search,
    companyScoped,
    currentCompanyId,
    selectedCompanyId,
    selectedStatus,
    selectedTaskType,
    selectedUnitIds,
    selectedAlertType,
    startDate,
    endDate,
  } = ctx

  const t = row._virtual || snapshotToTaskLike(row)

  const term = search.toLowerCase()
  const titleMatch = String(row.__searchTitle || '').includes(term)
  const companyMatch = String(row.__searchCompany || '').includes(term)
  const staffMatch = String(row.__searchStaff || '').includes(term)
  const extraMatch = String(row.__searchExtra || '').includes(term)
  const matchesSearch = companyScoped
    ? titleMatch || staffMatch || extraMatch
    : titleMatch || companyMatch || staffMatch || extraMatch

  const matchesCompany = companyScoped
    ? String(t.ana_sirket_id) === String(currentCompanyId)
    : selectedCompanyId
      ? String(t.ana_sirket_id) === String(selectedCompanyId)
      : true

  const matchesStatus = selectedStatus
    ? normalizeTaskStatus(t.durum) === selectedStatus
    : true

  const matchesTaskType = selectedTaskType
    ? selectedTaskType === 'sablon_gorev'
      ? !!t.is_sablon_id
      : String(t.gorev_turu || '').trim() === selectedTaskType
    : true

  const matchesUnit = selectedUnitIds.length
    ? selectedUnitIds.includes(String(t.birim_id || ''))
    : true

  const matchesAlert = selectedAlertType === 'overdue' ? isOverdueTask(t) : true

  const taskStart = t.baslama_tarihi ? new Date(t.baslama_tarihi) : null
  const taskEnd = t.son_tarih ? new Date(t.son_tarih) : null
  const taskStartMs =
    taskStart && !Number.isNaN(taskStart.getTime()) ? taskStart.getTime() : null
  const taskEndMs =
    taskEnd && !Number.isNaN(taskEnd.getTime()) ? taskEnd.getTime() : null
  const taskRangeStartMs =
    taskStartMs != null && taskEndMs != null ? Math.min(taskStartMs, taskEndMs) : null
  const taskRangeEndMs =
    taskStartMs != null && taskEndMs != null ? Math.max(taskStartMs, taskEndMs) : null
  const taskPointTimes = [t.baslama_tarihi, t.son_tarih, t.created_at, t.updated_at]
    .map((value) => {
      if (!value) return null
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return null
      return d.getTime()
    })
    .filter((value) => value != null)

  const startBoundary = startDate ? new Date(`${startDate}T00:00:00`) : null
  const endBoundary = endDate ? new Date(`${endDate}T23:59:59.999`) : null
  const startBoundaryMs = startBoundary ? startBoundary.getTime() : null
  const endBoundaryMs = endBoundary ? endBoundary.getTime() : null

  const matchesDateRange =
    !startBoundary && !endBoundary
      ? true
      : (() => {
          if (taskRangeStartMs != null && taskRangeEndMs != null) {
            const overlaps =
              (startBoundaryMs == null || taskRangeEndMs >= startBoundaryMs) &&
              (endBoundaryMs == null || taskRangeStartMs <= endBoundaryMs)
            if (overlaps) return true
          }
          return taskPointTimes.some((pointMs) => {
            if (startBoundaryMs != null && pointMs < startBoundaryMs) return false
            if (endBoundaryMs != null && pointMs > endBoundaryMs) return false
            return true
          })
        })()

  return (
    matchesSearch &&
    matchesCompany &&
    matchesStatus &&
    matchesTaskType &&
    matchesUnit &&
    matchesAlert &&
    matchesDateRange
  )
}

export default function DeletedTasksArchive() {
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

  const perms = profile?.yetkiler || {}
  const allowed = canApproveTaskDeletion(perms)

  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedAlertType, setSelectedAlertType] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const unitMenuRef = useRef(null)
  const [expandedArchiveIds, setExpandedArchiveIds] = useState({})

  const toggleArchiveExpanded = (id) => {
    const key = String(id)
    setExpandedArchiveIds((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
    }
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!unitMenuRef.current) return
      if (!unitMenuRef.current.contains(event.target)) {
        setIsUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const load = useCallback(async () => {
    if (!allowed || !canLoadWithScope) return
    setLoading(true)
    const scope = {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    }
    try {
      const [{ data: comps, error: compErr }, { data: unitsData, error: unitsErr }, { data: staffData, error: staffErr }] =
        await Promise.all([
          scopeAnaSirketlerQuery(
            supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
            scope,
          ),
          scopeBirimlerQuery(
            supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
            scope,
          ),
          scopePersonelQuery(
            supabase.from('personeller').select('id,ad,soyad,email,ana_sirket_id,birim_id').is('silindi_at', null),
            scope,
          ),
        ])

      const { data: archiveData, error: archiveErr } = await supabase
        .from('silinen_isler')
        .select(
          'id,original_is_id,silindi_at,silme_talep_id,talep_eden_personel_id,onaylayan_personel_id,snapshot,ana_sirket_id',
        )
        .order('silindi_at', { ascending: false })
        .limit(ARCHIVE_LIMIT)

      if (compErr || unitsErr || staffErr || archiveErr) {
        console.error(compErr || unitsErr || staffErr || archiveErr)
        toast.error('Veriler yüklenemedi')
        setRows([])
        setCompanies(comps || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        return
      }

      setCompanies(comps || [])
      setUnits(unitsData || [])

      const talepIds = [
        ...new Set((archiveData || []).map((r) => r.silme_talep_id).filter(Boolean)),
      ]
      let talepById = {}
      if (talepIds.length) {
        const { data: talepler, error: talepErr } = await supabase
          .from('isler_silme_talepleri')
          .select('id,talep_aciklama,created_at,onaylandi_at')
          .in('id', talepIds)
        if (talepErr) console.error(talepErr)
        talepById = Object.fromEntries((talepler || []).map((x) => [x.id, x]))
      }

      const staffIds = [
        ...new Set(
          (archiveData || []).flatMap((r) => [
            r.talep_eden_personel_id,
            r.onaylayan_personel_id,
          ]).filter(Boolean),
        ),
      ]
      const snapPersonIds = [
        ...new Set(
          (archiveData || []).flatMap((r) => {
            const s = snapshotToTaskLike(r)
            return [s.sorumlu_personel_id, s.atayan_personel_id].filter(Boolean)
          }),
        ),
      ]
      const extraIds = snapPersonIds.filter((id) => !staffIds.includes(id))
      let extraStaff = []
      if (extraIds.length) {
        const { data: extraPeople } = await supabase
          .from('personeller')
          .select('id,ad,soyad,email,ana_sirket_id,birim_id')
          .in('id', extraIds)
        extraStaff = extraPeople || []
      }
      const staffById = new Map()
      for (const p of [...(staffData || []), ...extraStaff]) {
        if (p?.id) staffById.set(String(p.id), p)
      }
      setStaff(Array.from(staffById.values()))

      const nameMap = Object.fromEntries(
        [...staffById.values()].map((p) => [
          p.id,
          p.ad && p.soyad ? `${p.ad} ${p.soyad}` : p.email || String(p.id),
        ]),
      )

      setRows(
        (archiveData || []).map((r) => {
          const snap = snapshotToTaskLike(r)
          const assigneeName = nameMap[snap.sorumlu_personel_id] || '—'
          const talep = r.silme_talep_id ? talepById[r.silme_talep_id] : null
          const silmeNedeni =
            talep?.talep_aciklama != null && String(talep.talep_aciklama).trim()
              ? String(talep.talep_aciklama).trim()
              : null
          return {
            ...r,
            _title: snap.baslik || '(başlıksız)',
            _requester: nameMap[r.talep_eden_personel_id] || '—',
            _approver: nameMap[r.onaylayan_personel_id] || '—',
            _assigneeSnapshot: assigneeName,
            _virtual: snap,
            _talepCreatedAt: talep?.created_at || null,
            _onaylandiAt: talep?.onaylandi_at || null,
            _silmeNedeni: silmeNedeni,
          }
        }),
      )
    } catch (e) {
      console.error(e)
      toast.error('Arşiv yüklenemedi')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [allowed, canLoadWithScope, isSystemAdmin, currentCompanyId, accessibleUnitIds])

  useEffect(() => {
    load()
  }, [load])

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
    return staffNameById[String(id)] || '-'
  }

  const getTaskTypeLabel = (taskType) => {
    const value = String(taskType || '').trim()
    if (!value) return '-'
    const labels = {
      normal: 'Normal',
      sablon_gorev: 'Şablon görev',
      zincir_gorev: 'Zincir görev',
      zincir_onay: 'Zincir onay',
      zincir_gorev_ve_onay: 'Zincir görev ve onay',
    }
    if (labels[value]) return labels[value]
    return value
      .replaceAll('_', ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase())
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

  const preparedRows = useMemo(
    () =>
      rows.map((row) => {
        const t = row._virtual || snapshotToTaskLike(row)
        const companyName = companyNameById[String(t.ana_sirket_id)] || '-'
        const staffName = !t.sorumlu_personel_id
          ? '-'
          : staffNameById[String(t.sorumlu_personel_id)] || '-'
        const assignerName = !t.atayan_personel_id
          ? ''
          : staffNameById[String(t.atayan_personel_id)] || ''
        const extraBits = [
          assignerName,
          row._requester,
          row._approver,
          row._silmeNedeni,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return {
          ...row,
          __searchTitle: String(t.baslik || '').toLowerCase(),
          __searchCompany: String(companyName || '').toLowerCase(),
          __searchStaff: String(staffName || '').toLowerCase(),
          __searchExtra: extraBits,
        }
      }),
    [rows, companyNameById, staffNameById],
  )

  const virtualTasksForOptions = useMemo(
    () => preparedRows.map((r) => r._virtual || snapshotToTaskLike(r)),
    [preparedRows],
  )

  const statusOptions = Array.from(
    new Set(virtualTasksForOptions.map((t) => normalizeTaskStatus(t?.durum)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const taskTypeOptions = Array.from(
    new Set([
      'normal',
      'sablon_gorev',
      'zincir_gorev',
      'zincir_onay',
      'zincir_gorev_ve_onay',
      ...virtualTasksForOptions.map((t) => String(t?.gorev_turu || '').trim()).filter(Boolean),
    ]),
  ).sort((a, b) => getTaskTypeLabel(a).localeCompare(getTaskTypeLabel(b), 'tr'))

  const availableUnitOptions = units.filter((u) => {
    if (!u?.id) return false
    if (companyScoped) return true
    if (!selectedCompanyId) return true
    return String(u.ana_sirket_id) === String(selectedCompanyId)
  })

  const selectedUnitNames = availableUnitOptions
    .filter((u) => selectedUnitIds.includes(String(u.id)))
    .map((u) => u.birim_adi)

  const toggleUnitSelection = (unitId) => {
    const id = String(unitId)
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  const filterCtx = {
    search,
    companyScoped,
    currentCompanyId,
    selectedCompanyId,
    selectedStatus,
    selectedTaskType,
    selectedUnitIds,
    selectedAlertType,
    startDate,
    endDate,
  }

  const filtered = preparedRows.filter((row) => matchesArchiveFilters(row, filterCtx))

  const filtersWrapStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
    gap: 16,
    marginBottom: 22,
    padding: '20px 22px',
    borderRadius: 18,
    background: `linear-gradient(180deg, ${AR.surface} 0%, ${AR.surface2} 100%)`,
    border: `1px solid ${AR.line}`,
    boxShadow: AR.filterShadow,
  }

  const filterFieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  }

  const filterLabelStyle = {
    fontSize: 11,
    fontWeight: 800,
    color: AR.navySoft,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginLeft: 2,
  }

  const filterControlStyle = {
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    border: `1px solid ${AR.line}`,
    padding: '10px 13px',
    fontSize: 12,
    fontWeight: 500,
    color: AR.text,
    backgroundColor: AR.surface,
    outline: 'none',
    boxShadow: `inset 0 1px 2px rgba(10,30,66,0.04)`,
  }

  const searchControlStyle = {
    ...filterControlStyle,
    gridColumn: '1 / -1',
    minHeight: 44,
    fontSize: 13,
  }

  const unitTriggerStyle = {
    ...filterControlStyle,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  }

  const unitMenuStyle = {
    position: 'absolute',
    top: 82,
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 220,
    overflowY: 'auto',
    borderRadius: 12,
    border: `1px solid ${AR.line}`,
    backgroundColor: AR.surface,
    boxShadow: '0 20px 44px -24px rgba(10,30,66,0.22)',
    padding: 10,
  }

  const unitOptionStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 12,
    color: AR.text,
  }

  const unitChipsWrapStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    minHeight: 22,
  }

  const unitChipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 11px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 700,
    color: AR.navy,
    backgroundColor: '#e8eef8',
    border: `1px solid #c9d7ee`,
  }

  const containerStyle = {
    padding: '16px 32px 36px',
    backgroundColor: '#f3f4f6',
    minHeight: 'calc(100vh - 72px)',
  }

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: AR.muted }}>Bu sayfa için iş silme onay yetkisi gerekir.</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: AR.navy,
                letterSpacing: '-0.03em',
                margin: 0,
                lineHeight: 1.15,
              }}
            >
              Silinen işler arşivi
            </h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: AR.navy,
                padding: '5px 11px',
                borderRadius: 9999,
                background: `linear-gradient(180deg, #e8eef8 0%, #dfe8f6 100%)`,
                border: `1px solid #c5d3ea`,
              }}
            >
              Salt okunur
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: AR.muted,
              margin: 0,
              lineHeight: 1.55,
              maxWidth: 600,
            }}
          >
            Onaylanarak silinmiş görevlerin kaydı. Kayıtları filtreleyebilir; kartta özet, genişleterek tüm detayları
            görebilirsiniz.
          </p>
        </div>
      </div>

      <div style={filtersWrapStyle}>
        {!companyScoped ? (
          <div style={filterFieldStyle}>
            <label style={filterLabelStyle}>Şirket</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value)
                setSelectedUnitIds([])
              }}
              style={filterControlStyle}
            >
              <option value="">Tüm şirketler</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ana_sirket_adi}
                </option>
              ))}
            </select>
          </div>
        ) : (
          companies[0] && (
            <div style={filterFieldStyle}>
              <label style={filterLabelStyle}>Şirket</label>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 40,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: `1px solid #c5d3ea`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: AR.navy,
                  background: `linear-gradient(180deg, #eef2fa 0%, #e4ebf7 100%)`,
                }}
              >
                {companies[0].ana_sirket_adi}
              </span>
            </div>
          )
        )}
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Görev Durumu</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={filterControlStyle}
          >
            <option value="">Tüm durumlar</option>
            {statusOptions.map((durum) => (
              <option key={durum} value={durum}>
                {durum}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Görev Tipi</label>
          <select
            value={selectedTaskType}
            onChange={(e) => setSelectedTaskType(e.target.value)}
            style={filterControlStyle}
          >
            <option value="">Tüm görev tipleri</option>
            {taskTypeOptions.map((taskType) => (
              <option key={taskType} value={taskType}>
                {getTaskTypeLabel(taskType)}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Uyarı</label>
          <select
            value={selectedAlertType}
            onChange={(e) => setSelectedAlertType(e.target.value)}
            style={filterControlStyle}
          >
            <option value="">Tümü</option>
            <option value="overdue">Gecikmiş (silinmeden önce)</option>
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Başlangıç Tarihi</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={filterControlStyle}
          />
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Bitiş Tarihi</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={filterControlStyle}
          />
        </div>
        <div style={{ ...filterFieldStyle, position: 'relative' }} ref={unitMenuRef}>
          <label style={filterLabelStyle}>Birimler</label>
          <button
            type="button"
            onClick={() => setIsUnitMenuOpen((prev) => !prev)}
            style={unitTriggerStyle}
          >
            <span>
              {selectedUnitIds.length
                ? `${selectedUnitIds.length} birim seçildi`
                : 'Tüm birimler'}
            </span>
            <span style={{ color: AR.muted, fontSize: 11 }}>{isUnitMenuOpen ? '▲' : '▼'}</span>
          </button>
          {isUnitMenuOpen && (
            <div style={unitMenuStyle}>
              {availableUnitOptions.length ? (
                availableUnitOptions.map((u) => {
                  const checked = selectedUnitIds.includes(String(u.id))
                  return (
                    <label
                      key={u.id}
                      style={{
                        ...unitOptionStyle,
                        backgroundColor: checked ? '#e8eef8' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUnitSelection(u.id)}
                        style={{ margin: 0 }}
                      />
                      <span>{u.birim_adi}</span>
                    </label>
                  )
                })
              ) : (
                <div style={{ padding: 8, fontSize: 12, color: AR.muted }}>
                  Seçilebilir birim bulunamadı.
                </div>
              )}
            </div>
          )}
          <div style={unitChipsWrapStyle}>
            {selectedUnitNames.slice(0, 4).map((name) => (
              <span key={name} style={unitChipStyle}>
                {name}
              </span>
            ))}
            {selectedUnitNames.length > 4 && (
              <span style={unitChipStyle}>+{selectedUnitNames.length - 4}</span>
            )}
          </div>
        </div>
        <div style={{ ...filterFieldStyle, gridColumn: '1 / -1', order: -1 }}>
          <label style={filterLabelStyle}>Arama</label>
          <input
            type="text"
            placeholder={
              companyScoped
                ? 'Görev başlığı veya kişi adına göre ara...'
                : 'Görev başlığı, şirket veya kişi adına göre ara...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchControlStyle}
          />
        </div>
      </div>

      {loading && (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: AR.muted,
            padding: '18px 20px',
            borderRadius: 14,
            border: `1px dashed ${AR.line}`,
            background: AR.surface2,
            textAlign: 'center',
          }}
        >
          Kayıtlar yükleniyor…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: AR.muted,
            padding: '22px 20px',
            borderRadius: 16,
            border: `1px solid ${AR.line}`,
            background: AR.surface,
            textAlign: 'center',
            boxShadow: '0 8px 24px -18px rgba(10,30,66,0.12)',
          }}
        >
          Filtreye uygun silinmiş iş kaydı yok.
        </div>
      )}

      {!loading &&
        filtered.map((r) => {
          const t = r._virtual || snapshotToTaskLike(r)
          const overdue = isOverdueTask(t)
          const expanded = !!expandedArchiveIds[String(r.id)]
          const assigneeLine = getStaffName(t.sorumlu_personel_id)
          const silmeOzet =
            truncateSummaryText(r._silmeNedeni) ||
            'Talebe silme gerekçesi yazılmamış.'
          return (
            <div
              key={r.id}
              style={{
                position: 'relative',
                background: AR.surface,
                borderRadius: 18,
                marginBottom: 16,
                border: `1px solid ${AR.line}`,
                boxShadow: AR.cardShadow,
                overflow: 'hidden',
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  background: AR.accentBar,
                }}
              />
              <div style={{ padding: '18px 20px 18px 22px' }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px 16px',
                    marginBottom: 14,
                  }}
                >
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: AR.ink,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.3,
                      }}
                    >
                      {r._title}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '7px 14px',
                      borderRadius: 9999,
                      background: `linear-gradient(180deg, ${AR.surface3} 0%, #e8edf5 100%)`,
                      border: `1px solid #cdd9ea`,
                      color: AR.navy,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Silinme · {formatDateTime(r.silindi_at)}
                  </span>
                </div>

              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`silinen-is-detay-${r.id}`}
                id={`silinen-is-ozet-${r.id}`}
                onClick={() => toggleArchiveExpanded(r.id)}
                style={{
                  width: '100%',
                  border: `1px solid ${expanded ? AR.navy : AR.line}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  background: expanded
                    ? `linear-gradient(145deg, ${AR.surface} 0%, #f0f4fb 100%)`
                    : `linear-gradient(180deg, ${AR.surface} 0%, ${AR.surface2} 100%)`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  textAlign: 'left',
                  boxShadow: expanded
                    ? `0 6px 20px -10px rgba(10,30,66,0.15), inset 0 1px 0 rgba(255,255,255,0.9)`
                    : `inset 0 1px 0 rgba(255,255,255,0.95), 0 4px 14px -12px rgba(10,30,66,0.1)`,
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        width: 3,
                        height: 14,
                        borderRadius: 2,
                        background: AR.accentBar,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color: AR.navySoft,
                      }}
                    >
                      Silinen iş özeti
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: AR.text, marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: AR.navySoft }}>Sorumlu personel:</span>{' '}
                    <span style={{ fontWeight: 600 }}>{assigneeLine}</span>
                  </div>
                  <div style={{ fontSize: 13, color: AR.text, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: AR.navySoft }}>Silme nedeni:</span>{' '}
                    <span
                      style={{
                        color: r._silmeNedeni ? AR.reasonInk : AR.muted2,
                        fontStyle: r._silmeNedeni ? 'normal' : 'italic',
                      }}
                    >
                      {silmeOzet}
                    </span>
                  </div>
                  {overdue ? (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 11,
                        fontWeight: 700,
                        color: AR.warn,
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        display: 'inline-block',
                      }}
                    >
                      Silinmeden önce gecikmiş görünüyordu
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: AR.muted }}>
                    {expanded ? 'Detayı kapatmak için tekrar tıklayın' : 'Detayları açmak için tıklayın'}
                  </div>
                </div>
                <span
                  aria-hidden
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: expanded ? AR.surface : AR.navy,
                    background: expanded ? AR.navy : AR.surface3,
                    border: `1px solid ${expanded ? AR.navy : AR.line}`,
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.22s ease, background 0.2s ease, color 0.2s ease',
                  }}
                >
                  ▼
                </span>
              </button>

              {expanded ? (
              <div
                id={`silinen-is-detay-${r.id}`}
                role="region"
                aria-labelledby={`silinen-is-ozet-${r.id}`}
                style={{ marginTop: 14 }}
              >
              <div
                style={{
                  fontSize: 12,
                  color: AR.text,
                  background: `linear-gradient(165deg, ${AR.surface} 0%, ${AR.surface2} 48%, #eceff4 100%)`,
                  border: `1px solid ${AR.line}`,
                  borderRadius: 16,
                  padding: '5px 5px 7px',
                  marginBottom: 4,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.92), 0 10px 28px -22px rgba(10,30,66,0.12)`,
                }}
              >
                <div style={{ padding: '14px 14px 12px' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: AR.navySoft,
                      marginBottom: 10,
                    }}
                  >
                    Görev ve kişiler
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                      Sorumlu personel
                    </div>
                    <div style={{ fontWeight: 600, color: AR.ink }}>
                      {getStaffName(t.sorumlu_personel_id)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                      Atayan personel
                    </div>
                    <div style={{ fontWeight: 600, color: AR.ink }}>
                      {getStaffName(t.atayan_personel_id)}
                    </div>
                  </div>
                  {!companyScoped ? (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                        Şirket
                      </div>
                      <div style={{ fontWeight: 600, color: AR.ink }}>
                        {getCompanyName(t.ana_sirket_id)}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                      Birim
                    </div>
                    <div style={{ fontWeight: 600, color: AR.ink }}>
                      {getUnitName(t.birim_id) || '—'}
                    </div>
                  </div>
                </div>
                </div>

                <div
                  style={{
                    margin: '0 4px',
                    padding: '14px 14px 16px',
                    borderTop: `1px solid ${AR.lineSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: AR.navySoft,
                      marginBottom: 4,
                    }}
                  >
                    Görev açıklaması
                  </div>
                  <div style={{ fontSize: 10.5, color: AR.muted, marginBottom: 10, lineHeight: 1.4 }}>
                    Silinmeden önce görev kartında yer alan açıklama (arşivde saklanan son metin).
                  </div>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      backgroundColor: '#ffffff',
                      border: `1px solid ${AR.line}`,
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: AR.text,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minHeight: 44,
                      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    }}
                  >
                    {String(t.aciklama || '').trim() ? (
                      String(t.aciklama || '').trim()
                    ) : (
                      <span style={{ color: AR.muted2, fontStyle: 'italic' }}>
                        Bu görevde açıklama girilmemiş.
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    margin: '0 4px',
                    padding: '14px 14px 16px',
                    borderTop: `1px solid ${AR.lineSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: AR.navySoft,
                      marginBottom: 10,
                    }}
                  >
                    Tarihler
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                      Görev oluşturulma
                    </div>
                    <div style={{ fontWeight: 600 }}>{formatDateTime(t.created_at)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: AR.muted, marginBottom: 4 }}>
                      Silinme tarihi
                    </div>
                    <div style={{ fontWeight: 600 }}>{formatDateTime(r.silindi_at)}</div>
                    <div style={{ fontSize: 10.5, color: AR.muted2, marginTop: 3 }}>
                      Arşive alındığı an
                    </div>
                  </div>
                  </div>
                </div>

                <div
                  style={{
                    margin: '0 4px',
                    padding: '14px 14px 16px',
                    borderTop: `1px solid ${AR.lineSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: AR.navySoft,
                      marginBottom: 10,
                    }}
                  >
                    Silme talebi ve onay
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      paddingLeft: 12,
                      borderLeft: `3px solid ${AR.navy}`,
                    }}
                  >
                    <div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: AR.navySoft }}>
                      1 · Talep
                    </div>
                    <div style={{ fontWeight: 700, color: AR.ink, marginTop: 2 }}>{r._requester}</div>
                    <div style={{ fontSize: 11, color: AR.muted }}>
                      {r._talepCreatedAt ? formatDateTime(r._talepCreatedAt) : '—'}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: AR.muted2,
                      paddingLeft: 2,
                      lineHeight: 1,
                    }}
                  >
                    ↓
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: AR.navySoft }}>
                      2 · Onay ve kalıcı silme
                    </div>
                    <div style={{ fontWeight: 700, color: AR.ink, marginTop: 2 }}>{r._approver}</div>
                    <div style={{ fontSize: 11, color: AR.muted }}>
                      {formatDateTime(r._onaylandiAt || r.silindi_at)}
                      <span style={{ marginLeft: 6, color: AR.muted2 }}>
                        {r._onaylandiAt ? '(onay zamanı)' : '(silinme zamanı)'}
                      </span>
                    </div>
                  </div>
                  </div>
                </div>

                <div
                  style={{
                    margin: '0 4px',
                    padding: '14px 14px 16px',
                    borderTop: `1px solid ${AR.lineSoft}`,
                    borderRadius: '0 0 14px 14px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: AR.navySoft,
                      marginBottom: 4,
                    }}
                  >
                    Silme nedeni
                  </div>
                  <div style={{ fontSize: 10.5, color: AR.muted, marginBottom: 10, lineHeight: 1.4 }}>
                    Silme talebinde yazılan gerekçe.
                  </div>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: `linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)`,
                      border: `1px solid #fcd34d`,
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: AR.text,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minHeight: 44,
                      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    }}
                  >
                    {r._silmeNedeni ? (
                      r._silmeNedeni
                    ) : (
                      <span style={{ color: AR.reasonMuted, fontStyle: 'italic', opacity: 0.9 }}>
                        Talebe not düşülmemiş.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              </div>
              ) : null}
              </div>
            </div>
          )
        })}
    </div>
  )
}
