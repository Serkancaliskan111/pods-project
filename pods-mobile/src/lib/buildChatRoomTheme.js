import { palette, hexToRgba } from '../theme/palette'
import { StyleSheet } from 'react-native'

const LIST_AVATAR_W = 52

/**
 * WhatsApp düzenini koruyup Pods marka renklerini sohbet ekranına uygular.
 */
export function buildChatRoomTheme(uiTheme) {
  const brand = uiTheme?.brandBlue || palette.primary[700]
  const accent = uiTheme?.accent || palette.accent[500]

  return {
    header: brand,
    chatBg: palette.slate[100],
    wallpaperDoodle: 'rgba(0,0,0,0.045)',
    sentBubble: palette.surface,
    sentBubbleBorder: palette.slate[200],
    receivedBubble: palette.surface,
    receivedBubbleBorder: palette.slate[200],
    composerBg: palette.surface,
    inputBg: palette.slate[50],
    textPrimary: palette.slate[900],
    textSecondary: palette.slate[600],
    textHeader: palette.surface,
    /** Koyu header üstünde durum satırı (çevrimiçi / son görülme) */
    presenceOnHeader: 'rgba(255,255,255,0.88)',
    presenceOnlineOnHeader: '#BBF7D0',
    textTime: palette.slate[500],
    icon: palette.slate[600],
    link: palette.primary[700],
    tickRead: palette.blurple[500],
    tickDefault: palette.slate[400],
    groupAvatar: accent,
    accent,
    brand,
    voiceWaveActive: palette.primary[700],
    voiceWaveInactive: hexToRgba(palette.primary[700], 0.28),
    sentBubbleVoice: palette.surface,
    quoteBgMine: 'rgba(0,0,0,0.05)',
    quoteBgTheirs: 'rgba(0,0,0,0.04)',
    forwardLabel: palette.slate[500],
    sheetBg: palette.slate[50],
    sheetBorder: palette.slate[200],
    attachment: {
      gallery: palette.blurple[500],
      camera: palette.slate[600],
      location: palette.primary[600],
      document: palette.primary[500],
      poll: palette.accent[500],
    },
  }
}

export function buildChatListTheme(uiTheme) {
  const brand = uiTheme?.brandBlue || palette.primary[700]
  const accent = uiTheme?.accent || palette.accent[500]

  return {
    header: brand,
    listBg: palette.surface,
    listDivider: palette.slate[100],
    textPrimary: palette.slate[800],
    textSecondary: palette.slate[500],
    textHeader: palette.surface,
    searchBg: palette.slate[50],
    unread: accent,
    fab: accent,
  }
}

export function buildChatListScreenStyles(t) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.listBg,
    },
    header: {
      backgroundColor: t.header,
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerCompact: {
      backgroundColor: t.header,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingBottom: 12,
      gap: 4,
    },
    headerTitle: {
      fontSize: 22,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerIconBtn: {
      padding: 8,
    },
    backBtn: {
      padding: 4,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 14,
      marginVertical: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: t.searchBg,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      color: t.textPrimary,
      padding: 0,
      backgroundColor: 'transparent',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 14,
      backgroundColor: t.listBg,
    },
    groupAvatar: {
      width: LIST_AVATAR_W,
      height: LIST_AVATAR_W,
      borderRadius: LIST_AVATAR_W / 2,
      backgroundColor: t.searchBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rowTitle: {
      flex: 1,
    },
    rowBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    preview: {
      flex: 1,
    },
    unreadBadge: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: t.unread,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.listDivider,
      marginLeft: 16 + LIST_AVATAR_W + 14,
    },
    loaderWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listEmpty: {
      flexGrow: 1,
    },
    list: {
      paddingBottom: 24,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 48,
    },
    centerEmpty: {
      padding: 32,
      alignItems: 'center',
    },
    fab: {
      position: 'absolute',
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: t.fab,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.22,
      shadowRadius: 4,
      elevation: 6,
    },
  })
}
