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
// Two layouts, two techniques, because HeaderNode renders its image two
// different ways (see nodes.jsx's exportDOM):
//  - split layout uses a real <img> — same blur-up technique BlogPostPage.jsx
//    already uses for content images: a blurred placeholder <img> painted
//    OVER the real one (no z-index needed — a positioned sibling naturally
//    paints after a non-positioned one), faded out once the real img loads.
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

        const placeholder = document.createElement('img')
        placeholder.src = lqip
        placeholder.setAttribute('aria-hidden', 'true')
        placeholder.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
          'filter:blur(20px);transform:scale(1.05);pointer-events:none'
        imgSide.insertBefore(placeholder, imgEl)

        imgEl.style.transition = 'opacity 0.4s'
        imgEl.style.opacity = '0'

        let removed = false
        function reveal() {
          if (removed) return
          imgEl.style.opacity = '1'
          placeholder.style.transition = 'opacity 0.4s'
          placeholder.style.opacity = '0'
          setTimeout(() => { if (!removed) placeholder.remove() }, 400)
        }

        if (imgEl.complete && imgEl.naturalWidth) {
          reveal()
        } else {
          imgEl.addEventListener('load', reveal, { once: true })
          imgEl.addEventListener('error', reveal, { once: true })
        }

        cleanups.push(() => {
          removed = true
          placeholder.remove()
          imgEl.style.opacity = ''
          imgEl.style.transition = ''
        })
        return
      }

      if (header.getAttribute('data-background-type') !== 'image') return
      const inner = header.querySelector('.header-inner')
      if (!inner) return

      // `.header-inner` isn't always position:relative (only when the
      // admin's shadow-overlay option is on) — needed so the placeholder's
      // position:absolute is relative to it, not some further ancestor.
      if (!inner.style.position) inner.style.position = 'relative'

      const placeholder = document.createElement('div')
      placeholder.setAttribute('aria-hidden', 'true')
      // z-index:-1 (not 0) is what keeps this behind the heading/subheading
      // text without needing to touch their own stacking — CSS paints
      // negative-z-index positioned children before non-positioned in-flow
      // content, so it lands behind them automatically.
      placeholder.style.cssText =
        'position:absolute;inset:0;z-index:-1;background-size:cover;background-position:center center;' +
        'filter:blur(20px);transform:scale(1.05);pointer-events:none;transition:opacity 0.4s ease'
      placeholder.style.backgroundImage = `url(${lqip})`
      inner.insertBefore(placeholder, inner.firstChild)

      let removed = false
      function reveal() {
        if (removed) return
        placeholder.style.opacity = '0'
        setTimeout(() => { if (!removed) placeholder.remove() }, 400)
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
