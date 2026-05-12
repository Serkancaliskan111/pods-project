import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Variant agnostik düzenleme form state yardımcısı.
 *
 * Çağıran tarafa şunu sağlar:
 *  - `form`: mevcut state
 *  - `setForm`: tam ve kısmi güncellemeler için setter (object → merge)
 *  - `patch(field, value)`: tek alan güncelle
 *  - `baseline`: ilk yükleme anındaki referans
 *  - `dirty`: en az bir alan baseline'dan farklı mı?
 *  - `diff`: baseline'a göre değişen alanlar (RPC patch payload için)
 *  - `resetTo(newBaseline)`: yeni baseline ile reset (ör. yeniden yükleme sonrası)
 */
export function useTaskEditFormState(initial) {
  const [form, setFormRaw] = useState(initial || {})
  const baselineRef = useRef(initial || {})
  const [, force] = useState(0)

  useEffect(() => {
    baselineRef.current = initial || {}
    setFormRaw(initial || {})
  }, [initial])

  const setForm = useCallback((updater) => {
    setFormRaw((prev) => {
      const next =
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      return next
    })
  }, [])

  const patch = useCallback((field, value) => {
    setFormRaw((prev) => ({ ...prev, [field]: value }))
  }, [])

  const resetTo = useCallback((newBaseline) => {
    baselineRef.current = newBaseline || {}
    setFormRaw(newBaseline || {})
    force((n) => n + 1)
  }, [])

  const diff = useMemo(() => {
    const out = {}
    const base = baselineRef.current || {}
    Object.keys(form || {}).forEach((k) => {
      const a = form[k]
      const b = base[k]
      if (a === b) return
      if (a == null && b == null) return
      if (typeof a === 'object' || typeof b === 'object') {
        try {
          if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a
        } catch {
          out[k] = a
        }
        return
      }
      out[k] = a
    })
    return out
  }, [form])

  const dirty = Object.keys(diff).length > 0

  return { form, setForm, patch, baseline: baselineRef.current, dirty, diff, resetTo }
}
