import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import NavAnchor from './NavAnchor'

// How long the pointer can be outside both the button and its menu before
// the menu closes. Labels span the navbar's full height, so the panel starts
// right under them; this just forgives a quick slip off the edge.
const CLOSE_DELAY_MS = 150

// Desktop nav item that has children (Site Navigation's secondary links).
// Open state lives in OverflowNav (`open`, `onOpen`, `onClose`), so only one
// dropdown (or the "more" popover) is ever open at a time: without that, the
// close delay below would briefly show two menus while the pointer moves from
// one parent to the next. OverflowNav also draws the dimmed, blurred backdrop
// over the page while any menu is open, and tells Navbar to turn the bar solid.
//
// Hover opens (mouse only: a touch tap fires pointerenter too, and opening on
// it would make the same tap's click immediately toggle the menu shut).
// Clicking the button toggles. Escape, a click outside (including on the
// backdrop), tabbing out, a change in window width, or following a link
// closes it.
//
// The menu is a full-width white panel that continues straight out of the
// navbar: its top covers the header's 1px bottom border, it has no border or
// shadow of its own, and its content lines up with the site title on the left
// (same max-w-6xl/px-6 container as the navbar row), whichever label opened it.
// It's position: fixed rather than absolute because OverflowNav's link row is
// overflow-hidden (that's how it clips links that don't fit), which would clip
// it. The header is always sticky or fixed, so page scroll never moves it. It
// stays inside this component's wrapper (not portaled elsewhere) so keyboard
// Tab order runs straight from the label into its links.
//
// Motion (all 200ms ease-in-out):
// - Opening from closed: the panel expands down from 0 to its height while
//   OverflowNav's backdrop fades in. Closing (nothing else opening): it
//   collapses back to 0 while the backdrop fades out, then goes invisible.
// - Switching from one open menu to another (`switchFromHeight` set): the new
//   panel starts at the previous panel's height and animates to its own while
//   its links fade in, and the old panel (`anotherOpen`) hides at once, so it
//   reads as one panel resizing.
//   OverflowNav remembers each panel's height via `onPanelHeight`.
// - Over a transparent bar (`barTransparent`, e.g. a page that starts with a
//   fullscreen header): the panel starts at the very top of the window with a
//   bar-height spacer above its content, so it slides down from the top
//   behind the bar and fills it with white as part of the same motion
//   (Navbar only fades the bar's text dark). Closing slides it back up. Over
//   a solid bar it starts at the bar's bottom edge, covering its 1px border.
//   The mode is chosen when the menu opens and kept until it closes.
// The panel sits at a negative z-index inside the header's stacking context:
// above the header's own background and border, below its labels and title.
// Content is a list of `sections` (a small label, then its links). A
// regular dropdown has one: its own label and children. OverflowNav's "more"
// button uses this same component with one section for the collapsed plain
// links plus one per collapsed dropdown, laid out as columns, and passes its
// icon as `buttonContent`.
// The panel and its content are data-keep-transition so the header's
// transition-killing snap (`.navbar-no-transition`, see Navbar.jsx and
// index.css) can never cut these animations short.
export default function NavDropdown({ item, sections: sectionsProp, buttonContent, ariaLabel, open, onOpen, onClose, switchFromHeight, anotherOpen, onPanelHeight, transparent, barTransparent, navItemClass }) {
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const spacerRef = useRef(null)
  const closeTimerRef = useRef(null)
  const openWidthRef = useRef(0)
  const location = useLocation()
  const sections = sectionsProp ?? [{ label: item.label, links: item.children }]
  // Lit like a current-page link while one of its links is the current page.
  const active = sections.some(section => section.links.some(link => link.url === location.pathname))

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => clearCloseTimer, [])
  useEffect(() => { if (!open) clearCloseTimer() }, [open])

  // Position and size the panel before paint, so it never flashes at a stale
  // spot or size. Imperative DOM writes (not state) so the height animation's
  // start and end values land in the right order within one effect.
  useLayoutEffect(() => {
    const panel = panelRef.current
    const button = buttonRef.current
    if (!panel || !button) return
    if (!open) {
      if (anotherOpen) {
        // Replaced by another menu: hide at once (the class drops the
        // transition), the new panel takes over from this height.
        panel.style.height = ''
      } else if (panel.style.height) {
        // Closing to nothing: collapse from its current height to 0. The
        // closed classes keep the height transition and hold `visibility`
        // until it ends, so the collapse is visible.
        panel.style.height = `${panel.offsetHeight}px`
        void panel.offsetHeight
        panel.style.height = '0px'
      }
      return
    }
    // Window width this placement was computed for; see handleResize below.
    openWidthRef.current = window.innerWidth
    // One pixel up from the header's bottom edge, so the menu covers the
    // header's border instead of sitting below it. Over a transparent bar,
    // the panel starts at the top of the window instead and pads its content
    // down by the same amount (see the comment at the top).
    const headerBottom = button.closest('header')?.getBoundingClientRect().bottom ?? button.getBoundingClientRect().bottom
    // The bar-height space is a spacer element inside the panel, not padding
    // on the panel itself: a box can't be shorter than its own padding, so
    // padding would keep the panel at least bar-height tall and the bar would
    // turn white in one jump instead of being filled by the slide.
    const spacer = spacerRef.current
    if (barTransparent) {
      panel.style.top = '0px'
      if (spacer) spacer.style.height = `${headerBottom - 1}px`
    } else {
      panel.style.top = `${headerBottom - 1}px`
      if (spacer) spacer.style.height = '0px'
    }
    // Mid-collapse (reopened within 200ms of closing)? Grow back from where it
    // is now rather than snapping to 0 first.
    const current = panel.style.height ? panel.offsetHeight : 0
    panel.style.height = ''
    const natural = panel.offsetHeight
    onPanelHeight?.(natural)
    // Start at the previous panel's height when switching, or at 0 when
    // opening from closed (from auto, so this jump itself doesn't animate),
    // force that to apply, then set the target so the height transition runs.
    const from = switchFromHeight || current
    if (from !== natural) {
      panel.style.height = `${from}px`
      void panel.offsetHeight
    }
    panel.style.height = `${natural}px`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) onClose()
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose()
        buttonRef.current?.focus()
      }
    }
    // Only a width change can reflow the nav row, so only that closes the
    // menu. Height-only resizes are ignored: tablet browsers (iPad Safari)
    // resize the window as their toolbar shows/hides while scrolling, which
    // would otherwise close an open menu mid-scroll.
    function handleResize() {
      if (window.innerWidth !== openWidthRef.current) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, onClose])

  function handlePointerEnter(e) {
    if (e.pointerType !== 'mouse') return
    clearCloseTimer()
    if (!open) onOpen()
  }

  function handlePointerLeave(e) {
    if (e.pointerType !== 'mouse' || !open) return
    clearCloseTimer()
    closeTimerRef.current = setTimeout(onClose, CLOSE_DELAY_MS)
  }

  function handleBlur(e) {
    if (open && wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget)) onClose()
  }

  const switching = open && !!switchFromHeight

  return (
    <div
      ref={wrapperRef}
      className="flex-shrink-0"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onBlur={handleBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ariaLabel}
        // The open item reads as current (dark), the others stay gray. No
        // chevron: the label alone opens the menu.
        className={navItemClass(active || open, transparent)}
      >
        {buttonContent ?? item.label}
      </button>
      <div
        ref={panelRef}
        data-keep-transition=""
        inert={!open}
        aria-hidden={!open}
        className={`fixed inset-x-0 top-0 -z-10 overflow-hidden bg-white ${
          open
            ? 'visible transition-[height] duration-200 ease-in-out motion-reduce:transition-none'
            : anotherOpen
              ? 'invisible pointer-events-none'
              : 'invisible pointer-events-none transition-[height,visibility] duration-200 ease-in-out motion-reduce:transition-none'
        }`}
      >
        {/* Bar-height spacer, used only when sliding in behind a transparent bar. */}
        <div ref={spacerRef} aria-hidden="true" />
        <div
          data-keep-transition=""
          className={`max-w-6xl mx-auto px-6 pt-8 pb-9 ${
            switching ? 'motion-safe:animate-[nav-panel-fade-in_200ms_ease-out]' : ''
          }`}
        >
          {/* One column per section, side by side (only "more" ever has
              several), wrapping if they run out of room. */}
          <div className="flex flex-wrap gap-x-24 gap-y-10">
            {sections.map((section, s) => (
              <div key={s} role="group" aria-label={section.label}>
                {/* Small heading: 14px medium, 60% black. */}
                <p className="text-sm leading-5 font-medium text-black/60">{section.label}</p>
                {/* Large links: 30px medium, black, fading to 60% black on hover
                    (250ms linear), rows ~52px apart. self-start keeps each
                    link's hover area to its own text rather than the full width. */}
                <div className="mt-3 flex flex-col gap-3">
                  {section.links.map((link, i) => (
                    <NavAnchor
                      key={i}
                      url={link.url}
                      label={link.label}
                      onClick={onClose}
                      className="self-start text-[30px] leading-[1.32] tracking-[-0.01em] font-medium text-black hover:text-black/60 transition-colors duration-[250ms] ease-linear"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
