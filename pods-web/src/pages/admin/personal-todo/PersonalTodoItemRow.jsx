import { useEffect, useRef, useState } from 'react'
import { Camera, Film, Loader2, Trash2, Upload } from 'lucide-react'
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
import { Button } from '../../../ui'

export default function PersonalTodoItemRow({
  item,
  readOnly,
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
      toast.error(`Bu madde için önce ${maddeTipLabel(item.tip).toLowerCase()} yükleyin`)
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
      toast.success('Medya yüklendi')
    } catch (e) {
      toast.error(e?.message || 'Yüklenemedi')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const accept =
    item.tip === TODO_MADDE_TIP.VIDEO ? 'video/*' : 'image/*'

  return (
    <li
      className={`group rounded-xl border px-3 py-3 ${
        item.tamamlandi ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={!!item.tamamlandi}
          disabled={readOnly || uploading}
          onChange={handleToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm leading-relaxed ${
                item.tamamlandi ? 'text-slate-400 line-through' : 'text-slate-800'
              }`}
            >
              {item.metin}
            </span>
            {isMediaMaddeTip(item.tip) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                {item.tip === TODO_MADDE_TIP.VIDEO ? (
                  <Film size={10} />
                ) : (
                  <Camera size={10} />
                )}
                {maddeTipLabel(item.tip)}
              </span>
            ) : null}
          </div>

          {isMediaMaddeTip(item.tip) ? (
            <div className="mt-3 space-y-2">
              {previewUrl ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-black/5">
                  {item.tip === TODO_MADDE_TIP.VIDEO ? (
                    <video
                      src={previewUrl}
                      controls
                      className="max-h-48 w-full bg-black"
                      playsInline
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt=""
                      className="max-h-48 w-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-700">
                  {readOnly ? 'Medya yüklenmemiş.' : 'Tamamlamak için medya yükleyin.'}
                </p>
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={uploading}
                    iconLeft={
                      uploading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )
                    }
                    onClick={() => inputRef.current?.click()}
                  >
                    {item.medyaYol ? 'Medyayı değiştir' : `${maddeTipLabel(item.tip)} yükle`}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
            aria-label="Maddeyi sil"
          >
            <Trash2 size={16} />
          </button>
        ) : null}
      </div>
    </li>
  )
}
