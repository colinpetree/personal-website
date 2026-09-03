import { useRef } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage, notFoundMeta, isNavEnabled } from '../utils/meta'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import NotFoundPage from './NotFoundPage'

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
  if (!isNavEnabled(data, 'about')) return notFoundMeta(data)
  return buildMeta({
    title: data?.site_title ? `${data.about_page_name ?? 'About'} - ${data.site_title}` : undefined,
    description: data?.about_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function AboutPage() {
  const { config } = useSiteConfig()
  const contentRef = useRef(null)
  const enabled = isNavEnabled(config, 'about')
  useTrackPageView('page', enabled ? 'about' : null)

  if (!enabled) return <NotFoundPage />

  return (
    <main className={`mx-auto px-6 pt-10 pb-16 ${config?.about_page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-3xl'}`}>
      {config?.about_text ? (
        <>
          <div
            ref={contentRef}
            className="prose prose-gray max-w-none blog-content page-header-content font-serif"
            data-page-width={config?.about_page_width === 'narrow' ? 'narrow' : 'regular'}
            dangerouslySetInnerHTML={{ __html: config.about_text }}
          />
          {config.about_scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={config.about_text} />
          )}
          <CodeBlockCopyToast containerRef={contentRef} contentKey={config.about_text} />
        </>
      ) : (
        <p className="text-gray-400">About page not configured.</p>
      )}
    </main>
  )
}
