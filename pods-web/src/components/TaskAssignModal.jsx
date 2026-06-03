import { useNavigate } from 'react-router-dom'
import { TaskAssignForm } from '../pages/admin/tasks/New.jsx'
import { useTaskAssign } from '../contexts/TaskAssignContext.jsx'
import Modal from '../ui/Modal'

export default function TaskAssignModal() {
  const { open, search, closeTaskAssign } = useTaskAssign()
  const navigate = useNavigate()

  const handleClose = (result) => {
    const projeId = (() => {
      try {
        const raw = String(search || '').replace(/^\?/, '')
        return raw ? new URLSearchParams(raw).get('projeId') : null
      } catch {
        return null
      }
    })()
    closeTaskAssign()
    if (!result?.refresh) return
    if (projeId) {
      navigate(`/admin/projects/${projeId}`, { state: { refreshAt: Date.now() } })
      return
    }
    navigate('/admin/tasks', { state: { refreshAt: Date.now() } })
  }

  return (
    <Modal
      open={open}
      onClose={() => handleClose()}
      title="Görev ekle"
      size="xl"
      className="!flex !h-[min(820px,calc(100vh-2rem))] !max-h-[92vh] !w-full !max-w-[min(720px,calc(100vw-2rem))] !flex-col !overflow-hidden !rounded-2xl !border-[#E2E8F0] !p-0 !shadow-[0_20px_50px_rgba(15,23,42,0.12)]"
    >
      {open ? (
        <TaskAssignForm
          key={search || 'default'}
          embedded
          initialSearch={search}
          onClose={handleClose}
        />
      ) : null}
    </Modal>
  )
}
