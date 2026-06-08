import {
  hasWebPanelAccess,
  canSeeCompanies,
  canSeeUnits,
  canManageStaff,
  canSeeRoles,
  canSeeTaskTemplates,
  canSeeTasks,
  canApproveTask,
  hasManagementDashboardAccess,
  canManageCustomerRatings,
  canAssignTask,
  isPermTruthy,
} from './permissions.js'
import {
  hasManagementPrivileges,
  isPermTruthy as isScopePermTruthy,
} from './managementScope.js'

/**
 * Mobil modül menüsü — web `adminNav.js` ile aynı yetki kuralları, stack ekran adları.
 */
export function buildMobileAdminModules({ permissions, isSystemAdmin, personel }) {
  const orgChildren = [
    {
      key: 'CompaniesList',
      label: 'Şirketler',
      show: canSeeCompanies(permissions, isSystemAdmin),
    },
    {
      key: 'UnitsList',
      label: 'Birimler',
      show: canSeeUnits(permissions, isSystemAdmin),
    },
    {
      key: 'StaffList',
      label: 'Personeller',
      show: canManageStaff(permissions, isSystemAdmin),
    },
    {
      key: 'StaffForm',
      label: 'Personel kayıt',
      show: canManageStaff(permissions, isSystemAdmin),
    },
    {
      key: 'RolesList',
      label: 'Roller',
      show: canSeeRoles(permissions, isSystemAdmin),
    },
  ].filter((c) => c.show)

  const taskChildren = [
    { key: 'TasksUpcoming', label: 'Yaklaşan görevler', show: canSeeTasks(permissions, isSystemAdmin) },
    {
      key: 'TaskDeletionCenter',
      label: 'Silme merkezi',
      show:
        isSystemAdmin ||
        isPermTruthy(permissions, 'is.sil') ||
        isPermTruthy(permissions, 'is.sil.onay'),
    },
  ].filter((c) => c.show)

  const auditChildren = [
    { key: 'AuditCenter', label: 'Onay bekleyenler', show: isSystemAdmin || canApproveTask(permissions) },
    {
      key: 'AuditApproved',
      label: 'Onaylananlar',
      show: isSystemAdmin || canApproveTask(permissions),
    },
  ].filter((c) => c.show)

  const sections = [
    {
      title: 'Genel',
      items: [
        {
          key: 'Home',
          label: hasManagementDashboardAccess(permissions, isSystemAdmin)
            ? 'Yönetim özeti'
            : 'Ana sayfa',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
          tab: true,
        },
        {
          key: 'Tasks',
          label: 'Görevler',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
          tab: true,
        },
        {
          key: 'ChatList',
          label: 'Sohbet',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
          tab: true,
        },
      ].filter((i) => i.show),
    },
    {
      title: 'Görevler',
      items: taskChildren,
    },
    {
      title: 'Denetim',
      items: auditChildren,
    },
    {
      title: 'Planlama',
      items: [
        {
          key: 'TaskCalendar',
          label: 'Takvim',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
        },
        {
          key: 'ProjectsList',
          label: 'Projeler',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
        },
        {
          key: 'PersonalTodoList',
          label: 'Yapılacaklar',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
        },
      ].filter((i) => i.show),
    },
    {
      title: 'Yönetim',
      items: [
        {
          key: 'ManagerTasks',
          label: 'Görevler',
          show:
            hasManagementPrivileges(permissions, personel) ||
            isPermTruthy(permissions, 'is.duzenle') ||
            isPermTruthy(permissions, 'is.sil') ||
            isPermTruthy(permissions, 'is.sil.onay'),
          tab: true,
        },
        {
          key: 'AnnouncementsList',
          label: 'Duyurular',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
        },
        {
          key: 'PresenceIndex',
          label: 'Canlı durum',
          show: canManageStaff(permissions, isSystemAdmin),
        },
        {
          key: 'CustomerRatingsList',
          label: 'Müşteri anketi',
          show: canManageCustomerRatings(permissions, isSystemAdmin),
        },
        {
          key: 'TaskTemplatesList',
          label: 'Görev şablonları',
          show: canSeeTaskTemplates(permissions, isSystemAdmin),
        },
        {
          key: 'ExtraTask',
          label: canAssignTask(permissions, isSystemAdmin, personel) ? 'Görev ata' : 'Ekstra görev',
          show:
            canAssignTask(permissions, isSystemAdmin, personel) ||
            isPermTruthy(permissions, 'is.olustur'),
        },
      ].filter((i) => i.show),
    },
    {
      title: 'Organizasyon',
      items: orgChildren,
    },
    {
      title: 'Hesap',
      items: [
        { key: 'Profile', label: 'Profil', show: true, tab: true },
        {
          key: 'PointsHistory',
          label: 'Puan geçmişi',
          show: hasWebPanelAccess(permissions, isSystemAdmin),
          tab: true,
        },
      ].filter((i) => i.show),
    },
  ]

  return sections.filter((s) => s.items.length > 0)
}

