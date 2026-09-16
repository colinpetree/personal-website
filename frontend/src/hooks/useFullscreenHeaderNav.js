import { useEffect, useState } from 'react'
import { useNavOverlay } from '../context/NavOverlayContext'

// Detects whether a page-header-content container's very first element is a
// fullscreen-, full-width-, split-, linear-, or linear-split-layout HeaderNode
// (<header class="header-fullscreen">, <header class="header-full">, <header
// class="header-split">, <header class="header-linear">, or <header
// class="header-linear-split">, see nodes.jsx; these are the layouts meant to
// feel like the header owns the whole viewport, as opposed to regular/wide
// which stay flush with the navbar but keep it in its normal solid state)
// and, if so, tells Navbar (via NavOverlayContext) to overlay itself
// transparently on top of it (white text, no background) until the user
// scrolls, at which point it becomes the normal solid navbar. Mirrors the
// existing "first h1" special case in index.css, but drives Navbar behavior
// instead of CSS since it needs to react to which page is currently mounted.
//
// Returns { isOverlayHeader, isFullscreenHeader }: isOverlayHeader covers all
// five layouts (drives the Navbar overlay above). isFullscreenHeader is true
// for "Full screen" always, and for "Linear"/"Linear split" only once their
// height (which scales via `min(max(280px, 56.25vw), 100vh)` / `min(max(280px,
// 43.75vw), 100vh)`, see nodes.jsx) is actually pinned to the 100vh ceiling;
// at that point it visually fills the screen just like fullscreen does, so
// callers like FullscreenHeaderNav should show the same scroll-down hint.
// Full-width/split headers don't fill the viewport, so the hint would be
// misleading there.
export function useFullscreenHeaderNav(containerRef, contentKey) {
  const nav = useNavOverlay()
  const [state, setState] = useState({ isOverlayHeader: false, isFullscreenHeader: false })

  useEffect(() => {
    const first = containerRef.current?.firstElementChild
    const isFullscreen = !!first && first.tagName === 'HEADER' && first.classList.contains('header-fullscreen')
    const isLinear = !!first && first.tagName === 'HEADER' && first.classList.contains('header-linear')
    const isLinearSplit = !!first && first.tagName === 'HEADER' && first.classList.contains('header-linear-split')
    const isOverlay = isFullscreen
      || (!!first && first.tagName === 'HEADER' && first.classList.contains('header-full'))
      || (!!first && first.tagName === 'HEADER' && first.classList.contains('header-split'))
      || isLinear
      || isLinearSplit

    if (nav) nav.setOverlay(isOverlay)

    // 56.25vw (linear's slope) vs 100vh: mirrors the `min(max(280px, 56.25vw), 100vh)`
    // formula's own comparison; once 56.25vw reaches/exceeds the viewport height, that
    // clamp is pinned to 100vh and the header fills the screen. No forced breakpoint here
    // (or in index.css/nodes.jsx) — linear and linear-split both scale continuously with
    // viewport width and only count as "filling the screen" where their own aspect-ratio
    // slope actually reaches 100vh, hence each comparison uses only its own slope
    // (linear's 56.25vw full-header ratio vs. linear-split's 43.75vw — its whole-header
    // aspect ratio, 640x280 at 640px wide — see nodes.jsx's exportDOM).
    const needsResizeListener = isLinear || isLinearSplit
    function update() {
      const linearFillsViewport = isLinear && window.innerWidth * 0.5625 >= window.innerHeight
      const linearSplitFillsViewport = isLinearSplit && window.innerWidth * 0.4375 >= window.innerHeight
      setState({ isOverlayHeader: isOverlay, isFullscreenHeader: isFullscreen || linearFillsViewport || linearSplitFillsViewport })
    }
    update()

    if (needsResizeListener) window.addEventListener('resize', update)
    return () => {
      if (nav) nav.setOverlay(false)
      if (needsResizeListener) window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, contentKey, nav])

  return state
}
