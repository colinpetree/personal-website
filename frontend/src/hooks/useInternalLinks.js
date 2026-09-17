import { useState, useEffect } from 'react'

export function useInternalLinks() {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/internal-links', { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then(data => { setLinks(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return { links, loading }
}
