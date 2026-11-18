import { useLayoutEffect, useRef, useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import NavAnchor from './NavAnchor'
import NavDropdown from './NavDropdown'

// Desktop-only "priority navigation": renders every link from `links` until
// the row would no longer fit its container, then collapses the remainder
// (in original order) into a "more" button.
//
// A link with `children` renders as a NavDropdown (a button that opens a menu
// of its children) instead. The "more" button is a NavDropdown too, with the
// same full-width panel: one column for the collapsed plain links, then one
// per collapsed dropdown. Which menu is open lives here, as one `openKey` (a
// link index, or 'more'), so only one menu is ever open at a time.
// While a dropdown is open this also draws one shared backdrop (dimmed and
// blurred) over the page below the navbar, shared so switching between two
// menus doesn't flicker it, and reports the open state through
// `onMenuOpenChange` so Navbar can turn a transparent bar solid.
export default function OverflowNav({ links, transparent, barTransparent, navItemClass, onMenuOpenChange }) {
  const containerRef = useRef(null)
  const measureRef = useRef(null)
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
  // Index (in `links`) of the open dropdown, 'more', or null.
  const [openKey, setOpenKey] = useState(null)
  // When a dropdown opens while another is already open, the height of the
  // panel being replaced, so the new one can animate from it (see
  // NavDropdown). null when opening from closed.
  const [switchFromHeight, setSwitchFromHeight] = useState(null)
  // Natural height of the most recently opened panel, reported by NavDropdown.
  const lastPanelHeightRef = useRef(null)
  const recordPanelHeight = useCallback(h => { lastPanelHeightRef.current = h }, [])
  function openDropdown(i) {
    setSwitchFromHeight(openKey !== null && openKey !== i ? lastPanelHeightRef.current : null)
    setOpenKey(i)
  }
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
      // The gap between labels (and between the last label and the "more"
      // button), read from the measurement row, which uses the same gap as
      // the real rows. It has to be counted: at 24px it adds up fast.
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0
      let used = 0
      let count = 0
      for (let i = 0; i < itemEls.length; i++) {
        const w = itemEls[i].offsetWidth
        const isLast = i === itemEls.length - 1
        const gapBefore = count > 0 ? gap : 0
        // Every link except the last needs to leave room for the "more"
        // button too (plus its gap), since taking it would still leave
        // something collapsed; the last one doesn't, since taking it means
        // nothing is left to collapse and the "more" button won't render.
        const widthNeeded = used + gapBefore + w + (isLast ? 0 : gap + moreWidth)
        if (widthNeeded > available) break
        used += gapBefore + w
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

  useEffect(() => { setOpenKey(null) }, [location.pathname])

  // A dropdown that collapses into "more" (window narrowed while it was
  // open), or "more" once nothing is collapsed any more, shouldn't stay open
  // as an orphan.
  useEffect(() => {
    if (typeof openKey === 'number' && openKey >= visibleCount) setOpenKey(null)
    if (openKey === 'more' && visibleCount >= links.length) setOpenKey(null)
  }, [openKey, visibleCount, links.length])

  // Tells Navbar a dropdown is open, so text over a transparent bar turns dark
  // (the panel slides white in behind it). On open, in a layout effect (not
  // passive) so it starts in the same paint the panel starts moving in. On
  // close, only once the panel's 200ms slide back has finished, so white text
  // never sits on the still-visible white panel; reopening within that window
  // cancels the pending report.
  const dropdownOpen = openKey !== null
  useLayoutEffect(() => {
    if (dropdownOpen) { onMenuOpenChange?.(true); return }
    const timer = setTimeout(() => onMenuOpenChange?.(false), 200)
    return () => clearTimeout(timer)
  }, [dropdownOpen, onMenuOpenChange])

  // Key-specific close: a dropdown's delayed close (see NavDropdown) can fire
  // after another dropdown has already opened, and must not close that one.
  const closeDropdown = useCallback(key => setOpenKey(k => (k === key ? null : k)), [])

  const visible = links.slice(0, visibleCount)
  const collapsed = links.slice(visibleCount)
  // The "more" panel's columns: collapsed plain links first, under "More",
  // then each collapsed dropdown under its own label.
  const collapsedPlain = collapsed.filter(link => !link.children?.length)
  const moreSections = [
    ...(collapsedPlain.length ? [{ label: 'More', links: collapsedPlain }] : []),
    ...collapsed.filter(link => link.children?.length).map(link => ({ label: link.label, links: link.children })),
  ]

  return (
    // Dropdown panels are position: fixed (see NavDropdown), so the links
    // row's overflow-hidden (which clips labels that don't fit) can't clip
    // them.
    // Labels sit on the left, right after the site title. The container takes
    // the remaining width (that's what recalc measures against); the links
    // row only takes its labels' width, so the "more" button sits directly
    // after the last visible label instead of at the far right.
    <div ref={containerRef} className="relative flex items-center justify-start gap-6 min-w-0 flex-1">
      <div className="flex items-center gap-6 min-w-0 overflow-hidden">
        {/* Hidden measurement row: every link plus a "more" button
            rendered at natural width, absolutely positioned off-screen so
            it doesn't affect layout but its children's offsetWidth is
            measurable. Same gap as the real rows (recalc reads it). */}
        <div ref={measureRef} aria-hidden="true" className="absolute -left-[9999px] top-0 flex items-center gap-6 pointer-events-none">
          {links.map((link, i) => (
            <span key={i} className={navItemClass(false, transparent)}>{link.label}</span>
          ))}
          <span className={navItemClass(false, transparent)}><MoreHorizontal size={16} /></span>
        </div>

        {visible.map((link, i) => (
          link.children?.length ? (
            <NavDropdown
              key={i}
              item={link}
              open={openKey === i}
              onOpen={() => openDropdown(i)}
              onClose={() => closeDropdown(i)}
              switchFromHeight={openKey === i ? switchFromHeight : null}
              anotherOpen={openKey !== null && openKey !== i}
              barTransparent={barTransparent}
              onPanelHeight={recordPanelHeight}
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
        <NavDropdown
          sections={moreSections}
          buttonContent={<MoreHorizontal size={16} />}
          ariaLabel="More links"
          open={openKey === 'more'}
          onOpen={() => openDropdown('more')}
          onClose={() => closeDropdown('more')}
          switchFromHeight={openKey === 'more' ? switchFromHeight : null}
          anotherOpen={openKey !== null && openKey !== 'more'}
          barTransparent={barTransparent}
          onPanelHeight={recordPanelHeight}
          transparent={transparent}
          navItemClass={navItemClass}
        />
      )}

      {/* Backdrop behind an open dropdown: dims (black at 12%) and blurs (16px)
          the page below the navbar. It fades
          in and out over 200ms ease-in-out as a menu opens from or closes to
          nothing (switching between menus leaves it as is). Not inside any dropdown's
          wrapper, so pressing on it counts as a click outside and closes the
          menu; moving the pointer onto it from the panel starts the dropdown's
          normal close delay. Negative z-index inside the header's stacking
          context: under the panels (-z-20 vs their -z-10), which are in turn
          under the navbar's own labels, title and buttons. `invisible` while closed, so a closed
          menu doesn't leave a full-screen blur layer for the browser to keep
          rendering. */}
      <div
        aria-hidden="true"
        data-keep-transition=""
        className={`fixed inset-x-0 top-16 bottom-0 -z-20 bg-black/[0.12] backdrop-blur-lg transition-[opacity,visibility] duration-200 ease-in-out motion-reduce:transition-none ${
          dropdownOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        }`}
      />
    </div>
  )
}
