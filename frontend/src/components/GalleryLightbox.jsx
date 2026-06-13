import { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export default function GalleryLightbox({ images, index, onClose, onNavigate }) {
  const total = images.length
  const current = images[index]

  const prev = useCallback(() => onNavigate((index - 1 + total) % total), [index, total, onNavigate])
  const next = useCallback(() => onNavigate((index + 1) % total), [index, total, onNavigate])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [prev, next, onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
        onClick={onClose}
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
        src={current.src}
        alt={current.alt || ''}
        className="max-h-[90vh] max-w-[90vw] object-contain select-none"
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
