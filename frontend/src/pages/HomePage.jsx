import { useRef } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage } from '../utils/meta'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'

// Purely for meta() below — the page body still reads config from context
// via useSiteConfig(), fed by root's own loader. This separate fetch exists
// because meta() can't reliably reach root's data through `matches` during
// prerendering (confirmed unreliable — see root.jsx); it needs its own
// directly-awaited copy, shared/memoized with every other page via
// fetchSiteConfig() so it's not a redundant network call per page.
export async function loader() {
  return fetchSiteConfig()
}

export async function clientLoader() {
  return fetchSiteConfig()
}
clientLoader.hydrate = true

export function meta({ data }) {
  return buildMeta({
    title: data?.site_title,
    description: data?.home_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function HomePage() {
  const { config } = useSiteConfig()
  const contentRef = useRef(null)
  // home_text presence is the page's own "has content" gate — home_enabled
  // only controls whether it shows in the nav, not whether it's public (see
  // site_config.py's get_site_config), so it's tracked whenever it renders.
  useTrackPageView('page', config?.home_text ? 'home' : null)

  if (!config?.home_text) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-gray-400">Home page not configured.</p>
      </main>
    )
  }

  return (
    <main className={`min-h-screen bg-white mx-auto px-6 pt-10 pb-16 ${config.home_page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-3xl'}`}>
      <div
        ref={contentRef}
        className={`prose prose-gray max-w-none blog-content page-header-content ${config.home_font_family === 'sans' ? 'font-sans' : 'font-serif'}`}
        data-page-width={config.home_page_width === 'narrow' ? 'narrow' : 'regular'}
        data-font-family={config.home_font_family || 'default'}
        dangerouslySetInnerHTML={{ __html: config.home_text }}
      />
      {config.home_scrollable_nav_enabled && (
        <ScrollableHeaderNav containerRef={contentRef} contentKey={config.home_text} />
      )}
      <CodeBlockCopyToast containerRef={contentRef} contentKey={config.home_text} />
    </main>
  )
}
