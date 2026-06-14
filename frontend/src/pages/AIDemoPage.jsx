import { useEffect } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'

export default function AIDemoPage() {
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.ai_demo_page_name ?? 'AI'} - ${config.site_title}`
    }
  }, [config])

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">AI Implementations</h1>
      <p className="text-gray-500">Coming soon.</p>
    </main>
  )
}
