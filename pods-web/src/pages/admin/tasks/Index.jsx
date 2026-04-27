import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../lib/supabaseClient'
import { AuthContext } from '../../../contexts/AuthContext.jsx'
import { canApproveTask, canAssignTask } from '../../../lib/permissions.js'
import {
  scopeAnaSirketlerQuery,
  scopeBirimlerQuery,
  scopeIslerQuery,
  scopePersonelQuery,
  isUnitInScope,
  TASKS_LIST_LIMIT,
} from '../../../lib/supabaseScope.js'
import {
  TASK_STATUS,
  isApprovedTaskStatus,
  isPendingApprovalTaskStatus,
  normalizeTaskStatus,
} from '../../../lib/taskStatus.js'

const supabase = getSupabase()

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

export default function TasksIndex() {
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const companyScoped = !isSystemAdmin && !!currentCompanyId
  const permissions = profile?.yetkiler || {}
  const canCreateTask = isSystemAdmin || canAssignTask(permissions)
  const [tasks, setTasks] = useState([])
  const [companies, setCompanies] = useState([])
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningTaskId, setActioningTaskId] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedTaskType, setSelectedTaskType] = useState('')
  const [selectedUnitIds, setSelectedUnitIds] = useState([])
  const [isUnitMenuOpen, setIsUnitMenuOpen] = useState(false)
  const unitMenuRef = useRef(null)

  const navigate = useNavigate()
  const location = useLocation()

  const load = async () => {
    setLoading(true)
    const scope = {
      isSystemAdmin,
      currentCompanyId,
      accessibleUnitIds,
    }
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

      const jobsQuery = scopeIslerQuery(
        supabase
          .from('isler')
          .select(
            'id,baslik,durum,son_tarih,created_at,ana_sirket_id,birim_id,sorumlu_personel_id,gorev_turu,zincir_aktif_adim',
          )
          .order('created_at', { ascending: false })
          .limit(TASKS_LIST_LIMIT),
        scope,
      )
      const { data: jobs, error: jobsErr } = await jobsQuery

      if (compErr || staffErr || jobsErr || unitsErr) {
        console.error(compErr || staffErr || jobsErr || unitsErr)
        toast.error('Görevler yüklenemedi')
        setTasks([])
        setCompanies(comps || [])
        setStaff(staffData || [])
      } else {
        setCompanies(comps || [])
        setUnits(unitsData || [])
        setStaff(staffData || [])
        setTasks(jobs || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const companyFromQuery = params.get('company')
    if (companyScoped && currentCompanyId) {
      setSelectedCompanyId(String(currentCompanyId))
      return
    }
    if (companyFromQuery) {
      setSelectedCompanyId(companyFromQuery)
    }
  }, [location.search, companyScoped, currentCompanyId])

  useEffect(() => {
    load()
  }, [
    isSystemAdmin,
    currentCompanyId,
    JSON.stringify(accessibleUnitIds || []),
  ])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!unitMenuRef.current) return
      if (!unitMenuRef.current.contains(event.target)) {
        setIsUnitMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [])

  const getCompanyName = (id) =>
    companies.find((c) => c.id === id)?.ana_sirket_adi ?? '-'

  const getUnitName = (id) =>
    units.find((u) => u.id === id)?.birim_adi ?? ''

  const getStaffName = (id) => {
    if (!id) return '-'
    const s = staff.find((p) => p.id === id)
    if (!s) return '-'
    if (s.ad || s.soyad) {
      return `${s.ad || ''} ${s.soyad || ''}`.trim()
    }
    return s.email || '-'
  }

  const getTaskTypeLabel = (taskType) => {
    const value = String(taskType || '').trim()
    if (!value) return '-'
    const labels = {
      normal: 'Normal',
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

  const statusOptions = Array.from(
    new Set(tasks.map((t) => normalizeTaskStatus(t?.durum)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const taskTypeOptions = Array.from(
    new Set([
      'normal',
      'zincir_gorev',
      'zincir_onay',
      'zincir_gorev_ve_onay',
      ...tasks.map((t) => String(t?.gorev_turu || '').trim()).filter(Boolean),
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

  const filtered = tasks.filter((t) => {
    const term = search.toLowerCase()
    const titleMatch = (t.baslik || '').toLowerCase().includes(term)
    const companyMatch = getCompanyName(t.ana_sirket_id)
      .toLowerCase()
      .includes(term)
    const staffMatch = getStaffName(t.sorumlu_personel_id)
      .toLowerCase()
      .includes(term)
    const matchesSearch = companyScoped
      ? titleMatch || staffMatch
      : titleMatch || companyMatch || staffMatch

    const matchesCompany = companyScoped
      ? String(t.ana_sirket_id) === String(currentCompanyId)
      : selectedCompanyId
        ? String(t.ana_sirket_id) === String(selectedCompanyId)
        : true

    const matchesStatus = selectedStatus
      ? normalizeTaskStatus(t.durum) === selectedStatus
      : true

    const matchesTaskType = selectedTaskType
      ? String(t.gorev_turu || '').trim() === selectedTaskType
      : true

    const matchesUnit = selectedUnitIds.length
      ? selectedUnitIds.includes(String(t.birim_id || ''))
      : true

    return (
      matchesSearch &&
      matchesCompany &&
      matchesStatus &&
      matchesTaskType &&
      matchesUnit
    )
  })

  const handleApprove = async (task) => {
    if (!task?.id) return
    setActioningTaskId(task.id)
    try {
      const { error } = await supabase
        .from('isler')
        .update({ durum: TASK_STATUS.APPROVED })
        .eq('id', task.id)
      if (error) throw error
      toast.success('Görev onaylandı')
      load()
    } catch (e) {
      console.error(e)
      toast.error('Görev onaylanamadı')
    } finally {
      setActioningTaskId(null)
    }
  }

  const handleReject = async (task) => {
    if (!task?.id) return
    const reason = window.prompt('Red nedeni girin:')
    if (reason == null) return
    const trimmed = String(reason || '').trim()
    if (!trimmed) {
      toast.error('Red nedeni boş olamaz')
      return
    }
    setActioningTaskId(task.id)
    try {
      if (
        task.gorev_turu === 'zincir_gorev' ||
        task.gorev_turu === 'zincir_gorev_ve_onay'
      ) {
        const activeStepNo = Number(task.zincir_aktif_adim) || 1
        const { data: currentStep, error: stepErr } = await supabase
          .from('isler_zincir_gorev_adimlari')
          .select('id')
          .eq('is_id', task.id)
          .eq('adim_no', activeStepNo)
          .maybeSingle()
        if (stepErr) throw stepErr
        if (currentStep?.id) {
          const { error: updStepErr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .update({
              durum: 'reddedildi',
              aciklama: trimmed,
            })
            .eq('id', currentStep.id)
          if (updStepErr) throw updStepErr
        }
      }

      const { error } = await supabase
        .from('isler')
        .update({
          durum: TASK_STATUS.REJECTED,
          red_nedeni: trimmed,
        })
        .eq('id', task.id)
      if (error) {
        // red_nedeni kolonu yoksa fallback
        const { error: fallbackErr } = await supabase
          .from('isler')
          .update({
            durum: TASK_STATUS.REJECTED,
            aciklama: trimmed,
          })
          .eq('id', task.id)
        if (fallbackErr) throw fallbackErr
      }
      toast.success('Görev reddedildi')
      load()
    } catch (e) {
      console.error(e)
      toast.error('Görev reddedilemedi')
    } finally {
      setActioningTaskId(null)
    }
  }

  const containerStyle = {
    padding: '32px',
    backgroundColor: '#f3f4f6',
    minHeight: '100vh',
  }

  const cardStyle = {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '16px 18px',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 10px -6px rgba(15,23,42,0.18)',
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

  const filterFieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  }

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

  const statusBadgeStyle = (durum) => {
    const d = String(durum || '').toLowerCase()
    if (d.includes('tamam')) {
      return {
        backgroundColor: '#bbf7d0',
        color: '#166534',
      }
    }
    if (d.includes('gecik') || d.includes('geçik')) {
      return {
        backgroundColor: '#fee2e2',
        color: '#b91c1c',
      }
    }
    return {
      backgroundColor: '#e5e7eb',
      color: '#374151',
    }
  }

  return (
    <div style={containerStyle}>
      {/* Başlık + Yeni Görev */}
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
            Görevler
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: 4,
            }}
          >
            {companyScoped
              ? 'Şirketiniz ve yetkili birimlerinizdeki görevleri görüntüleyin.'
              : 'Tüm şirketlerdeki atanmış görevleri görüntüleyin ve filtreleyin.'}
          </p>
        </div>
        {canCreateTask && (
          <button
            type="button"
            onClick={() => navigate('/admin/tasks/new')}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#0a1e42',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
            }}
          >
            + Yeni Görev Oluştur
          </button>
        )}
      </div>

      {/* Filtreler */}
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
                  border: '1px solid #dbe2ea',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#0a1e42',
                  backgroundColor: '#eef2ff',
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

      {/* Liste */}
      {loading && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: '#6b7280',
            padding: '16px 4px',
          }}
        >
          Kayıtlı görev bulunamadı.
        </div>
      )}

      {!loading &&
        filtered.map((t) => {
          const badge = statusBadgeStyle(t.durum)
          const isOverdue = isOverdueTask(t)

          return (
            <div key={t.id} style={cardStyle}>
              {/* Sol: başlık + şirket/personel + tarihler */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#0a1e42',
                  }}
                >
                  {t.baslik || 'Başlıksız görev'}{' '}
                  {t.gorev_turu && t.gorev_turu !== 'normal' ? (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4f46e5' }}>
                      {t.gorev_turu === 'zincir_gorev' && '🔗'}
                      {t.gorev_turu === 'zincir_onay' && '🔗'}
                      {t.gorev_turu === 'zincir_gorev_ve_onay' && '🔗'}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748b',
                  }}
                >
                  {companyScoped ? (
                    <>
                      {getUnitName(t.birim_id)
                        ? `${getUnitName(t.birim_id)} • `
                        : ''}
                      {getStaffName(t.sorumlu_personel_id)}
                    </>
                  ) : (
                    <>
                      {getCompanyName(t.ana_sirket_id)}
                      {getUnitName(t.birim_id)
                        ? ` • ${getUnitName(t.birim_id)}`
                        : ''}
                      {' • '}
                      {getStaffName(t.sorumlu_personel_id)}
                    </>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginTop: 4,
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  <span>
                    Oluşturma:{' '}
                    {t.created_at
                      ? new Date(t.created_at).toLocaleString('tr-TR')
                      : '-'}
                  </span>
                  <span>
                    Bitiş:{' '}
                    {t.son_tarih
                      ? new Date(t.son_tarih).toLocaleString('tr-TR')
                      : '-'}
                  </span>
                  {isOverdue && (
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                      Gecikmiş
                    </span>
                  )}
                </div>
              </div>

              {/* Sağ: durum + detay butonu */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginLeft: 16,
                  minWidth: 180,
                }}
              >
                <span
                  style={{
                    alignSelf: 'flex-end',
                    padding: '6px 12px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: badge.backgroundColor,
                    color: badge.color,
                  }}
                >
                  {normalizeTaskStatus(t.durum) || 'Durum yok'}
                </span>
                {(isSystemAdmin || canApproveTask(permissions)) &&
                  (!accessibleUnitIds ||
                    !accessibleUnitIds.length ||
                    isUnitInScope(accessibleUnitIds, t.birim_id)) && (
                    <>
                      <button
                        type="button"
                        disabled={actioningTaskId === t.id}
                        onClick={() => handleApprove(t)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: actioningTaskId === t.id ? 'not-allowed' : 'pointer',
                          opacity: actioningTaskId === t.id ? 0.6 : 1,
                        }}
                      >
                        Onayla
                      </button>
                      <button
                        type="button"
                        disabled={actioningTaskId === t.id}
                        onClick={() => handleReject(t)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: '#dc2626',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: actioningTaskId === t.id ? 'not-allowed' : 'pointer',
                          opacity: actioningTaskId === t.id ? 0.6 : 1,
                        }}
                      >
                        Reddet
                      </button>
                    </>
                  )}
                <button
                  type="button"
                  onClick={() => navigate(`/admin/tasks/${t.id}`)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 9999,
                    border: '1px solid rgba(79,70,229,0.4)',
                    backgroundColor: 'rgba(79,70,229,0.04)',
                    color: '#4f46e5',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Detay görüntüle
                </button>
              </div>
            </div>
          )
        })}
    </div>
  )
}

