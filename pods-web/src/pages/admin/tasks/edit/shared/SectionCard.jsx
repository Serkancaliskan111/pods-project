/**
 * Görev düzenleme formundaki bölüm kartı.
 *
 * Props:
 *  - title, subtitle, hint
 *  - icon: lucide-react bileşeni
 *  - tone: neutral | info | accent | purple | warn | success | muted
 *  - action: sağda render edilecek opsiyonel düğme/etiket
 *  - dense: küçük padding (read-only kartlar için)
 */
export default function SectionCard({
  title,
  subtitle,
  hint,
  tone = 'neutral',
  icon: Icon,
  children,
  action,
  dense = false,
}) {
  const palettes = {
    neutral: {
      border: '#e2e8f0',
      bg: '#ffffff',
      title: '#0f172a',
      subtitle: '#64748b',
      iconBg: '#eef2ff',
      iconFg: '#4f46e5',
    },
    info: {
      border: '#bfdbfe',
      bg: 'linear-gradient(180deg,#eff6ff 0%,#f8fbff 100%)',
      title: '#1e40af',
      subtitle: '#1d4ed8',
      iconBg: '#dbeafe',
      iconFg: '#1d4ed8',
    },
    accent: {
      border: '#bae6fd',
      bg: 'linear-gradient(180deg,#f0f9ff 0%,#f8fdff 100%)',
      title: '#0369a1',
      subtitle: '#0c4a6e',
      iconBg: '#e0f2fe',
      iconFg: '#0369a1',
    },
    purple: {
      border: '#ddd6fe',
      bg: 'linear-gradient(180deg,#faf5ff 0%,#fdfaff 100%)',
      title: '#6d28d9',
      subtitle: '#5b21b6',
      iconBg: '#ede9fe',
      iconFg: '#7c3aed',
    },
    warn: {
      border: '#fcd34d',
      bg: '#fef9e7',
      title: '#92400e',
      subtitle: '#9a3412',
      iconBg: '#fde68a',
      iconFg: '#b45309',
    },
    success: {
      border: '#bbf7d0',
      bg: '#f0fdf4',
      title: '#15803d',
      subtitle: '#166534',
      iconBg: '#dcfce7',
      iconFg: '#15803d',
    },
    muted: {
      border: '#e2e8f0',
      bg: '#f8fafc',
      title: '#475569',
      subtitle: '#64748b',
      iconBg: '#e2e8f0',
      iconFg: '#475569',
    },
  }
  const p = palettes[tone] || palettes.neutral
  const padding = dense ? '12px 14px' : '16px 18px'
  return (
    <section
      style={{
        padding,
        borderRadius: 16,
        border: `1px solid ${p.border}`,
        background: p.bg,
        boxShadow:
          tone === 'neutral' ? '0 1px 2px rgba(15,23,42,0.04)' : 'none',
      }}
    >
      {title || action ? (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: subtitle || hint || children ? 10 : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {Icon ? (
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: p.iconBg,
                  color: p.iconFg,
                  flex: '0 0 28px',
                }}
              >
                <Icon size={15} strokeWidth={2.2} />
              </span>
            ) : null}
            {title ? (
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: p.title,
                  letterSpacing: '-0.005em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </div>
            ) : null}
          </div>
          {action || null}
        </header>
      ) : null}
      {subtitle ? (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 12.5,
            color: p.subtitle,
            lineHeight: 1.55,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      {hint ? (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 11.5,
            color: p.subtitle,
            opacity: 0.85,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </p>
      ) : null}
    </section>
  )
}
