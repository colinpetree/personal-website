import { useEffect, useState } from 'react'

// Public, unauthenticated map of demo_key -> {url, text} for the admin-configured
// "watch a recorded demo instead" link shown in AccessRequiredModal. Fetched fresh
// per page visit (same reasoning as fetchSiteConfig in lib/apiFetch.js) since an
// admin could add/remove a link while a visitor's tab stays open.
export function useAiDemoAccessLinks() {
  const [links, setLinks] = useState({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/ai-demo/access-links')
      .then(res => res.ok ? res.json() : {})
      .then(data => { if (!cancelled) setLinks(data || {}) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return links
}
