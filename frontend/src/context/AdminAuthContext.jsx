import { createContext, useContext, useState, useEffect } from 'react'

const AdminAuthContext = createContext(null)

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

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}
