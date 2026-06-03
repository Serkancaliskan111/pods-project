import { AlignLeft, Camera, FileText, Video } from 'lucide-react'
import { inputClass, labelClass, fieldClass } from './utils.js'
import { TASK_DOCUMENT_MAX_COUNT } from '../../../../../lib/taskDocumentTypes.js'

/**
 * Kanıt zorunlulukları için segmented pill tasarımı.
 * - Foto / Video / Açıklama: 3 ayrı toggle kart
 * - Foto ↔ video birbirini dışlar (mutex)
 */
export default function EvidenceFields({ value, onChange, disabled, fotoMax = 99 }) {
  const v = value || {}

  const patch = (next) => {
    let merged = { ...v, ...next }
    if (next.foto_zorunlu === true) {
      merged.video_zorunlu = false
      merged.min_video_sayisi = 0
    }
    if (next.video_zorunlu === true) {
      merged.foto_zorunlu = false
      merged.min_foto_sayisi = 0
      if (!merged.min_video_sayisi || merged.min_video_sayisi < 1) {
        merged.min_video_sayisi = 1
      }
    }
    if (next.video_zorunlu === false) merged.min_video_sayisi = 0
    if (next.foto_zorunlu === false) merged.min_foto_sayisi = 0
    onChange(merged)
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}
    >
      <Tile
        icon={<Camera size={16} strokeWidth={2.2} />}
        title="Fotoğraf"
        on={!!v.foto_zorunlu}
        accent="#4f46e5"
        disabled={disabled}
        onToggle={(on) => patch({ foto_zorunlu: on })}
      >
        {v.foto_zorunlu ? (
          <label className={fieldClass}>
            <span className={labelClass}>Min. fotoğraf</span>
            <Stepper
              min={0}
              max={fotoMax}
              value={Number(v.min_foto_sayisi || 0)}
              disabled={disabled}
              onChange={(n) => patch({ min_foto_sayisi: n })}
            />
          </label>
        ) : null}
      </Tile>

      <Tile
        icon={<Video size={16} strokeWidth={2.2} />}
        title="Video"
        on={!!v.video_zorunlu}
        accent="#0ea5e9"
        disabled={disabled}
        onToggle={(on) => patch({ video_zorunlu: on })}
      >
        {v.video_zorunlu ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={fieldClass}>
              <span className={labelClass}>Min. video</span>
              <Stepper
                min={0}
                max={3}
                value={Number(v.min_video_sayisi || 0)}
                disabled={disabled}
                onChange={(n) => patch({ min_video_sayisi: n })}
              />
            </label>
            <label className={fieldClass}>
              <span className={labelClass}>Üst süre (sn)</span>
              <input
                type="number"
                min={5}
                max={60}
                className={inputClass}
                value={v.max_video_suresi_sn ?? 60}
                disabled={disabled}
                onChange={(ev) =>
                  patch({
                    max_video_suresi_sn: Math.min(
                      60,
                      Math.max(5, Number(ev.target.value) || 60),
                    ),
                  })
                }
              />
            </label>
          </div>
        ) : null}
      </Tile>

      <Tile
        icon={<FileText size={16} strokeWidth={2.2} />}
        title="Belge"
        on={!!v.belge_zorunlu}
        accent="#d97706"
        disabled={disabled}
        onToggle={(on) =>
          patch({
            belge_zorunlu: on,
            min_belge_sayisi: on ? Math.max(1, Number(v.min_belge_sayisi) || 1) : 0,
          })
        }
      >
        {v.belge_zorunlu ? (
          <label className={fieldClass}>
            <span className={labelClass}>Min. belge (1–{TASK_DOCUMENT_MAX_COUNT})</span>
            <Stepper
              min={1}
              max={TASK_DOCUMENT_MAX_COUNT}
              value={Number(v.min_belge_sayisi || 1)}
              disabled={disabled}
              onChange={(n) => patch({ min_belge_sayisi: n })}
            />
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.45 }}>
              PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
            </p>
          </label>
        ) : null}
      </Tile>

      <Tile
        icon={<AlignLeft size={16} strokeWidth={2.2} />}
        title="Açıklama"
        on={!!v.aciklama_zorunlu}
        accent="#16a34a"
        disabled={disabled}
        onToggle={(on) => patch({ aciklama_zorunlu: on })}
      >
        {v.aciklama_zorunlu ? (
          <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.45 }}>
            Personel görevi tamamlarken bir açıklama yazmak zorundadır.
          </p>
        ) : null}
      </Tile>
    </div>
  )
}

function Tile({ icon, title, on, accent, disabled, onToggle, children }) {
  const borderColor = on ? accent : '#e2e8f0'
  const bg = on ? `${accent}0F` : '#ffffff'
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        border: `1.5px solid ${borderColor}`,
        backgroundColor: bg,
        padding: 12,
        transition: 'all 0.18s ease',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(!on)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? accent : '#f1f5f9',
              color: on ? '#fff' : '#475569',
              transition: 'all 0.18s',
            }}
          >
            {icon}
          </span>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: on ? accent : '#0f172a',
              letterSpacing: '-0.005em',
            }}
          >
            {title}
          </span>
        </span>
        <ToggleDot on={on} accent={accent} />
      </button>
      {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  )
}

function ToggleDot({ on, accent }) {
  return (
    <span
      aria-hidden
      style={{
        width: 30,
        height: 18,
        borderRadius: 9999,
        backgroundColor: on ? accent : '#cbd5e1',
        position: 'relative',
        flexShrink: 0,
        transition: 'background-color 0.18s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 14 : 2,
          width: 14,
          height: 14,
          borderRadius: 9999,
          backgroundColor: '#fff',
          boxShadow: '0 1px 2px rgba(15,23,42,0.18)',
          transition: 'left 0.18s ease',
        }}
      />
    </span>
  )
}

function Stepper({ value, min, max, disabled, onChange }) {
  const dec = () => onChange(Math.max(min, (Number(value) || 0) - 1))
  const inc = () => onChange(Math.min(max, (Number(value) || 0) + 1))
  const btn = (active) => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: disabled || !active ? '#94a3b8' : '#0f172a',
    fontWeight: 700,
    fontSize: 14,
    cursor: disabled || !active ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  })
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <button type="button" disabled={disabled || value <= min} onClick={dec} style={btn(value > min)}>
        −
      </button>
      <input
        type="number"
        className={inputClass}
        style={{ width: 64, textAlign: 'center', padding: '6px 8px' }}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(ev) =>
          onChange(Math.max(min, Math.min(max, Number(ev.target.value) || 0)))
        }
      />
      <button type="button" disabled={disabled || value >= max} onClick={inc} style={btn(value < max)}>
        +
      </button>
    </div>
  )
}
