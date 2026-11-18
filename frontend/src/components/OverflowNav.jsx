import { useLayoutEffect, useRef, useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router'
import { MoreHorizontal, ChevronDown } from 'lucide-react'
import NavAnchor from './NavAnchor'
import NavDropdown from './NavDropdown'

// Desktop-only "priority navigation": renders every link from `links` until
// the row would no longer fit its container, then collapses the remainder
// (in original order: first collapsed link on top, last nav link at the
// bottom) into a "more" popover button. Reuses the same hand-rolled
// dropdown pattern already in Navbar.jsx (useState + outside-click
// absolute-positioned panel) rather than adding a new dependency.
//
// A link with `children` renders as a NavDropdown (a button that opens a menu
// of its children) instead. Which dropdown is open lives here, as one
// `openKey`, so only one menu (dropdown or "more") is ever open at a time.
export default function OverflowNav({ links, transparent, navItemClass }) {
  const containerRef = useRef(null)
  const measureRef = useRef(null)
  const moreRef = useRef(null)
  // Starts at 0, not links.length: useLayoutEffect below never runs
  // during server-side prerendering (no real DOM exists in Node to
  // measure), so the prerendered static HTML, and the brief window before
  // client hydration's layout effect corrects it, reflects whatever this
  // initial value is. Starting "full" meant that state was every link
  // rendered unclipped, which could overflow past the site title before
  // JS ever gets a chance to measure and trim it. Starting empty is always
  // safe: worst case a brief flash of just the "more" button, never a
  // flash of overlapping/broken layout.
  const [visibleCount, setVisibleCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  // Index (in `links`) of the open dropdown, or null.
  const [openKey, setOpenKey] = useState(null)
  const location = useLocation()

  // useLayoutEffect (not useEffect) so the trimmed-down link count is what
  // actually paints; otherwise the full untrimmed list would flash for one
  // frame before being cut down, the same reasoning HeaderImageLqip/
  // BlogPostView's LQIP effects use useLayoutEffect for.
  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    function recalc() {
      const available = container.clientWidth
      const itemEls = Array.from(measure.children).slice(0, links.length)
      const moreButtonEl = measure.children[links.length]
      const moreWidth = moreButtonEl ? moreButtonEl.offsetWidth : 0
      let used = 0
      let count = 0
      for (let i = 0; i < itemEls.length; i++) {
        const w = itemEls[i].offsetWidth
        const isLast = i === itemEls.length - 1
        // Every link except the last needs to leave room for the "more"
        // button too, since taking it would still leave something
        // collapsed; the last one doesn't, since taking it means nothing
        // is left to collapse and the "more" button won't render at all.
        const widthNeeded = used + w + (isLast ? 0 : moreWidth)
        if (widthNeeded > available) break
        used += w
        count += 1
      }
      setVisibleCount(count)
    }

    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(container)

    // ResizeObserver only fires when `container`'s OWN box size changes;
    // it does NOT fire when a self-hosted webfont (this site uses
    // @fontsource, not system fonts) finishes loading partway through and
    // reflows the *text inside* each link to its real, final width. If the
    // very first recalc() above ran against fallback-font metrics (narrower
    // than the real font), it can under-measure every item and let far too
    // many "fit," and since the container's own size never changed, nothing
    // ever re-triggers a correction. Re-running once fonts are ready (and
    // once more on the next frame, for any other late layout settling,
    // e.g. images/scrollbars affecting the header's own width) catches that.
    let cancelled = false
    const safeRecalc = () => { if (!cancelled) recalc() }
    if (document.fonts?.ready) document.fonts.ready.then(safeRecalc)
    const raf = requestAnimationFrame(safeRecalc)

    return () => { cancelled = true; ro.disconnect(); cancelAnimationFrame(raf) }
  }, [links])

  useEffect(() => {
    if (!moreOpen) return
    function handle(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [moreOpen])

  useEffect(() => { setMoreOpen(false); setOpenKey(null) }, [location.pathname])

  // A dropdown that collapses into "more" (window narrowed while it was
  // open) shouldn't stay open as an orphan.
  useEffect(() => {
    if (openKey !== null && openKey >= visibleCount) setOpenKey(null)
  }, [openKey, visibleCount])

  // Key-specific close: a dropdown's delayed close (see NavDropdown) can fire
  // after another dropdown has already opened, and must not close that one.
  const closeDropdown = useCallback(key => setOpenKey(k => (k === key ? null : k)), [])

  const visible = links.slice(0, visibleCount)
  const collapsed = links.slice(visibleCount)

  return (
    // No overflow-hidden on this outer element: the "more" popover is a
    // descendant of it and needs to render outside the clipped links row
    // below (an ancestor's overflow-hidden clips absolutely-positioned
    // descendants regardless of their own position, which was silently
    // hiding the popover even while open). Dropdown menus inside the
    // clipped row get around it by being position: fixed (see NavDropdown).
    <div ref={containerRef} className="relative flex items-center justify-end gap-1 min-w-0 flex-1">
      <div className="flex items-center justify-end gap-1 min-w-0 flex-1 overflow-hidden">
        {/* Hidden measurement row: every link plus a "more" button
            rendered at natural width, absolutely positioned off-screen so
            it doesn't affect layout but its children's offsetWidth is
            measurable. A parent's span includes its chevron, matching the
            NavDropdown button it measures for. */}
        <div ref={measureRef} aria-hidden="true" className="absolute -left-[9999px] top-0 flex items-center gap-1 pointer-events-none">
          {links.map((link, i) => (
            link.children?.length ? (
              <span key={i} className={`${navItemClass(false, transparent)} inline-flex items-center gap-1`}>
                {link.label}
                <ChevronDown size={14} />
              </span>
            ) : (
              <span key={i} className={navItemClass(false, transparent)}>{link.label}</span>
            )
          ))}
          <span className={navItemClass(false, transparent)}><MoreHorizontal size={16} /></span>
        </div>

        {visible.map((link, i) => (
          link.children?.length ? (
            <NavDropdown
              key={i}
              item={link}
              open={openKey === i}
              onOpen={() => { setMoreOpen(false); setOpenKey(i) }}
              onClose={() => closeDropdown(i)}
              transparent={transparent}
              navItemClass={navItemClass}
            />
          ) : (
            <NavAnchor
              key={i}
              url={link.url}
              label={link.label}
              className={navItemClass(location.pathname === link.url, transparent)}
            />
          )
        ))}
      </div>

      {collapsed.length > 0 && (
        <div className="relative flex-shrink-0" ref={moreRef}>
          <button
            onClick={() => { setOpenKey(null); setMoreOpen(o => !o) }}
            aria-label="More links"
            className={navItemClass(false, transparent)}
          >
            <MoreHorizontal size={16} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50">
              {collapsed.map((link, i) => (
                link.children?.length ? (
                  // A collapsed parent has no link of its own: a small
                  // heading with its children listed under it.
                  <div key={i} role="group" aria-label={link.label}>
                    <p className="px-4 pt-2 pb-1 text-xs font-medium text-gray-400">{link.label}</p>
                    {link.children.map((child, j) => (
                      <NavAnchor
                        key={j}
                        url={child.url}
                        label={child.label}
                        onClick={() => setMoreOpen(false)}
                        className={`block px-4 py-2 text-sm hover:bg-gray-50 ${
                          location.pathname === child.url ? 'text-gray-900 font-medium' : 'text-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                ) : (
                  <NavAnchor
                    key={i}
                    url={link.url}
                    label={link.label}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2 text-sm hover:bg-gray-50 ${
                      location.pathname === link.url ? 'text-gray-900 font-medium' : 'text-gray-700'
                    }`}
                  />
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
