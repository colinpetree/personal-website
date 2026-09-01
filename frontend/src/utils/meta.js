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

// Direct-DOM counterpart to buildMeta's `noindex` — for the handful of pages
// (the ai-demo sub-pages) that set document.title imperatively instead of
// through a route `meta()` export, and so need the same manual approach for
// robots. Idempotent either direction so it's safe to call on every render.
export function setRobotsNoindex(noindex) {
  let tag = document.querySelector('meta[name="robots"]')
  if (!noindex) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'robots')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', 'noindex')
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
export function buildMeta({ title, description, image, type = 'website', noindex = false }) {
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
  // A disabled/not-found page must never get indexed — the body renders
  // "Page not found" but nginx still serves it with an HTTP 200 (SPA
  // fallback, see deploy/nginx/personal-website.conf), so this is the only
  // signal a crawler gets that the page shouldn't be kept in search results.
  if (noindex) tags.push({ name: 'robots', content: 'noindex' })
  return tags
}

// Shared "this page doesn't exist" meta — used by NotFoundPage.jsx's own
// route meta() AND by every gated page's meta() when its SiteConfig
// `*_enabled` flag is off, so a disabled page's title/og tags never reveal
// its real content to a crawler or link-preview scraper that only reads
// <head>, even though the frontend route only 404s once React hydrates.
export function notFoundMeta(config) {
  return buildMeta({
    title: config?.site_title ? `Not found — ${config.site_title}` : 'Page not found',
    image: siteFallbackImage(config),
    noindex: true,
  })
}

// Whether the nav item for `key` is enabled in a /api/site-config response
// (or an object shaped like one) — the single check every gated page's
// meta()/component uses to decide between real content and notFoundMeta().
//
// Defaults to TRUE (enabled) when `config`/the nav entry itself is missing
// — deliberately NOT the same as "confirmed disabled". Several pages
// (About/Contact/Payment/AIDemo/Blog/Projects) run a SEPARATE, page-scoped
// fetchSiteConfig() call purely to feed their meta() (see each page's own
// `loader`/`clientLoader` and apiFetch.js's "deliberately NOT memoized"
// comment) — that call can fail independently of the one that actually
// gated the page's render, resolving to `null` with no error. Treating a
// missing/failed fetch the same as "explicitly disabled" would falsely
// noindex a real, working page over nothing more than a background
// request hiccup — so only an EXPLICIT `enabled: false` counts here.
export function isNavEnabled(config, key) {
  const entry = config?.nav?.find(n => n.key === key)
  return entry ? !!entry.enabled : true
}

// document.title/robots equivalent of notFoundMeta() — for the ai-demo
// sub-pages, which set document.title imperatively in a useEffect instead
// of through a route meta() export (see each ai-demos/*.jsx page), so they
// need this same manual approach to avoid leaking the real demo title/
// indexability when the AI demo page has been disabled.
export function setNotFoundDocumentHead(config) {
  document.title = config?.site_title ? `Not found — ${config.site_title}` : 'Page not found'
  setRobotsNoindex(true)
}
