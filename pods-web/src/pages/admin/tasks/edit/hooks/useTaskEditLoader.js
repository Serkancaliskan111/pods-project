import { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import getSupabase from '../../../../../lib/supabaseClient'
import { AuthContext } from '../../../../../contexts/AuthContext.jsx'
import {
  scopeBirimlerQuery,
  scopeIslerQuery,
  enrichScopeWithJunctionPersonelIds,
  scopePersonelQuery,
  isUnitInScope,
} from '../../../../../lib/supabaseScope.js'
import {
  TASK_STATUS,
  isStepApprovedStatus,
  taskOperationalEditEligible,
} from '../../../../../lib/taskStatus.js'
import {
  isSiraliGorevTuru,
  isZincirGorevTuru,
  isZincirOnayTuru,
} from '../../../../../lib/zincirTasks.js'

const supabase = getSupabase()

/**
 * Görev düzenleme ekranı için ortak yükleyici.
 *
 * - Task'ı şirket kapsamına göre çeker (`isler`).
 * - Sıralı / zincir / zincir-onay adımlarını ilgili tablodan çeker.
 * - Sıralı Görevde **tüm adımlar onaylıysa** ana görevi `APPROVED` sayar; düzenleme bloklanır.
 * - `birimler` ve `personeller` listelerini scope ile birlikte yükler.
 * - `blockedReason` doluysa form gizlenir; çağırıcı sadece read-only blok gösterir.
 */
export function useTaskEditLoader(taskId) {
  const navigate = useNavigate()
  const { profile, personel } = useContext(AuthContext)
  const isSystemAdmin = !!profile?.is_system_admin
  const currentCompanyId = isSystemAdmin ? null : personel?.ana_sirket_id
  const accessibleUnitIds = isSystemAdmin
    ? null
    : personel?.accessibleUnitIds || []
  const scopeReady = isSystemAdmin || personel?.scopeReady !== false

  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState(null)
  const [blockedReason, setBlockedReason] = useState(null)
  const [units, setUnits] = useState([])
  const [staff, setStaff] = useState([])
  const [chainGorevSteps, setChainGorevSteps] = useState([])
  const [chainOnaySteps, setChainOnaySteps] = useState([])
  const [siraliSteps, setSiraliSteps] = useState([])

  const loadScopeLists = useCallback(
    async (companyId) => {
      if (!companyId) return
      const scope = await enrichScopeWithJunctionPersonelIds(supabase, {
        isSystemAdmin,
        currentCompanyId: companyId,
        accessibleUnitIds,
      })
      const [{ data: u }, { data: s }] = await Promise.all([
        scopeBirimlerQuery(
          supabase
            .from('birimler')
            .select('id,birim_adi')
            .eq('ana_sirket_id', companyId)
            .is('silindi_at', null),
          scope,
        ).order('birim_adi', { ascending: true }),
        scopePersonelQuery(
          supabase
            .from('personeller')
            .select('id,ad,soyad,email,birim_id')
            .eq('ana_sirket_id', companyId)
            .is('silindi_at', null),
          scope,
        ).order('ad', { ascending: true }),
      ])
      setUnits(Array.isArray(u) ? u : [])
      setStaff(Array.isArray(s) ? s : [])
    },
    [isSystemAdmin, accessibleUnitIds],
  )

  useEffect(() => {
    if (!taskId || !scopeReady) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setBlockedReason(null)
      setChainGorevSteps([])
      setChainOnaySteps([])
      setSiraliSteps([])
      try {
        let q = supabase.from('isler').select('*').eq('id', taskId)
        q = scopeIslerQuery(q, {
          isSystemAdmin,
          currentCompanyId,
          accessibleUnitIds,
        })
        const { data: job, error: jobErr } = await q.maybeSingle()
        if (cancelled) return
        if (jobErr || !job) {
          toast.error('Görev yüklenemedi')
          navigate('/admin/tasks', { replace: true })
          return
        }
        if (!isSystemAdmin && currentCompanyId) {
          if (String(job.ana_sirket_id) !== String(currentCompanyId)) {
            navigate('/unauthorized', { replace: true })
            return
          }
          if (
            accessibleUnitIds &&
            accessibleUnitIds.length &&
            job.birim_id &&
            !isUnitInScope(accessibleUnitIds, job.birim_id)
          ) {
            navigate('/unauthorized', { replace: true })
            return
          }
        }

        const { data: pendingDel } = await supabase
          .from('isler_silme_talepleri')
          .select('id')
          .eq('is_id', job.id)
          .eq('durum', 'bekliyor')
          .maybeSingle()

        let effectiveDurum = job.durum
        if (isSiraliGorevTuru(job.gorev_turu)) {
          const { data: stepRows } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select(
              'id, adim_no, personel_id, denetimci_personel_id, adim_baslik, adim_istenenler, adim_durum, durum, kanit_resim_ler, tamamlandi_at, adim_gonderim_at, adim_onay_at, adim_onay_notu',
            )
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          const list = Array.isArray(stepRows) ? stepRows : []
          if (!cancelled) setSiraliSteps(list)
          if (list.length) {
            const allApproved = list.every((r) =>
              isStepApprovedStatus(r?.adim_durum || r?.durum),
            )
            if (allApproved) effectiveDurum = TASK_STATUS.APPROVED
          }
        }

        const jobForEligibility =
          effectiveDurum !== job.durum ? { ...job, durum: effectiveDurum } : job

        if (pendingDel?.id) {
          setBlockedReason(
            'Bu görev için bekleyen silme talebi var; düzenleme yapılamaz.',
          )
        } else if (!taskOperationalEditEligible(jobForEligibility)) {
          setBlockedReason(
            'Bu görev onay bekliyor, onaylı, reddedilmiş veya tekrar sürecinde; düzenleme yapılamaz.',
          )
        }

        setTask(job)
        await loadScopeLists(job.ana_sirket_id)

        if (isZincirGorevTuru(job.gorev_turu)) {
          const { data: zr } = await supabase
            .from('isler_zincir_gorev_adimlari')
            .select('id,adim_no,personel_id,durum,kanit_resim_ler,tamamlandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (!cancelled) setChainGorevSteps(Array.isArray(zr) ? zr : [])
        }
        if (isZincirOnayTuru(job.gorev_turu)) {
          const { data: orows } = await supabase
            .from('isler_zincir_onay_adimlari')
            .select('id,adim_no,onaylayici_personel_id,durum,onaylandi_at')
            .eq('is_id', job.id)
            .order('adim_no', { ascending: true })
          if (!cancelled) setChainOnaySteps(Array.isArray(orows) ? orows : [])
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) toast.error('Görev yüklenemedi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    taskId,
    scopeReady,
    isSystemAdmin,
    currentCompanyId,
    accessibleUnitIds,
    navigate,
    loadScopeLists,
  ])

  return {
    loading,
    task,
    blockedReason,
    units,
    staff,
    chainGorevSteps,
    chainOnaySteps,
    siraliSteps,
    setSiraliSteps,
    setChainGorevSteps,
    setChainOnaySteps,
  }
}
