import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { ChevronDown } from 'lucide-react'
import NavAnchor, { navItemIsActive } from './NavAnchor'

// How long the pointer can be outside both the button and its menu before
// the menu closes, so a slightly crooked path from the button down into the
// menu (across the gap between them) doesn't close it.
const CLOSE_DELAY_MS = 150

// Gap between the button and the menu, and the minimum distance the menu
// keeps from the viewport's right edge.
const PANEL_GAP = 8
const VIEWPORT_MARGIN = 8

// Desktop nav item that has children (Site Navigation's secondary links).
// Open state lives in OverflowNav (`open`, `onOpen`, `onClose`), so only one
// dropdown (or the "more" popover) is ever open at a time: without that, the
// close delay below would briefly show two menus while the pointer moves from
// one parent to the next.
//
// Hover opens (mouse only: a touch tap fires pointerenter too, and opening on
// it would make the same tap's click immediately toggle the menu shut).
// Clicking the button toggles. Escape, a click outside, tabbing out, a change
// in window width, or following a link closes it.
//
// The panel is position: fixed, placed from the button's rect when it opens.
// It can't be absolute: OverflowNav's link row is overflow-hidden (that's how
// it clips links that don't fit), and that would clip the menu too. The
// header is always sticky or fixed, so page scroll never moves the button.
//
// The panel stays mounted so it can animate both ways: a grid-template-rows
// 0fr -> 1fr reveal that slides it down out of the button, and the same in
// reverse on close. While closed it is inert, so its links are out of the tab
// order and the accessibility tree.
export default function NavDropdown({ item, open, onOpen, onClose, transparent, navItemClass }) {
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const closeTimerRef = useRef(null)
  const openWidthRef = useRef(0)
  const [position, setPosition] = useState(null)
  const location = useLocation()
  const active = navItemIsActive(item, location.pathname)

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  useEffect(() => clearCloseTimer, [])
  useEffect(() => { if (!open) clearCloseTimer() }, [open])

  // Placed before paint so the menu never flashes at its old/initial spot.
  // Kept (not reset) after closing, so the close animation plays in place.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current
    const panel = panelRef.current
    if (!button || !panel) return
    // Window width this placement was computed for; see handleResize below.
    openWidthRef.current = window.innerWidth
    const rect = button.getBoundingClientRect()
    const width = panel.offsetWidth
    let left = rect.left
    // The nav row is right-aligned, so a parent near the search/user
    // buttons would push a left-aligned menu past the window: right-align
    // it to the button instead.
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = rect.right - width
    setPosition({ top: rect.bottom + PANEL_GAP, left: Math.max(VIEWPORT_MARGIN, left) })
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
    // Only a width change can move the button (the nav row reflows
    // horizontally), so only that closes the menu. Height-only resizes are
    // ignored: tablet browsers (iPad Safari) resize the window as their
    // toolbar shows/hides while scrolling, which would otherwise close an
    // open menu mid-scroll.
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
        className={`${navItemClass(active, transparent)} inline-flex items-center gap-1`}
      >
        {item.label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        ref={panelRef}
        inert={!open}
        aria-hidden={!open}
        style={position ? { top: position.top, left: position.left } : { top: 0, left: 0 }}
        className={`fixed z-50 grid w-max min-w-[12rem] max-w-xs bg-white rounded-lg border border-gray-200 shadow-lg transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="py-1">
            {item.children.map((child, i) => (
              <NavAnchor
                key={i}
                url={child.url}
                label={child.label}
                onClick={onClose}
                className={`block px-4 py-2 text-sm hover:bg-gray-50 ${
                  location.pathname === child.url ? 'text-gray-900 font-medium' : 'text-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
