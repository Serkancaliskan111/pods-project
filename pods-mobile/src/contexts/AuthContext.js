import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import getSupabase from '../lib/supabaseClient'
import { Alert, Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Tablo/sütun isimleri supabase migrations ve pods-web AuthContext ile aynı:
 * - kullanicilar (id = auth.user.id, silindi_at)
 * - personeller (kullanici_id = auth user id, silindi_at)
 */
function safeCopy(data) {
  if (data == null) return data
  if (typeof data !== 'object') return data
  try {
    return JSON.parse(JSON.stringify(data))
  } catch {
    return Array.isArray(data) ? [...data] : { ...data }
  }
}

const AuthContext = createContext(null)
const DEVICE_ID_KEY = 'pods_mobile_device_id_v1'
// Temporarily disable: allow multiple devices to login same account.
// Set to true when you want to re-enable single-device enforcement.
const SINGLE_DEVICE_ENFORCEMENT_ENABLED = false

async function getOrCreateDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const generated = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    await AsyncStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch {
    return `dev_fallback_${Date.now()}`
  }
}

async function getExpoPushTokenSafe() {
  if (!Device.isDevice) return null
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const permission = await Notifications.requestPermissionsAsync()
      finalStatus = permission.status
    }
    if (finalStatus !== 'granted') return null

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      undefined

    const response = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return response?.data || null
  } catch {
    return null
  }
}

