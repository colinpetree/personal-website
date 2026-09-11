// Node-only helpers used by react-router.config.ts (prerender()) and
// routes.ts (dynamic route paths) — both need the same admin-configured
// slugs, so this is the single fetch both import rather than each doing
// its own request against the same endpoint.

// Memoized per baseUrl, deliberately: react-router.config.ts's prerender()
// and routes.ts both call this independently with the same baseUrl. Two
// unmemoized fetches could disagree if a transient failure hit only one of
// them (one falls back to default slugs while the other gets the real ones,
// and prerender() then tries to prerender a path routes.ts never
// registered) — sharing one promise means both call sites always resolve or
// reject identically, no matter which one triggers the actual fetch first.
const _slugsPromises = new Map()

export function getSlugs(baseUrl) {
  if (!_slugsPromises.has(baseUrl)) {
    _slugsPromises.set(baseUrl, (async () => {
      const res = await fetch(`${baseUrl}/api/site-config`)
      if (!res.ok) throw new Error(`Failed to fetch site-config for prerender: HTTP ${res.status}`)
      const config = await res.json()
      const {
        blog = 'blog', projects = 'projects', about = 'about',
        contact = 'contact', ai_demo = 'demo', payment = 'payment',
      } = config.slugs ?? {}
      return { blog, projects, about, contact, ai_demo, payment }
    })())
  }
  return _slugsPromises.get(baseUrl)
}

// Memoized per baseUrl for the same reason as getSlugs above — routes.ts and
// react-router.config.ts both call this independently, and an unmemoized
// pair of fetches could disagree if a post got published in the window
// between them (routes.ts picks BlogPostPageClientOnly.jsx for zero posts
// while react-router.config.ts's prerender() already sees the new one).
const _postSlugsPromises = new Map()

export function listAllPublishedSlugs(baseUrl) {
  if (!_postSlugsPromises.has(baseUrl)) {
    _postSlugsPromises.set(baseUrl, (async () => {
      const slugs = []
      let page = 1
      while (true) {
        const res = await fetch(`${baseUrl}/api/blog?page=${page}&per_page=50`)
        if (!res.ok) throw new Error(`Failed to fetch /api/blog page ${page} for prerender: HTTP ${res.status}`)
        const data = await res.json()
        slugs.push(...data.posts.map((p) => p.slug))
        if (page >= data.pages) break
        page += 1
      }
      return slugs
    })())
  }
  return _postSlugsPromises.get(baseUrl)
}

// Same shape/memoization as listAllPublishedSlugs above, and for the same
// reason — react-router.config.ts's prerender() and routes.ts both call
// this independently, and paginating through *all* pages (not just the
// first) is what makes prerendering work correctly once a site has more
// than one page of published Pages.
const _pageSlugsPromises = new Map()

export function listAllPublishedPageSlugs(baseUrl) {
  if (!_pageSlugsPromises.has(baseUrl)) {
    _pageSlugsPromises.set(baseUrl, (async () => {
      const slugs = []
      let page = 1
      while (true) {
        const res = await fetch(`${baseUrl}/api/pages?page=${page}&per_page=50`)
        if (!res.ok) throw new Error(`Failed to fetch /api/pages page ${page} for prerender: HTTP ${res.status}`)
        const data = await res.json()
        slugs.push(...data.items.map((p) => p.slug))
        if (page >= data.pages) break
        page += 1
      }
      return slugs
    })())
  }
  return _pageSlugsPromises.get(baseUrl)
}
