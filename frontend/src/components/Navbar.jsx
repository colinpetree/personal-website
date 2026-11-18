import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useLocation, useMatches } from 'react-router'
import { Search, ArrowLeft } from 'lucide-react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { startsWithOverlayHeader } from '../utils/headerLayout'
import SignInRequiredModal from './SignInRequiredModal'
import SearchModal from './SearchModal'
import OverflowNav from './OverflowNav'
import NavAnchor, { navItemIsActive } from './NavAnchor'
import { getInitials } from '../utils/getInitials'

// Shared by every nav-link-shaped control (desktop nav links, Sign in) so
// the hover chip and the transparent/solid text colors stay in sync in one
// place instead of being repeated at each call site.
function navItemClass(active, transparent) {
  const color = transparent
    ? (active ? 'text-white' : 'text-white/75 hover:text-white')
    : (active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900')
  const hoverBg = transparent ? 'hover:bg-gray-400/30' : 'hover:bg-gray-400/10'
  // whitespace-nowrap + flex-shrink-0: a flex item's default min-width:auto
  // otherwise lets the browser wrap/shrink a multi-word label (e.g. "AI
  // Demos") below its measured natural width once OverflowNav.jsx's row
  // gets tight, the JS width calculation there is what should decide
  // whether an item fits, not the browser wrapping text as a fallback. If
  // it truly doesn't fit, this makes the row overflow (clipped by
  // OverflowNav's own overflow-hidden) instead of visibly wrapping.
  return `text-sm font-medium rounded-md px-3 py-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${hoverBg} ${color}`
}

function SearchButton({ className = '', transparent = false }) {
  const [showSearchModal, setShowSearchModal] = useState(false)
  return (
    <>
      <button
        onClick={() => setShowSearchModal(true)}
        aria-label="Search"
        className={`rounded-full p-2 transition-colors ${transparent ? 'hover:bg-gray-400/30 text-white/75 hover:text-white' : 'hover:bg-gray-400/10 text-gray-500 hover:text-gray-900'} ${className}`}
      >
        <Search size={18} />
      </button>
      {showSearchModal && <SearchModal onClose={() => setShowSearchModal(false)} />}
    </>
  )
}

// Whether the current page starts with a header that the navbar should
// overlay transparently (full, split, fullscreen, linear, linear-split; see
// utils/headerLayout.js). Each page route that renders admin-edited content
// exports `handle.navOverlayHtml({ config, data })`, returning the HTML it
// will actually render at the top of the page (or null when it renders
// something else, e.g. a disabled page's 404 or a docs page). Deciding this
// during render, from the same config and loader data the page itself
// renders from, means the server-rendered/prerendered HTML already has the
// navbar fixed and transparent: no layout shift on hydrate, and the
// browser's scroll restore on reload lines up with the hydrated page.
function useRouteNavOverlay(config) {
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const getHtml = leaf?.handle?.navOverlayHtml
  if (typeof getHtml !== 'function') return false
  return startsWithOverlayHeader(getHtml({ config, data: leaf.data }))
}

export default function Navbar() {
  const { config } = useSiteConfig()
  const overlay = useRouteNavOverlay(config)
  const [menuOpen, setMenuOpen] = useState(false)
  // Mobile menu's secondary pane (a parent link's children). Index and open
  // flag are separate so the pane keeps its content while sliding back out.
  const [submenuIndex, setSubmenuIndex] = useState(null)
  const [submenuOpen, setSubmenuOpen] = useState(false)
  const submenuPaneRef = useRef(null)
  const backButtonRef = useRef(null)
  const parentRowRefs = useRef([])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [showSignInModal, setShowSignInModal] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // Starts hidden on an overlay page so the prerendered HTML doesn't paint a
  // gray rule under the transparent navbar before the effects below run.
  const [borderVisible, setBorderVisible] = useState(!overlay)
  const userMenuRef = useRef(null)
  const headerRef = useRef(null)
  const justNavigatedRef = useRef(true)
  const location = useLocation()
  const { user, logout } = useUserAuth()
  // menuOpen forces the navbar solid even before scrolling: the mobile menu panel doesn't
  // cover the navbar itself (intentional), so a still-transparent bar would let a
  // fullscreen/split/full-width header show through behind the open menu's nav links.
  const transparent = !!overlay && !scrolled && !menuOpen

  // The prerendered HTML can't know the scroll position, so it always ships
  // the top-of-page (transparent) navbar. Until hydration takes over, the
  // `navbar-prehydrate` class lets CSS alone turn it solid once the page is
  // scrolled (a scroll-driven animation, see index.css): a reload partway
  // down, or a visitor without JavaScript, would otherwise get white navbar
  // text over the page body. Server and first client render both include
  // the class (so hydration matches); this effect drops it in the same
  // effect flush where the scroll listener below sets `scrolled`.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // Fullscreen-header pages (see useRouteNavOverlay above) want the navbar to
  // overlay transparently on top of the header (white text, no background)
  // so the header gets the whole viewport for its cinematic effect, then
  // flip to the normal solid navbar as soon as the user scrolls even a
  // little. A plain boolean threshold (not a scroll-linked drag), the
  // color/background transition is handled by `transition-colors` in the
  // className below, not by JS.
  useEffect(() => {
    if (!overlay) { setScrolled(false); return }
    function onScroll() { setScrolled(window.scrollY > 10) }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [overlay])

  // `overlay` flips whenever the route changes to a page with a different
  // leading header, and each time it does, the header's (and its
  // nav links'/buttons') colors should snap straight to the new page's
  // top-of-page state instead of visibly crossfading from the previous
  // page's, there's nothing to transition FROM, it's a different page.
  // `.navbar-no-transition *` (index.css) kills every transition in the
  // subtree; toggling it via direct DOM writes in a layout effect (not
  // React state) makes the disable land in the very same paint as the
  // color change, a state-driven version of this raced the paint (still
  // showed a ~100ms fade) because the state update needed its own extra
  // render before the class actually landed in the DOM. The forced reflow
  // (`offsetHeight` read) is required so the browser commits the
  // "transitions off" style before re-enabling them on the next frame,
  // without it the two writes can get batched into one style
  // recalculation and the disable never visibly takes effect.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.classList.add('navbar-no-transition')
    void el.offsetHeight
    const raf = requestAnimationFrame(() => el.classList.remove('navbar-no-transition'))
    // Also snap the border straight to its correct state here, before
    // paint, see the effect below for why the border's reveal (but not
    // its hide) is otherwise delayed to match the background's fade.
    // Landing on a page is not a "reveal", there's nothing to delay for.
    justNavigatedRef.current = true
    setBorderVisible(!transparent)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])

  // Opening/closing the mobile menu should snap the navbar's color instantly (white while
  // the menu's open, since its panel doesn't cover the navbar itself), not play the same
  // 300ms fade used for the scroll-driven transparent-to-white flip, same
  // disable-transition-then-force-reflow trick as the route-change effect above, and same
  // justNavigatedRef trick to make the border snap instead of its normal delayed reveal.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    el.classList.add('navbar-no-transition')
    void el.offsetHeight
    const raf = requestAnimationFrame(() => el.classList.remove('navbar-no-transition'))
    justNavigatedRef.current = true
    setBorderVisible(!transparent)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  // The border has no in-between visual state the way a color fade does,
  // it's either there or not, so animating it in sync with the
  // background's 300ms fade reads as lagging behind (a hairline's alpha
  // ramp is far less perceptible than a full-bleed fill's identical ramp).
  // Snapping it instantly fixes that for the disappear direction, but for
  // the appear direction it then shows an empty outline that visibly waits
  // for the background fill to catch up to it. So: disappear instantly
  // (matches the background starting to fade out), but delay the
  // appearance until the background's own fade has finished, so the two
  // resolve together instead of the border finishing first.
  useEffect(() => {
    if (justNavigatedRef.current) { justNavigatedRef.current = false; return }
    if (transparent) { setBorderVisible(false); return }
    const timer = setTimeout(() => setBorderVisible(true), 300)
    return () => clearTimeout(timer)
  }, [transparent])

  // Close mobile menu on navigation
  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false) }, [location.pathname])

  // The mobile menu always reopens on its primary pane. The menu is already
  // display:none by the time this runs, so the slide back doesn't play.
  useEffect(() => { if (!menuOpen) setSubmenuOpen(false) }, [menuOpen])

  function openSubmenu(index) {
    if (submenuPaneRef.current) submenuPaneRef.current.scrollTop = 0
    setSubmenuIndex(index)
    setSubmenuOpen(true)
  }

  function closeSubmenu() {
    setSubmenuOpen(false)
  }

  // Move focus with the slide, so keyboard and screen reader users land in
  // the pane that's now showing (the other one just went inert). Skipped when
  // the reset above runs on menu close. preventScroll keeps the browser from
  // scrolling the overflow-hidden track sideways to reach the focused button.
  const submenuWasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = submenuWasOpenRef.current
    submenuWasOpenRef.current = submenuOpen
    if (!menuOpen) return
    if (submenuOpen) backButtonRef.current?.focus({ preventScroll: true })
    else if (wasOpen) parentRowRefs.current[submenuIndex]?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submenuOpen])

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

  // Ghost-style freeform {label, url} pairs, replaces the old fixed
  // 7-page-key nav_order/*_enabled system entirely (that system, and the
  // `config.nav` field it fed, are gone). No `enabled` filter needed: every
  // entry here is meant to render, unlike the old system's per-page toggle.
  const navLinks = config?.primary_navigation ?? []
  const submenuItem = submenuIndex !== null && navLinks[submenuIndex]?.children?.length
    ? navLinks[submenuIndex]
    : null
  const siteTitle = config?.site_title ?? ''
  const usersEnabled = config?.users_enabled ?? false

  return (
    <header
      ref={headerRef}
      className={`z-50 border-b transition-[background-color] duration-300 ${
        overlay ? 'fixed top-0 left-0 right-0' : 'sticky top-0'
      } ${transparent ? 'bg-transparent' : 'bg-white'} ${borderVisible ? 'border-gray-200' : 'border-transparent'}${
        transparent && !hydrated ? ' navbar-prehydrate' : ''
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Site title / logo */}
        {config ? (() => {
          const titleLink = config?.site_title_link || '/'
          const titleClassName = `flex-shrink-0 whitespace-nowrap text-lg font-semibold transition-colors ${
            transparent ? 'text-white hover:text-white/80' : 'text-gray-900 hover:text-gray-700'
          }`
          // Same internal-vs-external check as the nav links (see
          // OverflowNav.jsx's isInternalPath), site_title_link is a freely
          // typed field with no format restriction, so it needs the same
          // plain-<a>-for-external-URLs treatment or an external value
          // would get swallowed into a broken in-app <Link> navigation.
          return titleLink.startsWith('/') ? (
            <Link to={titleLink} className={titleClassName}>{siteTitle}</Link>
          ) : (
            <a href={titleLink} className={titleClassName}>{siteTitle}</a>
          )
        })() : (
          <div className="w-32 h-4 bg-gray-100 rounded animate-pulse" />
        )}

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 min-w-0 flex-1">
          {!config && (
            <>
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-4 bg-gray-100 rounded animate-pulse" />
            </>
          )}
          {config && (
            <OverflowNav links={navLinks} transparent={transparent} navItemClass={navItemClass} />
          )}

          <div className="flex items-center gap-1 flex-shrink-0">
            {usersEnabled ? (
              user ? (
                <>
                  <SearchButton transparent={transparent} />
                  <div className="relative ml-2" ref={userMenuRef}>
                    <button
                      onClick={() => setUserMenuOpen(o => !o)}
                      className="flex items-center gap-2 focus:outline-none"
                    >
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center leading-none text-sm font-semibold text-gray-600">
                          <span className="translate-y-px">{getInitials(user.name)}</span>
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
                  <SearchButton transparent={transparent} />
                  <button
                    onClick={() => setShowSignInModal(true)}
                    className={navItemClass(false, transparent)}
                  >
                    Sign in
                  </button>
                </>
              )
            ) : (
              <SearchButton transparent={transparent} />
            )}
          </div>
        </nav>

        {/* Mobile hamburger */}
        <div className="md:hidden flex items-center gap-1">
          <SearchButton transparent={transparent} />
          <button
            className={`rounded-full p-2 transition-colors ${transparent ? 'hover:bg-gray-400/30 text-white/75 hover:text-white' : 'hover:bg-gray-400/10 text-gray-500 hover:text-gray-900'}`}
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

      {/* Mobile menu - full-height overlay directly below the sticky header. No transition
          on open/close; it's simply shown/hidden. Marked inert while hidden to keep its links
          out of the tab order / a11y tree until opened. md:hidden already makes it
          display:none at desktop widths regardless.

          Inside it are two stacked panes. The primary pane holds the site links; the
          secondary pane has a "<- Home" back button, the tapped link's label as a small
          gray heading, then its sub-links. A link with sub-links looks like any other link.

          Switching panes is one crossfade, modeled on openai.com's mobile menu (measured
          frame by frame): both panes animate at the same time, 200ms, CSS `ease`, and both
          move 8px in the same direction. Opening a submenu, the primary pane fades out
          drifting up while the secondary pane fades in rising up into place; going back is
          the exact reverse (both drift down). Each pane scrolls on its own, and whichever
          one isn't showing is inert + aria-hidden + pointer-events-none. The panes are
          stacked in the same spot, so the hidden one sits invisibly on top of (or under)
          the visible one: inert alone lets taps and scrolls pass through it, but browsers
          from before inert support (Safari < 15.5, Chrome < 102) would let the invisible
          pane swallow every tap, so pointer-events-none makes that explicit. */}
      <nav
        inert={!menuOpen}
        aria-hidden={!menuOpen}
        className={`md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-white overflow-hidden ${
          menuOpen ? 'block' : 'hidden'
        }`}
      >
        <div
          inert={submenuOpen}
          aria-hidden={submenuOpen}
          className={`absolute inset-0 overflow-y-auto px-6 pt-2 pb-8 flex flex-col gap-1 transition-[opacity,transform] duration-200 ease-[ease] motion-reduce:transition-none ${
            submenuOpen ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
        >
          {navLinks.map((link, i) => {
            // Type scale matches openai.com's mobile menu (measured): 32px, medium
            // weight, ~1.15 line height, -0.02em tracking, rows 53px apart (the
            // 12px of padding plus the pane's 4px gap). Sub-links use the same.
            const className = `text-[32px] leading-[1.15] tracking-[-0.02em] font-medium -mx-3 px-3 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 ${
              navItemIsActive(link, location.pathname) ? 'text-gray-900' : 'text-gray-500'
            }`
            if (link.children?.length) {
              return (
                <button
                  key={i}
                  type="button"
                  ref={el => { parentRowRefs.current[i] = el }}
                  onClick={() => openSubmenu(i)}
                  aria-haspopup="true"
                  aria-expanded={submenuOpen && submenuIndex === i}
                  className={`${className} text-left`}
                >
                  {link.label}
                </button>
              )
            }
            return (
              <NavAnchor key={i} url={link.url} label={link.label} onClick={() => setMenuOpen(false)} className={className} />
            )
          })}
          {/* Account rows: the same type scale as the links (openai.com's "Login"
              matches its links' size), in a lighter gray so they read as secondary. */}
          {usersEnabled && (
            user ? (
              <>
                <div className="border-t border-gray-200 mt-4 pt-6 mb-4 flex items-center gap-3">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center leading-none text-base font-semibold text-gray-600">
                      <span className="translate-y-px">{getInitials(user.name)}</span>
                    </div>
                  )}
                  <span className="text-lg font-medium text-gray-900">{user.name}</span>
                </div>
                <Link to="/profile" onClick={() => setMenuOpen(false)} className="text-left text-[32px] leading-[1.15] tracking-[-0.02em] font-medium text-gray-400 -mx-3 px-3 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200">Profile</Link>
                <button onClick={logout} className="text-left text-[32px] leading-[1.15] tracking-[-0.02em] font-medium text-gray-400 -mx-3 px-3 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200">Sign out</button>
              </>
            ) : (
              <>
                {/* Divider spaced like the signed-in name row's top border, setting the
                    account row apart from the site links (as openai.com does). */}
                <div aria-hidden="true" className="border-t border-gray-200 mt-4 mb-5" />
                <button onClick={() => setShowSignInModal(true)} className="text-left text-[32px] leading-[1.15] tracking-[-0.02em] font-medium text-gray-400 -mx-3 px-3 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200">Sign in</button>
              </>
            )
          )}
        </div>

        {/* Secondary pane: the tapped parent's sub-links. Keeps showing the last
            parent's links while it fades back out (submenuIndex isn't cleared). Same
            timing as the primary pane above; keep the two in step. */}
        <div
          ref={submenuPaneRef}
          inert={!submenuOpen}
          aria-hidden={!submenuOpen}
          className={`absolute inset-0 overflow-y-auto px-6 pt-2 pb-8 flex flex-col gap-1 transition-[opacity,transform] duration-200 ease-[ease] motion-reduce:transition-none ${
            submenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
          }`}
        >
          {submenuItem && (
            <>
              {/* Back to the main links: 16px medium (openai.com's size), same color
                  as the links, with a full-width tap target. The accessible name spells out where
                  it goes, since "Home" alone reads like a link to the home page. */}
              <button
                ref={backButtonRef}
                type="button"
                onClick={closeSubmenu}
                aria-label="Home, back to main menu"
                className="text-base leading-5 font-medium -mx-3 px-3 py-2 rounded-lg flex items-center gap-2 text-left text-gray-500 hover:bg-gray-100 active:bg-gray-200"
              >
                <ArrowLeft size={16} aria-hidden="true" className="flex-shrink-0" />
                Home
              </button>
              {/* The link that was tapped to get here, as a plain heading. */}
              <p className="mt-4 mb-1 text-[13px] leading-normal font-medium text-gray-400">{submenuItem.label}</p>
              {submenuItem.children.map((child, j) => (
                <NavAnchor
                  key={j}
                  url={child.url}
                  label={child.label}
                  onClick={() => setMenuOpen(false)}
                  className={`text-[32px] leading-[1.15] tracking-[-0.02em] font-medium -mx-3 px-3 py-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 ${
                    location.pathname === child.url ? 'text-gray-900' : 'text-gray-500'
                  }`}
                />
              ))}
            </>
          )}
        </div>
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
