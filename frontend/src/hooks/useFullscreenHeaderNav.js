import { useEffect, useState } from 'react'
import { headerLayoutOfElement } from '../utils/headerLayout'

// Detects whether a page-header-content container's very first element is a
// header that fills the screen, for FullscreenHeaderNav's scroll-down hint.
//
// The navbar overlay (transparent navbar on top of a full, split, fullscreen,
// linear or linear-split header) is NOT decided here any more. Navbar works
// it out during render from the route's `handle.navOverlayHtml` (see
// utils/headerLayout.js), so the prerendered HTML already has the navbar in
// its final position. Deciding it here, in an effect after hydration, made
// the navbar jump from in-flow to fixed after the first paint, which shifted
// the page up 65px and broke the browser's scroll restore on reload.
//
// Returns { isFullscreenHeader }: true for "Full screen" always, and for
// "Linear"/"Linear split" only once their height (which scales via
// `min(max(280px, 56.25vw), 100vh)` / `min(max(280px, 43.75vw), 100vh)`, see
// nodes.jsx) is actually pinned to the 100vh ceiling; at that point it
// visually fills the screen just like fullscreen does. Full-width/split
// headers don't fill the viewport, so the hint would be misleading there.
//
// `inDocs`: the page is wrapped in DocsLayout, so the header sits in the
// column beside the docs sidebar instead of spanning the window, and "fills
// the screen" is measured against the docs column (.docs-content) width
// rather than window.innerWidth, matching the --docs-w overrides in
// index.css. (Navbar also never overlays on docs pages; see
// SlugResolverPage.jsx's handle.)
export function useFullscreenHeaderNav(containerRef, contentKey, { inDocs = false } = {}) {
  const [state, setState] = useState({ isFullscreenHeader: false })

  useEffect(() => {
    const layout = headerLayoutOfElement(containerRef.current?.firstElementChild)
    const isFullscreen = layout === 'fullscreen'
    const isLinear = layout === 'linear'
    const isLinearSplit = layout === 'linear-split'

    // 56.25vw (linear's slope) vs 100vh: mirrors the `min(max(280px, 56.25vw), 100vh)`
    // formula's own comparison; once 56.25vw reaches/exceeds the viewport height, that
    // clamp is pinned to 100vh and the header fills the screen. No forced breakpoint here
    // (or in index.css/nodes.jsx): linear and linear-split both scale continuously with
    // viewport width and only count as "filling the screen" where their own aspect-ratio
    // slope actually reaches 100vh, hence each comparison uses only its own slope
    // (linear's 56.25vw full-header ratio vs. linear-split's 43.75vw, its whole-header
    // aspect ratio, 640x280 at 640px wide; see nodes.jsx's exportDOM).
    const needsResizeListener = isLinear || isLinearSplit
    function update() {
      const docsColumn = inDocs ? containerRef.current?.closest('.docs-content') : null
      const width = docsColumn ? docsColumn.clientWidth : window.innerWidth
      const linearFillsViewport = isLinear && width * 0.5625 >= window.innerHeight
      const linearSplitFillsViewport = isLinearSplit && width * 0.4375 >= window.innerHeight
      setState({ isFullscreenHeader: isFullscreen || linearFillsViewport || linearSplitFillsViewport })
    }
    update()

    if (needsResizeListener) window.addEventListener('resize', update)
    return () => {
      if (needsResizeListener) window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, contentKey, inDocs])

  return state
}
