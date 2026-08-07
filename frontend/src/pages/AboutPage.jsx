import { useEffect } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { setMetaDescription } from '../utils/meta'

export default function AboutPage() {
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.about_page_name ?? 'About'} - ${config.site_title}`
    }
    setMetaDescription(config?.about_meta_description)
  }, [config])

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
