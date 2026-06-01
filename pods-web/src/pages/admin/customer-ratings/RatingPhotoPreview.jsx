import { useState } from 'react'
import { ZoomIn } from 'lucide-react'
import Modal from '../../../ui/Modal'

/** Liste önizlemesi — sabit kutu; tıklanınca tam boy popup */
const THUMB_CLASS = 'h-[132px] w-[200px]'

export default function RatingPhotoPreview({ url, alt = 'Müşteri fotoğrafı' }) {
  const [open, setOpen] = useState(false)

  if (!url) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative mt-3 block shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ring-offset-2 transition hover:border-slate-300 hover:ring-2 hover:ring-primary-300/80 focus:outline-none focus:ring-2 focus:ring-primary-400 ${THUMB_CLASS}`}
        aria-label="Fotoğrafı büyüt"
      >
        <img
          src={url}
          alt={alt}
          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/0 transition group-hover:bg-slate-900/25"
          aria-hidden
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
            <ZoomIn size={18} />
          </span>
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Müşteri fotoğrafı"
        size="xl"
        className="max-w-[min(96vw,56rem)]"
      >
        <div className="flex max-h-[min(82vh,720px)] items-center justify-center overflow-hidden bg-slate-50/80 px-4 py-5">
          <img
            src={url}
            alt={alt}
            className="max-h-[min(78vh,680px)] max-w-full object-contain"
          />
        </div>
      </Modal>
    </>
  )
}
