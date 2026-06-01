import { cn } from '../lib/cn'

export function Table({ className, children, ...rest }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm">
      <table className={cn('table-root w-full', className)} {...rest}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }) {
  return <thead className="bg-slate-50/80">{children}</thead>
}

export function TableBody({ children }) {
  return <tbody>{children}</tbody>
}

export function TableRow({ className, children, onClick, ...rest }) {
  return (
    <tr
      className={cn(onClick && 'cursor-pointer', className)}
      onClick={onClick}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function Th({ className, children, ...rest }) {
  return (
    <th className={cn('px-4 py-3', className)} {...rest}>
      {children}
    </th>
  )
}

export function Td({ className, children, ...rest }) {
  return (
    <td className={cn('px-4 py-3 text-sm text-slate-700', className)} {...rest}>
      {children}
    </td>
  )
}
