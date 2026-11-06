import { Outlet, Scripts, Links, Meta, ScrollRestoration, useLoaderData } from 'react-router'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { SiteConfigProvider } from './context/SiteConfigContext'
import { TooltipProvider } from './components/ui/Tooltip'
import { fetchSiteConfig } from './lib/apiFetch'
import { buildMeta } from './utils/meta'
import './index.css'

// Root loader — prerendered at build time (see react-router.config.ts).
export async function loader() {
  return fetchSiteConfig()
}

// Required in addition to loader — under ssr:false, loader only runs for
// prerendered paths (no server exists to run it otherwise). Without this,
// any route built with the generic/no-prerendering profile (PRERENDER_BASE_URL
// unreachable at build time, e.g. the domain didn't exist yet) permanently
// hydrates with config=null and never fetches it live — same fix already
// applied to BlogPage/ProjectsPage/BlogPostPage. clientLoader.hydrate=true
// makes this run in-browser on the very first hard load too.
export async function clientLoader() {
  return fetchSiteConfig()
}

// True only in the browser on the SPA fallback shell (__spa-fallback.html,
// served for paths that weren't prerendered), never while prerendering and
// never on a prerendered page.
//
// Why not just `true`: when a route has clientLoader.hydrate === true AND a
// HydrateFallback export, React Router throws away that route's prerendered
// loader data, both while prerendering and again in the browser
// (shouldHydrateRouteLoader / getHydrationData in react-router's dist), and
// writes the fallback into the static HTML instead of the page. For root
// that blanked the body of every prerendered page, so crawlers that don't
// run JavaScript saw nothing.
//
// Why root still has a HydrateFallback: without one, React Router uses its
// built-in root fallback, which (react-router always loads its development
// build in Node at prerender time) puts a "Hey developer" console.log
// inline script into __spa-fallback.html; scripts/inject-csp-hashes.mjs
// rightly refuses to hash an unknown inline script and fails the build.
//
// So: prerendered pages render from the build-time config and Root() below
// refreshes it once after mount, while the SPA fallback shell (where there
// is no usable build-time config) still runs this clientLoader on first load.
const IN_SPA_FALLBACK = typeof window !== 'undefined' && window.__reactRouterContext?.isSpaMode === true
clientLoader.hydrate = IN_SPA_FALLBACK

// Shown only on the SPA fallback shell while clientLoader resolves (see
// above), covering the whole tree since Navbar and page content both read
// site-config from context; kept blank rather than guessing at a skeleton.
// Prerendered routes (SlugResolverPage, BlogPage, ProjectsPage, HomePage,
// ContactPage) must not export a HydrateFallback, for the same reason: they
// all set clientLoader.hydrate = true.
export function HydrateFallback() {
  return <main className="min-h-screen bg-white" />
}

// Root's own meta/OG tags — react-router's per-route meta REPLACES rather
// than merges (a route with its own meta() export doesn't automatically
// inherit the parent's), so every other page needs its own complete tag
// set too, not just an override of this one. See HomePage.jsx etc., which
// each fetch their own config via fetchSiteConfig() (shared/memoized with
// this one, see apiFetch.js) rather than trying to reach this route's data
// through `matches` — confirmed unreliable during prerendering, since the
// <head> renders before this route's own async fetch resolves for anyone
// visiting a DIFFERENT path.
//
// Title is deliberately a static placeholder, NOT `data?.site_title` — root's
// own clientLoader.hydrate=true resolves independently of the body's
// HydrateFallback boundary (which waits on the LEAF route's own hydrate
// loader too), so on a fast local backend root's data is often already
// resolved by react-router's very first hydrateRoot commit while the body
// is still rendering HydrateFallback. If this title used live data, that
// commit's title text (real site_title) wouldn't match the static/prerendered
// shell's title (always this fallback, since no data existed at build time),
// producing a hydration mismatch — React then discards and remounts the
// ENTIRE document (Layout renders <html>, so hydrateRoot owns the whole
// page), wiping every <style> tag in <head> including Vite's dev CSS
// injection, i.e. the page loses all styling. Every real page already
// overrides this with its own complete meta() (title included) once ITS
// OWN hydrate loader resolves — properly gated behind the same boundary
// that swaps its body content in — so this static fallback is only ever
// visible for the brief instant before that, never a regression in the
// actual displayed title.
export function meta() {
  return buildMeta({
    title: 'My Website',
  })
}

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  const configData = useLoaderData()
  // On a prerendered page configData is the build-time snapshot (see
  // IN_SPA_FALLBACK above), so fetch the live config once after mount. Done
  // in an effect, after hydration, so the first render still matches the
  // prerendered HTML. On the SPA fallback shell the clientLoader already
  // fetched it live.
  //
  // The fetched copy is tied to the configData it replaced: once React
  // Router revalidates root (a search-param change, a form submission),
  // configData becomes a new object and that newer value wins instead of
  // being masked by the copy fetched on first load.
  const [fresh, setFresh] = useState(null)
  const initialConfigRef = useRef(configData)
  useEffect(() => {
    if (IN_SPA_FALLBACK) return undefined
    let cancelled = false
    const base = initialConfigRef.current
    fetchSiteConfig().then(config => { if (!cancelled && config) setFresh({ base, config }) })
    return () => { cancelled = true }
  }, [])
  const config = fresh && fresh.base === configData ? fresh.config : configData
  return (
    <StrictMode>
      <TooltipProvider>
        <AdminAuthProvider>
          <UserAuthProvider>
            <SiteConfigProvider config={config}>
              <Outlet />
            </SiteConfigProvider>
          </UserAuthProvider>
        </AdminAuthProvider>
      </TooltipProvider>
    </StrictMode>
  )
}
