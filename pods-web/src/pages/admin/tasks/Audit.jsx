import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  isUnitInScope,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope.js'
import {
  TASK_STATUS,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../../lib/taskStatus.js'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../../../lib/taskVisibility.js'
import { canApproveTask } from '../../../lib/permissions.js'
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx'
import { logTaskTimelineEvent } from '../../../lib/taskTimeline.js'
import { groupTasksByGrupId } from '../../../lib/groupTasks.js'

const supabase = getSupabase()
const containerStyle = {
  padding: '16px 32px 32px',
  backgroundColor: '#f3f4f6',
  minHeight: 'calc(100vh - 72px)',
}
const titleStyle = {
  fontSize: 24,
  fontWeight: 800,
  color: '#0a1e42',
  letterSpacing: '-0.03em',
}
const subtitleStyle = { fontSize: 13, color: '#6b7280', marginTop: 4 }
const panelStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #dbe4ef',
  borderRadius: 18,
  padding: 18,
  boxShadow:
    '0 18px 34px -28px rgba(15,23,42,0.5), 0 1px 0 rgba(255,255,255,0.75) inset',
}
const filtersWrapStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 16,
  marginBottom: 20,
  padding: 18,
  borderRadius: 20,
  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
  border: '1px solid #dbe5f0',
  boxShadow:
    '0 20px 40px -34px rgba(15,23,42,0.55), 0 1px 0 rgba(255,255,255,0.7) inset',
}
const filterFieldStyle = { display: 'flex', flexDirection: 'column', gap: 7 }
const filterLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginLeft: 2,
}
const filterControlStyle = {
  width: '100%',
  minHeight: 42,
  borderRadius: 14,
  border: '1px solid #d2dcea',
  padding: '10px 13px',
  fontSize: 12,
  fontWeight: 500,
  color: '#1e293b',
  backgroundColor: '#ffffff',
  outline: 'none',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
}
const searchControlStyle = {
  ...filterControlStyle,
  gridColumn: '1 / -1',
  minHeight: 40,
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
  borderRadius: 14,
  border: '1px solid #d2dcea',
  backgroundColor: '#ffffff',
  boxShadow: '0 22px 35px -22px rgba(15,23,42,0.45)',
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
  color: '#1e293b',
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
  padding: '4px 9px',
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 700,
  color: '#1d4ed8',
  backgroundColor: '#e0ecff',
  border: '1px solid #b8d3ff',
}
const cardStyle = {
  ...panelStyle,
  marginBottom: 14,
}
const subtleBoxStyle = {
  marginTop: 10,
  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  border: '1px solid #dbe4ef',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 12,
  color: '#334155',
}

