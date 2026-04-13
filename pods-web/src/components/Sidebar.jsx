import { useContext, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Rows3,
  Users,
  Shield,
  ListChecks,
  ClipboardList,
  Activity,
} from 'lucide-react'
import { AuthContext } from '../contexts/AuthContext.jsx'
import {
  hasWebPanelAccess,
  canSeeCompanies,
  canSeeUnits,
  canManageStaff,
  canSeeRoles,
  canSeeTaskTemplates,
  canSeeTasks,
  hasManagementDashboardAccess,
} from '../lib/permissions.js'

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
        to: '/admin/presence',
        label: 'Canli Durum',
        icon: Activity,
        key: 'presence',
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
        to: '/admin/task-templates',
        label: 'Görev Şablonları',
        icon: ClipboardList,
        key: 'templates',
        show: canSeeTaskTemplates(permissions, isSystemAdmin),
      },
      {
        to: '/admin/tasks',
        label: 'İşler',
        icon: ListChecks,
        key: 'tasks',
        show: canSeeTasks(permissions, isSystemAdmin),
      },
    ]
    return menu.filter((i) => i.show)
  }, [permissions, isSystemAdmin])

  const displayName =
    profile?.ad && profile?.soyad
      ? `${profile.ad} ${profile.soyad}`
      : profile?.ad_soyad || profile?.email || 'Oturum açmış kullanıcı'

  return (
    <aside
      style={{
        backgroundColor: '#0a1e42',
        width: '260px',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        color: 'white',
        zIndex: 9999,
        borderRight: '1px solid #1e293b',
      }}
      className="!bg-[#0a1e42] !w-64 !h-screen !fixed !left-0 !top-0 !flex !flex-col !text-slate-300 !border-r !border-slate-800"
    >
      <div className="!border-b !border-slate-800" style={{ padding: '24px' }}>
        <div className="!flex !items-center !gap-3">
          <div className="!flex !h-9 !w-9 !items-center !justify-center !rounded-2xl !bg-indigo-600 !shadow-lg">
            <span className="!text-base !font-black !tracking-tight !text-white"></span>
          </div>
          <div className="!flex !flex-col !min-w-0">
            <span
              className="!text-sm !font-semibold !tracking-tight"
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: 'white',
                letterSpacing: -0.5,
              }}
            >
              PODS Yönetim Paneli
            </span>
            <span className="!mt-0.5 !text-[11px] !text-slate-400 !truncate">
              {displayName}
            </span>
            {personel?.roleName && (
              <span className="!mt-0.5 !text-[10px] !text-slate-500 !truncate">
                Rol: {personel.roleName}
              </span>
            )}
          </div>
        </div>
      </div>

      <nav className="!flex-1 !py-4 !overflow-y-auto">
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
              end={to === '/admin'}
              style={({ isActive }) => ({
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '13px 20px',
                margin: '10px 12px',
                borderRadius: 12,
                color: '#ffffff',
                backgroundColor: isActive ? '#e95422' : 'transparent',
                fontWeight: isActive ? 'bold' : 'normal',
                transition: 'all 0.2s',
              })}
            >
              {Icon && (
                <Icon
                  className="!mr-3 !shrink-0"
                  size={18}
                  strokeWidth={2}
                />
              )}
              <span className="!truncate">{label}</span>
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
