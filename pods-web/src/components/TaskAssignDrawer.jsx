import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useTaskAssign } from '../contexts/TaskAssignContext.jsx'
import { TaskAssignForm } from '../pages/admin/tasks/New.jsx'
import Sheet from '../ui/Sheet'
import IconButton from '../ui/IconButton'

export default function TaskAssignDrawer() {
  const { open, search, closeTaskAssign } = useTaskAssign()
  const navigate = useNavigate()

  const handleClose = (result) => {
    closeTaskAssign()
    if (result?.refresh) {
      navigate('/admin/tasks', { state: { refreshAt: Date.now() } })
    }
  }

  return (
    <Sheet open={open} onClose={() => handleClose()} side="right" panelClassName="!max-w-[min(800px,100vw)]">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Yönetim</p>
          <h2 className="text-xl font-extrabold tracking-tight text-slate-800 truncate">Görev Ata</h2>
        </div>
        <IconButton
          icon={<X size={20} />}
          tone="soft"
          aria-label="Kapat"
          onClick={() => handleClose()}
        />
      </div>
      {open ? (
        <TaskAssignForm
          key={search || 'default'}
          embedded
          initialSearch={search}
          onClose={handleClose}
        />
      ) : null}
    </Sheet>
  )
}
