import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import './index.css'
import { createRouter } from './router'

async function init() {
  let slugs = {}
  try {
    const res = await fetch('/api/site-config')
    if (res.ok) slugs = (await res.json()).slugs ?? {}
  } catch {}

  const router = createRouter(slugs)

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AdminAuthProvider>
        <UserAuthProvider>
          <RouterProvider router={router} />
        </UserAuthProvider>
      </AdminAuthProvider>
    </StrictMode>
  )
}

init()
