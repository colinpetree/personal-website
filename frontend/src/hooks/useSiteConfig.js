import { useState, useEffect } from 'react'

export function useSiteConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/site-config')
      .then(res => res.ok ? res.json() : null)
      .then(data => { setConfig(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return { config, loading }
}
