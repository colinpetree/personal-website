import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useFullscreenHeaderNav } from '../hooks/useFullscreenHeaderNav'

// Drop this alongside any page-header-content container (About/Home/
// Contact/Projects/Payment/AI Demo/Blog list pages) so a leading fullscreen
// HeaderNode gets to use the whole viewport (see useFullscreenHeaderNav) and
// shows a scroll-down hint when there's more page below the header.
export default function FullscreenHeaderNav({ containerRef, contentKey }) {
  const { isFullscreenHeader } = useFullscreenHeaderNav(containerRef, contentKey)
  return isFullscreenHeader ? <ScrollDownIndicator containerRef={containerRef} /> : null
}

// Subtle, fixed bottom-center hint that the page continues below the
// fullscreen header — only shown when the page actually has more content
// than fits in one viewport (scrollHeight > innerHeight), and fades out as
// soon as the user starts scrolling (same 1:1-with-scroll feel as Navbar's
// own reveal, so it reads as one coordinated effect rather than two
// unrelated animations).
function ScrollDownIndicator({ containerRef }) {
  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    const header = containerRef.current?.firstElementChild
    if (!header) return

    let ticking = false
    function update() {
      const scrollable = document.documentElement.scrollHeight > window.innerHeight + 4
      setVisible(scrollable && window.scrollY < 40)
      ticking = false
    }
    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
    }
  }, [containerRef])

  return createPortal(
    <div
      aria-hidden="true"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center justify-center w-11 h-11 rounded-full bg-black/60 transition-opacity duration-300 ${
        visible ? 'opacity-60' : 'opacity-0'
      }`}
    >
      <ChevronDown size={22} strokeWidth={2} className="text-white" />
    </div>,
    document.body
  )
}
