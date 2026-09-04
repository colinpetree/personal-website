import { useEffect, useState } from 'react'
import { useNavOverlay } from '../context/NavOverlayContext'

// Detects whether a page-header-content container's very first element is a
// fullscreen-layout HeaderNode (<header class="header-fullscreen">, see
// nodes.jsx) and, if so, tells Navbar (via NavOverlayContext) to overlay
// itself transparently on top of it — white text, no background — until the
// user scrolls, at which point it becomes the normal solid navbar. Mirrors
// the existing "first h1" special case in index.css, but drives Navbar
// behavior instead of CSS since it needs to react to which page is
// currently mounted.
//
// Returns the same boolean it computes so callers (FullscreenHeaderNav) can
// also decide whether to show the scroll-down indicator, without every page
// re-implementing the "is my first node a fullscreen header" check.
export function useFullscreenHeaderNav(containerRef, contentKey) {
  const nav = useNavOverlay()
  const [isFullscreenHeader, setIsFullscreenHeader] = useState(false)

  useEffect(() => {
    const first = containerRef.current?.firstElementChild
    const detected =
      !!first && first.tagName === 'HEADER' && first.classList.contains('header-fullscreen')
    setIsFullscreenHeader(detected)
    if (!nav) return
    nav.setOverlay(detected)
    return () => nav.setOverlay(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, contentKey, nav])

  return isFullscreenHeader
}
