import { Outlet, Scripts, ScrollRestoration, Links, Meta, useLoaderData } from 'react-router'
import { StrictMode } from 'react'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { SiteConfigProvider } from './context/SiteConfigContext'
import { TooltipProvider } from './components/ui/Tooltip'
import { apiUrl } from './lib/apiFetch'
import './index.css'

async function fetchSiteConfig() {
  try {
    const res = await fetch(apiUrl('/api/site-config'))
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

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

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Colin Petree</title>
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
