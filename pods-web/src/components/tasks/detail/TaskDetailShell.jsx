import { cn } from '../../../lib/cn'
import { Spinner } from '../../../ui'
import { cubicle } from '../../../theme/cubicle.js'

export default function TaskDetailShell({ loading, notFound, children }) {
  return (
    <div
      className={cn('-mx-4 -mt-1 min-h-0 w-[calc(100%+2rem)] sm:-mx-6 sm:w-[calc(100%+3rem)]')}
      style={{ backgroundColor: cubicle.pageBg }}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Spinner />
          <p className="text-sm font-medium text-slate-500">Görev yükleniyor…</p>
        </div>
      ) : notFound ? (
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <p className="text-lg font-extrabold text-primary-900">Görev bulunamadı</p>
          <p className="mt-2 text-sm text-slate-500">
            Kayıt silinmiş veya bu görevi görüntüleme yetkiniz olmayabilir.
          </p>
        </div>
      ) : (
        <div className="pb-8">{children}</div>
      )}
    </div>
  )
}
