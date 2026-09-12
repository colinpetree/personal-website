import type { Config } from '@react-router/dev/config'

const PRERENDER_BASE_URL = process.env.PRERENDER_BASE_URL

export default {
  ssr: false,
  appDirectory: 'src',

  async prerender() {
    // No known-live production URL to fetch content from (e.g. the very
    // first build of this project, before a domain/DB exists, or the
    // generic/template build profile — see PLAN.md's two-build-profile
    // section) — build as a pure SPA, exactly matching pre-SSG behavior.
    if (!PRERENDER_BASE_URL) {
      console.warn(
        '[prerender] PRERENDER_BASE_URL not set — building with zero ' +
        'prerendered routes (pure SPA fallback).'
      )
      return []
    }

    const { getSlugs, listAllPublishedSlugs, listAllPublishedPageSlugs } = await import('./src/lib/prerenderData.js')
    const { fetchSiteConfig } = await import('./src/lib/apiFetch.js')
    // Pre-warms apiFetch.js's module-level _resolvedSiteConfig cache before
    // any route is rendered — confirmed empirically that this module-level
    // state IS shared with the later per-route SSR rendering phase. Without
    // this, BlogPage/ProjectsPage/BlogPostPage's meta() (which reads that
    // cache via getCachedSiteConfig() instead of loader data — see its own
    // comment for why) can run before any route's own redundant
    // fetchSiteConfig() call resolves, baking an empty/placeholder <head>
    // into the prerendered HTML. Still not sufficient on its own — see the
    // DOM-fallback logic in those three pages' meta() for the matching
    // client-side half of this same race.
    await fetchSiteConfig()

    // PRERENDER_BASE_URL being *set* doesn't guarantee it's actually
    // reachable or configured yet (wrong/not-yet-live domain, DB not seeded
    // so /api/site-config 404s, etc.) — getSlugs/listAllPublishedSlugs throw
    // in any of those cases. Baking that failure into a static file is worse
    // than not prerendering at all: a bad snapshot (e.g. "Home page not
    // configured") gets served by nginx forever until the next rebuild, even
    // after the real site/DB comes online, since the client only re-runs
    // loaders on client-side navigation, never on the initial hydration of
    // prerendered HTML. Treat any failure here exactly like PRERENDER_BASE_URL
    // being unset: zero prerendered routes, falling through to the plain CSR
    // shell so the browser fetches live from Flask instead.
    let slugs, postSlugs, pageSlugs
    try {
      slugs = await getSlugs(PRERENDER_BASE_URL)
      postSlugs = await listAllPublishedSlugs(PRERENDER_BASE_URL)
      pageSlugs = await listAllPublishedPageSlugs(PRERENDER_BASE_URL)
    } catch (err) {
      console.warn(
        `[prerender] Failed to fetch content from PRERENDER_BASE_URL (${PRERENDER_BASE_URL}) — ` +
        `building with zero prerendered routes (pure SPA fallback). Cause: ${err.message}`
      )
      return []
    }

    // Deliberately excluded: /admin/*, /{payment}, /{ai_demo}(+subroutes),
    // /profile, /auth/magic — all session-gated or write-heavy; never valid
    // to serve a stale prerendered snapshot for these.
    return [...new Set([
      '/',
      `/${slugs.blog}`,       // page 1 only — pagination stays client-fetched
      `/${slugs.projects}`,
      `/${slugs.contact}`,
      ...postSlugs.map((slug) => `/${slug}`),
      ...pageSlugs.map((slug) => `/${slug}`),
    ])]
  },
} satisfies Config
