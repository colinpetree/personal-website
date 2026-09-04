import { useHeaderImageLqip } from '../hooks/useHeaderImageLqip'

// Drop this alongside any container that renders editor HTML (blog posts,
// admin-editable page-text fields) to fade a HeaderNode's background image
// in over its blurred LQIP instead of an abrupt pop-in once it loads.
export default function HeaderImageLqip({ containerRef, contentKey }) {
  useHeaderImageLqip(containerRef, contentKey)
  return null
}
