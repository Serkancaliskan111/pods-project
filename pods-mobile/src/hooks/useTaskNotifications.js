import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { canApproveTask } from '../lib/permissions'
import { isTaskVisibleNow, isTaskVisibleToPerson } from '../lib/taskVisibility'
import { isPendingApprovalTaskStatus } from '../lib/taskStatus'
import {
  mergeChainSiraliTasksIntoJobs,
  JOBS_SELECT_WITH_VISIBLE_AT,
  JOBS_SELECT_LEGACY,
} from '../screens/admin/tasks/lib/tasksListLoadUtils'
import {
  buildTaskNotifications,
  countUnreadNotifications,
  loadReadNotificationIds,
  loadReadNotificationIdsAsync,
  saveReadNotificationIds,
} from '../lib/taskNotifications'
import { fetchWorkStatusNotifications, markWorkStatusNotificationRead } from '../lib/taskWorkStatusApi'
import { mapWorkStatusNotifications } from '../lib/workStatusNotifications'
import { fetchPersonalTodos } from '../lib/personalTodoApi'
import { buildPersonalTodoNotifications } from '../lib/personalTodoNotifications'

const supabase = getSupabase()
const POLL_MS = 5 * 60 * 1000
const PERSONAL_TODO_TICK_MS = 60 * 1000

export function useTaskNotifications() {
  const { profile, personel, user, scopeReady } = useAuth()
  const isSystemAdmin = !!profile?.is_system_admin
  const permissions = profile?.yetkiler || {}
  const canReview = isSystemAdmin || canApproveTask(permissions)
  const personelId = personel?.id ? String(personel.id) : ''
  const userId = user?.id ? String(user.id) : ''
  const companyId = personel?.ana_sirket_id

  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState([])
  const [personalTodos, setPersonalTodos] = useState([])
  const [workStatusRows, setWorkStatusRows] = useState([])
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(personelId))
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    if (!personelId) {
      setReadIds(new Set())
      return undefined
    }
    void loadReadNotificationIdsAsync(personelId).then((ids) => {
      if (!cancelled) setReadIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [personelId])

  const load = useCallback(async () => {
    if (!scopeReady || !personelId) {
      setTasks([])
      setPersonalTodos([])
      setWorkStatusRows([])
      return
    }
    setLoading(true)
    try {
      let q = supabase
        .from('isler')
        .select(JOBS_SELECT_WITH_VISIBLE_AT)
        .order('updated_at', { ascending: false })
        .limit(120)

      if (!isSystemAdmin && companyId) {
        q = q.eq('ana_sirket_id', companyId)
      }

      let { data: jobs, error } = await q
      if (error?.code === '42703') {
        const legacy = await supabase
          .from('isler')
          .select(JOBS_SELECT_LEGACY)
          .order('updated_at', { ascending: false })
          .limit(120)
        jobs = legacy.data
        error = legacy.error
      }
      if (error) throw error

      let merged = jobs || []
      if (personelId && companyId) {
        merged = await mergeChainSiraliTasksIntoJobs(supabase, merged, {
          personelId,
          companyId,
          isSystemAdmin,
          jobsSelectWithVisibleAt: JOBS_SELECT_WITH_VISIBLE_AT,
          jobsSelectLegacy: JOBS_SELECT_LEGACY,
        })
      }

      let visible = merged.filter(
        (t) => isTaskVisibleNow(t) && isTaskVisibleToPerson(t, personelId),
      )

      if (canReview && companyId) {
        const { data: auditPool } = await supabase
          .from('isler')
          .select(JOBS_SELECT_WITH_VISIBLE_AT)
          .eq('ana_sirket_id', companyId)
          .order('updated_at', { ascending: false })
          .limit(80)
        const pendingAudit = (auditPool || []).filter((t) =>
          isPendingApprovalTaskStatus(t?.durum),
        )
        const seen = new Set(visible.map((t) => String(t.id)))
        for (const row of pendingAudit) {
          if (!seen.has(String(row.id))) {
            visible.push(row)
            seen.add(String(row.id))
          }
        }
      }

      setTasks(visible)

      if (userId) {
        try {
          const ptodos = await fetchPersonalTodos(userId)
          setPersonalTodos(ptodos)
        } catch {
          setPersonalTodos([])
        }
      } else {
        setPersonalTodos([])
      }

      const wsRows = await fetchWorkStatusNotifications(personelId)
      setWorkStatusRows(wsRows)
    } catch (e) {
      console.warn('[useTaskNotifications]', e)
      setTasks([])
      setPersonalTodos([])
      setWorkStatusRows([])
    } finally {
      setLoading(false)
    }
  }, [scopeReady, personelId, userId, companyId, isSystemAdmin, canReview])

  useEffect(() => {
    if (!personelId) return undefined
    const id = setInterval(() => setNowTick(Date.now()), PERSONAL_TODO_TICK_MS)
    return () => clearInterval(id)
  }, [personelId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!personelId) return undefined
    const pollId = setInterval(() => void load(), POLL_MS)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load()
    })
    return () => {
      clearInterval(pollId)
      sub.remove()
    }
  }, [load, personelId])

  const computedNotifications = useMemo(
    () =>
      buildTaskNotifications(tasks, personelId, {
        canReview,
        readIds,
      }),
    [tasks, personelId, canReview, readIds],
  )

  const workStatusNotifications = useMemo(
    () => mapWorkStatusNotifications(workStatusRows),
    [workStatusRows],
  )

  const personalTodoNotifications = useMemo(
    () =>
      buildPersonalTodoNotifications(personalTodos, {
        readIds,
        now: new Date(nowTick),
      }),
    [personalTodos, readIds, nowTick],
  )

  const notifications = useMemo(() => {
    const merged = [...workStatusNotifications, ...computedNotifications, ...personalTodoNotifications]
    merged.sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0))
    return merged.slice(0, 40)
  }, [workStatusNotifications, computedNotifications, personalTodoNotifications])

  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications, readIds),
    [notifications, readIds],
  )

  const markRead = useCallback(
    (notifId) => {
      if (!notifId || !personelId) return
      if (String(notifId).startsWith('wsn:')) {
        const dbId = String(notifId).slice(4)
        void markWorkStatusNotificationRead(dbId, personelId).then(() => {
          setWorkStatusRows((prev) => prev.filter((r) => String(r.id) !== dbId))
        })
        return
      }
      setReadIds((prev) => {
        const next = new Set(prev)
        next.add(notifId)
        saveReadNotificationIds(personelId, next)
        return next
      })
    },
    [personelId],
  )

  const markAllRead = useCallback(() => {
    if (!personelId) return
    const persistIds = workStatusNotifications.map((n) => n.dbId).filter(Boolean)
    if (persistIds.length) {
      void Promise.all(
        persistIds.map((id) => markWorkStatusNotificationRead(id, personelId)),
      ).then(() => setWorkStatusRows([]))
    }
    setReadIds((prev) => {
      const next = new Set(prev)
      for (const n of notifications) {
        if (!n.persistRead) next.add(n.id)
      }
      saveReadNotificationIds(personelId, next)
      return next
    })
  }, [notifications, personelId, workStatusNotifications])

  return {
    loading,
    notifications,
    unreadCount,
    reload: load,
    markRead,
    markAllRead,
    readIds,
  }
}
