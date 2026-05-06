/**
 * Çoklu birim seçimi — kapalı halde tek satır “dropdown” tetikleyici (şirket select ile hizalı).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Star } from 'lucide-react'

const accent = 'var(--color-accent, #e95422)'
const accentSoft = 'rgba(233, 84, 34, 0.08)'
const accentBorder = 'rgba(233, 84, 34, 0.22)'
const slateText = '#0f172a'
const mutedText = '#64748b'

export default function StaffBirimMultiSelect({
  units = [],
  selectedIds = [],
  primaryId = null,
  onChange,
  hint,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [hoveredRowId, setHoveredRowId] = useState(null)
  const wrapRef = useRef(null)

  const visuallyHiddenInput = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  }

  const normalizedSelected = useMemo(
    () => selectedIds.map(String).filter(Boolean),
    [selectedIds],
  )

  useEffect(() => {
    if (!open) setHoveredRowId(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const emit = (nextIds, nextPrimary) => {
    const ids = [...nextIds]
    let pri = nextPrimary != null ? String(nextPrimary) : null
    if (pri && !ids.includes(pri)) pri = ids[0] || null
    if (!pri && ids.length) pri = ids[0]
    onChange({ selectedIds: ids, primaryId: pri })
  }

  const toggleUnit = (unitId) => {
    if (disabled) return
    const sid = String(unitId)
    const cur = [...normalizedSelected]
    let next
    let pri = primaryId != null ? String(primaryId) : null
    if (cur.includes(sid)) {
      next = cur.filter((x) => x !== sid)
      if (pri === sid) pri = next[0] || null
      else if (pri && !next.includes(pri)) pri = next[0] || null
    } else {
      next = [...cur, sid]
      if (!pri) pri = sid
    }
    emit(next, pri)
  }

  const setPrimary = (sid) => {
    if (disabled) return
    const s = String(sid)
    if (!normalizedSelected.includes(s)) return
    emit(normalizedSelected, s)
  }

  const summary = useMemo(() => {
    if (!normalizedSelected.length) return 'Birim seçin…'
    const primaryName =
      units.find((u) => String(u.id) === String(primaryId))?.birim_adi ||
      units.find((u) => normalizedSelected.includes(String(u.id)))
        ?.birim_adi ||
      '—'
    if (normalizedSelected.length === 1) {
      return `${primaryName} · Birincil`
    }
    return `${normalizedSelected.length} birim · Birincil: ${primaryName}`
  }, [normalizedSelected, primaryId, units])

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#4b5563',
    marginBottom: 4,
  }

  const hintStyle = {
    fontSize: 11,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 1.45,
  }

  const triggerStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 38,
    boxSizing: 'border-box',
    borderRadius: 9999,
    border: '1px solid #e2e8f0',
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: normalizedSelected.length ? '#111827' : '#94a3b8',
    backgroundColor: disabled ? '#f1f5f9' : '#f9fafb',
    cursor: disabled ? 'not-allowed' : 'pointer',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxShadow: open ? '0 0 0 3px rgba(233,84,34,0.12)' : 'none',
    borderColor: open ? 'rgba(233,84,34,0.45)' : '#e2e8f0',
  }

  const panelStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 'calc(100% + 6px)',
    zIndex: 40,
    background: '#ffffff',
    borderRadius: 12,
    border: '1px solid rgba(15,23,42,0.1)',
    boxShadow:
      '0 4px 6px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.12)',
    overflow: 'hidden',
  }

  const rowSurface = (checked, hovered) => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    margin: '0 8px 4px',
    fontSize: 13,
    fontWeight: checked ? 600 : 500,
    color: slateText,
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: 8,
    border: `1px solid ${
      checked ? accentBorder : hovered ? 'rgba(15,23,42,0.08)' : 'transparent'
    }`,
    backgroundColor: checked
      ? accentSoft
      : hovered
        ? 'rgba(15,23,42,0.035)'
        : 'transparent',
    opacity: disabled ? 0.65 : 1,
    transition:
      'background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease',
    boxShadow: checked ? `inset 3px 0 0 ${accent}` : 'none',
  })

  const checkboxFace = (checked) => ({
    width: 18,
    height: 18,
    borderRadius: 5,
    border: `2px solid ${checked ? accent : '#cbd5e1'}`,
    background: checked ? accent : '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'border-color 0.14s ease, background 0.14s ease',
  })

  return (
    <div
      ref={wrapRef}
      className="staff-birim-multi-select"
      style={{ position: 'relative', width: '100%' }}
    >
      <label style={labelStyle} htmlFor="staff-birim-trigger">
        Birimler
      </label>
      <button
        id="staff-birim-trigger"
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
        style={triggerStyle}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            textAlign: 'left',
          }}
        >
          {summary}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          style={{
            flexShrink: 0,
            color: '#64748b',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform 0.2s ease',
          }}
          aria-hidden
        />
      </button>

      {hint ? <p style={hintStyle}>{hint}</p> : null}

      {open ? (
        <div style={panelStyle}>
          <div
            style={{
              padding: '12px 14px 10px',
              borderBottom: '1px solid rgba(15,23,42,0.06)',
              background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 100%)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: mutedText,
                marginBottom: 2,
              }}
            >
              Birim seçimi
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span>
                {units.length === 0
                  ? 'Liste boş'
                  : `${normalizedSelected.length} / ${units.length} seçili`}
              </span>
            </div>
          </div>

          <div
            role="listbox"
            aria-label="Birimler"
            aria-multiselectable="true"
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              padding: '8px 0 12px',
            }}
          >
            {units.length === 0 ? (
              <div
                style={{
                  padding: '28px 20px',
                  textAlign: 'center',
                  color: mutedText,
                  fontSize: 13,
                }}
              >
                <Building2
                  size={28}
                  strokeWidth={1.5}
                  style={{
                    margin: '0 auto 10px',
                    color: '#cbd5e1',
                  }}
                  aria-hidden
                />
                Bu şirkette birim yok veya önce şirket seçin.
              </div>
            ) : (
              units.map((u) => {
                const sid = String(u.id)
                const checked = normalizedSelected.includes(sid)
                const isPrimary =
                  checked &&
                  primaryId != null &&
                  String(primaryId) === sid
                const hovered = hoveredRowId === sid && !disabled
                return (
                  <label
                    key={u.id}
                    role="option"
                    aria-selected={checked}
                    style={rowSurface(checked, hovered)}
                    onMouseEnter={() => setHoveredRowId(sid)}
                    onMouseLeave={() => setHoveredRowId(null)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleUnit(u.id)}
                      style={visuallyHiddenInput}
                    />
                    <span style={checkboxFace(checked)} aria-hidden>
                      {checked ? (
                        <Check size={11} strokeWidth={3} color="#fff" />
                      ) : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                      {u.birim_adi}
                    </span>
                    {isPrimary ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          color: accent,
                          background: 'rgba(233, 84, 34, 0.1)',
                          padding: '4px 9px',
                          borderRadius: 9999,
                          flexShrink: 0,
                        }}
                      >
                        <Star
                          size={12}
                          fill="currentColor"
                          color="currentColor"
                          strokeWidth={0}
                        />
                        Birincil
                      </span>
                    ) : null}
                  </label>
                )
              })
            )}
          </div>

          {normalizedSelected.length > 1 ? (
            <div
              style={{
                margin: '0 10px 10px',
                padding: '12px 12px 10px',
                borderRadius: 10,
                border: '1px solid rgba(15,23,42,0.07)',
                background: '#f8fafc',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  color: mutedText,
                  marginBottom: 10,
                }}
              >
                Varsayılan (birincil) birim
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {normalizedSelected.map((sid) => {
                  const u = units.find((x) => String(x.id) === sid)
                  const label = u?.birim_adi || sid
                  const picked =
                    primaryId != null && String(primaryId) === String(sid)
                  return (
                    <label
                      key={sid}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: picked ? 600 : 500,
                        cursor: disabled ? 'default' : 'pointer',
                        color: slateText,
                        border: `1px solid ${picked ? accentBorder : 'transparent'}`,
                        background: picked ? '#ffffff' : 'transparent',
                        boxShadow: picked
                          ? '0 1px 2px rgba(15,23,42,0.06)'
                          : 'none',
                        transition: 'border-color 0.14s ease, background 0.14s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="staff_primary_birim_panel"
                        checked={picked}
                        disabled={disabled}
                        onChange={() => setPrimary(sid)}
                        style={visuallyHiddenInput}
                      />
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: `2px solid ${picked ? accent : '#cbd5e1'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        {picked ? (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: accent,
                            }}
                          />
                        ) : null}
                      </span>
                      <span style={{ flex: 1 }}>{label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid rgba(15,23,42,0.06)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: '#fafbfc',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#334155',
                background: '#ffffff',
                border: '1px solid rgba(15,23,42,0.12)',
                cursor: 'pointer',
                padding: '8px 16px',
                borderRadius: 8,
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}
            >
              Tamam
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
