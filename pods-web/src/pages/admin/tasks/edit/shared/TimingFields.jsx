import { AlertCircle, Zap } from 'lucide-react'
import { fieldClass, inputClass, labelClass } from './utils.js'

export default function TimingFields({
  baslama,
  son,
  acil,
  onBaslamaChange,
  onSonChange,
  onAcilChange,
  disabled,
  showAcil = true,
  acilLabel = 'Acil görev',
  rangeError,
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className={fieldClass}>
          <span className={labelClass}>Başlangıç</span>
          <input
            type="datetime-local"
            className={inputClass}
            value={baslama || ''}
            disabled={disabled}
            onChange={(ev) => onBaslamaChange(ev.target.value)}
          />
        </label>
        <label className={fieldClass}>
          <span className={labelClass}>Bitiş</span>
          <input
            type="datetime-local"
            className={inputClass}
            value={son || ''}
            disabled={disabled}
            onChange={(ev) => onSonChange(ev.target.value)}
          />
        </label>
      </div>
      {rangeError ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 9999,
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            fontSize: 11.5,
            border: '1px solid #fecaca',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          <AlertCircle size={12} strokeWidth={2.4} />
          {rangeError}
        </div>
      ) : null}
      {showAcil ? (
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: acil ? '#b91c1c' : '#0f172a',
            cursor: disabled ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <input
            type="checkbox"
            checked={!!acil}
            disabled={disabled}
            onChange={(ev) => onAcilChange(ev.target.checked)}
          />
          <Zap
            size={14}
            strokeWidth={2.4}
            style={{ color: acil ? '#dc2626' : '#94a3b8' }}
          />
          {acilLabel}
        </label>
      ) : null}
    </>
  )
}
