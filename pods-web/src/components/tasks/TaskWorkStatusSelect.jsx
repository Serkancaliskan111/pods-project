import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import {
  TASK_WORK_STATUS_OPTIONS,
  getTaskWorkStatusOption,
  normalizeTaskWorkStatus,
} from '../../lib/taskWorkStatus.js'
import { updateTaskWorkStatus } from '../../lib/taskWorkStatusApi.js'

export default function TaskWorkStatusSelect({
  taskId,
  value,
  onUpdated,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef(null)
  const current = getTaskWorkStatusOption(value)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const onPick = useCallback(
    async (next) => {
      if (!taskId || disabled || saving) return
      const normalized = normalizeTaskWorkStatus(next)
      if (normalized === normalizeTaskWorkStatus(value)) {
        setOpen(false)
        return
      }
      setSaving(true)
      try {
        const result = await updateTaskWorkStatus(taskId, normalized)
        onUpdated?.(result?.calisma_durumu || normalized)
        toast.success('Görev durumu güncellendi')
        setOpen(false)
      } catch (e) {
        console.warn('[TaskWorkStatusSelect]', e)
        toast.error(e?.message || 'Durum güncellenemedi')
      } finally {
        setSaving(false)
      }
    },
    [taskId, disabled, saving, value, onUpdated],
  )

  return (
    <div className={className}>
      <div ref={rootRef} className="relative inline-block">
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-sm transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: current.pillBg,
            color: current.pillText,
          }}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          {current.label}
          <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>

        {open ? (
          <ul
            role="listbox"
            className="absolute left-0 z-50 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {TASK_WORK_STATUS_OPTIONS.map((opt) => {
              const selected = normalizeTaskWorkStatus(value) === opt.value
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => void onPick(opt.value)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-50 ${
                      selected ? 'bg-blue-50 font-semibold' : ''
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.dot }}
                      aria-hidden
                    />
                    {opt.label}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
