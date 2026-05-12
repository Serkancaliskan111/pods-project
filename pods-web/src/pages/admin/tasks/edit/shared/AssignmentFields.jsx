import { fieldClass, inputClass, labelClass, personName } from './utils.js'

export default function AssignmentFields({
  birimId,
  sorumluId,
  onBirimChange,
  onSorumluChange,
  units,
  staff,
  birimDisabled,
  sorumluDisabled,
  birimHint,
  sorumluHint,
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <label className={fieldClass}>
        <span className={labelClass}>Birim</span>
        <select
          className={inputClass}
          value={birimId || ''}
          disabled={birimDisabled}
          onChange={(ev) => onBirimChange(ev.target.value)}
        >
          <option value="">Seçin</option>
          {(units || []).map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.birim_adi || u.id}
            </option>
          ))}
        </select>
        {birimHint ? (
          <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{birimHint}</span>
        ) : null}
      </label>

      <label className={fieldClass}>
        <span className={labelClass}>Sorumlu personel</span>
        <select
          className={inputClass}
          value={sorumluId || ''}
          disabled={sorumluDisabled}
          onChange={(ev) => onSorumluChange(ev.target.value)}
        >
          <option value="">Seçin</option>
          {(staff || []).map((p) => (
            <option key={p.id} value={String(p.id)}>
              {personName(p)}
            </option>
          ))}
        </select>
        {sorumluHint ? (
          <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{sorumluHint}</span>
        ) : null}
      </label>
    </div>
  )
}
