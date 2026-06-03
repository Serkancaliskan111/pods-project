import { Paperclip } from 'lucide-react'
import { cn } from '../../../../lib/cn'

/** Kompakt referans medya — standart görevde ikincil */
function referenceImageUrls(items) {
  return (items || [])
    .filter((ref) => {
      if (!ref?.signedUrl) return false
      if (ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')) return true
      if (ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')) return false
      return /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|$)/i.test(String(ref.signedUrl))
    })
    .map((ref) => ref.signedUrl)
}

export default function TaskReferenceMediaPanel({ taskReferenceMedia, onPreview }) {
  if (!taskReferenceMedia?.length) return null
  const imageAlbum = referenceImageUrls(taskReferenceMedia)

  return (
    <details className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <Paperclip size={14} className="text-slate-400" />
        Referans medya ({taskReferenceMedia.length})
      </summary>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
        {taskReferenceMedia.map((ref, idx) => {
          const isVideo =
            ref.type === 'video' || String(ref.mimeType || '').startsWith('video/')
          const isImage =
            ref.type === 'image' || String(ref.mimeType || '').startsWith('image/')
          if (isVideo) {
            return (
              <video
                key={`task-ref-${idx}`}
                src={ref.signedUrl}
                controls
                playsInline
                className="max-h-28 max-w-[200px] rounded-lg border border-slate-200"
              />
            )
          }
          if (isImage) {
            return (
              <button
                key={`task-ref-${idx}`}
                type="button"
                onClick={() => onPreview?.(ref.signedUrl, imageAlbum)}
                className="h-20 w-20 overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-2"
              >
                <img src={ref.signedUrl} alt="" className="h-full w-full object-cover" />
              </button>
            )
          }
          return (
            <a
              key={`task-ref-${idx}`}
              href={ref.signedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-primary-700 hover:underline"
            >
              {ref.name || 'Dosya'}
            </a>
          )
        })}
      </div>
    </details>
  )
}
