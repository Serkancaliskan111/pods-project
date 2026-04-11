const theme = {
  Colors: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    text: '#111827',
    mutedText: '#6B7280',
    bodyText: '#1F2937',
    primary: '#0A1E42',
    accent: '#E95422',
    success: '#10B981',
    error: '#EF4444',
    gray: '#9CA3AF',
    inputBg: '#F9FAFB',
    inputBorder: '#E5E7EB',
    alpha: {
      indigo55: 'rgba(10,30,66,0.55)',
      indigo12: 'rgba(10,30,66,0.12)',
      indigo20: 'rgba(10,30,66,0.20)',
      indigo25: 'rgba(10,30,66,0.25)',
      indigo32: 'rgba(10,30,66,0.32)',
      indigo06: 'rgba(10,30,66,0.06)',
      indigo15: 'rgba(10,30,66,0.15)',
      indigo10: 'rgba(10,30,66,0.10)',
      emerald18: 'rgba(16,185,129,0.18)',
      emerald10: 'rgba(16,185,129,0.10)',
      emerald25: 'rgba(16,185,129,0.25)',
      amber10: 'rgba(245,158,11,0.10)',
      amber25: 'rgba(245,158,11,0.25)',
      rose10: 'rgba(239,68,68,0.10)',
      rose25: 'rgba(239,68,68,0.25)',
      white10: 'rgba(255,255,255,0.10)',
      white75: 'rgba(255,255,255,0.75)',
      black40: 'rgba(0,0,0,0.4)',
      black55: 'rgba(0,0,0,0.55)',
      black60: 'rgba(0,0,0,0.6)',
      black72: 'rgba(0,0,0,0.72)',
      gray08: 'rgba(107,114,128,0.08)',
      gray10: 'rgba(107,114,128,0.10)',
      gray18: 'rgba(107,114,128,0.18)',
      gray20: 'rgba(107,114,128,0.20)',
      gray22: 'rgba(107,114,128,0.22)',
      gray25: 'rgba(107,114,128,0.25)',
      gray35: 'rgba(107,114,128,0.35)',
      gray85: 'rgba(107,114,128,0.85)',
      gray95: 'rgba(107,114,128,0.95)',
      navy05: 'rgba(10,30,66,0.05)',
      navy09: 'rgba(10,30,66,0.9)',
      slate9009: 'rgba(10,30,66,0.9)',
      slate1555: 'rgba(10,30,66,0.55)',
    },
  },
  Typography: {
    fontFamily:
      'Avenir Next, Inter, SF Pro Text, Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
    heading: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: '#111827' },
    subheading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: '#111827' },
    body: { fontSize: 15, fontWeight: '500', color: '#1F2937' },
    bodyLg: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    caption: { fontSize: 12, fontWeight: '500', color: '#6B7280' },
  },
  Spacing: { xs: 8, sm: 16, md: 24, lg: 32, xl: 48 },
  Radii: { sm: 8, md: 12, lg: 24, xl: 30, full: 9999 },
  Layout: {
    borderRadius: { sm: 8, md: 12, lg: 24, xl: 30, full: 9999 },
    shadow: {
      sm: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
      },
    },
  },
  Shadows: {
    card: {
      elevation: 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.01,
      shadowRadius: 2,
    },
  },
  Card: { borderRadius: 16, padding: 12 },
  Button: { height: 44, borderRadius: 12, pressedOpacity: 0.8 },
}

export default theme

try {
  // eslint-disable-next-line no-undef
  module.exports = theme
  // eslint-disable-next-line no-undef
  module.exports.default = theme
} catch {
  // ignore
}
