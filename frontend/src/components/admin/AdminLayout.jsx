import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'
import { ToastProvider } from './Toast'
import StaffProfileModal, { AvatarCircle, ROLE_BADGE, ROLE_LABELS } from './StaffProfileModal'

const NAV_GROUPS = [
  {
    label: 'Site Pages',
    items: [
      { to: '/admin/home', label: 'Home' },
      {
        to: '/admin/blog',
        label: 'Blog',
        end: true,
        subItems: [
          { to: '/admin/blog/posts', label: 'Posts' },
          { to: '/admin/blog/comments', label: 'Comments' },
        ],
      },
      { to: '/admin/projects', label: 'Projects' },
      { to: '/admin/about', label: 'About' },
      { to: '/admin/contact', label: 'Contact' },
      { to: '/admin/demo', label: 'AI Demo' },
      { to: '/admin/donate', label: 'Donate' },
    ],
  },
  {
    label: 'System Settings',
    defaultCollapsed: true,
    items: [
      { to: '/admin', label: 'Site Settings', end: true },
      { to: '/admin/accounts', label: 'Staff Accounts' },
      { to: '/admin/users', label: 'Users' },
    ],
  },
]

function getFilteredNavGroups(role) {
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

  if (role === 'editor') {
    return NAV_GROUPS.map(group => {
      if (group.label === 'System Settings') {
        return {
          ...group,
          items: group.items.filter(item => item.label !== 'Site Settings' && item.label !== 'Users'),
        }
      }
      return group
    })
  }

  return NAV_GROUPS
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
  const [showSelfProfile, setShowSelfProfile] = useState(false)

  const isEditorPage = /^\/admin\/blog\/posts\/[^/]+/.test(location.pathname)

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

  const filteredNav = getFilteredNavGroups(admin.role)

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
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 mt-1 rounded-md text-xs text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
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
