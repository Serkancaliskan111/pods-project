import { useNavigate } from 'react-router-dom'
import { Eye, X } from 'lucide-react'
import Modal from '../../ui/Modal.jsx'
import { formatHiddenDueLabel } from '../../lib/taskHomeHidden.js'

export default function HiddenTasksModal({
  open,
  onClose,
  tasks,
  loading,
  onRestore,
  restoringId,
}) {
  const navigate = useNavigate()

  return (
    <Modal open={open} onClose={onClose} title="Gizlenmiş görevlerim" size="lg">
      <div className="max-h-[min(70vh,520px)] overflow-y-auto px-4 pb-5 pt-1">
        <p className="mb-4 text-sm text-slate-600">
          Son tarihi bugünden önce olan gecikmiş görevler ana sayfada otomatik gizlenir.
          Bugün vadesi dolan gecikmiş görevler listede kalır.
        </p>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Yükleniyor…</p>
        ) : null}

        {!loading && !tasks.length ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
            Gizlenmiş görev yok.
          </p>
        ) : null}

        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(`/admin/tasks/${task.id}/complete`)
                }}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold text-slate-900">
                  {task.baslik || 'Görev'}
                </p>
                <p className="mt-0.5 text-xs text-red-600">
                  Gecikmiş · Son tarih: {formatHiddenDueLabel(task)}
                </p>
                {task.projectLabel ? (
                  <p className="mt-0.5 text-xs text-slate-500">{task.projectLabel}</p>
                ) : null}
              </button>
              <button
                type="button"
                disabled={restoringId === task.id}
                onClick={() => void onRestore(task)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Eye size={14} />
                {restoringId === task.id ? 'Ekleniyor…' : 'Ana sayfada göster'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
