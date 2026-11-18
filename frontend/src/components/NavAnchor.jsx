import { Link } from 'react-router'

// Internal site pages always use root-relative paths (every route in
// routes.ts starts with '/'). Anything an admin types into Site Navigation
// that doesn't start with '/' is treated as an external URL and rendered as
// a plain <a>, since react-router's <Link> resolves `to` as an in-app route
// and isn't meant for arbitrary absolute URLs.
export function isInternalPath(url) {
  return url.startsWith('/')
}

export default function NavAnchor({ url, label, className, onClick, children }) {
  const content = children ?? label
  return isInternalPath(url)
    ? <Link to={url} className={className} onClick={onClick}>{content}</Link>
    : <a href={url} className={className} onClick={onClick}>{content}</a>
}

// A nav item with children has no link of its own; it's "active" while the
// current page is one of its children.
export function navItemIsActive(item, pathname) {
  if (item.children?.length) return item.children.some(child => child.url === pathname)
  return item.url === pathname
}
