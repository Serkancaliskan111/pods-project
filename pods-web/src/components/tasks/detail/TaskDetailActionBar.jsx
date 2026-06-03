import { Button } from '../../../ui'
import { cn } from '../../../lib/cn'
import { cubicle } from '../../../theme/cubicle.js'

export default function TaskDetailActionBar({ children, className }) {
  if (!children) return null
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
}

export function TaskDetailActionButton({
  variant = 'primary',
  children,
  disabled,
  onClick,
  title,
}) {
  const map = {
    primary: 'primary',
    danger: 'danger',
    success: 'success',
    outline: 'secondary',
  }
  const v = map[variant] || 'primary'
  const isSuccess = variant === 'success'
  const isDanger = variant === 'danger'
  const isOutline = variant === 'outline'

  return (
    <Button
      variant={v}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        '!h-10 !rounded-lg !px-4 !text-sm !font-bold',
        isSuccess && '!border-0 !text-white hover:brightness-[1.03]',
        isDanger && '!bg-white !border-red-200 !text-red-700 hover:!bg-red-50',
        isOutline && '!bg-white !border-slate-200 !text-slate-700',
      )}
      style={isSuccess ? { backgroundColor: cubicle.greenCta } : undefined}
    >
      {children}
    </Button>
  )
}
