import { useSiteConfig } from '../hooks/useSiteConfig'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage } from '../utils/meta'

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

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {config?.about_text ? (
        <div
          className="prose prose-gray max-w-none blog-content page-header-content"
          dangerouslySetInnerHTML={{ __html: config.about_text }}
        />
      ) : (
        <p className="text-gray-400">About page not configured.</p>
      )}
    </main>
  )
}
