import { createContext, useContext, useState, useEffect } from 'react'

const UserAuthContext = createContext(null)

export function UserAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setUser(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function loginWithGoogle(next = window.location.href) {
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`
  }

  async function requestMagicLink(email, next = window.location.pathname) {
    const res = await fetch('/api/auth/magic-link/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, next }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to send sign-in link')
    return data
  }

  async function verifyMagicLink(token) {
    const res = await fetch('/api/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Invalid or expired sign-in link')
    setUser(data)
    return data
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  async function updateProfile(name, title) {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, title }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to update profile')
    setUser(data)
    return data
  }

  return (
    <UserAuthContext.Provider value={{ user, loading, loginWithGoogle, requestMagicLink, verifyMagicLink, logout, updateProfile }}>
      {children}
    </UserAuthContext.Provider>
  )
}

export function useUserAuth() {
  return useContext(UserAuthContext)
}
