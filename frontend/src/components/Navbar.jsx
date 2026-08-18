import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { Search } from 'lucide-react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import SignInRequiredModal from './SignInRequiredModal'
import SearchModal from './SearchModal'

function SearchButton({ className = '' }) {
  const [showSearchModal, setShowSearchModal] = useState(false)
  return (
    <>
      <button
        onClick={() => setShowSearchModal(true)}
        aria-label="Search"
        className={`text-gray-500 hover:text-gray-900 transition-colors ${className}`}
      >
        <Search size={18} />
      </button>
      {showSearchModal && <SearchModal onClose={() => setShowSearchModal(false)} />}
    </>
  )
}

export default function Navbar() {
  const { config } = useSiteConfig()
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showSignInModal, setShowSignInModal] = useState(false)
  const userMenuRef = useRef(null)
  const location = useLocation()
  const { user, logout } = useUserAuth()

  // Close mobile menu on navigation
  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false) }, [location.pathname])

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Update favicon when site config loads
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

  const navLinks = config?.nav?.filter(n => n.enabled) ?? []
  const siteTitle = config?.site_title ?? ''
  const usersEnabled = config?.users_enabled ?? false

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Site title / logo */}
        {config ? (
          <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors">
            {siteTitle}
          </Link>
        ) : (
          <div className="w-32 h-4 bg-gray-100 rounded animate-pulse" />
        )}

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {!config && (
            <>
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
            </>
          )}
          {navLinks.map(link => (
            <Link
              key={link.key}
              to={link.path}
              className={`text-sm font-medium transition-colors ${
                location.pathname === link.path
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {link.name}
            </Link>
          ))}

          {usersEnabled ? (
            user ? (
              <>
                <SearchButton />
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(o => !o)}
                    className="flex items-center gap-2 focus:outline-none"
                  >
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-44 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                        {user.title && <p className="text-xs text-gray-400 truncate">{user.title}</p>}
                      </div>
                      <Link to="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Profile</Link>
                      <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Sign out</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowSignInModal(true)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Sign in
                </button>
                <SearchButton />
              </>
            )
          ) : (
            <SearchButton />
          )}
        </nav>

        {/* Mobile hamburger */}
        <div className="md:hidden flex items-center">
          <SearchButton className="p-2" />
          <button
            className="p-2 text-gray-500 hover:text-gray-900"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu - full-height overlay directly below the sticky header. No transition;
          it's simply shown/hidden. Marked inert while hidden to keep its links out of the
          tab order / a11y tree until opened. md:hidden already makes it display:none at
          desktop widths regardless. */}
      <nav
        inert={menuOpen ? undefined : ''}
        aria-hidden={!menuOpen}
        className={`md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-white overflow-y-auto px-6 pt-2 pb-8 flex-col gap-1 ${
          menuOpen ? 'flex' : 'hidden'
        }`}
      >
        {navLinks.map(link => (
          <Link
            key={link.key}
            to={link.path}
            onClick={() => setMenuOpen(false)}
            className={`text-2xl font-semibold -mx-3 px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200 ${
              location.pathname === link.path ? 'text-gray-900' : 'text-gray-500'
            }`}
          >
            {link.name}
          </Link>
        ))}
        {usersEnabled && (
          user ? (
            <>
              <div className="border-t border-gray-100 mt-4 pt-6 flex items-center gap-3">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-lg font-medium text-gray-900">{user.name}</span>
              </div>
              <Link to="/profile" onClick={() => setMenuOpen(false)} className="text-lg text-gray-500 -mx-3 px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200">Profile</Link>
              <button onClick={logout} className="text-left text-lg text-gray-500 -mx-3 px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200">Sign out</button>
            </>
          ) : (
            <button onClick={() => setShowSignInModal(true)} className="text-left text-lg text-gray-500 -mx-3 px-3 py-2 rounded-lg hover:bg-gray-100 active:bg-gray-200">Sign in</button>
          )
        )}
      </nav>

      {showSignInModal && (
        <SignInRequiredModal
          onClose={() => setShowSignInModal(false)}
          title="Sign in"
          message={null}
        />
      )}
    </header>
  )
}
