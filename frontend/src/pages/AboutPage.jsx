import { useEffect } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'

export default function AboutPage() {
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.about_page_name ?? 'About'} - ${config.site_title}`
    }
  }, [config])

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {config?.headshot_filename && (
        <img
          src={`/api/uploads/${config.headshot_filename}`}
          alt="Headshot"
          className="w-40 h-40 rounded-full object-cover mb-8"
        />
      )}
      {config?.about_text ? (
        <div
          className="prose prose-gray"
          dangerouslySetInnerHTML={{ __html: config.about_text }}
        />
      ) : (
        <p className="text-gray-400">About page not configured.</p>
      )}
    </main>
  )
}
