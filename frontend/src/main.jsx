import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { UserAuthProvider } from './context/UserAuthContext'
import './index.css'
import router from './router'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AdminAuthProvider>
      <UserAuthProvider>
        <RouterProvider router={router} />
      </UserAuthProvider>
    </AdminAuthProvider>
  </StrictMode>
)
