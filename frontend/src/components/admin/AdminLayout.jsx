import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router'
import { Menu } from 'lucide-react'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { ToastProvider } from '../../context/ToastContext'
import StaffProfileModal, { AvatarCircle, ROLE_BADGE, ROLE_LABELS } from './StaffProfileModal'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import Popover from '../ui/Popover'

// Deployment-time flag — matches the one router.jsx uses to exclude the AI demo
// routes; keeps this sidebar link from pointing at a route that doesn't exist.
const AI_DEMOS_ENABLED = import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'

// Blog keeps its own group (unchanged). Everything else that's still a
// fixed SiteConfig-backed page lives under "Feature Pages", in this fixed
// order — About is gone from this list entirely: it's a regular `Page` now,
// reached through the standalone "Pages" link below, not a fixed page key.
const FEATURE_PAGE_LOOKUP = {
  home: { to: '/admin/home', label: 'Home' },
  projects: { to: '/admin/projects', label: 'Projects' },
  contact: { to: '/admin/contact', label: 'Contact' },
  ai_demo: { to: '/admin/demo', label: 'AI Demo' },
  payment: { to: '/admin/payment', label: 'Payment' },
}

const FEATURE_PAGE_ORDER = ['home', 'projects', 'contact', 'ai_demo', 'payment']

function buildNavGroups() {
  const featurePages = FEATURE_PAGE_ORDER
    .filter(key => key !== 'ai_demo' || AI_DEMOS_ENABLED)
    .map(key => FEATURE_PAGE_LOOKUP[key])

  return [
    {
      label: 'Blog',
      items: [
        { to: '/admin/blog', label: 'Blog', end: true },
        { to: '/admin/blog/posts', label: 'Posts' },
        { to: '/admin/blog/comments', label: 'Comments' },
      ],
    },
    { label: 'Feature Pages', items: featurePages },
    {
      label: 'System Settings',
      defaultCollapsed: true,
      items: [
        { to: '/admin/settings', label: 'Site Settings' },
        { to: '/admin/integrations', label: 'Integrations' },
        { to: '/admin/accounts', label: 'Staff Accounts' },
        { to: '/admin/users', label: 'Users' },
      ],
    },
  ]
}

// adminOnly items require administrator (matches each route's own RoleGuard
// threshold) and are stripped out below for editors.
const METRICS_NAV_ITEMS = [
  { to: '/admin', label: 'Site Metrics', end: true },
  { to: '/admin/metrics/blog', label: 'Blog Metrics' },
  { to: '/admin/metrics/payments', label: 'Payment Metrics', adminOnly: true },
]

// Standalone (not inside a collapsible NavGroup) top-level sidebar link —
// used for Pages below. Contributor-visible like Blog > Posts, per the
// Pages feature plan's locked-in permissions decision (contributors can
// create/edit their own draft pages, same as blog posts).
const PAGES_NAV_ITEM = { standalone: true, to: '/admin/pages', label: 'Pages' }

// Editor+ only (not contributor-visible, unlike Pages above) — matches
// AdminSiteNavigationPage.jsx's own RoleGuard minRole="editor".
const SITE_NAVIGATION_NAV_ITEM = { standalone: true, to: '/admin/navigation', label: 'Site Navigation' }

function getFilteredNavGroups(role) {
  if (role === 'contributor') {
    return [
      PAGES_NAV_ITEM,
      {
        label: 'Blog',
        items: [
          { to: '/admin/blog/posts', label: 'Posts' },
        ],
      },
    ]
  }

  const navGroups = buildNavGroups()
  // Metrics is editor+ (same threshold as its route's RoleGuard).
  const withMetrics = [{ label: 'Metrics', items: METRICS_NAV_ITEMS }, SITE_NAVIGATION_NAV_ITEM, PAGES_NAV_ITEM, ...navGroups]

  if (role === 'editor') {
    // "System Settings" (Site Settings, Staff Accounts, Users) is hidden
    // entirely for editors — every entry in it requires administrator+
    // (matches each route's own RoleGuard threshold), so leaving any of
    // them visible just links to a dead-end "must be administrator"
    // fallback instead of actually being usable.
    return withMetrics
      .filter(group => group.label !== 'System Settings')
      .map(group => group.label === 'Metrics'
        ? { ...group, items: group.items.filter(item => !item.adminOnly) }
        : group
      )
  }

  return withMetrics
}

