import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext.jsx'
import { cn } from '../../lib/cn'
import { cubicle } from '../../theme/cubicle'
import { resolveSidebarCssVars } from '../../lib/userUiPreferences'
import { buildAdminNavItems } from '../../lib/adminNav.js'
import CubicleLogo from './CubicleLogo.jsx'
import UserProfileAvatar from '../UserProfileAvatar.jsx'

/** Ana içerik sol boşluğu — dar ray genişliği (hover genişlemesi üstte kalır) */
export const CUBICLE_SIDEBAR_WIDTH = cubicle.sidebarRailWidth

function isPathActive(pathname, to, end, matchPrefix) {
  if (matchPrefix) return pathname === to || pathname.startsWith(`${matchPrefix}/`)
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

function SidebarNavItem({ item, pathname, dense }) {
  const { label, icon: Icon, to, end, children } = item
  const hasChildren = Array.isArray(children) && children.length > 0

  if (!hasChildren) {
    return (
      <li className="cubicle-sidebar__list-item">
        <NavLink
          to={to}
          end={end ?? false}
          className={({ isActive }) =>
            cn('cubicle-sidebar__item', isActive && 'is-active')
          }
        >
          <span className="cubicle-sidebar__surface" aria-hidden />
          <Icon size={22} strokeWidth={1.5} className="cubicle-sidebar__icon" aria-hidden />
          <span className="cubicle-sidebar__label">{label}</span>
        </NavLink>
      </li>
    )
  }

  const groupActive = children.some((child) =>
    isPathActive(pathname, child.to, child.end ?? false, null),
  )

  return (
    <li
      className={cn(
        'cubicle-sidebar__list-item',
        'cubicle-sidebar__list-item--group',
        groupActive && 'is-group-active',
      )}
      tabIndex={-1}
    >
      <div
        className={cn(
          'cubicle-sidebar__item',
          'cubicle-sidebar__item--parent',
          dense && 'cubicle-sidebar__item--parent-dense',
          groupActive && 'is-active',
        )}
      >
        <span className="cubicle-sidebar__surface" aria-hidden />
        <Icon size={22} strokeWidth={1.5} className="cubicle-sidebar__icon" aria-hidden />
        <span className="cubicle-sidebar__label">{label}</span>
      </div>
      <ul className="cubicle-sidebar__sublist">
        {children.map((child) => (
          <li key={child.to} className="cubicle-sidebar__sublist-item">
            <NavLink
              to={child.to}
              end={child.end ?? false}
              className={({ isActive }) =>
                cn('cubicle-sidebar__item', 'cubicle-sidebar__item--sub', isActive && 'is-active')
              }
            >
              <span className="cubicle-sidebar__surface" aria-hidden />
              <span className="cubicle-sidebar__sub-dot" aria-hidden />
              <span className="cubicle-sidebar__label">{child.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </li>
  )
}

export default function CubicleSidebar() {
  const { personel, profile, user } = useContext(AuthContext)
  const location = useLocation()
  const sidebarDisplayName = useMemo(() => {
    const ad = personel?.ad || profile?.ad
    const soyad = personel?.soyad || profile?.soyad
    if (ad || soyad) return [ad, soyad].filter(Boolean).join(' ').trim()
    if (profile?.ad_soyad) return profile.ad_soyad
    return user?.email?.split('@')[0] || 'Profil'
  }, [personel?.ad, personel?.soyad, profile?.ad, profile?.soyad, profile?.ad_soyad, user?.email])
  const navRef = useRef(null)
  const collapseTimerRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const permissions = profile?.yetkiler || {}
  const isSystemAdmin = !!profile?.is_system_admin

  const items = useMemo(
    () => buildAdminNavItems(permissions, isSystemAdmin),
    [permissions, isSystemAdmin],
  )

  const dense = items.length >= 7

  const sidebarStyle = useMemo(
    () => ({
      ...resolveSidebarCssVars(profile?.arayuz_tercihleri),
      '--cubicle-sidebar-collapsed': `${cubicle.sidebarRailWidth}px`,
      '--cubicle-sidebar-expanded': `${cubicle.sidebarExpandedWidth}px`,
    }),
    [profile?.arayuz_tercihleri],
  )

  useEffect(() => {
    const root = navRef.current
    if (!root) return
    const active = root.querySelector('.cubicle-sidebar__item.is-active')
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [location.pathname, items.length])

  useEffect(
    () => () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    },
    [],
  )

  return (
    <aside
      className={cn(
        'cubicle-sidebar',
        expanded && 'is-expanded',
        dense && 'cubicle-sidebar--dense',
      )}
      style={sidebarStyle}
      onMouseEnter={() => {
        if (collapseTimerRef.current) {
          clearTimeout(collapseTimerRef.current)
          collapseTimerRef.current = null
        }
        setExpanded(true)
      }}
      onMouseLeave={() => {
        collapseTimerRef.current = setTimeout(() => {
          setExpanded(false)
          collapseTimerRef.current = null
        }, 120)
      }}
    >
      <div className="cubicle-sidebar__logo">
        <CubicleLogo className="text-white" />
        <span className="cubicle-sidebar__brand">PODS</span>
      </div>

      <nav ref={navRef} className="cubicle-sidebar__nav" aria-label="Ana menü">
        {items.length === 0 ? (
          <p className="cubicle-sidebar__empty">Menü yok</p>
        ) : (
          <ul className="cubicle-sidebar__list">
            {items.map((item) => (
              <SidebarNavItem
                key={item.key}
                item={item}
                pathname={location.pathname}
                dense={dense}
              />
            ))}
          </ul>
        )}
      </nav>

      <div className="cubicle-sidebar__footer">
        <NavLink
          to="/admin/profile"
          aria-label={sidebarDisplayName ? `Profil: ${sidebarDisplayName}` : 'Profil'}
          title={sidebarDisplayName}
          className={({ isActive }) =>
            cn('cubicle-sidebar__profile-link', isActive && 'cubicle-sidebar__profile-link--active')
          }
        >
          <UserProfileAvatar
            photoPath={profile?.profil_foto_yol ?? personel?.profil_foto_yol}
            avatarId={profile?.avatar_id ?? personel?.avatar_id}
            name={sidebarDisplayName}
            size={48}
          />
          <span className="cubicle-sidebar__profile-name">{sidebarDisplayName}</span>
        </NavLink>
      </div>
    </aside>
  )
}
