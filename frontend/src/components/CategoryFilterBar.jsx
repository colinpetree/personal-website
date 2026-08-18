import { useRef, useEffect } from 'react'

// Horizontally-scrollable category badge bar. Touch devices get free native
// momentum scrolling from overflow-x:auto + -webkit-overflow-scrolling:touch;
// desktop mouse users get a hand-rolled click-and-drag with a short
// deceleration glide on release, since there's no native equivalent for mouse.
export default function CategoryFilterBar({ categories, activeSlug, onSelect }) {
  const scrollRef = useRef(null)
  const drag = useRef({ dragging: false, startX: 0, startScroll: 0, moved: 0, lastX: 0, lastT: 0, velocity: 0 })
  const momentumFrame = useRef(null)

  function stopMomentum() {
    if (momentumFrame.current) {
      cancelAnimationFrame(momentumFrame.current)
      momentumFrame.current = null
    }
  }

  // Stops the glide loop if the user navigates away mid-flick — otherwise it
  // keeps scheduling frames against a detached scrollRef for however long the
  // deceleration takes to decay below the stop threshold.
  useEffect(() => stopMomentum, [])

  function onMouseDown(e) {
    stopMomentum()
    const el = scrollRef.current
    drag.current = {
      dragging: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: 0,
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
    }
  }

  function onMouseMove(e) {
    if (!drag.current.dragging) return
    const el = scrollRef.current
    const dx = e.clientX - drag.current.startX
    el.scrollLeft = drag.current.startScroll - dx
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx))

    const now = performance.now()
    const dt = now - drag.current.lastT
    if (dt > 0) {
      drag.current.velocity = (e.clientX - drag.current.lastX) / dt
      drag.current.lastX = e.clientX
      drag.current.lastT = now
    }
  }

  function endDrag() {
    if (!drag.current.dragging) return
    drag.current.dragging = false

    let velocity = -drag.current.velocity * 16 // px per frame, roughly
    const el = scrollRef.current
    function glide() {
      velocity *= 0.95
      if (Math.abs(velocity) < 0.5 || !el) {
        momentumFrame.current = null
        return
      }
      el.scrollLeft += velocity
      momentumFrame.current = requestAnimationFrame(glide)
    }
    if (Math.abs(velocity) > 0.5) {
      momentumFrame.current = requestAnimationFrame(glide)
    }
  }

  function handleBadgeClick(slug) {
    // Suppress the click that follows a drag gesture beyond a small threshold.
    if (drag.current.moved > 5) return
    onSelect(slug)
  }

  return (
    <div
      ref={scrollRef}
      className="category-filter-scroll flex gap-2 overflow-x-auto pb-1 mb-6 cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <button
        type="button"
        onClick={() => handleBadgeClick(null)}
        className={`shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
          activeSlug === null
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
        }`}
      >
        All
      </button>
      {categories.map(c => (
        <button
          key={c.id}
          type="button"
          onClick={() => handleBadgeClick(c.slug)}
          className={`shrink-0 whitespace-nowrap text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
            activeSlug === c.slug
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
