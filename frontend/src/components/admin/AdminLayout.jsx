import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { ToastProvider } from './Toast'

const NAV_ITEMS = [
  { to: '/admin', label: 'Settings', end: true },
  { to: '/admin/home', label: 'Home' },
  { to: '/admin/blog', label: 'Blog' },
  { to: '/admin/projects', label: 'Projects' },
  { to: '/admin/about', label: 'About' },
  { to: '/admin/contact', label: 'Contact' },
  { to: '/admin/demo', label: 'AI Demo' },
  { to: '/admin/donate', label: 'Donate' },
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/users', label: 'Users' },
]

export default function AdminLayout() {
  const { admin, loading, logout } = useAdminAuth()
  const navigate = useNavigate()

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

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-gray-900 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">Admin Panel</span>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
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
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-700">
          <p className="px-3 text-xs text-gray-500 mb-2 truncate">{admin.name}</p>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
    </ToastProvider>
  )
}
