import { createContext, useContext, useState, useEffect } from 'react'

const AdminAuthContext = createContext(null)

export const ROLE_ORDER = ['contributor', 'editor', 'administrator', 'owner']

export function isAtLeast(admin, minRole) {
  if (!admin) return false
  return ROLE_ORDER.indexOf(admin.role) >= ROLE_ORDER.indexOf(minRole)
}

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setAdmin(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Login failed')
    setAdmin(data)
    return data
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    setAdmin(null)
  }

  function refreshAdmin() {
    fetch('/api/admin/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => setAdmin(data))
      .catch(() => {})
  }

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, refreshAdmin }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}
