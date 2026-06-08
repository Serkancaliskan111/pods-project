import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { buildUiTheme } from '../lib/buildUiTheme'
import { parseUiPreferences, readCachedUiPreferences, uiPreferencesEqual } from '../lib/userUiPreferences'

const UiThemeContext = createContext(null)

export function UiThemeProvider({ children }) {
  const { user, profile } = useAuth()
  const [bootPrefs, setBootPrefs] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!user?.id) {
      setBootPrefs(null)
      return undefined
    }
    void readCachedUiPreferences(user.id).then((cached) => {
      if (!cancelled) setBootPrefs(cached)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const theme = useMemo(
    () => buildUiTheme(bootPrefs ?? profile?.arayuz_tercihleri),
    [bootPrefs, profile?.arayuz_tercihleri],
  )

  const refreshTheme = useCallback(async (nextPrefs) => {
    if (nextPrefs) {
      const parsed = parseUiPreferences(nextPrefs)
      setBootPrefs((prev) => (uiPreferencesEqual(prev, parsed) ? prev : parsed))
      return
    }
    if (!user?.id) return
    const cached = await readCachedUiPreferences(user.id)
    setBootPrefs((prev) => (uiPreferencesEqual(prev, cached) ? prev : cached))
  }, [user?.id])

  const value = useMemo(() => ({ theme, refreshTheme }), [theme, refreshTheme])

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>
}

export function useUiTheme() {
  const ctx = useContext(UiThemeContext)
  if (!ctx) throw new Error('useUiTheme UiThemeProvider içinde kullanılmalı')
  return ctx
}

export function useUiThemeOptional() {
  return useContext(UiThemeContext)
}
