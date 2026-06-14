import { useEffect } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'

export default function DonatePage() {
  const { config } = useSiteConfig()

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.donate_page_name ?? 'Donate'} - ${config.site_title}`
    }
  }, [config])

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Donate</h1>
      <p className="text-gray-500">Coming soon.</p>
    </main>
  )
}
