import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import { SiteConfigProvider } from './context/SiteConfigContext'
import { TooltipProvider } from './components/ui/Tooltip'
import './index.css'
import { createRouter } from './router'

async function init() {
  let configData = null
  try {
    const res = await fetch('/api/site-config')
    if (res.ok) configData = await res.json()
  } catch {}

  const slugs = configData?.slugs ?? {}
  const router = createRouter(slugs)

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <TooltipProvider>
        <AdminAuthProvider>
          <UserAuthProvider>
            <SiteConfigProvider config={configData}>
              <RouterProvider router={router} />
            </SiteConfigProvider>
          </UserAuthProvider>
        </AdminAuthProvider>
      </TooltipProvider>
    </StrictMode>
  )
}

init()
