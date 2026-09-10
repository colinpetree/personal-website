import { useGalleryLightbox } from '../hooks/useGalleryLightbox'
import GalleryLightbox from './GalleryLightbox'

// Drop this alongside any container that renders editor HTML capable of
// containing a Gallery node (blog posts, admin-editable page-text fields) —
// mirrors CodeBlockCopyToast/HeaderImageLqip.
export default function GalleryLightboxController({ containerRef, contentKey }) {
  const { images, index, originRect, close, navigate } = useGalleryLightbox(containerRef, contentKey)
  if (index === null) return null
  return (
    <GalleryLightbox
      images={images}
      index={index}
      originRect={originRect}
      onClose={close}
      onNavigate={navigate}
    />
  )
}
