export function setMetaDescription(description) {
  let tag = document.querySelector('meta[name="description"]')
  if (!description) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'description')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', description)
}

// Turns an uploads-relative path (e.g. `/api/uploads/foo.webp`, the shape
// every image field in this app already uses) into an absolute URL — Open
// Graph/Twitter Card scrapers (Slack, Discord, iMessage, X, ...) fetch
// og:image directly and don't resolve relative URLs against the page they
// found it on, so a relative path silently produces a blank preview image.
// Returns null (not an empty tag) when `config.domain` isn't set yet, since
// that's the same "not configured" state root.jsx/HomePage.jsx already
// treat as absent elsewhere.
export function absoluteUploadUrl(config, relativeUrl) {
  if (!relativeUrl || !config?.domain) return null
  return `https://${config.domain}${relativeUrl}`
}

// Site-wide fallback og:image (the favicon) for any page that doesn't have
// a more specific image of its own (a blog post's thumbnail, etc.) — a
// small square favicon isn't an ideal share-preview image, but it beats no
// image at all. Every page below has its own `config` (see fetchSiteConfig
// in apiFetch.js) to call this with, rather than relying on root.jsx's own
// meta() to supply it — react-router's per-route meta REPLACES rather than
// merges (a route with its own meta() export doesn't inherit the parent's
// at all), confirmed empirically: root's favicon-based image silently
// never appeared on any page that defined its own meta(), i.e. every page.
export function siteFallbackImage(config) {
  return config?.favicon_filename
    ? absoluteUploadUrl(config, `/api/uploads/${config.favicon_filename}`)
    : null
}

// Builds a react-router `meta()` route export's return array — one shared
// place for the og:/twitter: tag shape so every page's meta() stays a
// one-line call instead of re-deriving this list. Each page must return its
// OWN complete tag set (see siteFallbackImage above for why) — this does
// not compose with a parent route's meta() automatically.
export function buildMeta({ title, description, image, type = 'website' }) {
  const tags = []
  if (title) tags.push({ title })
  if (description) tags.push({ name: 'description', content: description })
  if (title) tags.push({ property: 'og:title', content: title })
  if (description) tags.push({ property: 'og:description', content: description })
  tags.push({ property: 'og:type', content: type })
  if (image) tags.push({ property: 'og:image', content: image })
  tags.push({ name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' })
  if (title) tags.push({ name: 'twitter:title', content: title })
  if (description) tags.push({ name: 'twitter:description', content: description })
  if (image) tags.push({ name: 'twitter:image', content: image })
  return tags
}
