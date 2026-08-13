import { Outlet, Scripts, ScrollRestoration, Links, Meta, useLoaderData } from 'react-router'
import { StrictMode } from 'react'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { SiteConfigProvider } from './context/SiteConfigContext'
import { TooltipProvider } from './components/ui/Tooltip'
import { apiUrl } from './lib/apiFetch'
import './index.css'

// Root loader — runs for every route (prerendered or not), replacing
// main.jsx's one-time fetch-before-render. Composes automatically with
// every nested route's own loader.
export async function loader() {
  try {
    const res = await fetch(apiUrl('/api/site-config'))
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
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
