import { forwardRef } from 'react'
import { cn } from '../lib/cn'

export const inputClassName =
  'w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-200 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed font-medium'

const Input = forwardRef(function Input({ className, label, error, ...props }, ref) {
  const field = (
    <input ref={ref} className={cn(inputClassName, error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/15', className)} {...props} />
  )
  if (!label) return field
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</span>
      {field}
      {error ? <span className="text-xs text-danger-600">{error}</span> : null}
    </label>
  )
})

export default Input

export const Textarea = forwardRef(function Textarea({ className, label, error, rows = 3, ...props }, ref) {
  const field = (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputClassName, 'resize-y min-h-[88px]', error && 'border-danger-500', className)}
      {...props}
    />
  )
  if (!label) return field
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</span>
      {field}
      {error ? <span className="text-xs text-danger-600">{error}</span> : null}
    </label>
  )
})

export const Select = forwardRef(function Select({ className, label, error, children, ...props }, ref) {
  const field = (
    <select ref={ref} className={cn(inputClassName, className)} {...props}>
      {children}
    </select>
  )
  if (!label) return field
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{label}</span>
      {field}
      {error ? <span className="text-xs text-danger-600">{error}</span> : null}
    </label>
  )
})

export const labelClassName = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500'
export const fieldClassName = 'flex flex-col gap-1.5'
