import { Outlet, Scripts, Links, Meta, ScrollRestoration, useLoaderData } from 'react-router'
import { StrictMode } from 'react'
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
clientLoader.hydrate = true

// Shown only while clientLoader resolves on a hard load with nothing
// prerendered yet — covers the whole tree (Navbar + page content both read
// site-config from context), so kept intentionally blank rather than
// guessing at a page-specific skeleton.
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
  return (
    <StrictMode>
      <TooltipProvider>
        <AdminAuthProvider>
          <UserAuthProvider>
            <SiteConfigProvider config={configData}>
              <Outlet />
            </SiteConfigProvider>
          </UserAuthProvider>
        </AdminAuthProvider>
      </TooltipProvider>
    </StrictMode>
  )
}
