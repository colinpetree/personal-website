import { useState, useEffect } from 'react'

export function useAdminConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/site-config', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setConfig(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function save(fields) {
    const res = await fetch('/api/admin/site-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fields),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Save failed')
    setConfig(data)
    return data
  }

  return { config, loading, save }
}
