import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'
import getSupabase from '../lib/supabaseClient'
import { useAuth } from './AuthContext'
import { useTaskNotifications } from '../hooks/useTaskNotifications'
import {
  channelLooksUnread,
  fetchMyChannels,
  subscribeChannelSummaries,
  CHAT_REALTIME_LIST_DEBOUNCE_MS,
} from '../lib/chatApi'
import {
  countUnreadAnnouncements,
  loadReadAnnouncementIdsAsync,
} from '../lib/announcementRead'
import { hasManagementPrivileges } from '../lib/managementScope'

const TabBadgeContext = createContext(null)
const supabase = getSupabase()
const CHAT_POLL_MS = 30_000
const ANNOUNCEMENT_POLL_MS = 60_000

export function TabBadgeProvider({ children }) {
  const { user, personel, profile, permissions } = useAuth()
  const uid = user?.id
  const companyId = personel?.ana_sirket_id
  const readScopeId = personel?.id ? String(personel.id) : ''
  const isManager = hasManagementPrivileges(permissions, personel)

  const taskNotifications = useTaskNotifications()
  const [chatUnread, setChatUnread] = useState(0)
  const [announcementUnread, setAnnouncementUnread] = useState(0)
  const [homeNotifCount, setHomeNotifCount] = useState(0)
  const [announcementItems, setAnnouncementItems] = useState([])
  const [announcementReadIds, setAnnouncementReadIds] = useState(() => new Set())

  const chatDebounceRef = useRef(null)
  const [chatChannelIds, setChatChannelIds] = useState([])

  const loadChatUnread = useCallback(async () => {
    if (!uid || !companyId) {
      setChatUnread(0)
      setChatChannelIds([])
      return
    }
    try {
      const raw = await fetchMyChannels(uid)
      const count = (raw || []).filter((c) => channelLooksUnread(c)).length
      setChatUnread(count)
      setChatChannelIds((raw || []).map((c) => c.id).filter(Boolean))
    } catch {
      setChatUnread(0)
      setChatChannelIds([])
    }
  }, [uid, companyId])

  const loadAnnouncements = useCallback(async () => {
    if (!readScopeId) {
      setAnnouncementItems([])
      setAnnouncementUnread(0)
      return
    }
    try {
      const readIds = await loadReadAnnouncementIdsAsync(readScopeId)
      setAnnouncementReadIds(readIds)

      if (!companyId && !profile?.is_system_admin) {
        setAnnouncementItems([])
        setAnnouncementUnread(0)
        return
      }

      let query = supabase
        .from('duyurular')
        .select('id, metin, created_at, ana_sirket_id')
        .order('created_at', { ascending: false })
        .limit(100)

      if (!profile?.is_system_admin && companyId) {
        query = query.eq('ana_sirket_id', companyId)
      }

      const { data, error } = await query
      const rows = !error && Array.isArray(data) ? data : []
      setAnnouncementItems(rows)
      setAnnouncementUnread(countUnreadAnnouncements(rows, readIds))
    } catch {
      setAnnouncementItems([])
      setAnnouncementUnread(0)
    }
  }, [readScopeId, companyId, profile?.is_system_admin])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadChatUnread(), loadAnnouncements(), taskNotifications.reload()])
  }, [loadChatUnread, loadAnnouncements, taskNotifications])

  useEffect(() => {
    void loadChatUnread()
    void loadAnnouncements()
  }, [loadChatUnread, loadAnnouncements])

  useEffect(() => {
    if (!uid || !companyId) return undefined

    const poll = setInterval(() => void loadChatUnread(), CHAT_POLL_MS)
    const annPoll = setInterval(() => void loadAnnouncements(), ANNOUNCEMENT_POLL_MS)

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshAll()
    })

    return () => {
      if (chatDebounceRef.current) clearTimeout(chatDebounceRef.current)
      clearInterval(poll)
      clearInterval(annPoll)
      appSub.remove()
    }
  }, [uid, companyId, loadChatUnread, loadAnnouncements, refreshAll])

  useEffect(() => {
    if (!uid || !companyId || !chatChannelIds.length) return undefined

    const unsub = subscribeChannelSummaries(chatChannelIds, () => {
      if (chatDebounceRef.current) clearTimeout(chatDebounceRef.current)
      chatDebounceRef.current = setTimeout(() => void loadChatUnread(), CHAT_REALTIME_LIST_DEBOUNCE_MS)
    })

    return () => {
      unsub?.()
      if (chatDebounceRef.current) clearTimeout(chatDebounceRef.current)
    }
  }, [uid, companyId, chatChannelIds, loadChatUnread])

  const notificationUnread = useMemo(() => {
    if (!isManager) return taskNotifications.unreadCount
    return Math.max(homeNotifCount, taskNotifications.unreadCount)
  }, [isManager, homeNotifCount, taskNotifications.unreadCount])

  const value = useMemo(
    () => ({
      chatUnread,
      announcementUnread,
      notificationUnread,
      taskNotifications,
      setHomeNotifCount,
      refreshChat: loadChatUnread,
      refreshAnnouncements: loadAnnouncements,
      refreshAll,
      announcementItems,
      announcementReadIds,
      setAnnouncementReadIds,
    }),
    [
      chatUnread,
      announcementUnread,
      notificationUnread,
      taskNotifications,
      loadChatUnread,
      loadAnnouncements,
      refreshAll,
      announcementItems,
      announcementReadIds,
    ],
  )

  return <TabBadgeContext.Provider value={value}>{children}</TabBadgeContext.Provider>
}

export function useTabBadges() {
  const ctx = useContext(TabBadgeContext)
  if (!ctx) {
    throw new Error('useTabBadges must be used within TabBadgeProvider')
  }
  return ctx
}

export function useTabBadgesOptional() {
  return useContext(TabBadgeContext)
}
