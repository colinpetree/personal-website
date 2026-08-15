// Loaders run in three different places, not two:
//  - `react-router build`'s prerender step (typeof window === 'undefined',
//    PRERENDER_BASE_URL set) — needs an ABSOLUTE URL to the live prod site,
//    since there's no browser/relative-URL resolution and no nginx/Varnish
//    in front of it there.
//  - `react-router dev`'s dev server (typeof window === 'undefined' HERE
//    TOO — it also runs loaders in Node to render the initial document on
//    every request, not just during a build) with PRERENDER_BASE_URL
//    unset — falls back to localhost:5000, mirroring routes.ts's identical
//    fallback for the same reason. Discovered by actually running the dev
//    server against the real backend: every loader-having route 500'd
//    before this fallback existed, since this case was originally
//    (incorrectly) conflated with "prerendering with no prod site yet".
//  - The browser, on every client-side navigation after hydration — needs
//    a RELATIVE URL, so requests keep going through the real
//    nginx -> Varnish -> gunicorn stack (caching, auth cookies, etc.)
//    rather than being permanently pinned to whatever PRERENDER_BASE_URL
//    was at build time.
export function apiUrl(path) {
  if (typeof window === 'undefined') {
    const base = process.env.PRERENDER_BASE_URL ?? 'http://localhost:5000'
    return `${base}${path}`
  }
  return path
}

// Memoized ONLY in the Node/build context (one build process = one process
// lifetime, so sharing a single fetch across every page's loader during
// prerendering is a real efficiency win with no correctness cost). In the
// browser, deliberately NOT memoized — every call fetches fresh.
//
// Memoizing in the browser too was tried first, but it meant the very
// first fetch's result got reused for the rest of that tab's ENTIRE
// session: an admin editing the site title or favicon while a visitor's
// tab stayed open would never be reflected — every subsequent client-side
// navigation kept showing the stale title/og:image, not just until the
// next rebuild (a different, narrower staleness window than the
// content-staleness tradeoff already accepted elsewhere). Fetching fresh
// per call costs one extra small JSON request per page visited — every
// route needing this already calls it from its own loader/clientLoader on
// each navigation to it, and root's clientLoader re-runs on every
// navigation by default too, so this naturally keeps the whole app's
// config current without any custom cache-invalidation logic.
//
// This exists specifically because meta() can't reliably read root's
// config via `matches.find(m => m.id === 'root').data` during prerendering:
// confirmed empirically (a unique marker value in site_title silently fell
// back to a hardcoded default) that root's own loader data isn't
// synchronously available yet when a DIFFERENT route's meta() runs at
// build time — the <head>/meta tags render before root's async fetch
// resolves, while the streamed body (read via useSiteConfig() context)
// gets it later once the promise settles. Every non-root page needing
// config in its own meta() needs its own directly-awaited copy instead.
let _siteConfigPromise = null
let _resolvedSiteConfig = null
export function fetchSiteConfig() {
  if (typeof window === 'undefined' && _siteConfigPromise) {
    return _siteConfigPromise
  }
  const promise = (async () => {
    try {
      const res = await fetch(apiUrl('/api/site-config'))
      const config = res.ok ? await res.json() : null
      _resolvedSiteConfig = config
      return config
    } catch {
      _resolvedSiteConfig = null
      return null
    }
  })()
  if (typeof window === 'undefined') {
    _siteConfigPromise = promise
  }
  return promise
}

// Synchronous read of whatever fetchSiteConfig() last resolved to. Exists
// for meta() functions specifically: react-router's own data-threading to
// meta() (the `data`/`matches` params) is confirmed unreliable at prerender
// time for any route whose component ALSO calls useLoaderData() directly
// (BlogPage/ProjectsPage/BlogPostPage) — `data` comes back undefined in
// meta() even though the exact same loader's data correctly reaches the
// component via useLoaderData() moments later in the same render. Since the
// fetch demonstrably completes before render either way, this plain
// synchronous cache sidesteps whatever's broken in meta()'s param threading
// without touching the (working) component-level data flow.
export function getCachedSiteConfig() {
  return _resolvedSiteConfig
}