const TAB_SCREEN_MAP = {
  ChatList: 'Chat',
  Home: 'Home',
  Tasks: 'Tasks',
  Chat: 'Chat',
  Profile: 'Profile',
  ManagerTasks: 'ManagerTasks',
  StaffList: 'StaffList',
  PointsHistory: 'PointsHistory',
  News: 'News',
  Denetim: 'Denetim',
}

/** Tab’da zaten olan veya FAB’da olan route’lar menüde tekrarlanmasın */
const HIDDEN_FROM_EXTRA_MENU = new Set(['ExtraTask', 'StaffForm', 'ModulesHub'])

/** Hamburger menüde sabit gösterilenler — profil “Diğer özellikler”de tekrarlanmasın */
export const MOBILE_HAMBURGER_KEYS = new Set([
  'Denetim',
  'AuditCenter',
  'ManagerTasks',
  'Tasks',
  'StaffList',
  'PointsHistory',
  'Profile',
  'News',
  'PersonalTodoList',
  'ProjectsList',
])

function isPermValueTruthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/**
 * Ana sayfa üst barında zaten olan kısayollar — hamburger menüde tekrarlanmasın.
 */
export function getHomeTopBarExcludedMenuKeys({ permissions, isSystemAdmin, personel }) {
  const canWebPanel = hasWebPanelAccess(permissions, isSystemAdmin)
  const excluded = new Set(['Chat'])

  if (canWebPanel) {
    excluded.add('ProjectsList')
    excluded.add('PersonalTodoList')
    excluded.add('TaskCalendar')
  }
  if (canManageStaff(permissions, isSystemAdmin)) {
    excluded.add('PresenceIndex')
  }

  return excluded
}

/**
 * Alt navbar hamburger menüsü — sabit sıra ve etiketler.
 */
export function buildMobileHamburgerMenu({ permissions, isSystemAdmin, personel }) {
  const isManagerUser =
    hasManagementPrivileges(permissions, personel) || isScopePermTruthy(permissions, 'gorev_onayla')

  const canManageStaffTab =
    isManagerUser &&
    (isPermValueTruthy(permissions?.manage_staff) ||
      isPermValueTruthy(permissions?.view_staff) ||
      isPermValueTruthy(permissions?.['personel.yonet']) ||
      isPermValueTruthy(permissions?.['personel_yonet']) ||
      isPermValueTruthy(permissions?.['sirket.yonet']) ||
      isPermValueTruthy(permissions?.['sube.yonet']) ||
      isPermValueTruthy(permissions?.['rol.yonet']))

  const canViewReports =
    isManagerUser &&
    (isPermValueTruthy(permissions?.view_reports) ||
      isPermValueTruthy(permissions?.puan_ver) ||
      isPermValueTruthy(permissions?.['puan.ver']) ||
      isPermValueTruthy(permissions?.['rapor.oku']) ||
      isPermValueTruthy(permissions?.['rapor_oku']))

  const panel = hasWebPanelAccess(permissions, isSystemAdmin)
  const excluded = getHomeTopBarExcludedMenuKeys({ permissions, isSystemAdmin, personel })

  const items = []

  if (!isManagerUser) {
    items.push({ key: 'News', label: 'Duyurular', routeName: 'News' })
  }

  if (isSystemAdmin || canApproveTask(permissions)) {
    items.push({ key: 'Denetim', label: 'Denetim', routeName: 'Denetim' })
  }

  if (canManageStaffTab) {
    items.push({ key: 'StaffList', label: 'Personeller', routeName: 'StaffList' })
  }

  if (canViewReports || !isManagerUser) {
    items.push({ key: 'PointsHistory', label: 'Puan Geçmişi', routeName: 'PointsHistory' })
  }

  items.push({ key: 'Profile', label: 'Profil', routeName: 'Profile' })

  if (panel) {
    items.push({ key: 'PersonalTodoList', label: 'Yapılacaklar', routeName: 'PersonalTodoList' })
    items.push({ key: 'ProjectsList', label: 'Projeler', routeName: 'ProjectsList' })
  }

  return items.filter(
    (item) => !excluded.has(item.routeName) && !excluded.has(item.key),
  )
}

