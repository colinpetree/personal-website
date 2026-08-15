import { Outlet, Scripts, ScrollRestoration, Links, Meta, useLoaderData } from 'react-router'
import { StrictMode } from 'react'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { SiteConfigProvider } from './context/SiteConfigContext'
import { TooltipProvider } from './components/ui/Tooltip'
import { fetchSiteConfig } from './lib/apiFetch'
import { buildMeta, siteFallbackImage } from './utils/meta'
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
export function meta({ data }) {
  return buildMeta({
    title: data?.site_title || 'My Website',
    image: siteFallbackImage(data),
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
