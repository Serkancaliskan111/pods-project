import { cn } from '../../../lib/cn'

export default function TaskDetailBody({ sidebar, children, layout, className }) {
  const isApproveOnly = layout === 'chain-approve'

  return (
    <div className={cn('mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-5', className)}>
      <div
        className={cn(
          'grid w-full gap-4 lg:gap-5',
          isApproveOnly
            ? 'grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]'
            : 'grid-cols-1 lg:grid-cols-[minmax(240px,272px)_minmax(0,1fr)]',
        )}
      >
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          {sidebar}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