/** Alt çubukta görünen birincil sekmeler: 2 sol + ortada + + 2 sağ (Menü ayrı) */
export const MOBILE_PRIMARY_TAB_NAMES = ['Home', 'Tasks', 'Chat']
export const MOBILE_PRIMARY_TAB_LEFT_COUNT = 2

/** Tab route adı → modül key (zaten sekmede açılanlar menüde tekrarlanmasın) */
const TAB_ROUTE_TO_KEY = {
  Home: 'Home',
  Tasks: 'Tasks',
  Chat: 'ChatList',
  Profile: 'Profile',
  ManagerTasks: 'ManagerTasks',
  StaffList: 'StaffList',
  PointsHistory: 'PointsHistory',
  News: 'News',
  Denetim: 'AuditCenter',
}

/**
 * Profil / “Daha” menüsü için yığın ekran linkleri (tab olmayanlar).
 * @param {string[]} [activeTabNames] — `state.routes` içindeki sekme adları
 */
export function buildMobileStackLinks(ctx, activeTabNames = []) {
  const onTab = new Set()
  for (const name of activeTabNames) {
    onTab.add(name)
    const key = TAB_ROUTE_TO_KEY[name] || name
    onTab.add(key)
  }

  const sections = buildMobileAdminModules(ctx)
  const links = []
  const seen = new Set()
  for (const section of sections) {
    if (section.title === 'Genel' || section.title === 'Hesap') continue
    for (const item of section.items) {
      if (item.tab || item.show === false) continue
      if (HIDDEN_FROM_EXTRA_MENU.has(item.key)) continue
      if (MOBILE_HAMBURGER_KEYS.has(item.key)) continue
      if (onTab.has(item.key)) continue
      if (seen.has(item.key)) continue
      seen.add(item.key)
      links.push({ ...item, section: section.title })
    }
  }
  return links
}

export function resolveMobileRouteName(key) {
  return TAB_SCREEN_MAP[key] || key
}

/** Görev listeleri Tasks sekmesi içindeki yığın ekranları */
export const TASKS_STACK_SCREENS = new Set([
  'TasksHub',
  'TasksPending',
  'TasksCompleted',
  'TasksUpcoming',
])

export function tasksListModeForScreen(screenName) {
  if (screenName === 'TasksPending') return 'pending'
  if (screenName === 'TasksCompleted') return 'completed'
  if (screenName === 'TasksUpcoming') return 'upcoming'
  return undefined
}

/** Tab + görev yığını dahil mobil yönlendirme */
export function navigateMobileRoute(navigation, routeName, params) {
  const name = resolveMobileRouteName(routeName)
  if (TASKS_STACK_SCREENS.has(name)) {
    const listMode = params?.listMode ?? tasksListModeForScreen(name)
    navigation.navigate('Tasks', {
      screen: name,
      params: listMode ? { ...params, listMode } : params,
    })
    return
  }
  navigation.navigate(name, params)
}