function normalizePermissions(raw) {
  if (raw == null) return {}
  let obj = raw
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return {}
    }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) return {}

  const flat = { ...obj }
  const isFlatPermissionLeafMap = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const keys = Object.keys(v)
    if (!keys.length) return false
    return Object.values(v).every(
      (x) =>
        x === null ||
        typeof x === 'boolean' ||
        typeof x === 'string' ||
        typeof x === 'number',
    )
  }

  // İç içe: { OPERASYON: { ... } } veya { YONETIM: { "personel.yonet": true } }
  for (const [k, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    const legacyAsciiCategory = /^[A-Z][A-Z0-9_]*$/.test(k)
    const nestedKeys = Object.keys(v)
    const hasDotted = nestedKeys.some((nk) => nk.includes('.'))
    const mergeNested =
      legacyAsciiCategory ||
      (isFlatPermissionLeafMap(v) &&
        (hasDotted || nestedKeys.includes('personel_yonet') || nestedKeys.includes('personel.yonet')))
    if (mergeNested) {
      Object.assign(flat, v)
    }
  }

  return flat
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [personel, setPersonel] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const activeSessionRef = useRef({ personelId: null, sessionId: null, sessionCol: null, deviceCol: null, timeCol: null })

  const syncPushTokenToPersonel = useCallback(async (personelId, userId) => {
    if (!personelId || !userId) return
    const token = await getExpoPushTokenSafe()
    if (!token) return
    try {
      const supabase = getSupabase()
      // Kolon adı farklı ortamlarda değişebildiği için fallback ile deniyoruz.
      const candidateCols = ['expo_push_token', 'push_token', 'bildirim_tokeni']
      for (const col of candidateCols) {
        try {
          const { error } = await supabase
            .from('personeller')
            .update({ [col]: token })
            .eq('id', personelId)
            .eq('kullanici_id', userId)
          if (!error) return
        } catch {
          // try next candidate
        }
      }
    } catch {
      // best-effort
    }
  }, [])

  const enforceSingleDeviceSession = useCallback(async (personelRow, userId) => {
    if (!SINGLE_DEVICE_ENFORCEMENT_ENABLED) return { ok: true }
    if (!personelRow?.id || !userId) return { ok: true }
    const supabase = getSupabase()
    const deviceId = await getOrCreateDeviceId()
    const sessionId = `${userId}:${deviceId}`

    const selectCandidates = [
      { sessionCol: 'aktif_oturum_id', deviceCol: 'aktif_cihaz_id', timeCol: 'aktif_oturum_guncellendi_at' },
      { sessionCol: 'active_session_id', deviceCol: 'active_device_id', timeCol: 'active_session_updated_at' },
    ]

    let selected = null
    let currentSessionValue = null
    for (const cand of selectCandidates) {
      try {
        const { data, error } = await supabase
          .from('personeller')
          .select(`id, ${cand.sessionCol}, ${cand.deviceCol}`)
          .eq('id', personelRow.id)
          .maybeSingle()
        if (!error && data) {
          selected = cand
          currentSessionValue = data?.[cand.sessionCol] || null
          break
        }
      } catch {
        // try next candidate
      }
    }

    // Kolonlar yoksa enforcement yapılamaz; migration sonrası otomatik devreye girer.
    if (!selected) return { ok: true }

    if (currentSessionValue && String(currentSessionValue) !== String(sessionId)) {
      return { ok: false, blocked: true, reason: 'active_elsewhere' }
    }

    const updatePayload = {
      [selected.sessionCol]: sessionId,
      [selected.deviceCol]: deviceId,
    }
    if (selected.timeCol) updatePayload[selected.timeCol] = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('personeller')
      .update(updatePayload)
      .eq('id', personelRow.id)
      .eq('kullanici_id', userId)

    if (updateErr) return { ok: false, blocked: false, reason: updateErr.message }

    activeSessionRef.current = {
      personelId: personelRow.id,
      sessionId,
      sessionCol: selected.sessionCol,
      deviceCol: selected.deviceCol,
      timeCol: selected.timeCol,
    }
    return { ok: true }
  }, [])

  const clearSingleDeviceSession = useCallback(async (userId) => {
    const supabase = getSupabase()
    const state = activeSessionRef.current
    if (!state?.personelId || !state?.sessionCol) return
    try {
      const payload = {
        [state.sessionCol]: null,
        [state.deviceCol]: null,
      }
      if (state.timeCol) payload[state.timeCol] = null
      await supabase
        .from('personeller')
        .update(payload)
        .eq('id', state.personelId)
        .eq('kullanici_id', userId || '')
        .eq(state.sessionCol, state.sessionId)
    } catch {
      // best effort
    } finally {
      activeSessionRef.current = { personelId: null, sessionId: null, sessionCol: null, deviceCol: null, timeCol: null }
    }
  }, [])

  const loadProfileAndPersonel = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setPersonel(null)
      setPermissions({})
      return
    }
    try {
      const supabase = getSupabase()

      // 1) public.kullanicilar: id = auth.uid(), silindi_at IS NULL
      const { data: kullaniciData, error: errKullanici } = await supabase
        .from('kullanicilar')
        .select('id, ad_soyad, email')
        .eq('id', userId)
        .is('silindi_at', null)
        .maybeSingle()

      if (__DEV__ && errKullanici) console.warn('[PODS] kullanicilar error:', errKullanici.message, errKullanici.code)

      // 2) Opsiyonel: profiles tablosu varsa ad/full_name için kullan (ismin görünmesi için)
      let mergedProfile = kullaniciData ? safeCopy(kullaniciData) : null
      try {
        const { data: profilesData, error: errProfiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
        if (!errProfiles && profilesData) {
          mergedProfile = mergedProfile ? { ...mergedProfile, ...safeCopy(profilesData) } : safeCopy(profilesData)
        }
      } catch (_) {
        // profiles tablosu yoksa veya hata varsa sadece kullanicilar verisi kullanılır
      }
      setProfile(mergedProfile)

      // 2) public.personeller (migration 002: kullanici_id index): kullanici_id = auth.uid(), silindi_at IS NULL
      const { data: personelData, error: errPersonel } = await supabase
        .from('personeller')
        .select('id, ad, soyad, email, birim_id, rol_id, ana_sirket_id, roller(rol_adi, yetkiler)')
        .eq('kullanici_id', userId)
        .is('silindi_at', null)
        .maybeSingle()

      if (__DEV__ && errPersonel) console.warn('[PODS] personeller error:', errPersonel.message, errPersonel.code)
      if (personelData) {
        const roleRow = Array.isArray(personelData.roller) ? personelData.roller[0] : personelData.roller
        const nextPermissions = normalizePermissions(roleRow?.yetkiler)
        const safePersonel = safeCopy({
          ...personelData,
          roleName: roleRow?.rol_adi || null,
          permissions: nextPermissions,
        })
        setPersonel(safePersonel)
        setPermissions(nextPermissions)
        if (SINGLE_DEVICE_ENFORCEMENT_ENABLED) {
          const sessionCheck = await enforceSingleDeviceSession(personelData, userId)
          if (!sessionCheck?.ok && sessionCheck?.blocked) {
            await supabase.auth.signOut().catch(() => {})
            setUser(null)
            setProfile(null)
            setPersonel(null)
            setPermissions({})
            Alert.alert(
              'Oturum sınırı',
              'Bu hesap başka bir cihazda aktif. Güvenlik nedeniyle aynı anda tek cihazdan giriş yapılabilir.',
            )
            return
          }
        }
        // Otomatik token sync: girişte ve auth state değişiminde tetiklenir.
        syncPushTokenToPersonel(personelData.id, userId)
      } else {
        setPersonel(null)
        setPermissions({})
      }
    } catch {
      setProfile(null)
      setPersonel(null)
      setPermissions({})
    }
  }, [syncPushTokenToPersonel, enforceSingleDeviceSession])

  useEffect(() => {
    let mounted = true
    const supabase = getSupabase()

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) {
        // Refresh token storage bozulduysa veya bulunamazsa signOut ile temizle.
        // Bu sayede aynı hatanın sürekli loglanmasını önleriz.
        supabase.auth
          .signOut()
          .catch(() => {})
          .finally(() => {
            setUser(null)
            setProfile(null)
            setPersonel(null)
            setPermissions({})
            setLoading(false)
          })
        return
      }
      const rawUser = session?.user ?? null
      const userId = rawUser?.id ?? null
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) loadProfileAndPersonel(userId)
      else {
        setProfile(null)
        setPersonel(null)
        setPermissions({})
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const rawUser = session?.user ?? null
      const userId = rawUser?.id ?? null
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) loadProfileAndPersonel(userId)
      else {
        setProfile(null)
        setPersonel(null)
        setPermissions({})
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe?.()
    }
  }, [loadProfileAndPersonel])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    await clearSingleDeviceSession(user?.id || '')
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setPersonel(null)
    setPermissions({})
  }, [clearSingleDeviceSession, user?.id])

  // Expose deep-cloned objects so consumers never receive frozen/non-configurable refs
  const value = useMemo(
    () => ({
      user: safeCopy(user),
      profile: safeCopy(profile),
      personel: safeCopy(personel),
      permissions: safeCopy(permissions),
      loading,
      signOut,
    }),
    [user, profile, personel, permissions, loading, signOut]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { safeCopy }
