import { createContext, useContext, useState } from 'react'
import { useCubicleHomeData } from '../hooks/useCubicleHomeData.js'
import HiddenTasksModal from '../components/cubicle/HiddenTasksModal.jsx'

const CubicleHomeContext = createContext(null)

export function CubicleHomeProvider({ children }) {
  const data = useCubicleHomeData()
  const [hiddenModalOpen, setHiddenModalOpen] = useState(false)

  const value = {
    ...data,
    hiddenModalOpen,
    openHiddenModal: () => setHiddenModalOpen(true),
    closeHiddenModal: () => setHiddenModalOpen(false),
  }

  return (
    <CubicleHomeContext.Provider value={value}>
      {children}
      {data.operatorMode ? (
        <HiddenTasksModal
          open={hiddenModalOpen}
          onClose={() => setHiddenModalOpen(false)}
          tasks={data.hiddenOverdue}
          loading={data.loading}
          onRestore={data.restoreHiddenToHome}
          restoringId={data.restoringTaskId}
        />
      ) : null}
    </CubicleHomeContext.Provider>
  )
}

export function useCubicleHomeContext() {
  const ctx = useContext(CubicleHomeContext)
  if (!ctx) {
    throw new Error('useCubicleHomeContext must be used within CubicleHomeProvider')
  }
  return ctx
}

export function useCubicleHomeContextOptional() {
  return useContext(CubicleHomeContext)
}
