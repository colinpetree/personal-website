import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const [config, setConfig] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    fetch('/api/site-config')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setConfig(data) })
      .catch(() => {})
  }, [])

  // Close mobile menu on navigation
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

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

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Site title / logo */}
        <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-gray-700 transition-colors">
          {siteTitle}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
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
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-gray-500 hover:text-gray-900"
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

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-gray-200 bg-white px-6 py-4 flex flex-col gap-4">
          {navLinks.map(link => (
            <Link
              key={link.key}
              to={link.path}
              className={`text-sm font-medium ${
                location.pathname === link.path ? 'text-gray-900' : 'text-gray-500'
              }`}
            >
              {link.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
