import { useEffect } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'

export default function HomePage() {
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.site_title) {
      document.title = config.site_title
    }
  }, [config])

  if (!config?.home_text) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-gray-400">Home page not configured.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white max-w-3xl mx-auto px-6 py-16">
      <div
        className="prose prose-gray max-w-none blog-content"
        dangerouslySetInnerHTML={{ __html: config.home_text }}
      />
    </main>
  )
}
