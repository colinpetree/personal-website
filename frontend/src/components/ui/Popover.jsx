import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

// Minimal trigger + floating-panel popover. Positions itself off the
// trigger's rect and portals into document.body so it isn't clipped by
// overflow:hidden ancestors (e.g. the admin sidebar).
export default function Popover({ trigger, children, align = 'start', side = 'bottom', panelClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  function updatePos() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const top = side === 'top' ? rect.top - 8 : rect.bottom + 8
    const left = align === 'end' ? rect.right : align === 'center' ? rect.left + rect.width / 2 : rect.left
    setPos({ top, left })
  }

  function toggle() {
    if (!open) updatePos()
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onScroll() { updatePos() }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [open])

  const translateX = align === 'end' ? '-100%' : align === 'center' ? '-50%' : '0'
  const translateY = side === 'top' ? '-100%' : '0'

  return (
    <>
      <span ref={triggerRef} onClick={toggle} className="flex w-fit">
        {trigger}
      </span>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: `translate(${translateX}, ${translateY})`, zIndex: 10000 }}
          className={`bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] ${panelClassName}`}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>,
        document.body
      )}
    </>
  )
}
