import { fieldClass, inputClass, labelClass } from './utils.js'

export default function ScoringField({ puan, onChange, disabled, label = 'Puan' }) {
  return (
    <label className={fieldClass}>
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        className={inputClass}
        value={puan == null ? '' : puan}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder="0"
      />
    </label>
  )
}