function fmt(v) {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadgeStyle(durum) {
  const normalized = normalizeTaskStatus(durum)
  if (normalized === TASK_STATUS.APPROVED) {
    return { backgroundColor: '#bbf7d0', color: '#166534' }
  }
  if (normalized === TASK_STATUS.REJECTED) {
    return { backgroundColor: '#fee2e2', color: '#b91c1c' }
  }
  if (normalized === TASK_STATUS.RESUBMITTED) {
    return { backgroundColor: '#e0e7ff', color: '#3730a3' }
  }
  return { backgroundColor: '#e5e7eb', color: '#374151' }
}

export default function TasksAudit() {
  const navigate = useNavigate()
  const { profile, personel, scopeReady } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canReview = isSystemAdmin || canApproveTask(permissions)
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
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(TASK_STATUS.PENDING_APPROVAL)
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [confirmCtx, setConfirmCtx] = useState(null)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const unitMenuRef = useRef(null)

  const load = useCallback(async () => {
    if (!canLoadWithScope || !canReview) return
    setLoading(true)
    const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    })
    try {
      const [{ data: comps }, { data: unitsData }, { data: staffData }, jobsRes] = await Promise.all([
        scopeAnaSirketlerQuery(
          supabase.from('ana_sirketler').select('id,ana_sirket_adi').is('silindi_at', null),
          scope,
        ),
        scopeBirimlerQuery(
          supabase.from('birimler').select('id,birim_adi,ana_sirket_id').is('silindi_at', null),
          scope,
        ),
        scopePersonelQuery(
          supabase
            .from('personeller')
            .select('id,ad,soyad,email,ana_sirket_id,birim_id')
            .is('silindi_at', null),
          scope,
        ),
        scopeIslerQuery(
          supabase
            .from('isler')
            .select(
              'id,baslik,aciklama,durum,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,grup_id,kanit_resim_ler,kanit_videolar,personel_tamamlama_notu',
            )
            .order('updated_at', { ascending: false })
            .limit(TASKS_LIST_LIMIT),
          scope,
        ),
      ])
      if (jobsRes.error) throw jobsRes.error
      const submitted = (jobsRes.data || []).filter(
        (t) =>
          isTaskVisibleNow(t) &&
          isTaskVisibleToPerson(t, personel?.id) &&
          isPendingApprovalTaskStatus(t?.durum),
      )
      // Havuz görev (`grup_id`): denetim filtresi yalnız PENDING_APPROVAL satırları getirdiği için
      // aynı havuzdaki diğer (ASSIGNED) üye satırları eksik kalır. Eksik üyeleri ek bir sorguyla
      // çekip listeye ekliyoruz; ardından `groupTasksByGrupId` hepsini tek karta sıkıştırır.
      const grupIds = [...new Set(submitted.map((r) => r?.grup_id).filter(Boolean))]
      let enriched = submitted
      if (grupIds.length) {
        const { data: groupMates } = await supabase
          .from('isler')
          .select(
            'id,baslik,aciklama,durum,created_at,updated_at,ana_sirket_id,birim_id,sorumlu_personel_id,atayan_personel_id,gorev_turu,grup_id,kanit_resim_ler,kanit_videolar,personel_tamamlama_notu',
          )
          .in('grup_id', grupIds)
        if (Array.isArray(groupMates) && groupMates.length) {
          const seen = new Set(submitted.map((r) => String(r?.id)))
          for (const r of groupMates) {
            if (!seen.has(String(r?.id))) {
              enriched = [...enriched, r]
              seen.add(String(r?.id))
            }
          }
        }
      }
      const { items: grouped } = groupTasksByGrupId(enriched)
      setTasks(grouped)
      setCompanies(comps || [])
      setUnits(unitsData || [])
      setStaff(staffData || [])
    } catch (e) {
      console.error(e)
      toast.error('Denetim işleri yüklenemedi')
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [canLoadWithScope, canReview, isSystemAdmin, currentCompanyId, accessibleUnitIds, personel?.id])

  useEffect(() => {
    if (companyScoped && currentCompanyId) setSelectedCompanyId(String(currentCompanyId))
  }, [companyScoped, currentCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  const companyNameById = useMemo(
    () => Object.fromEntries((companies || []).map((c) => [String(c.id), c.ana_sirket_adi || '-'])),
    [companies],
  )
  const unitNameById = useMemo(
    () => Object.fromEntries((units || []).map((u) => [String(u.id), u.birim_adi || '-'])),
    [units],
  )
  const staffNameById = useMemo(
    () =>
      Object.fromEntries(
        (staff || []).map((s) => [
          String(s.id),
          s?.ad || s?.soyad ? `${s.ad || ''} ${s.soyad || ''}`.trim() : s?.email || '-',
        ]),
      ),
    [staff],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (tasks || []).filter((t) => {
      if (selectedCompanyId && String(t.ana_sirket_id) !== String(selectedCompanyId)) return false
      if (selectedStatus && normalizeTaskStatus(t?.durum) !== selectedStatus) return false
      if (selectedTaskType && String(t?.gorev_turu || '') !== selectedTaskType) return false
      if (selectedUnitIds.length && !selectedUnitIds.includes(String(t?.birim_id || ''))) return false
      if (startDate && new Date(t.created_at || 0) < new Date(`${startDate}T00:00:00`)) return false
      if (endDate && new Date(t.created_at || 0) > new Date(`${endDate}T23:59:59`)) return false
      if (!term) return true
      return [
        t.baslik,
        t.aciklama,
        companyNameById[String(t.ana_sirket_id)] || '',
        unitNameById[String(t.birim_id)] || '',
        staffNameById[String(t.sorumlu_personel_id)] || '',
        staffNameById[String(t.atayan_personel_id)] || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [
    tasks,
    search,
    selectedCompanyId,
    selectedStatus,
    selectedTaskType,
    selectedUnitIds,
    startDate,
    endDate,
    companyNameById,
    unitNameById,
    staffNameById,
  ])

  const reviewAction = useCallback(
    async (task, type, reason = '') => {
      setActioningTaskId(task.id)
      try {
        const payload =
          type === 'approve'
            ? { durum: TASK_STATUS.APPROVED, red_nedeni: null }
            : { durum: TASK_STATUS.REJECTED, red_nedeni: String(reason || '').trim() }
        if (type === 'reject' && !payload.red_nedeni) {
          toast.error('Red nedeni zorunludur')
          return
        }
        // Havuz görev (grup_id): tek bir satır temsilci olarak gösteriliyor; onay/red kararı
        // aynı `grup_id`'deki tüm satırlara uygulanmalı (yoksa diğer kişilerin görevleri
        // hâlâ pending kalır). grup_id yoksa eski tek satırlık akış korunur.
        let updateQ = supabase.from('isler').update(payload)
        if (task?.grup_id) {
          updateQ = updateQ.eq('grup_id', task.grup_id)
          if (task?.ana_sirket_id) updateQ = updateQ.eq('ana_sirket_id', task.ana_sirket_id)
        } else {
          updateQ = updateQ.eq('id', task.id)
        }
        const { error } = await updateQ
        if (error) throw error
        await logTaskTimelineEvent(task.id, 'review', personel?.id, type)
        toast.success(type === 'approve' ? 'Görev onaylandı' : 'Görev reddedildi')
        await load()
      } catch (e) {
        toast.error(e?.message || 'İşlem başarısız')
      } finally {
        setActioningTaskId(null)
      }
    },
    [load, personel?.id],
  )

  const taskTypeOptions = useMemo(
    () => [...new Set((tasks || []).map((t) => String(t.gorev_turu || '')).filter(Boolean))],
    [tasks],
  )
  const availableUnitOptions = useMemo(() => {
    return (units || [])
      .filter((u) => !selectedCompanyId || String(u.ana_sirket_id) === String(selectedCompanyId))
      .filter(
        (u) =>
          !accessibleUnitIds ||
          !accessibleUnitIds.length ||
          isUnitInScope(accessibleUnitIds, u.id),
      )
      .sort((a, b) => String(a?.birim_adi || '').localeCompare(String(b?.birim_adi || ''), 'tr'))
  }, [units, selectedCompanyId, accessibleUnitIds])
  const selectedUnitNames = useMemo(() => {
    const map = new Map((units || []).map((u) => [String(u.id), u.birim_adi || '-']))
    return selectedUnitIds.map((id) => map.get(String(id))).filter(Boolean)
  }, [selectedUnitIds, units])

  const toggleUnitSelection = useCallback((unitId) => {
    const key = String(unitId)
    setSelectedUnitIds((prev) => (prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]))
  }, [])

  useEffect(() => {
    if (!isUnitMenuOpen) return
    const onClickOutside = (event) => {
      if (unitMenuRef.current && !unitMenuRef.current.contains(event.target)) {
        setIsUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isUnitMenuOpen])

  if (!canReview) return <div style={{ padding: 24, color: '#64748b' }}>Bu sayfa için yetkiniz yok.</div>

  return (
    <div style={containerStyle}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={titleStyle}>Denetim</h1>
        <p style={subtitleStyle}>
          Onaya gönderilen işleri hiyerarşi kapsamına göre görüntüleyin ve sonuçlandırın.
        </p>
      </div>
      <div style={filtersWrapStyle}>
        <div style={{ ...filterFieldStyle, gridColumn: '1 / -1' }}>
          <label style={filterLabelStyle}>Arama</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Görev başlığı, şirket, birim veya personel adına göre ara..."
            style={searchControlStyle}
          />
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Şirket</label>
          <select
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value)
              setSelectedUnitIds([])
            }}
            disabled={companyScoped}
            style={filterControlStyle}
          >
            <option value="">Tüm şirketler</option>
            {(companies || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Durum</label>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={filterControlStyle}>
            <option value={TASK_STATUS.PENDING_APPROVAL}>Onay Bekliyor</option>
            <option value={TASK_STATUS.RESUBMITTED}>Tekrar Gönderildi</option>
            <option value="">Tümü</option>
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Görev tipi</label>
          <select value={selectedTaskType} onChange={(e) => setSelectedTaskType(e.target.value)} style={filterControlStyle}>
            <option value="">Görev türü</option>
            {taskTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Başlangıç tarihi</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={filterControlStyle} />
        </div>
        <div style={filterFieldStyle}>
          <label style={filterLabelStyle}>Bitiş tarihi</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={filterControlStyle} />
        </div>
        <div style={{ ...filterFieldStyle, position: 'relative' }} ref={unitMenuRef}>
          <label style={filterLabelStyle}>Birimler</label>
          <button
            type="button"
            onClick={() => setIsUnitMenuOpen((prev) => !prev)}
            style={unitTriggerStyle}
          >
            <span>{selectedUnitIds.length ? `${selectedUnitIds.length} birim seçildi` : 'Tüm birimler'}</span>
            <span style={{ color: '#64748b' }}>{isUnitMenuOpen ? '▲' : '▼'}</span>
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
                        backgroundColor: checked ? '#eff6ff' : 'transparent',
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
                <div style={{ padding: 8, fontSize: 12, color: '#64748b' }}>
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
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {loading && <div style={{ color: '#64748b' }}>Yükleniyor…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: '#64748b' }}>Gönderilen iş bulunamadı.</div>}
        {filtered.map((t) => {
          const badge = statusBadgeStyle(t.durum)
          const assigneeName = staffNameById[String(t.sorumlu_personel_id)] || '-'
          const assignerName = t.atayan_personel_id ? staffNameById[String(t.atayan_personel_id)] || '-' : '-'
          const isSelfAssigned =
            String(t?.sorumlu_personel_id || '') === String(personel?.id || '')
          const approveDisabled = actioningTaskId === t.id || isSelfAssigned
          const rejectDisabled = actioningTaskId === t.id
          // Havuz görev (`grup_id`): bu kartta birden fazla sorumlu personel var; sadece temsilci
          // satır gösteriliyor ama tüm sorumlular ve tamamlayan kişi rozet olarak çıkar.
          const isPool = !!t?._isGrouped
          const groupAssigneeNames = isPool
            ? (t?._groupAssigneeIds || []).map(
                (id) => staffNameById[String(id)] || 'Personel',
              )
            : []
          const completedAssigneeId = isPool ? t?._groupCompletedAssigneeId : null
          const completedName = completedAssigneeId
            ? staffNameById[String(completedAssigneeId)] || 'Personel'
            : null
          return (
            <div key={t.id} style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'stretch',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#0f172a',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3,
                    }}
                  >
                    {t.baslik || 'Başlıksız görev'}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
                    {companyScoped ? (
                      <>
                        {unitNameById[String(t.birim_id)] ? `${unitNameById[String(t.birim_id)]} • ` : ''}
                        {isPool ? `${t._groupSize} kişi sorumlu` : assigneeName}
                      </>
                    ) : (
                      <>
                        {companyNameById[String(t.ana_sirket_id)] || '-'}
                        {unitNameById[String(t.birim_id)] ? ` • ${unitNameById[String(t.birim_id)]}` : ''}
                        {' • '}
                        {isPool ? `${t._groupSize} kişi sorumlu` : assigneeName}
                      </>
                    )}
                  </div>
                  {isPool ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderLeft: '4px solid #f59e0b',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            borderRadius: 9999,
                            fontSize: 11,
                            fontWeight: 800,
                            background: 'rgba(245, 158, 11, 0.18)',
                            color: '#92400e',
                          }}
                        >
                          Havuz · {t._groupSize} kişi
                        </span>
                        {completedName ? (
                          <span style={{ fontSize: 12, color: '#0f172a' }}>
                            <span style={{ color: '#16a34a', fontWeight: 800, marginRight: 4 }}>✓</span>
                            Tamamlayan:{' '}
                            <strong style={{ color: '#15803d' }}>{completedName}</strong>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                            İlk yapan kazanır — kanıt henüz yok
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(t._groupAssigneeIds || []).map((id) => {
                          const isDone = String(id) === String(completedAssigneeId || '')
                          const name = staffNameById[String(id)] || 'Personel'
                          return (
                            <span
                              key={id}
                              style={{
                                padding: '3px 9px',
                                borderRadius: 9999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: isDone ? '#ECFDF5' : '#ffffff',
                                color: isDone ? '#15803d' : '#0f172a',
                                border: `1px solid ${isDone ? '#A7F3D0' : '#dbe4ef'}`,
                              }}
                            >
                              {isDone ? '✓ ' : ''}
                              {name}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 10,
                      marginTop: 8,
                      fontSize: 11.5,
                      color: '#334155',
                      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                      border: '1px solid #dbe4ef',
                      borderRadius: 14,
                      padding: '11px 12px',
                    }}
                  >
                    <span>
                      <strong>Durum:</strong> {normalizeTaskStatus(t.durum) || '-'}
                    </span>
                    <span>
                      <strong>Atayan:</strong> {assignerName}
                    </span>
                    <span>
                      <strong>Oluşturma:</strong> {fmt(t.created_at)}
                    </span>
                    <span>
                      <strong>Güncelleme:</strong> {fmt(t.updated_at)}
                    </span>
                  </div>
                  {t.aciklama ? (
                    <div style={{ ...subtleBoxStyle, marginTop: 8 }}>
                      <strong>Açıklama:</strong> {t.aciklama}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 10,
                    minWidth: 150,
                  }}
                >
                  <span
                    style={{
                      alignSelf: 'flex-end',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 10px',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 700,
                      ...badge,
                    }}
                  >
                    {normalizeTaskStatus(t.durum) || '-'}
                  </span>
                  <button
                    type="button"
                    disabled={approveDisabled}
                    onClick={() => setConfirmCtx({ type: 'approve', task: t })}
                    style={{
                      width: 132,
                      padding: '8px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: approveDisabled ? 'not-allowed' : 'pointer',
                      opacity: approveDisabled ? 0.55 : 1,
                      boxShadow: approveDisabled
                        ? 'none'
                        : '0 10px 20px -16px rgba(22,163,74,0.9)',
                    }}
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    disabled={rejectDisabled}
                    onClick={() => setConfirmCtx({ type: 'reject', task: t })}
                    style={{
                      width: 132,
                      padding: '8px 12px',
                      borderRadius: 9999,
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: rejectDisabled ? 'not-allowed' : 'pointer',
                      opacity: rejectDisabled ? 0.55 : 1,
                      boxShadow: rejectDisabled
                        ? 'none'
                        : '0 10px 20px -16px rgba(220,38,38,0.9)',
                    }}
                  >
                    Reddet
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/tasks/${t.id}`)}
                    style={{
                      width: 132,
                      padding: '8px 12px',
                      borderRadius: 9999,
                      border: '1px solid rgba(79,70,229,0.4)',
                      backgroundColor: 'rgba(79,70,229,0.04)',
                      color: '#4f46e5',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Detay görüntüle
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!confirmCtx}
        onClose={() => setConfirmCtx(null)}
        title={confirmCtx?.type === 'approve' ? 'Görev onayı' : 'Görev reddi'}
        message={
          confirmCtx?.type === 'approve'
            ? 'Görevi onaylamak istediğinize emin misiniz?'
            : 'Reddetmek için neden girin.'
        }
        confirmLabel={confirmCtx?.type === 'approve' ? 'Onayla' : 'Reddet'}
        cancelLabel="Vazgeç"
        variant={confirmCtx?.type === 'approve' ? 'primary' : 'danger'}
        requireReason={confirmCtx?.type === 'reject'}
        reasonLabel="Red nedeni"
        reasonPlaceholder="Red gerekçesi"
        onConfirm={(reason) => {
          const ctx = confirmCtx
          setConfirmCtx(null)
          if (!ctx?.task) return
          void reviewAction(ctx.task, ctx.type, reason)
        }}
      />
    </div>
  )
}
