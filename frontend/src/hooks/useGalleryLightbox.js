import { useState, useCallback, useEffect, useRef } from 'react'

function rectFromImg(imgEl) {
  const rect = imgEl.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    naturalWidth: imgEl.naturalWidth || rect.width,
    naturalHeight: imgEl.naturalHeight || rect.height,
  }
}

// Delegated click handler for figure.gallery images, scoped to containerRef
// (not document-wide) so it composes safely alongside other content on the
// page. contentKey should be the HTML string that changes whenever the
// rendered content changes, so the listener re-binds against the new DOM
// (mirrors useCodeBlockCopy's contentKey convention).
export function useGalleryLightbox(containerRef, contentKey) {
  const [images, setImages] = useState([])
  const [index, setIndex] = useState(null)
  const [originRect, setOriginRect] = useState(null)
  const galleryElRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !contentKey) return
    function onClick(e) {
      if (e.target.tagName !== 'IMG') return

      const gallery = e.target.closest('figure.gallery')
      if (gallery) {
        if (!container.contains(gallery)) return
        const allImgs = [...gallery.querySelectorAll('img')]
        const clickedIndex = allImgs.indexOf(e.target)
        galleryElRef.current = gallery
        setImages(allImgs.map(img => ({ src: img.getAttribute('src') || img.src, alt: img.alt || '' })))
        setIndex(clickedIndex)
        setOriginRect(rectFromImg(e.target))
        return
      }

      // Standalone (non-gallery) images — only `[data-width]` figures are
      // ImageNode's own output (VideoNode uses a class instead of this
      // attribute, AudioNode/HeaderNode/embeds don't use it at all), and only
      // when the image isn't wrapped in a link (a linked image should still
      // navigate to its href, not lightbox).
      const figure = e.target.closest('figure[data-width]')
      if (!figure || !container.contains(figure) || figure.closest('a')) return
      galleryElRef.current = null
      setImages([{ src: e.target.getAttribute('src') || e.target.src, alt: e.target.alt || '' }])
      setIndex(0)
      setOriginRect(rectFromImg(e.target))
    }
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [containerRef, contentKey])

  const close = useCallback(() => { setIndex(null); setOriginRect(null); galleryElRef.current = null }, [])

  // Re-derive the origin rect for whichever image is now showing, so closing
  // after navigating still animates back to that image's actual on-page
  // thumbnail (not the originally-clicked one, and not a plain fade).
  const navigate = useCallback((i) => {
    const imgEl = galleryElRef.current?.querySelectorAll('img')[i]
    setOriginRect(imgEl ? rectFromImg(imgEl) : null)
    setIndex(i)
  }, [])

  return { images, index, originRect, close, navigate }
}
