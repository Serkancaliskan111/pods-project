import { Camera, FileText, Film, ZoomIn } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { coercePhotoUrl } from '../../../pages/admin/tasks/taskShow/taskShowUtils.js'

const SQUARE_CELL =
  'relative block overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/90 transition hover:ring-2 hover:ring-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'

const SCROLL_AREA =
  'max-h-[min(520px,58vh)] w-full overflow-y-auto overscroll-contain scroll-smooth pr-1 [scrollbar-gutter:stable]'

export default function TaskDetailEvidence({
  photoUrls = [],
  videos = [],
  documents = [],
  onPhotoClick,
  className,
  accent = '#2563EB',
}) {
  const urls = (photoUrls || []).map(coercePhotoUrl).filter(Boolean)
  const photoCount = urls.length
  const videoCount = videos.length
  const docCount = (documents || []).length
  const total = photoCount + videoCount
  const empty = total === 0 && docCount === 0
  const useScroll = total >= 3

  const gridClass =
    'grid w-full grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'

  function renderPhoto(url, idx) {
    const src = coercePhotoUrl(url)
    if (!src) return null
    return (
      <button
        key={`ev-photo-${idx}-${src.slice(-24)}`}
        type="button"
        onClick={() => onPhotoClick?.(src, idx)}
        className={cn(SQUARE_CELL, 'group aspect-square w-full')}
      >
        <img src={src} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <ZoomIn size={20} strokeWidth={2.25} />
        </span>
      </button>
    )
  }

  function renderVideo(v, idx) {
    return (
      <div key={`ev-vid-${idx}`} className={cn(SQUARE_CELL, 'bg-slate-950 ring-slate-300')}>
        <video
          src={v.url}
          controls
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
          <Film size={10} />
          Video
        </span>
      </div>
    )
  }

  const mediaGrid = (
    <div className={gridClass}>
      {urls.map((url, idx) => renderPhoto(url, idx))}
      {videos.map((v, idx) => renderVideo(v, idx))}
    </div>
  )

  return (
    <section
      data-help="task-detail-evidence"
      className={cn(
        'w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Camera size={17} className="shrink-0 text-slate-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-primary-900">Tamamlama kanıtları</h2>
            {!empty ? (
              <p className="text-[11px] text-slate-500">
                {photoCount} fotoğraf
                {videoCount ? ` · ${videoCount} video` : ''}
                {docCount ? ` · ${docCount} belge` : ''}
                {useScroll ? ' · kaydırarak görüntüleyin' : ''}
                {photoCount > 1 ? ' · büyütünce ok ile gezin' : ''}
              </p>
            ) : null}
          </div>
        </div>
        {!empty ? (
          <span
            className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {total}
          </span>
        ) : docCount ? (
          <span
            className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {docCount}
          </span>
        ) : null}
      </div>

      {empty ? (
        <div className="px-4 py-12 text-left">
          <p className="text-sm font-medium text-slate-500">Henüz kanıt yüklenmedi</p>
        </div>
      ) : (
        <div className="flex w-full flex-col items-start gap-4 p-4">
          {total > 0 ? (
            <>
          {total === 1 && photoCount === 1 ? (
            <button
              type="button"
              onClick={() => onPhotoClick?.(urls[0], 0)}
              className={cn(SQUARE_CELL, 'group aspect-square w-52 shrink-0 sm:w-56')}
            >
              <img src={urls[0]} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn size={20} />
              </span>
            </button>
          ) : total === 1 && videoCount === 1 ? (
            <div className={cn(SQUARE_CELL, 'w-52 shrink-0 bg-slate-950 sm:w-56')}>
              <video
                src={videos[0].url}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ) : total === 2 ? (
            <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:w-auto">
              {urls.map((url, idx) => renderPhoto(url, idx))}
              {videos.map((v, idx) => renderVideo(v, idx))}
            </div>
          ) : (
            <div
              className={cn(
                SCROLL_AREA,
                'w-full rounded-lg border border-slate-100/80 bg-slate-50/50 p-3',
              )}
            >
              {mediaGrid}
            </div>
          )}
            </>
          ) : null}
          {docCount ? (
            <div className="w-full space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Belgeler</p>
              <ul className="space-y-2">
                {documents.map((doc, idx) => (
                  <li key={`ev-doc-${idx}-${doc.url}`}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-primary-700 transition hover:bg-slate-100"
                    >
                      <FileText size={16} className="shrink-0 text-slate-500" />
                      <span className="min-w-0 truncate">{doc.name || 'Belge'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
