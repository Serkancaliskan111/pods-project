import { formatTaskTitleCase } from '../../../../../lib/formatTaskTitle.js'
import { fieldClass, inputClass, labelClass } from './utils.js'

export default function MetaFields({
  baslik,
  aciklama,
  onBaslikChange,
  onAciklamaChange,
  disabled,
}) {
  return (
    <>
      <label className={fieldClass}>
        <span className={labelClass}>Başlık</span>
        <input
          className={inputClass}
          value={baslik || ''}
          disabled={disabled}
          onChange={(ev) => onBaslikChange(formatTaskTitleCase(ev.target.value))}
          placeholder="Görev başlığı"
        />
      </label>
      <label className={fieldClass}>
        <span className={labelClass}>Açıklama</span>
        <textarea
          className={inputClass}
          rows={4}
          value={aciklama || ''}
          disabled={disabled}
          onChange={(ev) => onAciklamaChange(ev.target.value)}
          placeholder="İsteğe bağlı görev açıklaması"
        />
      </label>
    </>
  )
}
