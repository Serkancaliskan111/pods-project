import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import getSupabase from '../lib/supabaseClient'
import { Alert, AppState, Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getClientPublicIp, isIpAllowed } from '../lib/ipAccess'

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
const PRESENCE_HEARTBEAT_MS = 20 * 1000
const APPSTATE_HEARTBEAT_MIN_GAP_MS = 2 * 1000
// 0: alta alınır alınmaz sunucuya offline yazılmaya çalışılır (web’de gecikmeyi azaltır).
// Kısa bildirim paneli gibi durumlarda anlık offline görünebilir; gerekirse 200–400 yapılabilir.
const BACKGROUND_OFFLINE_GRACE_MS = 0

function isMissingColumnError(error) {
  return (
    error?.code === '42703' ||
    String(error?.message || '').includes('mobil_online') ||
    String(error?.message || '').includes('mobil_last_seen_at') ||
    String(error?.message || '').includes('mobil_last_offline_at')
  )
}

function isMissingPresenceLogTableError(error) {
  return (
    error?.code === '42P01' ||
    String(error?.message || '').includes('personel_online_kayitlari')
  )
}

/** RN fetch / arka plan / kesinti: konsolu kirletmeden yutulabilir. */
function isLikelyTransientNetworkFailure(err) {
  if (!err) return false
  const msg = String(err?.message || err?.details || err || '').toLowerCase()
  return (
    err?.name === 'AbortError' ||
    err?.name === 'TypeError' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('aborted') ||
    msg.includes('load failed')
  )
}

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

function isPermTruthy(perms, key) {
  const v = perms?.[key]
  return v === true || v === 'true' || v === 1 || v === '1'
}

function hasCompanyWideManagementScope(perms, isSystemAdmin) {
  if (isSystemAdmin) return true
  return (
    isPermTruthy(perms, 'is_admin') ||
    isPermTruthy(perms, 'is_manager') ||
    isPermTruthy(perms, 'sirket.yonet') ||
    isPermTruthy(perms, 'rol.yonet') ||
    isPermTruthy(perms, 'sube.yonet') ||
    isPermTruthy(perms, 'personel.yonet') ||
    isPermTruthy(perms, 'personel_yonet')
  )
}

