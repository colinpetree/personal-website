import { useLayoutEffect } from 'react'

// Fades a HeaderNode's uploaded background image in over its LQIP (a tiny
// blurred base64 placeholder generated at upload time — see
// backend/upload_utils.py's optimize_image) instead of the abrupt "solid
// fallback color -> full photo" swap the browser does on its own while a
// large hero image is still downloading (see HeaderNode's exportDOM in
// nodes.jsx: backgroundColor is only ever a fallback for backgroundImage).
//
// Scans for every <header data-header-image-lqip> block in the container,
// not just one — a header block can appear anywhere in page/post content,
// not only as a page's first node (compare useFullscreenHeaderNav, which is
// deliberately scoped to just the first node for a different feature).
// useLayoutEffect (not useEffect) so the blurred placeholder is painted
// before the browser's own first paint of the solid fallback color,
// avoiding a flash of solid color before the placeholder covers it.
//
// Matches useContentLqip's approach (the same technique used for
// ImageNode/GalleryNode content images): the swap is an instant cut, no
// fade/opacity transition — and scale(1.08) is a static crop, not an
// animation, cropping the vignette CSS blur() leaves at an image's own edge
// (no pixels beyond it to blend with) by rendering the placeholder oversized
// and letting the container's overflow:hidden clip the soft border away.
//
// Two layouts, two techniques, because HeaderNode renders its image two
// different ways (see nodes.jsx's exportDOM):
//  - split layout uses a real <img> — same blur-up technique content images
//    use: a blurred placeholder <img> painted OVER the real one (no z-index
//    needed — a positioned sibling naturally paints after a non-positioned
//    one), removed once the real img loads.
//  - every other layout paints the photo as a CSS background-image on
//    .header-inner — there's no img element to hang a `load` event off, so
//    a preloaded Image() drives a blurred placeholder <div> instead, kept
//    BEHIND the heading/subheading text via z-index:-1.
export function useHeaderImageLqip(containerRef, contentKey) {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const headers = container.querySelectorAll('header[data-header-image-lqip]')
    const cleanups = []

    headers.forEach(header => {
      const filename = header.getAttribute('data-header-image')
      const lqip = header.getAttribute('data-header-image-lqip')
      if (!filename || !lqip) return

      if (header.classList.contains('header-split')) {
        const imgEl = header.querySelector('.header-split-image img')
        if (!imgEl) return
        const imgSide = imgEl.parentElement
        if (!imgSide.style.position) imgSide.style.position = 'relative'
        // exportDOM already sets overflow:hidden on .header-split-image, but
        // guard here too in case older saved posts predate that.
        if (!imgSide.style.overflow) imgSide.style.overflow = 'hidden'

        const placeholder = document.createElement('img')
        placeholder.src = lqip
        placeholder.setAttribute('aria-hidden', 'true')
        placeholder.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
          'transform:scale(1.08);filter:blur(20px);pointer-events:none'
        imgSide.insertBefore(placeholder, imgEl)

        let removed = false
        function reveal() {
          if (removed) return
          removed = true
          placeholder.remove()
        }

        if (imgEl.complete && imgEl.naturalWidth) {
          reveal()
        } else {
          imgEl.addEventListener('load', reveal, { once: true })
          imgEl.addEventListener('error', reveal, { once: true })
        }

        cleanups.push(() => { removed = true; placeholder.remove() })
        return
      }

      if (header.getAttribute('data-background-type') !== 'image') return
      const inner = header.querySelector('.header-inner')
      if (!inner) return

      // `.header-inner` isn't always position:relative (only when the
      // admin's shadow-overlay option is on) — needed so the placeholder's
      // position:absolute is relative to it, not some further ancestor.
      if (!inner.style.position) inner.style.position = 'relative'
      // position:relative alone does NOT make inner establish its own
      // stacking context (that needs position + a non-auto z-index) — so
      // without this, the placeholder's z-index:-1 below can escape to
      // whatever ANCESTOR stacking context is nearest instead, potentially
      // painting it behind inner's own background entirely (invisible,
      // leaving only the plain background-color showing). An explicit
      // z-index here (any value) forces inner to own its stacking context
      // so the negative z-index child is guaranteed to land where intended:
      // above inner's own background, below the heading/subheading text.
      if (!inner.style.zIndex) inner.style.zIndex = '0'
      // Only set overflow:hidden for a video background at export time —
      // guard it here for the image case too, or the scale(1.08) overscan
      // below bleeds past the header's own edges instead of being cropped.
      if (!inner.style.overflow) inner.style.overflow = 'hidden'

      const placeholder = document.createElement('div')
      placeholder.setAttribute('aria-hidden', 'true')
      // z-index:-1 (not 0) is what keeps this behind the heading/subheading
      // text without needing to touch their own stacking — CSS paints
      // negative-z-index positioned children before non-positioned in-flow
      // content, so it lands behind them automatically.
      placeholder.style.cssText =
        'position:absolute;inset:0;z-index:-1;background-size:cover;background-position:center center;' +
        'transform:scale(1.08);filter:blur(20px);pointer-events:none'
      placeholder.style.backgroundImage = `url(${lqip})`
      inner.insertBefore(placeholder, inner.firstChild)

      let removed = false
      function reveal() {
        if (removed) return
        removed = true
        placeholder.remove()
      }

      const img = new Image()
      img.src = `/api/uploads/${filename}`
      if (img.complete && img.naturalWidth) {
        reveal()
      } else {
        img.addEventListener('load', reveal, { once: true })
        // A failed/missing image must still clear the placeholder — without
        // this, a deleted or broken upload leaves the blurred placeholder
        // on screen forever instead of falling back to the header's own
        // background-color (which is still sitting underneath, unaffected).
        img.addEventListener('error', reveal, { once: true })
      }

      cleanups.push(() => { removed = true; placeholder.remove() })
    })

    return () => cleanups.forEach(fn => fn())
  }, [containerRef, contentKey])
}
