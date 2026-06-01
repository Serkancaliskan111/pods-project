import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import getSupabase from '../lib/supabaseClient'
import { Alert, AppState, Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { isExpoGoClient } from '../lib/expoGoNotifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getClientPublicIp, isIpAllowed } from '../lib/ipAccess'
import { resolveAccessibleUnitIds } from '../lib/personelUnitScope'

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
/** Son başarılı kapsam; cold start’ta ~anında UI için (ağ gelene kadar). */
const SCOPE_CACHE_KEY = 'pods_mobile_scope_cache_v1'
const SCOPE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

async function readScopeCache(userId) {
  try {
    const raw = await AsyncStorage.getItem(SCOPE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userId !== userId || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > SCOPE_CACHE_MAX_AGE_MS) return null
    if (!parsed.personel?.id) return null
    return parsed
  } catch {
    return null
  }
}

async function writeScopeCache(userId, profileObj, personelObj, permissionsObj) {
  try {
    const slim =
      personelObj && typeof personelObj === 'object' ? { ...personelObj } : personelObj
    if (slim && typeof slim === 'object') delete slim.roller
    await AsyncStorage.setItem(
      SCOPE_CACHE_KEY,
      JSON.stringify({
        userId,
        savedAt: Date.now(),
        profile: profileObj ?? null,
        personel: slim ?? null,
        permissions: permissionsObj || {},
      }),
    )
  } catch {
    // ignore
  }
}

async function clearScopeCache() {
  try {
    await AsyncStorage.removeItem(SCOPE_CACHE_KEY)
  } catch {
    // ignore
  }
}
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
  if (isExpoGoClient()) return null
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
  const [scopeReady, setScopeReady] = useState(false)
  const activeSessionRef = useRef({ personelId: null, sessionId: null, sessionCol: null, deviceCol: null, timeCol: null })
  const presenceStateRef = useRef({ userId: null, personelId: null, online: false })
  const presenceIdentityRef = useRef({ userId: null, personelId: null })
  const lastHeartbeatAtRef = useRef(0)
  const heartbeatInFlightRef = useRef(false)
  const backgroundOfflineTimerRef = useRef(null)
  const latestUserIdRef = useRef(null)
  const profileRefreshInFlightRef = useRef(null)
  const profileRefreshInFlightUserIdRef = useRef(null)
  const lastProfileRefreshAtRef = useRef(0)
  /** true iken load hata verirse önbellekten gelen UI sıfırlanmasın. */
  const preserveUiOnTransientLoadFailureRef = useRef(false)

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
      void writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
      return
    }
    if (error) {
      if (__DEV__ && !isMissingColumnError(error) && !isLikelyTransientNetworkFailure(error)) {
        console.warn('[PODS] presence online update failed:', error?.message || error)
      }
      // Kolonlar yoksa bile giriş/çıkış saat akışı için log tutmaya devam et.
      presenceStateRef.current = { userId, personelId, online: true }
      lastHeartbeatAtRef.current = Date.now()
      void writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
      return
    }
    presenceStateRef.current = { userId, personelId, online: true }
    presenceIdentityRef.current = { userId, personelId }
    lastHeartbeatAtRef.current = Date.now()
    void writePresenceLog(supabase, personelId, 'online', 'Mobil uygulama oturumu aktif')
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
      void writePresenceLog(supabase, targetPersonelId, 'offline', reason)
      lastHeartbeatAtRef.current = 0
      return
    }
    if (error && __DEV__ && !isMissingColumnError(error) && !isLikelyTransientNetworkFailure(error)) {
      console.warn('[PODS] presence offline update failed:', error?.message || error)
    }
    void writePresenceLog(supabase, targetPersonelId, 'offline', reason)
    lastHeartbeatAtRef.current = 0
  }, [writePresenceLog])

  const loadProfileAndPersonel = useCallback(async (userId) => {
    if (!userId) {
      preserveUiOnTransientLoadFailureRef.current = false
      await clearScopeCache()
      setProfile(null)
      setPersonel(null)
      setPermissions({})
      setScopeReady(false)
      return
    }
    try {
      const supabase = getSupabase()

      const [
        { data: kullaniciData, error: errKullanici },
        { data: personelData, error: errPersonel },
        { data: profilesData, error: errProfiles },
      ] = await Promise.all([
        supabase
          .from('kullanicilar')
          .select('id, ad_soyad, email, avatar_id, profil_foto_yol')
          .eq('id', userId)
          .is('silindi_at', null)
          .maybeSingle(),
        supabase
          .from('personeller')
          .select('id, ad, soyad, email, birim_id, rol_id, ana_sirket_id, roller(rol_adi, yetkiler)')
          .eq('kullanici_id', userId)
          .is('silindi_at', null)
          .maybeSingle(),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ])

      if (__DEV__ && errKullanici) console.warn('[PODS] kullanicilar error:', errKullanici.message, errKullanici.code)
      if (__DEV__ && errPersonel) console.warn('[PODS] personeller error:', errPersonel.message, errPersonel.code)
      // profiles tablosu yoksa PostgREST PGRST205 (schema cache); satır yoksa vb. PGRST116 — bunlar sessiz kabul edilir.
      const ignorableProfilesCodes = new Set(['PGRST116', 'PGRST205'])
      if (__DEV__ && errProfiles && !ignorableProfilesCodes.has(errProfiles.code)) {
        console.warn('[PODS] profiles error:', errProfiles.message, errProfiles.code)
      }

      let mergedProfile = kullaniciData ? { ...kullaniciData } : null
      if (!errProfiles && profilesData) {
        mergedProfile = mergedProfile ? { ...mergedProfile, ...profilesData } : { ...profilesData }
      }
      setProfile(mergedProfile)
      if (personelData) {
        const roleRow = Array.isArray(personelData.roller) ? personelData.roller[0] : personelData.roller
        const nextPermissions = normalizePermissions(roleRow?.yetkiler)
        const isSystemAdmin = !!mergedProfile?.is_system_admin
        const canBypassIpRestriction =
          isSystemAdmin ||
          nextPermissions?.['ip.kisit_muaf'] === true ||
          nextPermissions?.['ip.kisit_muaf'] === 'true' ||
          nextPermissions?.['ip.kisit_muaf'] === 1 ||
          nextPermissions?.['ip.kisit_muaf'] === '1'
        // Sabit IP: şirket satırı önce; birim ağı sonra — ana ekran bir ağ gidişini beklemez (IP muafiyeti varsa doğrudan açılır).
        if (personelData.ana_sirket_id && !canBypassIpRestriction) {
          const { data: companyRow, error: companyErr } = await supabase
            .from('ana_sirketler')
            .select('id,sabit_ip_aktif,izinli_ipler')
            .eq('id', personelData.ana_sirket_id)
            .maybeSingle()
          if (__DEV__ && companyErr) {
            console.warn('[PODS] ana_sirketler error:', companyErr.message, companyErr.code)
          }
          if (companyRow) {
            try {
              const fixedIpEnabled = !!companyRow?.sabit_ip_aktif
              if (fixedIpEnabled) {
                const clientIp = await getClientPublicIp()
                const allowed = isIpAllowed(companyRow?.izinli_ipler || [], clientIp)
                if (!allowed) {
                  preserveUiOnTransientLoadFailureRef.current = false
                  await clearScopeCache()
                  await supabase.auth.signOut().catch(() => {})
                  setUser(null)
                  setProfile(null)
                  setPersonel(null)
                  setPermissions({})
                  setScopeReady(false)
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
        }

        let junctionBirimIds = []
        if (personelData?.id) {
          const { data: pbRows, error: pbErr } = await supabase
            .from('personel_birimleri')
            .select('birim_id')
            .eq('personel_id', personelData.id)
          if (
            pbErr &&
            pbErr.code !== '42P01' &&
            pbErr.code !== 'PGRST205' &&
            __DEV__
          ) {
            console.warn('[PODS] personel_birimleri:', pbErr.message, pbErr.code)
          } else {
            junctionBirimIds = (pbRows || [])
              .map((r) => r.birim_id)
              .filter(Boolean)
          }
        }

        const provisionalAccessible = resolveAccessibleUnitIds({
          isSystemAdmin,
          companyUnitsList: [],
          legacyBirimId: personelData.birim_id,
          junctionBirimIds,
        })

        const provisionalPersonel = safeCopy({
          ...personelData,
          roleName: roleRow?.rol_adi || null,
          permissions: nextPermissions,
          scopeReady: true,
          accessibleUnitIds: provisionalAccessible,
        })
        setPersonel(provisionalPersonel)
        setPermissions(nextPermissions)
        setProfile((prev) =>
          prev
            ? { ...prev, accessibleUnitIds: provisionalAccessible }
            : mergedProfile
              ? { ...mergedProfile, accessibleUnitIds: provisionalAccessible }
              : null,
        )
        setScopeReady(true)
        presenceIdentityRef.current = { userId, personelId: personelData.id }

        if (SINGLE_DEVICE_ENFORCEMENT_ENABLED) {
          const sessionCheck = await enforceSingleDeviceSession(personelData, userId)
          if (!sessionCheck?.ok && sessionCheck?.blocked) {
            preserveUiOnTransientLoadFailureRef.current = false
            await clearScopeCache()
            await supabase.auth.signOut().catch(() => {})
            setUser(null)
            setProfile(null)
            setPersonel(null)
            setPermissions({})
            setScopeReady(false)
            Alert.alert(
              'Oturum sınırı',
              'Bu hesap başka bir cihazda aktif. Güvenlik nedeniyle aynı anda tek cihazdan giriş yapılabilir.',
            )
            return
          }
        }

        void setPresenceOnline(personelData.id, userId)
        syncPushTokenToPersonel(personelData.id, userId)

        let companyUnitsRaw = []
        if (personelData.ana_sirket_id) {
          const { data: unitsData, error: birimErr } = await supabase
            .from('birimler')
            .select('id,ust_birim_id,ana_sirket_id')
            .eq('ana_sirket_id', personelData.ana_sirket_id)
            .is('silindi_at', null)
          if (__DEV__ && birimErr) {
            console.warn('[PODS] birimler (scope) error:', birimErr.message, birimErr.code)
          }
          companyUnitsRaw = unitsData || []
        }

        let accessibleUnitIds = provisionalAccessible
        try {
          const list = Array.isArray(companyUnitsRaw) ? companyUnitsRaw : []
          accessibleUnitIds = resolveAccessibleUnitIds({
            isSystemAdmin,
            companyUnitsList: list,
            legacyBirimId: personelData.birim_id,
            junctionBirimIds,
          })
        } catch {
          // best-effort
        }

        const finalPersonel = safeCopy({
          ...personelData,
          roleName: roleRow?.rol_adi || null,
          permissions: nextPermissions,
          scopeReady: true,
          accessibleUnitIds,
        })
        setPersonel(finalPersonel)
        setPermissions(nextPermissions)
        setProfile((prev) => (prev ? { ...prev, accessibleUnitIds } : null))

        preserveUiOnTransientLoadFailureRef.current = false
        const profileForCache = mergedProfile ? { ...mergedProfile, accessibleUnitIds } : null
        void writeScopeCache(userId, profileForCache, finalPersonel, nextPermissions)
      } else {
        preserveUiOnTransientLoadFailureRef.current = false
        presenceIdentityRef.current = { userId: null, personelId: null }
        setPersonel(null)
        setPermissions({})
        setScopeReady(!!mergedProfile?.is_system_admin)
      }
    } catch (e) {
      if (__DEV__) console.warn('[PODS] loadProfileAndPersonel failed:', e?.message || e)
      if (preserveUiOnTransientLoadFailureRef.current) {
        return
      }
      setProfile(null)
      setPersonel(null)
      setPermissions({})
      setScopeReady(false)
    }
  }, [syncPushTokenToPersonel, enforceSingleDeviceSession, setPresenceOnline])

  const refreshProfileAndPersonel = useCallback(
    async (userId, { force = false } = {}) => {
      if (!userId) {
        await loadProfileAndPersonel(null)
        return
      }
      const now = Date.now()
      const existingTask = profileRefreshInFlightRef.current
      const existingUserId = profileRefreshInFlightUserIdRef.current
      if (existingTask && existingUserId === userId) {
        await existingTask
        return
      }
      if (!force && now - lastProfileRefreshAtRef.current < 20 * 1000) {
        return
      }
      const task = loadProfileAndPersonel(userId)
      profileRefreshInFlightRef.current = task
      profileRefreshInFlightUserIdRef.current = userId
      try {
        await task
      } finally {
        lastProfileRefreshAtRef.current = Date.now()
        profileRefreshInFlightRef.current = null
        profileRefreshInFlightUserIdRef.current = null
      }
    },
    [loadProfileAndPersonel],
  )

  useEffect(() => {
    let mounted = true
    const supabase = getSupabase()

    ;(async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (!mounted) return
      if (error) {
        preserveUiOnTransientLoadFailureRef.current = false
        void clearScopeCache()
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
            setScopeReady(false)
            setLoading(false)
          })
        return
      }
      const rawUser = session?.user ?? null
      const userId = rawUser?.id ?? null
      latestUserIdRef.current = userId
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) {
        try {
          const cached = await readScopeCache(userId)
          if (cached?.personel?.id) {
            preserveUiOnTransientLoadFailureRef.current = true
            setProfile(cached.profile ?? null)
            setPersonel(cached.personel)
            setPermissions(typeof cached.permissions === 'object' && cached.permissions ? cached.permissions : {})
            setScopeReady(true)
            presenceIdentityRef.current = { userId, personelId: cached.personel?.id ?? null }
          }
        } catch {
          // önbellek okunamazsa normal ağ yolu
        }
        void refreshProfileAndPersonel(userId, { force: true })
      } else {
        preserveUiOnTransientLoadFailureRef.current = false
        await clearScopeCache()
        presenceIdentityRef.current = { userId: null, personelId: null }
        setProfile(null)
        setPersonel(null)
        setPermissions({})
        setScopeReady(false)
      }
      setLoading(false)
    })().catch((e) => {
      if (__DEV__) console.warn('[PODS] getSession bootstrap failed:', e?.message || e)
      if (!mounted) return
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      // İlk oturum: getSession() bootstrap’ı zaten refresh tetikliyor; INITIAL_SESSION ile çift yükleme yapılmasın.
      if (event === 'INITIAL_SESSION') return
      const rawUser = session?.user ?? null
      const userId = rawUser?.id ?? null
      latestUserIdRef.current = userId
      setUser(rawUser ? safeCopy({ id: rawUser.id, email: rawUser.email ?? '' }) : null)
      if (userId) {
        void refreshProfileAndPersonel(userId, { force: true })
      } else {
        preserveUiOnTransientLoadFailureRef.current = false
        void clearScopeCache()
        void setPresenceOffline('Oturum kapatıldı', { force: true })
        presenceIdentityRef.current = { userId: null, personelId: null }
        setProfile(null)
        setPersonel(null)
        setPermissions({})
        setScopeReady(false)
      }
    })

    return () => {
      mounted = false
      subscription?.unsubscribe?.()
    }
  }, [refreshProfileAndPersonel, setPresenceOffline])

  useEffect(() => {
    const id = setInterval(() => {
      const uid = latestUserIdRef.current
      if (!uid) return
      void refreshProfileAndPersonel(uid, { force: false })
    }, 45000)
    return () => clearInterval(id)
  }, [refreshProfileAndPersonel])

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
    preserveUiOnTransientLoadFailureRef.current = false
    await clearScopeCache()
    await setPresenceOffline('Kullanıcı manuel çıkış yaptı', { force: true })
    await clearSingleDeviceSession(user?.id || '')
    await supabase.auth.signOut()
    presenceIdentityRef.current = { userId: null, personelId: null }
    setUser(null)
    setProfile(null)
    setPersonel(null)
    setPermissions({})
    setScopeReady(false)
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
      scopeReady,
      signOut,
      markPresenceOffline,
    }),
    [user, profile, personel, permissions, loading, scopeReady, signOut, markPresenceOffline]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { safeCopy }
