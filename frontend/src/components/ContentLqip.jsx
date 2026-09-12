import { useContentLqip } from '../hooks/useContentLqip'

// Drop this alongside any container that renders editor HTML containing
// ImageNode/GalleryNode figures, to fade each image in over its blurred LQIP
// placeholder instead of painting in raw top-down as it downloads.
export default function ContentLqip({ containerRef, contentKey }) {
  useContentLqip(containerRef, contentKey)
  return null
}
