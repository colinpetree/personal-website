import { useRef } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage } from '../utils/meta'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'

// Purely for meta() below — see HomePage.jsx for why this route needs its
// own directly-awaited config fetch rather than reaching root's via
// `matches` (unreliable during prerendering). Page body still reads from
// context via useSiteConfig().
export async function loader() {
  return fetchSiteConfig()
}

export async function clientLoader() {
  return fetchSiteConfig()
}
clientLoader.hydrate = true

export function meta({ data }) {
  return buildMeta({
    title: data?.site_title ? `${data.about_page_name ?? 'About'} - ${data.site_title}` : undefined,
    description: data?.about_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function AboutPage() {
  const { config } = useSiteConfig()
  const contentRef = useRef(null)

  return (
    <main className="max-w-3xl mx-auto px-6 pt-10 pb-16">
      {config?.about_text ? (
        <>
          <div
            ref={contentRef}
            className="prose prose-gray max-w-none blog-content page-header-content font-serif"
            dangerouslySetInnerHTML={{ __html: config.about_text }}
          />
          {config.about_scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={config.about_text} />
          )}
        </>
      ) : (
        <p className="text-gray-400">About page not configured.</p>
      )}
    </main>
  )
}
