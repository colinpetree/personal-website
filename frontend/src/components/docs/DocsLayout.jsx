import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Menu, X } from 'lucide-react'

// Sidebar list shared by the desktop aside and the mobile drawer. The
// active page comes from `currentSlug` (the resolved page), not
// useLocation(), so the prerendered HTML and hydration always agree.
function DocsNavList({ docs, currentSlug, onNavigate }) {
  return (
    <nav aria-label="Documentation" className="text-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-900">{docs.section_name}</p>
      <ul className="border-l border-gray-200">
        {docs.items.map((item, index) => {
          if (item.kind === 'label') {
            return (
              <li key={`label-${index}`} className={`pl-5 pb-1.5 text-xs font-semibold text-gray-900 ${index > 0 ? 'pt-4' : ''}`}>
                {item.label}
              </li>
            )
          }
          const active = item.slug === currentSlug
          return (
            <li key={item.slug} className="relative">
              {/* Short tick off the vertical rule, or the active dot. */}
              {active ? (
                <span aria-hidden="true" className="absolute -left-[4.5px] top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-blue-100" />
              ) : (
                <span aria-hidden="true" className="absolute left-0 top-1/2 h-px w-2.5 bg-gray-200" />
              )}
              <Link
                to={`/${item.slug}`}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`block py-1.5 pl-5 pr-2 leading-snug transition-colors ${
                  active ? 'font-medium text-blue-600' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {item.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Wraps a docs page (see PageView.jsx) with the docs sidebar. The page's
// own <main> is passed in as children untouched; the sidebar just takes
// width away from it. lg+: sticky sidebar in the same max-w-6xl column as
// the navbar, so it lines up under the logo. Below lg: a sticky bar under
// the header opens the same list in a left drawer (no slide animation,
// same as the Navbar mobile menu).
export default function DocsLayout({ docs, currentSlug, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const currentTitle = docs.items.find(i => i.kind === 'page' && i.slug === currentSlug)?.title

  // :slug reuses this component across docs pages, so close the drawer on
  // every page change, not only on link clicks.
  useEffect(() => { setDrawerOpen(false) }, [currentSlug])

  useEffect(() => {
    if (!drawerOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    // The drawer is lg:hidden, so if the window widens past lg (e.g. a
    // tablet rotating) it vanishes; close it so the scroll lock goes too.
    const wide = window.matchMedia('(min-width: 1024px)')
    function onWide() { if (wide.matches) setDrawerOpen(false) }
    onWide()
    wide.addEventListener('change', onWide)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
    }
  }, [drawerOpen])

  return (
    <>
      <div className="lg:hidden sticky top-16 z-30 border-b border-gray-100 bg-white">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex w-full items-center gap-3 px-6 py-2.5 text-left text-sm text-gray-900"
          aria-label="Open documentation menu"
          aria-expanded={drawerOpen}
        >
          <Menu size={18} strokeWidth={1.75} className="shrink-0 text-gray-500" />
          <span className="truncate font-medium">{currentTitle || docs.section_name}</span>
        </button>
      </div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-gray-50 px-6 pt-5 pb-10 shadow-xl">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 -mr-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Close documentation menu"
              >
                <X size={18} />
              </button>
            </div>
            <DocsNavList docs={docs} currentSlug={currentSlug} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:max-w-6xl lg:mx-auto lg:px-6 lg:flex">
        <aside className="hidden lg:block w-60 shrink-0 border-r border-gray-100">
          {/* -ml-2/pl-2: room for the active dot, which sits half outside the
              rule, without the scroll container clipping it. */}
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pr-6 -ml-2 pl-2">
            <DocsNavList docs={docs} currentSlug={currentSlug} />
          </div>
        </aside>
        <div className="docs-content flex-1 min-w-0">
          {children}
        </div>
      </div>
    </>
  )
}
