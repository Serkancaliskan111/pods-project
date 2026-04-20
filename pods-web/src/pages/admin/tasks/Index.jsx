import { useContext, useEffect, useState } from 'react'
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

const supabase = getSupabase()

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

  const filtered = tasks.filter((t) => {
    const term = search.toLowerCase()
    const titleMatch = (t.baslik || '').toLowerCase().includes(term)
    const companyMatch = getCompanyName(t.ana_sirket_id)
      .toLowerCase()
      .includes(term)
    const matchesSearch = companyScoped
      ? titleMatch
      : titleMatch || companyMatch

    const matchesCompany = companyScoped
      ? String(t.ana_sirket_id) === String(currentCompanyId)
      : selectedCompanyId
        ? String(t.ana_sirket_id) === String(selectedCompanyId)
        : true

    return matchesSearch && matchesCompany
  })

  const handleApprove = async (task) => {
    if (!task?.id) return
    setActioningTaskId(task.id)
    try {
      const { error } = await supabase
        .from('isler')
        .update({ durum: 'TAMAMLANDI' })
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
          durum: 'Onaylanmadı',
          red_nedeni: trimmed,
        })
        .eq('id', task.id)
      if (error) {
        // red_nedeni kolonu yoksa fallback
        const { error: fallbackErr } = await supabase
          .from('isler')
          .update({
            durum: 'Onaylanmadı',
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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {!companyScoped ? (
          <select
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
            style={{
              minWidth: 200,
              borderRadius: 9999,
              border: '1px solid #e2e8f0',
              padding: '8px 12px',
              fontSize: 12,
              backgroundColor: '#ffffff',
            }}
          >
            <option value="">Tüm şirketler</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ana_sirket_adi}
              </option>
            ))}
          </select>
        ) : (
          companies[0] && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 36,
                padding: '0 14px',
                borderRadius: 9999,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                fontWeight: 600,
                color: '#0a1e42',
                backgroundColor: '#f8fafc',
              }}
            >
              {companies[0].ana_sirket_adi}
            </span>
          )
        )}
        <input
          type="text"
          placeholder={
            companyScoped
              ? 'Görev başlığına göre ara...'
              : 'Görev başlığı veya şirket adına göre ara...'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            borderRadius: 9999,
            border: '1px solid #e2e8f0',
            padding: '8px 12px',
            fontSize: 12,
            color: '#111827',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        />
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
          const isOverdue =
            t.son_tarih &&
            !String(t.durum || '').toLowerCase().includes('tamam') &&
            new Date(t.son_tarih) < new Date()

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
                  {t.durum || 'Durum yok'}
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

