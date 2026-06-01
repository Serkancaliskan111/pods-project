import {
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  MessageSquare,
  ClipboardList,
  NotebookPen,
  Rows3,
  Users,
  Shield,
  Activity,
  QrCode,
  CalendarDays,
  Network,
} from 'lucide-react'
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
} from './permissions.js'

function buildOrganizationChildren(permissions, isSystemAdmin) {
  return [
    {
      to: '/admin/companies',
      label: 'Şirketler',
      end: false,
      show: canSeeCompanies(permissions, isSystemAdmin),
    },
    {
      to: '/admin/units',
      label: 'Birimler',
      end: false,
      show: canSeeUnits(permissions, isSystemAdmin),
    },
    {
      to: '/admin/staff',
      label: 'Personeller',
      end: false,
      show: canManageStaff(permissions, isSystemAdmin),
    },
    {
      to: '/admin/roles',
      label: 'Roller',
      end: false,
      show: canSeeRoles(permissions, isSystemAdmin),
    },
  ].filter((c) => c.show)
}

/**
 * Web panel sol menü — yetkilere göre filtrelenir.
 */
export function buildAdminNavItems(permissions, isSystemAdmin) {
  const organizationChildren = buildOrganizationChildren(permissions, isSystemAdmin)

  const menu = [
    {
      to: '/admin',
      label: hasManagementDashboardAccess(permissions, isSystemAdmin)
        ? 'Genel Yönetim'
        : 'Ana Sayfa',
      icon: LayoutDashboard,
      key: 'dashboard',
      end: true,
      show: hasWebPanelAccess(permissions, isSystemAdmin),
    },
    {
      to: '/admin/tasks/pending',
      label: 'Görevler',
      icon: ListChecks,
      key: 'tasks',
      matchPrefix: '/admin/tasks',
      show: canSeeTasks(permissions, isSystemAdmin),
      children: [
        { to: '/admin/tasks/pending', label: 'Bekleyen görevler', end: false },
        { to: '/admin/tasks/completed', label: 'Tamamlanan görevler', end: false },
      ],
    },
    {
      to: '/admin/audit/pending',
      label: 'Denetim',
      icon: ShieldCheck,
      key: 'audit',
      matchPrefix: '/admin/audit',
      show: isSystemAdmin || canApproveTask(permissions),
      children: [
        { to: '/admin/audit/pending', label: 'Onay bekleyenler', end: false },
        { to: '/admin/audit/approved', label: 'Onaylananlar', end: false },
      ],
    },
    {
      to: '/admin/chat',
      label: 'Sohbet',
      icon: MessageSquare,
      key: 'chat',
      show: hasWebPanelAccess(permissions, isSystemAdmin),
    },
    {
      to: '/admin/calendar',
      label: 'Takvim',
      icon: CalendarDays,
      key: 'calendar',
      show: hasWebPanelAccess(permissions, isSystemAdmin),
    },
    {
      to: '/admin/customer-ratings',
      label: 'Müşteri Anketi',
      icon: QrCode,
      key: 'customer-ratings',
      show: canManageCustomerRatings(permissions, isSystemAdmin),
    },
    {
      to: '/admin/task-templates',
      label: 'Görev Şablonları',
      icon: ClipboardList,
      key: 'templates',
      show: canSeeTaskTemplates(permissions, isSystemAdmin),
    },
    {
      to: '/admin/personal-todo',
      label: 'To-Do List',
      icon: NotebookPen,
      key: 'personal-todo',
      show: hasWebPanelAccess(permissions, isSystemAdmin),
    },
    {
      to: '/admin/companies',
      label: 'Organizasyon',
      icon: Network,
      key: 'organization',
      show: organizationChildren.length > 0,
      children: organizationChildren,
    },
    {
      to: '/admin/presence',
      label: 'Canlı Durum',
      icon: Activity,
      key: 'presence',
      show: canManageStaff(permissions, isSystemAdmin),
    },
  ]
  return menu.filter((i) => i.show)
}
