import { Link } from 'react-router'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage } from '../utils/meta'

// Same pattern as HomePage.jsx (see its comments for the full rationale) —
// gives this route its own og:image fallback without touching root.jsx's
// meta(), which was deliberately made data-independent to avoid a
// hydration-mismatch/CSS-wipe bug (see root.jsx). Safe here because this
// route owns/gates its own hydrate boundary (root's HydrateFallback covers
// body+title+image together until THIS loader resolves), unlike root's own
// meta() which has no boundary above it to hide behind.
//
// No `loader` export (unlike HomePage) — deliberately. This route is never
// in react-router.config.ts's prerender() list (a 404 has no fixed path to
// prerender), and `ssr:false` build fails hard
// (`validateSsrFalsePrerenderExports`) on any route exporting `loader` that
// isn't part of the prerendered set — confirmed by actually running
// `npm run build` with PRERENDER_BASE_URL set, which threw "Invalid route
// exports found when prerendering with `ssr:false`: `loader`". clientLoader
// alone is fine (same reasoning as BlogPostPageClientOnly.jsx).
export async function clientLoader() {
  return fetchSiteConfig()
}
clientLoader.hydrate = true

export function meta({ data }) {
  return buildMeta({
    title: data?.site_title ? `Not found — ${data.site_title}` : 'Page not found',
    image: siteFallbackImage(data),
  })
}

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
      <p className="text-xl text-gray-500 mb-8">Page not found.</p>
      <Link to="/" className="text-blue-600 hover:underline">
        Go home
      </Link>
    </main>
  )
}
