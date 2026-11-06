import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { Menu, X } from 'lucide-react'

// Sidebar list shared by the desktop aside and the mobile drawer. The
// active page comes from `currentSlug` (the resolved page), not
// useLocation(), so the prerendered HTML and hydration always agree.
// Splits the flat item list into blocks: a label, or a run of consecutive
// pages. Each run gets its own vertical rule, so a label breaks the rule.
function toBlocks(items) {
  const blocks = []
  items.forEach(item => {
    if (item.kind === 'label') {
      blocks.push({ kind: 'label', label: item.label })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'pages') last.pages.push(item)
      else blocks.push({ kind: 'pages', pages: [item] })
    }
  })
  return blocks
}

function DocsNavList({ docs, currentSlug, onNavigate }) {
  const blocks = toBlocks(docs.items)
  return (
    <nav aria-label="Documentation" className="text-sm">
      {blocks.map((block, index) => {
        if (block.kind === 'label') {
          return (
            <p key={`label-${index}`} className={`pb-2 font-semibold text-gray-900 ${index > 0 ? 'pt-5' : ''}`}>
              {block.label}
            </p>
          )
        }
        return (
          <ul key={`pages-${index}`}>
            {block.pages.map((page, pageIndex) => {
              const active = page.slug === currentSlug
              const first = pageIndex === 0
              const last = pageIndex === block.pages.length - 1
              return (
                <li key={page.slug} className="relative">
                  {/* This row's piece of the vertical rule. It starts just
                      above the first tick and stops just below the last, so
                      it doesn't run the full padding of the end rows. */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 w-px bg-gray-200 ${
                      first ? 'top-[calc(50%-0.5rem)]' : 'top-0'
                    } ${last ? 'bottom-[calc(50%-0.5rem)]' : 'bottom-0'}`}
                  />
                  {/* Short tick off the vertical rule; the active page gets
                      a blue dot on the end of its tick. */}
                  <span aria-hidden="true" className="absolute left-0 top-1/2 h-px w-4 bg-gray-200" />
                  {active && (
                    <span aria-hidden="true" className="absolute left-4 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-blue-100" />
                  )}
                  <Link
                    to={`/${page.slug}`}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={`block py-1.5 pl-7 pr-2 leading-snug transition-colors ${
                      active ? 'font-medium text-blue-600' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      })}
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
          <span className="truncate font-medium">{currentTitle || 'Menu'}</span>
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
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pr-6">
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
