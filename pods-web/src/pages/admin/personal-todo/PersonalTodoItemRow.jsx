import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Film, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  canCompleteMadde,
  isMediaMaddeTip,
  maddeTipLabel,
  TODO_MADDE_TIP,
} from '../../../lib/personalTodoItemTypes.js'
import {
  getPersonalTodoMediaSignedUrl,
  uploadPersonalTodoItemMedia,
} from '../../../lib/personalTodoMediaApi.js'
import { cn } from '../../../lib/cn'

export default function PersonalTodoItemRow({
  item,
  readOnly,
  editMode = false,
  todoId,
  userId,
  onUpdate,
  onRemove,
}) {
  const inputRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!item.medyaYol) {
      setPreviewUrl(null)
      return undefined
    }
    void getPersonalTodoMediaSignedUrl(item.medyaYol)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [item.medyaYol])

  const handleToggle = () => {
    if (!canCompleteMadde(item) && !item.tamamlandi) {
      toast.error(`Önce ${maddeTipLabel(item.tip).toLowerCase()} yükleyin`)
      return
    }
    onUpdate({ ...item, tamamlandi: !item.tamamlandi })
  }

  const handleFile = async (file) => {
    if (!file || !userId || !todoId) return
    setUploading(true)
    try {
      const path = await uploadPersonalTodoItemMedia({
        userId,
        todoId,
        itemId: item.id,
        file,
        tip: item.tip,
      })
      onUpdate({ ...item, medyaYol: path })
      toast.success('Yüklendi')
    } catch (e) {
      toast.error(e?.message || 'Yüklenemedi')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const accept = item.tip === TODO_MADDE_TIP.VIDEO ? 'video/*' : 'image/*'
  const needsMedia = isMediaMaddeTip(item.tip) && !item.medyaYol && !item.tamamlandi

  return (
    <li
      className={cn(
        'group flex gap-3 rounded-2xl border px-3 py-3 transition',
        item.tamamlandi
          ? 'border-transparent bg-slate-50/80'
          : needsMedia
            ? 'border-amber-200 bg-amber-50/40'
            : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm',
      )}
    >
      <button
        type="button"
        disabled={readOnly || uploading}
        onClick={handleToggle}
        aria-label={item.tamamlandi ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
          item.tamamlandi
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-slate-300 bg-white text-transparent hover:border-primary-400',
          (readOnly || uploading) && 'cursor-not-allowed opacity-60',
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[15px] leading-snug',
            item.tamamlandi ? 'text-slate-400 line-through' : 'text-slate-800',
          )}
        >
          {item.metin}
        </p>

        {isMediaMaddeTip(item.tip) ? (
          <div className="mt-2.5 space-y-2">
            {previewUrl ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5">
                {item.tip === TODO_MADDE_TIP.VIDEO ? (
                  <video src={previewUrl} controls className="max-h-40 w-full bg-black" playsInline />
                ) : (
                  <img src={previewUrl} alt="" className="max-h-40 w-full object-contain" />
                )}
              </div>
            ) : !readOnly ? (
              <p className="text-xs font-medium text-amber-800">
                {item.tip === TODO_MADDE_TIP.VIDEO ? 'Video' : 'Fotoğraf'} ekleyince tamamlayabilirsiniz
              </p>
            ) : (
              <p className="text-xs text-slate-400">Medya yüklenmemiş</p>
            )}
            {!readOnly ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={accept}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleFile(f)
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : item.tip === TODO_MADDE_TIP.VIDEO ? (
                    <Film size={14} />
                  ) : (
                    <Camera size={14} />
                  )}
                  {item.medyaYol ? 'Değiştir' : 'Yükle'}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {!readOnly && editMode ? (
        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
          aria-label="Maddeyi sil"
        >
          <Trash2 size={16} />
        </button>
      ) : null}
    </li>
  )
}
