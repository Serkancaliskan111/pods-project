import { Save, X } from 'lucide-react'

/**
 * Görev düzenleme formlarının alt aksiyon barı.
 */
export default function SaveBar({
  submitting,
  disabled,
  onCancel,
  primaryLabel = 'Kaydet',
  primaryHint,
}) {
  const isBlocked = disabled || submitting
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        background: 'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)',
        position: 'sticky',
        bottom: 14,
        boxShadow: '0 12px 28px -20px rgba(15,23,42,0.4)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.45 }}>
        {primaryHint || 'Değişiklikler kaydedilmeden sayfa kapatılırsa bilgiler kaybolur.'}
      </div>
      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          type="button"
          disabled={submitting}
          onClick={onCancel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            backgroundColor: '#fff',
            color: '#475569',
            fontWeight: 600,
            fontSize: 13,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          <X size={14} strokeWidth={2.4} />
          İptal
        </button>
        <button
          type="submit"
          disabled={isBlocked}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            borderRadius: 10,
            border: 'none',
            background: isBlocked
              ? '#94a3b8'
              : 'linear-gradient(180deg,#4f46e5 0%,#4338ca 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            cursor: isBlocked ? 'not-allowed' : 'pointer',
            boxShadow: isBlocked
              ? 'none'
              : '0 8px 20px -10px rgba(79,70,229,0.65)',
          }}
        >
          <Save size={14} strokeWidth={2.4} />
          {submitting ? 'Kaydediliyor…' : primaryLabel}
        </button>
      </div>
    </div>
  )
}
