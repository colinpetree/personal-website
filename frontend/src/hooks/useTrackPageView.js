import { useEffect, useRef } from 'react'

// Fires once per distinct (pageType, pageKey) — the ref guard both survives
// React StrictMode's dev-only double-invoke of effects (same component
// instance, so the ref persists across it) and correctly re-fires when
// pageKey changes without a remount (e.g. BlogPostPage.jsx is reused, not
// remounted, when navigating between two posts via the same ':slug' route).
export function useTrackPageView(pageType, pageKey) {
  const lastTracked = useRef(null)

  useEffect(() => {
    if (!pageKey || lastTracked.current === pageKey) return
    lastTracked.current = pageKey
    fetch('/api/analytics/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ page_type: pageType, page_key: pageKey }),
    }).catch(() => {})
  }, [pageType, pageKey])
}
