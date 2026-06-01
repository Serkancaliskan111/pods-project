import Text from './Text'

const LEVEL_MAP = {
  displayLg: 'h1',
  displayMd: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
}

export default function Heading({ variant = 'h1', as, className, children, ...rest }) {
  const tag = as || LEVEL_MAP[variant] || 'h2'
  return (
    <Text as={tag} variant={variant} className={className} {...rest}>
      {children}
    </Text>
  )
}
