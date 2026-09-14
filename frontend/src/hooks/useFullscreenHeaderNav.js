import { useEffect, useState } from 'react'
import { useNavOverlay } from '../context/NavOverlayContext'

// Detects whether a page-header-content container's very first element is a
// fullscreen-, full-width-, or split-layout HeaderNode (<header
// class="header-fullscreen">, <header class="header-full">, or <header
// class="header-split">, see nodes.jsx — "Full screen", "Full width", and
// "Split" are the three layouts meant to feel like the header owns the whole
// viewport, as opposed to regular/wide which stay flush with the navbar but
// keep it in its normal solid state) and, if so, tells Navbar (via
// NavOverlayContext) to overlay itself transparently on top of it — white
// text, no background — until the user scrolls, at which point it becomes
// the normal solid navbar. Mirrors the existing "first h1" special case in
// index.css, but drives Navbar behavior instead of CSS since it needs to
// react to which page is currently mounted.
//
// Returns { isOverlayHeader, isFullscreenHeader }: isOverlayHeader covers all
// three layouts (drives the Navbar overlay above) while isFullscreenHeader is
// fullscreen-only, so callers like FullscreenHeaderNav can still limit the
// scroll-down indicator to the "Full screen" layout — full-width/split
// headers don't necessarily fill the viewport, so the hint would be
// misleading there.
export function useFullscreenHeaderNav(containerRef, contentKey) {
  const nav = useNavOverlay()
  const [state, setState] = useState({ isOverlayHeader: false, isFullscreenHeader: false })

  useEffect(() => {
    const first = containerRef.current?.firstElementChild
    const isFullscreen = !!first && first.tagName === 'HEADER' && first.classList.contains('header-fullscreen')
    const isOverlay = isFullscreen
      || (!!first && first.tagName === 'HEADER' && first.classList.contains('header-full'))
      || (!!first && first.tagName === 'HEADER' && first.classList.contains('header-split'))
    setState({ isOverlayHeader: isOverlay, isFullscreenHeader: isFullscreen })
    if (!nav) return
    nav.setOverlay(isOverlay)
    return () => nav.setOverlay(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, contentKey, nav])

  return state
}
