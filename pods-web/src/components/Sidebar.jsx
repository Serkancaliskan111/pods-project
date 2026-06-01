import { useContext, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  MessageSquare,
  ClipboardList,
  Building2,
  Rows3,
  Users,
  Shield,
  Activity,
  QrCode,
  NotebookPen,
} from 'lucide-react'
import { AuthContext } from '../contexts/AuthContext.jsx'
import {
  hasWebPanelAccess,
  canSeeCompanies,
  canSeeUnits,
  canManageStaff,
  canEditStaffRecord,
  canSeeRoles,
  canSeeTaskTemplates,
  canSeeTasks,
  canApproveTask,
  hasManagementDashboardAccess,
  canManageCustomerRatings,
} from '../lib/permissions.js'
import { cn } from '../lib/cn'

export default function Sidebar() {
  const { personel, profile, signOut } = useContext(AuthContext)
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  const items = useMemo(() => {
    const menu = [
      {
        to: '/admin',
        label: hasManagementDashboardAccess(permissions, isSystemAdmin)
          ? 'Genel Yönetim'
          : 'Ana Sayfa',
        icon: LayoutDashboard,
        key: 'dashboard',
        show:
          hasWebPanelAccess(permissions, isSystemAdmin),
      },
      {
        to: '/admin/tasks',
        label: 'Görevler',
        icon: ListChecks,
        key: 'tasks',
        show: canSeeTasks(permissions, isSystemAdmin),
      },
      {
        to: '/admin/audit',
        label: 'Denetim',
        icon: ShieldCheck,
        key: 'audit',
        show: isSystemAdmin || canApproveTask(permissions),
      },
      {
        to: '/admin/chat',
        label: 'Sohbet',
        icon: MessageSquare,
        key: 'chat',
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
        label: 'To Do List',
        icon: NotebookPen,
        key: 'personal-todo',
        show: hasWebPanelAccess(permissions, isSystemAdmin),
      },
      {
        to: '/admin/companies',
        label: 'Şirketler',
        icon: Building2,
        key: 'companies',
        show: canSeeCompanies(permissions, isSystemAdmin),
      },
      {
        to: '/admin/units',
        label: 'Birimler',
        icon: Rows3,
        key: 'units',
        show: canSeeUnits(permissions, isSystemAdmin),
      },
      {
        to: '/admin/staff',
        label: 'Personeller',
        icon: Users,
        key: 'staff',
        show: canManageStaff(permissions, isSystemAdmin),
      },
      {
        to: '/admin/roles',
        label: 'Roller',
        icon: Shield,
        key: 'roles',
        show: canSeeRoles(permissions, isSystemAdmin),
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
  }, [permissions, isSystemAdmin])

  const displayName =
    profile?.ad && profile?.soyad
      ? `${profile.ad} ${profile.soyad}`
      : profile?.ad_soyad || profile?.email || 'Oturum açmış kullanıcı'

  // Kendi profilini düzenleme kestirmesi: `personel.yonet` yoksa bile
  // `rol.yonet` sahibi kullanıcı kendi rolünü değiştirebilmek için bu linke
  // ihtiyaç duyar (Personeller menüsü ona kapalıdır).
  const canEditOwnProfile =
    !!personel?.id &&
    canEditStaffRecord(permissions, isSystemAdmin, { isOwnRecord: true })
  const ownProfilePath = canEditOwnProfile
    ? `/admin/staff/edit/${personel.id}`
    : null

  return (
    <aside className="sidebar fixed left-0 top-0 z-[9999] flex h-screen w-[260px] flex-col border-r border-primary-800 text-white">
      <div className="!border-b !border-slate-800" style={{ padding: '24px' }}>
        <div className="!flex !min-w-0 !flex-col">
          <div className="!flex !min-w-0 !flex-col">
            <span
              className="!text-sm !font-semibold !tracking-tight"
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: 'white',
                letterSpacing: -0.5,
              }}
            >
              PODS Yönetim Paneli
            </span>
            {ownProfilePath ? (
              <NavLink
                to={ownProfilePath}
                title="Profilimi düzenle"
                className="!mt-0.5 !text-[11px] !text-slate-300 !truncate hover:!text-white"
                style={{
                  textDecoration: 'none',
                  display: 'inline-block',
                  maxWidth: '100%',
                }}
              >
                {displayName}
              </NavLink>
            ) : (
              <span className="!mt-0.5 !text-[11px] !text-slate-400 !truncate">
                {displayName}
              </span>
            )}
            {personel?.roleName && (
              <span className="!mt-0.5 !text-[10px] !text-slate-500 !truncate">
                Rol: {personel.roleName}
              </span>
            )}
          </div>
        </div>
      </div>

      <nav className="sidebar-scroll !flex-1 !py-4 !overflow-y-auto">
        {items.length === 0 ? (
          <div
            style={{
              padding: '20px 20px 20px 20px',
              fontSize: 12,
              color: '#94a3b8',
            }}
          >
            Görüntülenecek menü yok. Yetkilerinizi kontrol edin.
          </div>
        ) : (
          items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin' || to === '/admin/tasks'}
              className={({ isActive }) =>
                cn('nav-item mx-1 mb-1 flex items-center gap-3 no-underline', isActive && 'active !font-semibold')
              }
            >
              {Icon ? <Icon className="shrink-0" size={18} strokeWidth={2} /> : null}
              <span className="truncate">{label}</span>
            </NavLink>
          ))
        )}
      </nav>

      <div
        style={{
          padding: '20px 20px 20px',
          borderTop: '1px solid #1f2937',
        }}
      >
        <button
          type="button"
          onClick={signOut}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 9999,
            border: 'none',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Çıkış
        </button>
      </div>
    </aside>
  )
}
