import { Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { pageSurfaceStyle } from '../../lib/userUiPreferences'
import { Button, Card, EmptyState, PageHeader, Select, Spinner, StatusBadge, Text } from '../../ui'

/** Standart yönetim listesi sayfası kabuğu */
export function AdminPageShell({ children, className }) {
  return (
    <div className={cn('min-h-full px-4 pb-10 pt-2 sm:px-6', className)} style={pageSurfaceStyle}>
      {children}
    </div>
  )
}

export function AdminScopeChip({ children }) {
  if (!children) return null
  return (
    <span className="inline-flex min-h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-primary-700">
      {children}
    </span>
  )
}

/** Filtre + arama şeridi */
export function AdminFiltersBar({ children, className }) {
  return (
    <Card padding="md" radius="2xl" className={cn('mb-4', className)}>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </Card>
  )
}

export function AdminSearchField({ value, onChange, placeholder = 'Ara…', className }) {
  return (
    <div className={cn('relative min-w-[200px] flex-1', className)}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
      />
    </div>
  )
}

export function AdminFilterSelect({ label, value, onChange, children, className }) {
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      className={cn('!min-w-[160px]', className)}
    >
      {children}
    </Select>
  )
}

/** Liste gövdesi */
export function AdminListPanel({
  loading,
  empty,
  emptyTitle = 'Kayıt bulunamadı',
  emptyDescription,
  children,
  className,
}) {
  if (loading) {
    return (
      <Card padding="lg" radius="2xl" className={cn('flex justify-center py-16', className)}>
        <Spinner />
      </Card>
    )
  }
  if (empty) {
    return (
      <Card padding="lg" radius="2xl" className={className}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Card>
    )
  }
  return (
    <div className={cn('space-y-2', className)}>
      {children}
    </div>
  )
}

/** Tek satır kart */
export function AdminDirectoryRow({ title, subtitle, meta, badges, actions, onClick }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <Text variant="body" className="!font-bold text-slate-900">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" className="mt-0.5 block text-slate-600">
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" className="mt-1 block text-slate-400">
            {meta}
          </Text>
        ) : null}
        {badges ? <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-slate-200 hover:shadow-md"
      >
        {inner}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      {inner}
    </div>
  )
}

export function AdminStatusPill({ active, activeLabel = 'Aktif', passiveLabel = 'Pasif' }) {
  return (
    <StatusBadge tone={active ? 'success' : 'soft'}>
      {active ? activeLabel : passiveLabel}
    </StatusBadge>
  )
}

export { PageHeader, Button, Card, Text, StatusBadge }