function StandaloneNavLink({ to, label, onNavigate }) {
  const location = useLocation()
  return (
    <NavLink
      to={to}
      onClick={(e) => { if (location.pathname === to) e.preventDefault(); onNavigate?.() }}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-md text-sm transition-colors mb-2 ${
          isActive
            ? 'bg-gray-700 text-white font-medium'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function NavGroup({ label, items, defaultCollapsed = false, onNavigate }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const location = useLocation()

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span>{label}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 mt-0.5 mb-2">
          {items.map(item => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={(e) => { if (location.pathname === item.to) e.preventDefault(); onNavigate?.() }}
                className={({ isActive }) =>
                  `block px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-700 text-white font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                {item.label}
              </NavLink>
              {item.subItems && (
                <div className="flex flex-col gap-0.5 ml-3 mt-0.5">
                  {item.subItems.map(sub => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      onClick={(e) => { if (location.pathname === sub.to) e.preventDefault(); onNavigate?.() }}
                      className={({ isActive }) =>
                        `block px-3 py-1.5 rounded-md text-xs transition-colors ${
                          isActive
                            ? 'bg-gray-700 text-white font-medium'
                            : 'text-gray-500 hover:text-white hover:bg-gray-800'
                        }`
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  const { admin, loading, logout, refreshAdmin } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.favicon_filename) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = `/api/uploads/${config.favicon_filename}`
    }
  }, [config?.favicon_filename])

  useEffect(() => {
    if (config?.site_title) {
      document.title = `Admin - ${config.site_title}`
    }
  }, [config?.site_title])
  const [showSelfProfile, setShowSelfProfile] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const isEditorPage = /^\/admin\/blog\/posts\/[^/]+/.test(location.pathname)
    || /^\/admin\/pages\/[^/]+/.test(location.pathname)
    || /^\/admin\/(home|projects|contact|payment|demo|blog)\/edit/.test(location.pathname)

  useEffect(() => {
    if (!loading && !admin) navigate('/admin/login', { replace: true })
  }, [admin, loading, navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    )
  }

  if (!admin) return null

  async function handleLogout() {
    await logout()
    navigate('/admin/login')
  }

  const filteredNav = getFilteredNavGroups(admin.role)

  return (
    <ToastProvider>
    <div className="flex h-screen bg-gray-50">
      {!isEditorPage && <>
        {/* Mobile backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-gray-900 flex flex-col overflow-hidden transition-transform duration-200 md:static md:z-auto md:w-52 md:translate-x-0 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="admin-sidebar-scroll flex-1 min-h-0 px-3 py-4 flex flex-col gap-1 overflow-y-auto mt-2">
            {filteredNav.map(group => (
              group.standalone
                ? <StandaloneNavLink key={group.to} to={group.to} label={group.label} onNavigate={() => setMobileNavOpen(false)} />
                : <NavGroup
                    key={group.label}
                    label={group.label}
                    items={group.items}
                    defaultCollapsed={group.defaultCollapsed}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
            ))}
          </nav>

          <div className="shrink-0 px-3 py-3 border-t border-gray-700 bg-gray-900">
            <Popover
              trigger={
                <button className="rounded-full hover:ring-2 hover:ring-gray-700 transition-all" aria-label="Account menu">
                  <AvatarCircle name={admin.full_name} avatarFilename={admin.avatar_filename} size="sm" />
                </button>
              }
              align="start"
              side="top"
              panelClassName="!min-w-[220px]"
            >
              {({ close }) => (
                <div>
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900 truncate">{admin.full_name}</p>
                    <span className={`inline-flex items-center px-1.5 py-1 text-[10px] font-medium rounded-full leading-none mt-1 ${ROLE_BADGE[admin.role] || 'bg-gray-100 text-gray-500'}`}>
                      {ROLE_LABELS[admin.role] || admin.role}
                    </span>
                  </div>
                  <button
                    onClick={() => { setShowSelfProfile(true); close() }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Edit profile
                  </button>
                  <a
                    href="/api/admin/enter-public-site"
                    className="block w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Sign in to public site
                  </a>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </Popover>
          </div>
        </aside>
      </>}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!isEditorPage && (
          <div className="md:hidden flex items-center px-4 py-3 border-b border-gray-200 bg-white shrink-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 -ml-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              aria-label="Open navigation"
            >
              <Menu size={20} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>

    {showSelfProfile && (
      <StaffProfileModal
        account={admin}
        onClose={() => setShowSelfProfile(false)}
        onUpdated={() => { refreshAdmin(); setShowSelfProfile(false) }}
        onRefetch={() => {}}
      />
    )}
    </ToastProvider>
  )
}
