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
            if (params?.search) {
              const raw = String(params.search)
              return raw.startsWith('?') ? raw : raw ? `?${raw}` : ''
            }
            const sp = new URLSearchParams()
            if (params?.personId) sp.set('personId', params.personId)
            if (params?.company) sp.set('company', params.company)
            if (params?.unitId) sp.set('unitId', params.unitId)
            if (params?.mode) sp.set('mode', params.mode)
            if (params?.baslik) sp.set('baslik', params.baslik)
            if (params?.baslangic) sp.set('baslangic', params.baslangic)
            if (params?.bitis) sp.set('bitis', params.bitis)
            if (params?.sablonId) sp.set('sablonId', params.sablonId)
            if (params?.projeId) sp.set('projeId', params.projeId)
            if (params?.projeGorevId) sp.set('projeGorevId', params.projeGorevId)
            if (params?.aciklama) sp.set('aciklama', params.aciklama)
            if (params?.assignees) sp.set('assignees', params.assignees)
            if (params?.cokluAtama) sp.set('cokluAtama', params.cokluAtama)
            if (params?.zincirGorev) sp.set('zincirGorev', params.zincirGorev)
            if (params?.zincirOnay) sp.set('zincirOnay', params.zincirOnay)
            if (params?.sirali) sp.set('sirali', params.sirali)
            if (params?.operasyonel) sp.set('operasyonel', params.operasyonel)
            if (params?.acil) sp.set('acil', params.acil)
            if (params?.aciklamaZorunlu) sp.set('aciklamaZorunlu', params.aciklamaZorunlu)
            if (params?.fotoZorunlu) sp.set('fotoZorunlu', params.fotoZorunlu)
            if (params?.videoZorunlu) sp.set('videoZorunlu', params.videoZorunlu)
            if (params?.ozelGorev) sp.set('ozelGorev', params.ozelGorev)
            if (params?.bireysel != null) sp.set('bireysel', params.bireysel)
            if (params?.puan) sp.set('puan', params.puan)
            if (params?.minFoto) sp.set('minFoto', params.minFoto)
            if (params?.minVideo) sp.set('minVideo', params.minVideo)
            if (params?.maxVideoSn) sp.set('maxVideoSn', params.maxVideoSn)
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
