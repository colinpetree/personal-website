import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { ToastProvider } from '../../context/ToastContext'
import StaffProfileModal, { AvatarCircle, ROLE_BADGE, ROLE_LABELS } from './StaffProfileModal'
import { useSiteConfig } from '../../hooks/useSiteConfig'

// Deployment-time flag — matches the one router.jsx uses to exclude the AI demo
// routes; keeps this sidebar link from pointing at a route that doesn't exist.
const AI_DEMOS_ENABLED = import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'

// One entry per site page key — reordered per the admin's saved nav order
// (see ReorderNavModal.jsx / SiteConfig.nav_order) rather than fixed here.
const SITE_PAGE_LOOKUP = {
  home: { to: '/admin/home', label: 'Home' },
  blog: {
    to: '/admin/blog',
    label: 'Blog',
    end: true,
    subItems: [
      { to: '/admin/blog/posts', label: 'Posts' },
      { to: '/admin/blog/comments', label: 'Comments' },
    ],
  },
  projects: { to: '/admin/projects', label: 'Projects' },
  about: { to: '/admin/about', label: 'About' },
  contact: { to: '/admin/contact', label: 'Contact' },
  ai_demo: { to: '/admin/demo', label: 'AI Demo' },
  payment: { to: '/admin/payment', label: 'Payment' },
}

const DEFAULT_NAV_ORDER = ['home', 'blog', 'projects', 'about', 'contact', 'ai_demo', 'payment']

function buildNavGroups(navOrder) {
  const order = navOrder && navOrder.length ? navOrder : DEFAULT_NAV_ORDER
  // The sidebar always lists every site page (regardless of the page's
  // public enabled/disabled state), just in the configured order.
  const sitePages = order
    .filter(key => key !== 'ai_demo' || AI_DEMOS_ENABLED)
    .map(key => SITE_PAGE_LOOKUP[key])
    .filter(Boolean)

  return [
    { label: 'Site Pages', items: sitePages },
    {
      label: 'System Settings',
      defaultCollapsed: true,
      items: [
        { to: '/admin/settings', label: 'Site Settings' },
        { to: '/admin/accounts', label: 'Staff Accounts' },
        { to: '/admin/users', label: 'Users' },
      ],
    },
  ]
}

const METRICS_NAV_ITEMS = [
  { to: '/admin', label: 'Site', end: true },
  { to: '/admin/metrics/blog', label: 'Blog' },
]

function getFilteredNavGroups(role, navOrder) {
  if (role === 'contributor') {
    return [
      {
        label: 'Blog',
        items: [
          { to: '/admin/blog/posts', label: 'Posts' },
        ],
      },
    ]
  }

  const navGroups = buildNavGroups(navOrder)
  // Metrics is editor+ (same threshold as its route's RoleGuard) — the
  // Site Settings/Users entries inside "System Settings" are further
  // restricted below for editors specifically.
  const withMetrics = [{ label: 'Metrics', items: METRICS_NAV_ITEMS }, ...navGroups]

  if (role === 'editor') {
    return withMetrics.map(group => {
      if (group.label === 'System Settings') {
        return {
          ...group,
          items: group.items.filter(item => item.label !== 'Site Settings' && item.label !== 'Users'),
        }
      }
      return group
    })
  }

  return withMetrics
}

function NavGroup({ label, items, defaultCollapsed = false }) {
  const [open, setOpen] = useState(!defaultCollapsed)

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

  const isEditorPage = /^\/admin\/blog\/posts\/[^/]+/.test(location.pathname)
    || /^\/admin\/(home|about|projects|contact|payment|demo|blog)\/edit/.test(location.pathname)

  useEffect(() => {
    if (!loading && !admin) navigate('/admin/login', { replace: true })
  }, [admin, loading, navigate])

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

  const filteredNav = getFilteredNavGroups(admin.role, config?.nav?.map(n => n.key))

  return (
    <ToastProvider>
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      {!isEditorPage && <aside className="w-52 shrink-0 bg-gray-900 flex flex-col relative">
        <div className="px-5 py-5 border-b border-gray-700 shrink-0">
          <span className="text-white font-semibold text-sm">Admin Panel</span>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto" style={{ paddingBottom: '6rem' }}>
          {filteredNav.map(group => (
            <NavGroup
              key={group.label}
              label={group.label}
              items={group.items}
              defaultCollapsed={group.defaultCollapsed}
            />
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 px-3 py-4 border-t border-gray-700 bg-gray-900">
          <button
            onClick={() => setShowSelfProfile(true)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-gray-800 transition-colors text-left"
          >
            <AvatarCircle name={admin.full_name} avatarFilename={admin.avatar_filename} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-300 truncate">{admin.full_name}</p>
              <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full leading-none mt-0.5 ${ROLE_BADGE[admin.role] || 'bg-gray-700 text-gray-400'}`}>
                {ROLE_LABELS[admin.role] || admin.role}
              </span>
            </div>
          </button>
          <a
            href="/api/admin/enter-public-site"
            className="block w-full px-3 py-2 mt-1 rounded-md text-xs text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Sign in to public site
          </a>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-md text-xs text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>}

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
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
