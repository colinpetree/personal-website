import { useEffect, useCallback, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

const TRANSITION_MS = 320
const EASING = 'cubic-bezier(0.65, 0, 0.35, 1)'
const FADE_MS = 150

// The thumbnail shows a CROPPED view of the image (object-fit: cover), but
// the lightbox always shows the FULL, uncropped image (object-fit: contain
// — its layout box already equals the image's true contain-fit size, since
// no explicit width/height is set, just max-h/max-w). A plain scale/
// translate transform between the cropped box and the full box is a
// non-uniform stretch (different horizontal vs vertical scale factors),
// which looks like the image "distorts" and pops into correct proportions
// right as the animation ends — because it doesn't just move/resize the
// image, it silently stretches a crop onto a non-crop.
//
// Fix: compute the implied on-screen box of the FULL (uncropped) image at
// the thumbnail's own display scale/position (`start` below) — this has the
// exact same aspect ratio as the target box, so the transform between them
// is a uniform scale (no distortion). Then animate a `clip-path` on top,
// from an inset matching exactly the thumbnail's visible crop down to
// inset(0) (fully revealed) — so the image appears to "unwrap" from its
// cropped thumbnail view into the full picture as it grows, instead of
// popping.
function computeFlipGeometry(originRect, targetRect) {
  if (!originRect || !targetRect || !targetRect.width || !targetRect.height) return null
  const { left: oLeft, top: oTop, width: boxW, height: boxH } = originRect
  const imgW = originRect.naturalWidth || boxW
  const imgH = originRect.naturalHeight || boxH
  if (!imgW || !imgH) return null

  // object-fit: cover — the image is scaled up until it fully covers the
  // box, so the larger of the two ratios wins (that's the dimension that
  // gets cropped).
  const displayScale = Math.max(boxW / imgW, boxH / imgH)
  const fullW = imgW * displayScale
  const fullH = imgH * displayScale
  // object-position defaults to center, so the crop window is centered
  // within the full image's implied box.
  const fullLeft = oLeft - (fullW - boxW) / 2
  const fullTop = oTop - (fullH - boxH) / 2

  const dx = (fullLeft + fullW / 2) - (targetRect.left + targetRect.width / 2)
  const dy = (fullTop + fullH / 2) - (targetRect.top + targetRect.height / 2)
  const s = fullW / targetRect.width // fullH/targetRect.height is the same ratio — same aspect ratio on both sides

  const insetXPct = Math.max(0, 0.5 * (1 - boxW / fullW)) * 100
  const insetYPct = Math.max(0, 0.5 * (1 - boxH / fullH)) * 100

  return {
    transform: `translate(${dx}px, ${dy}px) scale(${s}, ${s})`,
    clipPath: `inset(${insetYPct}% ${insetXPct}% ${insetYPct}% ${insetXPct}%)`,
  }
}

// The lightbox <img> always requests the full-resolution original — a
// different resource than whatever smaller srcset variant the thumbnail
// actually downloaded for its on-page size — so on a first open it hasn't
// loaded/decoded yet. imgRef.current.getBoundingClientRect() would then
// report a 0x0 box (nothing to measure), silently failing computeFlipGeometry
// and skipping the whole animation — while a second open of the same image
// finds it already decoded and cached, and animates fine. Computing the
// target box analytically instead — from the aspect ratio we already know
// (the thumbnail's own naturalWidth/naturalHeight, captured when it was
// clicked, since the thumbnail is by definition already loaded) plus the
// fixed max-h-[90vh] max-w-[90vw] object-contain constraint the lightbox
// <img> renders with — removes that dependency entirely, so the animation
// is correct on every open regardless of whether the full-res file has
// finished loading yet.
function computeTargetRect(imgW, imgH) {
  if (!imgW || !imgH) return null
  // clientWidth/Height (the layout viewport, e.g. what `fixed inset-0`
  // sizes against), not window.innerWidth/Height — the latter includes a
  // visible scrollbar's width, which would drift the centered box a few px
  // off from where the lightbox container actually renders.
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const scale = Math.min((vw * 0.9) / imgW, (vh * 0.9) / imgH, 1)
  const width = imgW * scale
  const height = imgH * scale
  return {
    left: (vw - width) / 2,
    top: (vh - height) / 2,
    width,
    height,
  }
}

// FLIP shared-element transition: the clicked thumbnail's captured
// getBoundingClientRect() (originRect, from useGalleryLightbox) is used to
// compute the crop-aware inverse geometry above, then animated to identity
// — so the image appears to grow from its on-page position/size into the
// centered fullscreen view, unwrapping from its thumbnail crop as it goes,
// and reverses on close. The backdrop fades in/out alongside the move; the
// image itself stays fully opaque throughout (only `transform`/`clip-path`
// animate on it) — it never fades, only the dimmed backdrop behind it does.
// The image's opacity is only ever animated separately, for the prev/next
// crossfade between two different images.
export default function GalleryLightbox({ images, index, originRect, onClose, onNavigate }) {
  const total = images.length
  const current = images[index]
  const imgRef = useRef(null)
  const closingRef = useRef(false)
  const openedIndexRef = useRef(index)

  const [transform, setTransform] = useState(originRect ? null : 'none')
  const [clipPath, setClipPath] = useState(originRect ? null : 'inset(0%)')
  const [flipTransitionOn, setFlipTransitionOn] = useState(false)
  const [backdropOpacity, setBackdropOpacity] = useState(originRect ? 0 : 1)
  const [imgOpacity, setImgOpacity] = useState(1)
  const [fadeTransitionOn, setFadeTransitionOn] = useState(false)

  // The on-page thumbnail's srcset means a smaller variant is already
  // decoded and cached (current.lowResSrc, from useGalleryLightbox) — the
  // full-res original (current.src) is a different, likely-uncached
  // resource on a cold page. Painting the already-available low-res version
  // immediately means the open animation always has real pixels to show
  // from frame one, instead of the image content itself popping in
  // mid-animation once the full-res fetch+decode finally completes. Once it
  // does, this swaps to it in the background — imperceptible when the two
  // are close in resolution, but for a small thumbnail variant stretched up
  // to fill most of the screen, the low-res stage is visibly softer than
  // the full image — so `isCached` below skips it entirely whenever the
  // full-res file already happens to be available, which the prefetch
  // effect further down aims to make the common case for prev/next.
  function isCached(src) {
    if (!src) return false
    const probe = new Image()
    probe.src = src
    return probe.complete && probe.naturalWidth > 0
  }

  const [displaySrc, setDisplaySrc] = useState(() => (isCached(current.src) ? current.src : (current.lowResSrc || current.src)))
  useEffect(() => {
    if (isCached(current.src)) { setDisplaySrc(current.src); return }
    setDisplaySrc(current.lowResSrc || current.src)
    if (!current.lowResSrc || current.lowResSrc === current.src) return
    let cancelled = false
    const upgrade = new Image()
    upgrade.onload = () => { if (!cancelled) setDisplaySrc(current.src) }
    upgrade.src = current.src
    return () => { cancelled = true }
  }, [current.src, current.lowResSrc])

  // Prefetch the full-res files for both neighbors as soon as the current
  // image is shown — by the time a Next/Prev click actually lands on one of
  // them, it's very likely already cached, so the isCached fast path above
  // takes over and the low-res stage never has to show at all for ordinary
  // sequential browsing (only for jumping around faster than the network
  // can keep up).
  useEffect(() => {
    const neighbors = [images[(index + 1) % total]?.src, images[(index - 1 + total) % total]?.src]
    neighbors.forEach(src => { if (src) new Image().src = src })
  }, [index, images, total])

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  const computeStartGeometry = useCallback(() => {
    if (!originRect) return null
    // Prefer the actual rendered box when it's available — exact, and by
    // close time the image has certainly already loaded (it's been on
    // screen). The analytical estimate is only a stand-in for when the real
    // box isn't measurable yet (freshly opened, image still loading): using
    // it as the "target" for the close animation too would end the shrink
    // animation at its (however slightly) estimated position rather than
    // the image's real one, producing a visible jump right as the lightbox
    // unmounts and the real, exactly-positioned page thumbnail takes over.
    const measured = imgRef.current?.getBoundingClientRect()
    const targetRect = measured?.width && measured?.height
      ? measured
      : computeTargetRect(originRect.naturalWidth, originRect.naturalHeight)
    return computeFlipGeometry(originRect, targetRect)
  }, [originRect])

  const handleClose = useCallback((useFlip = true) => {
    if (closingRef.current) return
    closingRef.current = true
    // originRect is a viewport-relative snapshot taken at open/navigate
    // time. If the page has scrolled since then (the trigger for this close
    // in that case), it's stale — animating to it would fly the image to
    // wherever the thumbnail *used to be* on screen, not where it is now.
    const geometry = useFlip ? computeStartGeometry() : null
    if (geometry) {
      setFlipTransitionOn(true)
      setTransform(geometry.transform)
      setClipPath(geometry.clipPath)
      setBackdropOpacity(0)
      setTimeout(onClose, TRANSITION_MS)
    } else {
      onClose()
    }
  }, [computeStartGeometry, onClose])

  // Play-in: paint the image at the origin (thumbnail) position/scale/crop
  // first (no transition), then on a later frame flip to identity with a
  // transition — the standard FLIP double-rAF sequence.
  useLayoutEffect(() => {
    if (!originRect || !imgRef.current) return
    const geometry = computeStartGeometry()
    if (!geometry) { setBackdropOpacity(1); return }
    setTransform(geometry.transform)
    setClipPath(geometry.clipPath)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlipTransitionOn(true)
        setTransform('translate(0px, 0px) scale(1, 1)')
        setClipPath('inset(0%)')
        setBackdropOpacity(1)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // prev/next: simple crossfade — no transform/move happens here at all.
  useEffect(() => {
    if (index === openedIndexRef.current) return
    setFadeTransitionOn(true)
    setImgOpacity(0)
    const t = setTimeout(() => setImgOpacity(1), 20)
    return () => clearTimeout(t)
  }, [index])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [prev, next, handleClose])

  // Scrolling the page behind the lightbox closes it. Skip the FLIP
  // animation here — the scroll that triggered this has already moved the
  // thumbnail's on-page position, so the captured originRect no longer
  // matches reality; just close instantly instead of flying to a stale spot.
  useEffect(() => {
    function onScroll() { handleClose(false) }
    window.addEventListener('wheel', onScroll, { passive: true })
    window.addEventListener('touchmove', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', onScroll)
      window.removeEventListener('touchmove', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [handleClose])

  const imgTransition = [
    flipTransitionOn ? `transform ${TRANSITION_MS}ms ${EASING}, clip-path ${TRANSITION_MS}ms ${EASING}` : null,
    fadeTransitionOn ? `opacity ${FADE_MS}ms linear` : null,
  ].filter(Boolean).join(', ') || 'none'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop — a separate layer from the image below, so animating its
          opacity never fades the image (CSS opacity fades an element's
          entire subtree). */}
      <div
        className="absolute inset-0 bg-black/85"
        style={{ opacity: backdropOpacity, transition: flipTransitionOn ? `opacity ${TRANSITION_MS}ms ${EASING}` : 'none' }}
      />

      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
        onClick={handleClose}
        aria-label="Close"
      >
        <X size={28} strokeWidth={1.5} />
      </button>

      {/* Image counter */}
      {total > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm select-none">
          {index + 1} / {total}
        </div>
      )}

      {/* Prev arrow */}
      {total > 1 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-2"
          onClick={e => { e.stopPropagation(); prev() }}
          aria-label="Previous image"
        >
          <ChevronLeft size={40} strokeWidth={1.5} />
        </button>
      )}

      {/* Image */}
      <img
        ref={imgRef}
        src={displaySrc}
        alt={current.alt || ''}
        className="relative max-h-[90vh] max-w-[90vw] object-contain select-none"
        style={{
          transform: transform || 'none',
          transformOrigin: 'center center',
          clipPath: clipPath || 'inset(0%)',
          opacity: imgOpacity,
          transition: imgTransition,
          // Hints the browser to promote this element to its own compositing
          // layer as soon as it mounts, rather than reactively once the
          // transform/clip-path animation actually starts two frames later.
          // That layer allocation+rasterization is a one-time cost per page
          // — without this hint it lands mid-animation on the very first
          // lightbox open of a page (visible as a dropped-frame stutter),
          // while every open after that reuses an already-warmed compositor.
          willChange: 'transform, clip-path',
        }}
        onClick={e => e.stopPropagation()}
        draggable={false}
      />

      {/* Next arrow */}
      {total > 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors p-2"
          onClick={e => { e.stopPropagation(); next() }}
          aria-label="Next image"
        >
          <ChevronRight size={40} strokeWidth={1.5} />
        </button>
      )}
    </div>,
    document.body
  )
}
