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