function expandUnitsFromSeeds(allUnits, seedIds) {
  const list = Array.isArray(allUnits) ? allUnits : []
  const set = new Set((seedIds || []).filter(Boolean).map((x) => String(x)))
  const queue = Array.from(set)
  while (queue.length) {
    const currentId = queue.shift()
    list
      .filter((unit) => String(unit?.ust_birim_id || '') === String(currentId))
      .forEach((child) => {
        const cid = String(child.id)
        if (set.has(cid)) return
        set.add(cid)
        queue.push(cid)
      })
  }
  return Array.from(set)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [personel, setPersonel] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const activeSessionRef = useRef({ personelId: null, sessionId: null, sessionCol: null, deviceCol: null, timeCol: null })
  const presenceStateRef = useRef({ userId: null, personelId: null, online: false })
  const presenceIdentityRef = useRef({ userId: null, personelId: null })
  const lastHeartbeatAtRef = useRef(0)
  const heartbeatInFlightRef = useRef(false)
  const backgroundOfflineTimerRef = useRef(null)
  const latestUserIdRef = useRef(null)

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

  const writePresenceLog = useCallback(async (supabase, personelId, durum, aciklama = null) => {
    if (!personelId || !durum) return
    try {
      const { error } = await supabase.from('personel_online_kayitlari').insert({
        personel_id: personelId,
        durum,
        aciklama,
        kaydedildi_at: new Date().toISOString(),
      })
      if (
        error &&
        __DEV__ &&
        !isMissingPresenceLogTableError(error) &&
        !isLikelyTransientNetworkFailure(error)
      ) {
        console.warn('[PODS] presence log write failed:', error?.message || error)
      }
    } catch {
      // best effort
    }
  }, [])

  const setPresenceOnline = useCallback(async (personelId, userId) => {
    if (!personelId || !userId) return
    const supabase = getSupabase()
    const nowIso = new Date().toISOString()
    const payload = {
      mobil_online: true,
      mobil_online_at: nowIso,
      mobil_last_seen_at: nowIso,
    }
    let error
    try {
      const res = await supabase
        .from('personeller')
        .update(payload)
        .eq('id', personelId)
        .eq('kullanici_id', userId)
      error = res.error
    } catch (e) {
      if (__DEV__ && !isLikelyTransientNetworkFailure(e)) {
        console.warn('[PODS] presence online update failed:', e?.message || e)
      }
      presenceStateRef.current = { userId, personelId, online: true }
      lastHeartbeatAtRef.current = Date.now()
      await writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
      return
    }
    if (error) {
      if (__DEV__ && !isMissingColumnError(error) && !isLikelyTransientNetworkFailure(error)) {
        console.warn('[PODS] presence online update failed:', error?.message || error)
      }
      // Kolonlar yoksa bile giriş/çıkış saat akışı için log tutmaya devam et.
      presenceStateRef.current = { userId, personelId, online: true }
      lastHeartbeatAtRef.current = Date.now()
      await writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
      return
    }
    presenceStateRef.current = { userId, personelId, online: true }
    presenceIdentityRef.current = { userId, personelId }
    lastHeartbeatAtRef.current = Date.now()
    await writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
  }, [writePresenceLog])

  const heartbeatPresence = useCallback(async ({ force = false } = {}) => {
    const state = presenceStateRef.current
    if (!state?.online || !state?.personelId || !state?.userId) return
    if (heartbeatInFlightRef.current) return
    const now = Date.now()
    const minGap = force ? APPSTATE_HEARTBEAT_MIN_GAP_MS : PRESENCE_HEARTBEAT_MS
    if (!force && now - lastHeartbeatAtRef.current < minGap) return
    const supabase = getSupabase()
    heartbeatInFlightRef.current = true
    try {
      let error
      try {
        const res = await supabase
          .from('personeller')
          .update({ mobil_last_seen_at: new Date().toISOString() })
          .eq('id', state.personelId)
          .eq('kullanici_id', state.userId)
          .eq('mobil_online', true)
        error = res.error
      } catch (e) {
        if (__DEV__ && !isLikelyTransientNetworkFailure(e)) {
          console.warn('[PODS] presence heartbeat failed:', e?.message || e)
        }
        return
      }
      if (error && __DEV__ && !isMissingColumnError(error) && !isLikelyTransientNetworkFailure(error)) {
        console.warn('[PODS] presence heartbeat failed:', error?.message || error)
        return
      }
      if (!error) lastHeartbeatAtRef.current = now
    } finally {
      heartbeatInFlightRef.current = false
    }
  }, [])

  const setPresenceOffline = useCallback(async (reason = 'manual_sign_out', options = {}) => {
    const state = presenceStateRef.current
    const identity = presenceIdentityRef.current
    const force = !!options?.force
    const targetUserId = state?.userId || identity?.userId
    const targetPersonelId = state?.personelId || identity?.personelId
    if ((!state?.online && !force) || !targetPersonelId || !targetUserId) return
    const supabase = getSupabase()
    const nowIso = new Date().toISOString()
    // Yarış durumlarını azaltmak için lokal state'i hemen offline al.
    presenceStateRef.current = { userId: targetUserId, personelId: targetPersonelId, online: false }
    const payload = {
      mobil_online: false,
      mobil_last_offline_at: nowIso,
      mobil_last_seen_at: nowIso,
    }
    let error
    try {
      const res = await supabase
        .from('personeller')
        .update(payload)
        .eq('id', targetPersonelId)
        .eq('kullanici_id', targetUserId)
      error = res.error
    } catch (e) {
      if (__DEV__ && !isLikelyTransientNetworkFailure(e)) {
        console.warn('[PODS] presence offline update failed:', e?.message || e)
      }
      await writePresenceLog(supabase, targetPersonelId, 'offline', reason)
      lastHeartbeatAtRef.current = 0
      return
    }
    if (error && __DEV__ && !isMissingColumnError(error) && !isLikelyTransientNetworkFailure(error)) {
      console.warn('[PODS] presence offline update failed:', error?.message || error)
    }
    await writePresenceLog(supabase, targetPersonelId, 'offline', reason)
    lastHeartbeatAtRef.current = 0
  }, [writePresenceLog])

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
        const isSystemAdmin = !!mergedProfile?.is_system_admin
        const hasCompanyWideScope = hasCompanyWideManagementScope(nextPermissions, isSystemAdmin)
        const canBypassIpRestriction =
          isSystemAdmin ||
          nextPermissions?.['ip.kisit_muaf'] === true ||
          nextPermissions?.['ip.kisit_muaf'] === 'true' ||
          nextPermissions?.['ip.kisit_muaf'] === 1 ||
          nextPermissions?.['ip.kisit_muaf'] === '1'
        if (personelData.ana_sirket_id && !canBypassIpRestriction) {
          try {
            const { data: companyRow, error: companyErr } = await supabase
              .from('ana_sirketler')
              .select('id,sabit_ip_aktif,izinli_ipler')
              .eq('id', personelData.ana_sirket_id)
              .maybeSingle()
            if (__DEV__ && companyErr) {
              console.warn('[PODS] ana_sirketler error:', companyErr.message, companyErr.code)
            }
            const fixedIpEnabled = !!companyRow?.sabit_ip_aktif
            if (fixedIpEnabled) {
              const clientIp = await getClientPublicIp()
              const allowed = isIpAllowed(companyRow?.izinli_ipler || [], clientIp)
              if (!allowed) {
                await supabase.auth.signOut().catch(() => {})
                setUser(null)
                setProfile(null)
                setPersonel(null)
                setPermissions({})
                Alert.alert(
                  'IP Kısıtı',
                  `Bu şirket için sabit IP girişi aktif. Mevcut IP (${clientIp || 'tespit edilemedi'}) izinli değil.`,
                )
                return
              }
            }
          } catch (ipErr) {
            if (__DEV__) console.warn('[PODS] ip validation error:', ipErr?.message || ipErr)
          }
        }
        const safePersonel = safeCopy({
          ...personelData,
          roleName: roleRow?.rol_adi || null,
          permissions: nextPermissions,
          accessibleUnitIds:
            personelData.birim_id != null && String(personelData.birim_id) !== ''
              ? [personelData.birim_id]
              : [],
        })
        let accessibleUnitIds = safePersonel.accessibleUnitIds || []
        try {
          if (personelData.ana_sirket_id) {
            const { data: companyUnits } = await supabase
              .from('birimler')
              .select('id,ust_birim_id,ana_sirket_id')
              .eq('ana_sirket_id', personelData.ana_sirket_id)
              .is('silindi_at', null)

            const list = Array.isArray(companyUnits) ? companyUnits : []
            if (list.length) {
              if (hasCompanyWideScope) {
                accessibleUnitIds = list.map((unit) => unit.id)
              } else if (personelData.birim_id) {
                const currentUnit = list.find((u) => String(u.id) === String(personelData.birim_id))
                const parentId = currentUnit?.ust_birim_id
                const peerIds = list
                  .filter((u) => String(u?.ust_birim_id || '') === String(parentId || ''))
                  .map((u) => u.id)
                const seeds = Array.from(new Set([personelData.birim_id, ...peerIds].filter(Boolean)))
                accessibleUnitIds = expandUnitsFromSeeds(list, seeds)
                if (!accessibleUnitIds.length) {
                  accessibleUnitIds = [personelData.birim_id]
                }
              } else {
                accessibleUnitIds = list.map((unit) => unit.id)
              }
            }
          }
        } catch {
          // best-effort
        }
        safePersonel.accessibleUnitIds = accessibleUnitIds
        setPersonel(safePersonel)
        setPermissions(nextPermissions)
        setProfile((prev) => (prev ? { ...prev, accessibleUnitIds } : prev))
        presenceIdentityRef.current = { userId, personelId: personelData.id }
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
        await setPresenceOnline(personelData.id, userId)
        // Otomatik token sync: girişte ve auth state değişiminde tetiklenir.
        syncPushTokenToPersonel(personelData.id, userId)
      } else {
        presenceIdentityRef.current = { userId: null, personelId: null }
        setPersonel(null)
        setPermissions({})
      }
    } catch {
      setProfile(null)
      setPersonel(null)
      setPermissions({})
    }
  }, [syncPushTokenToPersonel, enforceSingleDeviceSession, setPresenceOnline])

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
      latestUserIdRef.current = userId
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) loadProfileAndPersonel(userId)
      else {
        presenceIdentityRef.current = { userId: null, personelId: null }
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
      latestUserIdRef.current = userId
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) loadProfileAndPersonel(userId)
      else {
        void setPresenceOffline('Oturum kapatıldı', { force: true })
        presenceIdentityRef.current = { userId: null, personelId: null }
        setProfile(null)
        setPersonel(null)
        setPermissions({})
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe?.()
    }
  }, [loadProfileAndPersonel, setPresenceOffline])

  useEffect(() => {
    const id = setInterval(() => {
      const uid = latestUserIdRef.current
      if (!uid) return
      void loadProfileAndPersonel(uid)
    }, 45000)
    return () => clearInterval(id)
  }, [loadProfileAndPersonel])

  useEffect(() => {
    const clearBackgroundOfflineTimer = () => {
      if (backgroundOfflineTimerRef.current) {
        clearTimeout(backgroundOfflineTimerRef.current)
        backgroundOfflineTimerRef.current = null
      }
    }

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const hadPendingOfflineTimer = !!backgroundOfflineTimerRef.current
        clearBackgroundOfflineTimer()
        const state = presenceStateRef.current
        const identity = presenceIdentityRef.current
        const targetUserId = state?.userId || identity?.userId
        const targetPersonelId = state?.personelId || identity?.personelId
        if (targetPersonelId && targetUserId && (!state.online || hadPendingOfflineTimer)) {
          void setPresenceOnline(targetPersonelId, targetUserId)
        }
        void heartbeatPresence({ force: true })
        return
      }
      // inactive/background: mümkün olan en erken offline (grace > 0 ise tek seferlik gecikme).
      clearBackgroundOfflineTimer()
      const scheduleOffline = () => {
        void setPresenceOffline('Uygulama arka plana alindi/kapatildi')
      }
      if (BACKGROUND_OFFLINE_GRACE_MS <= 0) {
        scheduleOffline()
      } else {
        backgroundOfflineTimerRef.current = setTimeout(scheduleOffline, BACKGROUND_OFFLINE_GRACE_MS)
      }
    })
    const intervalId = setInterval(() => {
      void heartbeatPresence({ force: false })
    }, PRESENCE_HEARTBEAT_MS)
    return () => {
      appStateSub.remove()
      clearInterval(intervalId)
      clearBackgroundOfflineTimer()
    }
  }, [heartbeatPresence, setPresenceOffline])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    await setPresenceOffline('Kullanıcı manuel çıkış yaptı', { force: true })
    await clearSingleDeviceSession(user?.id || '')
    await supabase.auth.signOut()
    presenceIdentityRef.current = { userId: null, personelId: null }
    setUser(null)
    setProfile(null)
    setPersonel(null)
    setPermissions({})
    latestUserIdRef.current = null
  }, [clearSingleDeviceSession, setPresenceOffline, user?.id])

  const markPresenceOffline = useCallback(async (reason = 'app_closed') => {
    await setPresenceOffline(reason, { force: true })
  }, [setPresenceOffline])

  // Expose deep-cloned objects so consumers never receive frozen/non-configurable refs
  const value = useMemo(
    () => ({
      user: safeCopy(user),
      profile: safeCopy(profile),
      personel: safeCopy(personel),
      permissions: safeCopy(permissions),
      loading,
      signOut,
      markPresenceOffline,
    }),
    [user, profile, personel, permissions, loading, signOut, markPresenceOffline]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { safeCopy }
