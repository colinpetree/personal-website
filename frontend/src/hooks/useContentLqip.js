import { useLayoutEffect } from 'react'

// Covers any content <img data-lqip> with its blurred base64 placeholder
// (generated at upload time — see backend/upload_utils.py's optimize_image)
// until the real image has fully loaded, instead of the raw image painting
// in top-down as it downloads. Covers both ImageNode (one image per figure)
// and GalleryNode (many images per figure) since the selector targets the
// <img> itself rather than its wrapping figure. useLayoutEffect (not
// useEffect) so the placeholder is inserted BEFORE the browser's first paint
// — useEffect fires post-paint, leaving a window where the raw image is
// already in the DOM with its real src and visibly rendering before this
// effect can cover it.
//
// The swap from placeholder to real image is an instant cut, not a fade —
// a smooth cross-fade/scale here reads as the placeholder visibly
// stretching/narrowing into the final image whenever the two don't share
// the exact same box (e.g. a gallery image whose real aspect ratio only
// becomes known once it loads), which is more distracting than just seeing
// the swap happen.
export function useContentLqip(containerRef, contentKey) {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const images = container.querySelectorAll('img[data-lqip]')
    const cleanups = []

    images.forEach(img => {
      const lqipSrc = img.getAttribute('data-lqip')
      if (!lqipSrc) return

      const wrap = img.parentElement
      if (!wrap) return
      if (!wrap.style.position) wrap.style.position = 'relative'

      if (!wrap.style.overflow) wrap.style.overflow = 'hidden'

      const placeholder = document.createElement('img')
      placeholder.src = lqipSrc
      placeholder.setAttribute('aria-hidden', 'true')
      // Positioned elements paint after non-positioned in-flow siblings
      // regardless of DOM order, so this absolutely-positioned placeholder
      // covers the real <img> underneath for free — no opacity/z-index
      // juggling needed, just remove it once the real image is ready.
      //
      // scale(1.08) is a static crop, not an animation: CSS blur() clamps at
      // the image's own edge (no pixels beyond it to blend with), so the
      // blurred image comes out visibly lighter/softer right at its border
      // — a vignette. Rendering it 8% oversized and letting the wrap's
      // overflow:hidden clip the excess pushes that soft edge outside the
      // visible box, leaving only the fully-blurred interior on screen.
      placeholder.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
        'transform:scale(1.08);filter:blur(20px);pointer-events:none'
      wrap.insertBefore(placeholder, img)

      let removed = false
      function reveal() {
        if (removed) return
        removed = true
        placeholder.remove()
      }

      if (img.complete && img.naturalWidth) {
        reveal()
      } else {
        img.addEventListener('load', reveal, { once: true })
        img.addEventListener('error', reveal, { once: true })
      }

      cleanups.push(() => { removed = true; placeholder.remove() })
    })

    return () => cleanups.forEach(fn => fn())
  }, [containerRef, contentKey])
}
