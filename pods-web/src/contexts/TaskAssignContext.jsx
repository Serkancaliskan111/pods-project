import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AuthContext } from './AuthContext.jsx'
import { canAssignTask } from '../lib/permissions.js'

const TaskAssignContext = createContext(null)

/** Mobil ExtraTask / "Görev Ata" — tam sayfa route yerine panel overlay */
export function TaskAssignProvider({ children }) {
  const { profile, personel } = useContext(AuthContext)
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const openTaskAssign = useCallback((params = {}) => {
    if (!canAssignTask(permissions, isSystemAdmin, personel)) {
      toast.error('Görev oluşturma ve atama yetkiniz bulunmuyor.')
      return
    }
    const q =
      typeof params === 'string'
        ? params.startsWith('?')
          ? params
          : params
            ? `?${params}`
            : ''
        : (() => {
            const sp = new URLSearchParams()
            if (params?.personId) sp.set('personId', params.personId)
            if (params?.company) sp.set('company', params.company)
            if (params?.unitId) sp.set('unitId', params.unitId)
            const s = sp.toString()
            return s ? `?${s}` : ''
          })()
    setSearch(q)
    setOpen(true)
  }, [permissions, isSystemAdmin, personel])

  const closeTaskAssign = useCallback(() => {
    setOpen(false)
    setSearch('')
  }, [])

  const value = useMemo(
    () => ({ open, search, openTaskAssign, closeTaskAssign }),
    [open, search, openTaskAssign, closeTaskAssign],
  )

  return <TaskAssignContext.Provider value={value}>{children}</TaskAssignContext.Provider>
}

export function useTaskAssign() {
  const ctx = useContext(TaskAssignContext)
  if (!ctx) {
    return {
      open: false,
      search: '',
      openTaskAssign: () => {},
      closeTaskAssign: () => {},
    }
  }
  return ctx
}

export default TaskAssignContext
