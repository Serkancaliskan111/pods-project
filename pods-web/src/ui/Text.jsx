import { cn } from '../lib/cn'
import { typographyClasses } from './tokens'

export default function Text({
  variant = 'body',
  as: Tag = 'span',
  className,
  color,
  align,
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(typographyClasses[variant] || typographyClasses.body, align && `text-${align}`, className)}
      style={color ? { color } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
